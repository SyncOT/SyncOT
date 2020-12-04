import {
    ContentClient,
    createOperationKey,
    isAlreadyExistsError,
    Operation,
} from '@syncot/content'
import { assert, createTaskRunner, throwError } from '@syncot/util'
import OrderedMap from 'orderedmap'
import { MarkSpec, NodeSpec, Schema } from 'prosemirror-model'
import {
    EditorState,
    Plugin,
    PluginKey,
    PluginSpec,
    TextSelection,
    Transaction,
} from 'prosemirror-state'
import { Step, Transform } from 'prosemirror-transform'
import { EditorView } from 'prosemirror-view'
import { Duplex } from 'readable-stream'

/**
 * The config expected by the `syncOT` plugin.
 */
export interface SyncOTConfig {
    /**
     * The type of the document to synchronize with the server and peer clients.
     */
    type: string
    /**
     * The ID of the document to synchronize with the server and peer clients.
     */
    id: string
    /**
     * The client used for reading and writing document content.
     */
    contentClient: ContentClient
    /**
     * A function to call in case of errors.
     * Defaults to a function which throws the error.
     */
    onError?: (error: Error) => void
}

/**
 * Creates an instance of the `syncOT` ProseMirror plugin
 * which synchronizes the document content and presence with the server and peer clients.
 */
export function syncOT({
    type,
    id,
    contentClient,
    onError = throwError,
}: SyncOTConfig): Plugin {
    assert(typeof type === 'string', 'Argument "type" must be a string.')
    assert(typeof id === 'string', 'Argument "id" must be a string.')
    assert(
        typeof onError === 'function',
        'Argument "onError" must be a function or undefined.',
    )
    assert(
        typeof contentClient === 'object' && contentClient != null,
        'Argument "contentClient" must be an object.',
    )
    return new Plugin<PluginState>({
        key,
        state: {
            init(): PluginState {
                return new PluginState(type, id, -1, -1, [])
            },

            apply(tr: Transaction, pluginState: PluginState): PluginState {
                const newPluginState = tr.getMeta(key)
                if (newPluginState) {
                    return newPluginState
                }
                if (tr.docChanged)
                    return new PluginState(
                        pluginState.type,
                        pluginState.id,
                        pluginState.version,
                        pluginState.schema,
                        pluginState.pendingSteps.concat(
                            rebaseableStepsFrom(tr),
                        ),
                    )
                return pluginState
            },
        },
        view(view: EditorView) {
            return new PluginView(view, contentClient, onError)
        },
        props: {
            editable(state: EditorState): boolean {
                return this.getState(state).version >= 0
            },
        },

        // Tell the "prosemirror-history" plugin to not merge steps,
        // so that the history can be rebased.
        // It might be an omission that `historyPreserveItems` is not declared in typings.
        // It is definitely there though and also used in the "prosemirror-collab" plugin.
        historyPreserveItems: true,
    } as PluginSpec<PluginState>)
}

const key = new PluginKey<PluginState>('syncOT')

type PluginViewInterface = ReturnType<
    NonNullable<PluginSpec<PluginState>['view']>
>
class PluginView<S extends Schema = any> implements PluginViewInterface {
    private view: EditorView<S> | undefined
    private stream: Duplex | undefined
    private streamType: string = ''
    private streamId: string = ''
    private streamVersion: number = -1
    private minVersionForSubmit: number = 0

    private get state(): EditorState {
        return this.view!.state
    }

    private get pluginState(): PluginState {
        return key.getState(this.state)!
    }

    public constructor(
        view: EditorView,
        private contentClient: ContentClient,
        private onError: (error: Error) => void,
    ) {
        this.view = view
        this.initSchemaTaskRunner.on('error', this.onError)
        this.initStateTaskRunner.on('error', this.onError)
        this.initStreamTaskRunner.on('error', this.onError)
        this.submitOperationTaskRunner.on('error', this.onError)
        this.contentClient.on('active', this.onActive)
        this.initSchema()
        this.initState()
        this.initStream()
    }

    public update(_view: EditorView, previousState: EditorState): void {
        const { pluginState } = this
        const previousPluginState = key.getState(previousState)!

        // Close the operation stream immediately, if it is not valid for the new state.
        if (
            this.stream &&
            (this.streamType !== pluginState.type ||
                this.streamId !== pluginState.id ||
                this.streamVersion !== pluginState.version)
        ) {
            this.stream.destroy()
        }

        // Allow any operation version on submit,
        // if the new state is not derived from the previous state.
        if (
            pluginState.type !== previousPluginState.type ||
            pluginState.id !== previousPluginState.id ||
            pluginState.version < previousPluginState.version
        ) {
            this.minVersionForSubmit = 0
        }

        this.initSchema()
        this.initState()
        this.initStream()
        this.ensureOperation()
        this.submitOperation()
    }

    public destroy() {
        this.view = undefined
        this.initSchemaTaskRunner.destroy()
        this.initStateTaskRunner.destroy()
        this.initStreamTaskRunner.destroy()
        this.submitOperationTaskRunner.destroy()
        this.contentClient.off('active', this.onActive)
        if (this.stream) {
            this.stream.destroy()
        }
    }

    private onActive = (): void => {
        this.initSchema()
        this.initState()
        this.initStream()
        this.submitOperation()
    }

    private onData = (operation: Operation): void => {
        this.view!.dispatch(this.receiveOperation(operation))
    }

    private onClose = (): void => {
        this.stream = undefined
        this.initStream()
    }

    private initSchema(force: boolean = false): void {
        if (this.initSchemaTaskRunner.destroyed) return
        if (force) this.initSchemaTaskRunner.cancel()
        this.initSchemaTaskRunner.run()
    }
    private initSchemaTaskRunner = createTaskRunner(
        async (): Promise<void> => {
            assert(this.view, 'Plugin already destroyed.')

            // Handle already initialized.
            const { type, schema } = this.pluginState
            if (schema != null) return

            // Check, if authenticated.
            if (!this.contentClient.active) return

            // Register the schema.
            const oldState = this.view!.state
            const { spec } = oldState.schema
            const { topNode } = spec
            const nodesMap = spec.nodes as OrderedMap<NodeSpec>
            const nodes: any[] = []
            nodesMap.forEach((nodeName, { parseDOM, ...nodeSpec }) =>
                nodes.push(nodeName, nodeSpec),
            )
            const marksMap = spec.marks as OrderedMap<MarkSpec>
            const marks: any[] = []
            marksMap.forEach((markName, { parseDOM, ...markSpec }) =>
                marks.push(markName, markSpec),
            )
            const registeredSchema = await this.contentClient.registerSchema({
                key: 0,
                type,
                data: { nodes, marks, topNode },
                meta: null,
            })

            // Handle plugin destroyed.
            if (!this.view) return

            // Handle state changed in the meantime.
            const newState = this.view.state
            const newPluginState = this.pluginState
            if (
                newPluginState.type !== type ||
                newPluginState.schema !== schema ||
                newState.schema !== oldState.schema
            ) {
                this.initSchema(true)
                return
            }

            // Record the registered schema key.
            this.view.dispatch(
                this.view.state.tr.setMeta(key, {
                    ...newPluginState,
                    schema: registeredSchema,
                }),
            )
        },
    )

    private initState(force: boolean = false): void {
        if (this.initStateTaskRunner.destroyed) return
        if (force) this.initStateTaskRunner.cancel()
        this.initStateTaskRunner.run()
    }
    private initStateTaskRunner = createTaskRunner(
        async (): Promise<void> => {
            assert(this.view, 'Plugin already destroyed.')

            // Handle already initialized.
            const { type, id, version, schema } = this.pluginState
            if (version >= 0) return

            // Handle schema not initialized.
            if (schema == null) return

            // Check, if authenticated.
            if (!this.contentClient.active) return

            // Load the latest document snapshot.
            const snapshot = await this.contentClient.getSnapshot(type, id)

            // Handle plugin destroyed.
            if (!this.view) return

            // Handle state changed in the meantime.
            const newPluginState = this.pluginState
            if (
                newPluginState.type !== type ||
                newPluginState.id !== id ||
                newPluginState.version !== version ||
                newPluginState.schema !== schema
            ) {
                this.initState(true)
                return
            }

            // TODO init state.doc from the snapshot

            // Update the state.
            this.view.dispatch(
                this.view.state.tr.setMeta(
                    key,
                    new PluginState(type, id, snapshot.version, schema, []),
                ),
            )
        },
    )

    private initStream(force: boolean = false): void {
        if (this.initStreamTaskRunner.destroyed) return
        if (force) this.initStreamTaskRunner.cancel()
        this.initStreamTaskRunner.run()
    }
    private initStreamTaskRunner = createTaskRunner(
        async (): Promise<void> => {
            assert(this.view, 'Plugin already destroyed.')

            // Handle a correct existing stream.
            const { type, id, version } = this.pluginState
            if (
                this.stream &&
                this.streamType === type &&
                this.streamId === id &&
                this.streamVersion === version
            ) {
                return
            }

            // Handle an incorrect existing stream.
            if (this.stream) {
                this.stream.destroy()
                return
            }

            // Check if a new stream can be created.
            if (version < 0) return // Version not initialized.
            if (!this.contentClient.active) return // Not authenticated.

            // Create a new stream.
            const stream = await this.contentClient.streamOperations(
                type,
                id,
                version + 1,
            )

            // Handle plugin destroyed.
            if (!this.view) {
                stream.destroy()
                return
            }

            this.streamType = type
            this.streamId = id
            this.streamVersion = version
            this.stream = stream
            this.stream.on('data', this.onData)
            this.stream.on('error', this.onError)
            this.stream.on('close', this.onClose)

            // Make sure that we're still subscribed to the correct stream,
            // as the plugin's state might have changed in the meantime.
            this.initStream(true)
        },
    )

    private ensureOperation(): void {
        // Check, if there are any pending steps.
        const { type, id, version, schema, pendingSteps } = this.pluginState
        if (pendingSteps.length === 0) return

        // Check, if an operation already exists.
        if (pendingSteps[0].operation) return

        // Check, if schema is initialized.
        if (schema == null) return

        // Create a new operation.
        const operation: Operation = {
            key: createOperationKey(this.contentClient.userId!),
            type,
            id,
            version: version + 1,
            schema,
            data: pendingSteps.map(({ step }) => step),
            meta: null,
        }

        // Add the operation to the state.
        this.view!.dispatch(
            this.state.tr.setMeta(
                key,
                new PluginState(
                    type,
                    id,
                    version,
                    schema,
                    pendingSteps.map(
                        ({ step, invertedStep }) =>
                            new Rebaseable(step, invertedStep, operation),
                    ),
                ),
            ),
        )
    }

    private submitOperation(force: boolean = false): void {
        if (this.submitOperationTaskRunner.destroyed) return
        if (force) this.submitOperationTaskRunner.cancel()
        this.submitOperationTaskRunner.run()
    }
    private submitOperationTaskRunner = createTaskRunner(
        async (): Promise<void> => {
            // Ensure authenticated.
            if (!this.contentClient.active) return

            // Ensure there is an operation to submit.
            const { pendingSteps } = this.pluginState
            const operation =
                pendingSteps.length > 0 ? pendingSteps[0].operation : undefined
            if (!operation) return

            // Make sure we're up to date with the server before submitting.
            if (operation.version < this.minVersionForSubmit) return

            // Record the minimum version for the next operation to submit.
            this.minVersionForSubmit = operation.version + 1

            try {
                // Submit the operation.
                await this.contentClient.submitOperation(operation)

                // Submit again, in case a new operation was added in the meantime.
                this.submitOperation(true)
            } catch (error) {
                // Handle operation conflicting with an existing operation.
                if (isAlreadyExistsError(error)) {
                    // If the version number caused the conflict,
                    // get all operations from the server before retrying.
                    if (error.key === 'version') {
                        this.minVersionForSubmit = Math.max(
                            this.minVersionForSubmit,
                            error.value + 1,
                        )
                    }
                    // Otherwise the conflict must have been caused by the operation.key.
                    // It can happen when we resubmit the same operation because we are
                    // not sure, if it has been saved by the server already, for example
                    // when connection drops after submitting an operation but before
                    // receiving a confirmation. In this case we can jsut wait until the
                    // operation is confirmed.
                    return
                }

                // Allow the operation to be resubmitted and rethrow the error.
                this.minVersionForSubmit = operation.version
                throw error
            }
        },
    )

    /**
     * Creates a transaction that represents an operation received from
     * the authority. Applying this transaction moves the state forward to
     * adjust to the authority's view of the document.
     *
     * @param state The current editor state.
     * @param operation The operation received from the authority.
     * @returns A transaction which applies the operation to the state.
     */
    receiveOperation(operation: Operation): Transaction {
        const { state } = this.view!
        const { type, id, version, schema, pendingSteps } = this.pluginState
        const nextVersion = version + 1
        assert(operation.type === type, 'Unexpected operation.type.')
        assert(operation.id === id, 'Unexpected operation.id.')
        assert(
            operation.version === nextVersion,
            'Unexpected operation.version.',
        )
        this.streamVersion = nextVersion
        const { tr } = state

        // Handle our own operation being confirmed by the authority.
        if (
            pendingSteps.length > 0 &&
            pendingSteps[0].operation &&
            pendingSteps[0].operation.key === operation.key
        ) {
            // Update the "syncOT" plugin's state.
            return tr.setMeta(
                key,
                new PluginState(
                    type,
                    id,
                    nextVersion,
                    schema,
                    pendingSteps.filter((step) => !step.operation),
                ),
            )
        }

        // Deserialize the steps from the operation.
        const operationSteps = (operation.data as JsonObject[]).map((step) =>
            Step.fromJSON(state.schema, step),
        )

        const rebasedPendingSteps: Rebaseable[] = []
        if (pendingSteps.length === 0) {
            // No pending steps, so just apply `operationSteps`.
            for (const step of operationSteps) {
                tr.step(step)
            }
        } else {
            const pendingOperationSteps: Step[] = []
            const pendingOperation: Operation | undefined = pendingSteps[0]
                .operation
                ? {
                      ...pendingSteps[0].operation,
                      data: pendingOperationSteps,
                      version: nextVersion + 1,
                  }
                : undefined

            // Undo `pendingSteps`.
            for (let i = pendingSteps.length - 1; i >= 0; i--) {
                tr.step(pendingSteps[i].invertedStep)
            }

            // Apply `operationSteps`.
            for (const step of operationSteps) {
                tr.step(step)
            }

            // Rebase and apply `pendingSteps`.
            let mapFrom = pendingSteps.length
            for (const pendingStep of pendingSteps) {
                const mappedStep = pendingStep.step.map(
                    tr.mapping.slice(mapFrom),
                )
                mapFrom--
                if (mappedStep && !tr.maybeStep(mappedStep).failed) {
                    // It might be an omission that `setMirror` is not declared in typings.
                    // It is definitely there though and also used in the "prosemirror-collab" plugin.
                    ;(tr.mapping as any).setMirror(mapFrom, tr.steps.length - 1)
                    rebasedPendingSteps.push(
                        new Rebaseable(
                            mappedStep,
                            mappedStep.invert(tr.docs[tr.docs.length - 1]),
                            pendingStep.operation && pendingOperation,
                        ),
                    )
                    if (pendingStep.operation) {
                        pendingOperationSteps.push(mappedStep)
                    }
                }
            }
        }

        // Map the selection to positions before the characters which were inserted
        // at the initial selection positions.
        if (state.selection instanceof TextSelection) {
            tr.setSelection(
                TextSelection.between(
                    tr.doc.resolve(tr.mapping.map(state.selection.anchor, -1)),
                    tr.doc.resolve(tr.mapping.map(state.selection.head, -1)),
                    -1,
                ),
            )
            // Reset the "selection updated" flag.
            // There's no official API to do it and
            // the same hack is used in the "prosemirror-collab" plugin.
            // tslint:disable-next-line:no-bitwise
            ;(tr as any).updated &= ~1
        }

        return (
            tr
                // Tell the "prosemirror-history" plugin to rebase its items.
                // This is based on the "prosemirror-collab" plugin.
                .setMeta('rebased', pendingSteps.length)
                // Tell the "prosemirror-history" plugin to not add this transaction to the undo list.
                .setMeta('addToHistory', false)
                // Update the "syncOT" plugin's state.
                .setMeta(
                    key,
                    new PluginState(
                        type,
                        id,
                        nextVersion,
                        schema,
                        rebasedPendingSteps,
                    ),
                )
        )
    }
}

interface JsonObject {
    [key: string]: any
}

export class Rebaseable {
    constructor(
        public step: Step,
        public invertedStep: Step,
        public operation: Operation | undefined,
    ) {}
}

export class PluginState {
    public constructor(
        /**
         * The type of the document in SyncOT.
         */
        public type: string,
        /**
         * The ID of the document in SyncOT.
         */
        public id: string,
        /**
         * The version number of the document in SyncOT with content corresponding to this state.
         */
        public version: number,
        /**
         * The registered `Schema.key` of this state's schema, or null, if not registered.
         */
        public schema: number | null,
        /**
         * A list of steps which have not been recorded and confirmed by the server.
         */
        public pendingSteps: Rebaseable[],
    ) {}
}

/**
 * Creates rebaseable steps from the specified transform.
 */
export function rebaseableStepsFrom(transform: Transform): Rebaseable[] {
    const rebaseableSteps = []
    for (let i = 0; i < transform.steps.length; i++)
        rebaseableSteps.push(
            new Rebaseable(
                transform.steps[i],
                transform.steps[i].invert(transform.docs[i]),
                undefined,
            ),
        )
    return rebaseableSteps
}
