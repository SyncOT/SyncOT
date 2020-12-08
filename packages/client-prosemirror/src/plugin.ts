import {
    ContentClient,
    createOperationKey,
    isAlreadyExistsError,
    Operation,
} from '@syncot/content'
import {
    assert,
    delay,
    noop,
    throwError,
    TypedEventEmitter,
} from '@syncot/util'
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
                return new PluginState(type, id, -1, null, [])
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

interface PluginViewEvents {
    update: void
    destroy: void
}

type PluginViewInterface = ReturnType<
    NonNullable<PluginSpec<PluginState>['view']>
>
class PluginView<S extends Schema = any>
    extends TypedEventEmitter<PluginViewEvents>
    implements PluginViewInterface {
    private view: EditorView<S> | undefined
    private stream: Duplex | undefined
    private streamType: string = ''
    private streamId: string = ''
    private streamVersion: number = -1
    private minVersionForSubmit: number = 0

    public constructor(
        view: EditorView,
        private contentClient: ContentClient,
        private onError: (error: Error) => void,
    ) {
        super()
        this.view = view
        this.initSchema()
        this.initState()
        this.initStream()
        this.submitOperation()
    }

    public update(view: EditorView, previousState: EditorState): void {
        queueMicrotask(() => this.emit('update'))

        // Allow any operation version on submit,
        // if the new state is not derived from the previous state.
        const pluginState = key.getState(view.state)
        const previousPluginState = key.getState(previousState)
        if (
            !pluginState ||
            !previousPluginState ||
            pluginState.type !== previousPluginState.type ||
            pluginState.id !== previousPluginState.id ||
            pluginState.version < previousPluginState.version
        ) {
            this.minVersionForSubmit = 0
        }
    }

    public destroy() {
        queueMicrotask(() => this.emit('destroy'))
        this.view = undefined
    }

    private setUp = (notify: () => void): void => {
        this.on('update', notify)
        this.on('destroy', notify)
        this.contentClient.on('active', notify)
    }

    private tearDown = (notify: () => void): void => {
        this.off('update', notify)
        this.off('destroy', notify)
        this.contentClient.off('active', notify)
    }

    private isDestroyed = (): boolean => {
        return !this.view
    }

    private initSchema = task<PluginView>({
        setUp: this.setUp,
        tearDown: this.tearDown,
        done: this.isDestroyed,
        onError: this.onError,
        retryDelay: backOffStrategy,
        async run() {
            // Make sure state exists.
            if (!this.view) return
            const { state } = this.view
            const pluginState = key.getState(state)
            if (!pluginState) return

            // Handle already initialized.
            const { type, schema } = pluginState
            if (schema != null) return

            // Check, if authenticated.
            if (!this.contentClient.active) return

            // Register the schema.
            const { spec } = state.schema
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
                key: null,
                type,
                data: { nodes, marks, topNode },
                meta: null,
            })

            // Handle state changed in the meantime.
            if (!this.view) return
            const newState = this.view.state
            const newPluginState = key.getState(newState)
            if (!newPluginState) return
            if (
                newPluginState.type !== pluginState.type ||
                newPluginState.schema !== pluginState.schema ||
                newState.schema !== state.schema
            )
                return

            // Record the registered schema key.
            this.view.dispatch(
                this.view.state.tr.setMeta(
                    key,
                    new PluginState(
                        newPluginState.type,
                        newPluginState.id,
                        newPluginState.version,
                        registeredSchema,
                        newPluginState.pendingSteps,
                    ),
                ),
            )
        },
    })

    private initState = task<PluginView>({
        setUp: this.setUp,
        tearDown: this.tearDown,
        done: this.isDestroyed,
        onError: this.onError,
        retryDelay: backOffStrategy,
        async run() {
            // Make sure state exists.
            if (!this.view) return
            const { state } = this.view
            const pluginState = key.getState(state)
            if (!pluginState) return

            // Handle already initialized.
            const { type, id, version, schema } = pluginState
            if (version >= 0) return

            // Handle schema not initialized.
            if (schema == null) return

            // Check, if authenticated.
            if (!this.contentClient.active) return

            // Load the latest document snapshot.
            const snapshot = await this.contentClient.getSnapshot(type, id)
            const newVersion = snapshot ? snapshot.version : 0

            // Handle state changed in the meantime.
            if (!this.view) return
            const newState = this.view.state
            const newPluginState = key.getState(newState)
            if (!newPluginState) return
            if (
                newPluginState.type !== type ||
                newPluginState.id !== id ||
                newPluginState.version !== version ||
                newPluginState.schema !== schema
            )
                return

            // TODO init state.doc from the snapshot

            // Update the state.
            this.view.dispatch(
                this.view.state.tr.setMeta(
                    key,
                    new PluginState(type, id, newVersion, schema, []),
                ),
            )
        },
    })

    private initStream = task<PluginView>({
        setUp: this.setUp,
        tearDown(notify) {
            this.tearDown(notify)
            if (this.stream) {
                this.stream.destroy()
            }
        },
        done: this.isDestroyed,
        onError: this.onError,
        retryDelay: backOffStrategy,
        async run(notify) {
            // Make sure state exists.
            if (!this.view) return
            const { state } = this.view
            const pluginState = key.getState(state)
            if (!pluginState) return

            // Handle a correct existing stream.
            const { type, id, version } = pluginState
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
            this.streamType = type
            this.streamId = id
            this.streamVersion = version
            this.stream = stream
            this.stream.on('data', this.receiveOperation)
            this.stream.on('error', this.onError)
            this.stream.on('close', notify)
        },
    })

    private submitOperation = task<PluginView>({
        setUp: this.setUp,
        tearDown: this.tearDown,
        done: this.isDestroyed,
        onError: this.onError,
        retryDelay: backOffStrategy,
        async run() {
            // Make sure state exists.
            const { view } = this
            if (!view) return
            const { dispatch, state } = view
            const pluginState = key.getState(state)
            if (!pluginState) return

            // Ensure authenticated.
            if (!this.contentClient.active) return

            // Verify the state.
            const { type, id, version, schema, pendingSteps } = pluginState
            if (version < 0 || schema == null || pendingSteps.length === 0)
                return

            // Ensure there is an operation to submit.
            const operation = pendingSteps[0].operation
            if (!operation) {
                // Create a new operation.
                const newOperation: Operation = {
                    key: createOperationKey(this.contentClient.userId!),
                    type,
                    id,
                    version: version + 1,
                    schema,
                    data: pendingSteps.map(({ step }) => step),
                    meta: null,
                }

                // Add the operation to the state.
                dispatch(
                    state.tr.setMeta(
                        key,
                        new PluginState(
                            type,
                            id,
                            version,
                            schema,
                            pendingSteps.map(
                                ({ step, invertedStep }) =>
                                    new Rebaseable(
                                        step,
                                        invertedStep,
                                        newOperation,
                                    ),
                            ),
                        ),
                    ),
                )
                return
            }

            // Make sure we're up to date with the server before submitting.
            if (operation.version < this.minVersionForSubmit) return

            // Record the minimum version for the next operation to submit.
            this.minVersionForSubmit = operation.version + 1

            try {
                // Submit the operation.
                await this.contentClient.submitOperation(operation)
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
    })

    /**
     * Applies the operation to the state.
     * @param operation The operation to apply.
     */
    receiveOperation = (operation: Operation): void => {
        if (!this.view) return
        const { state } = this.view
        const pluginState = key.getState(state)
        if (!pluginState) return

        const { type, id, version, schema, pendingSteps } = pluginState
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
            return this.view.dispatch(
                tr.setMeta(
                    key,
                    new PluginState(
                        type,
                        id,
                        nextVersion,
                        schema,
                        pendingSteps.filter((step) => !step.operation),
                    ),
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

        return this.view.dispatch(
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
                ),
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

/**
 * The `syncOT` plugin's state.
 */
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

function task<T>({
    setUp,
    tearDown: tearDown,
    run,
    done,
    onError,
    retryDelay,
}: {
    setUp(this: T, notify: () => void): void
    tearDown(this: T, notify: () => void): void
    run: (this: T, notify: () => void) => Promise<void>
    done: (this: T) => boolean
    onError: (this: T, error: Error) => void
    retryDelay: (this: T, attempt: number) => number
}): (this: T) => Promise<void> {
    // tslint:disable-next-line:only-arrow-functions
    return async function (): Promise<void> {
        await Promise.resolve()
        let retry = 0
        let change: Promise<void>
        let triggerChange: () => void = noop
        function notify() {
            triggerChange()
        }

        setUp.call(this, notify)
        try {
            while (!done.call(this)) {
                change = new Promise((resolve) => (triggerChange = resolve))
                try {
                    await run.call(this, notify)
                    retry = 0
                    await change
                } catch (error) {
                    queueMicrotask(() => onError.call(this, error))
                    await Promise.race([
                        change,
                        delay(retryDelay.call(this, retry++)),
                    ])
                }
            }
        } finally {
            tearDown.call(this, notify)
        }
    }
}

const exponentialBackOffStrategy = ({
    minDelay,
    maxDelay,
    delayFactor,
}: {
    minDelay: number
    maxDelay: number
    delayFactor: number
}) => (attempt: number) =>
    Math.max(
        minDelay,
        Math.min(
            maxDelay,
            Math.floor(minDelay * Math.pow(delayFactor, attempt)),
        ),
    )

const backOffStrategy = exponentialBackOffStrategy({
    minDelay: 1000,
    maxDelay: 10000,
    delayFactor: 1.5,
})
