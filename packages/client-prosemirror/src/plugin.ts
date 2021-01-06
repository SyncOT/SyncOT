import {
    ContentClient,
    createOperationKey,
    createSchemaHash,
    isAlreadyExistsError,
    maxVersion,
    minVersion,
    Operation,
    OperationKey,
    Schema,
} from '@syncot/content'
// import { createProseMirrorSchema } from '@syncot/content-type-prosemirror'
import {
    assert,
    exponentialBackOffStrategy,
    noop,
    throwError,
    workLoop,
} from '@syncot/util'
import OrderedMap from 'orderedmap'
import {
    MarkSpec,
    Node,
    NodeSpec,
    Schema as EditorSchema,
} from 'prosemirror-model'
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
                return {
                    type,
                    id,
                    version: -1,
                    pendingSteps: [],
                }
            },

            apply(tr: Transaction, pluginState: PluginState): PluginState {
                const newPluginState: PluginState = tr.getMeta(key)
                if (newPluginState) return newPluginState
                if (!tr.docChanged) return pluginState
                return {
                    ...pluginState,
                    pendingSteps: pluginState.pendingSteps.concat(
                        rebaseableStepsFrom(tr),
                    ),
                }
            },
        },
        view(view: EditorView) {
            let localNotify = noop
            let localView: EditorView | undefined = view
            const getView = () => localView
            workLoop((notify) => {
                localNotify = notify
                return new PluginLoop(getView, contentClient, onError, notify)
            })
            return {
                update: localNotify,
                destroy() {
                    localView = undefined
                    localNotify()
                },
            }
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

export const key = new PluginKey<PluginState>('syncOT')

class PluginLoop {
    private get view(): EditorView | undefined {
        return this.getView()
    }
    private previousState: EditorState
    private stream: Duplex | undefined
    private streamType: string = ''
    private streamId: string = ''
    private streamVersion: number = -1
    private minVersionForSubmit: number = 0
    public retryDelay = exponentialBackOffStrategy({
        minDelay: 1000,
        maxDelay: 10000,
        delayFactor: 1.5,
    })

    public constructor(
        private getView: () => EditorView | undefined,
        private contentClient: ContentClient,
        public onError: (error: Error) => void,
        private notify: () => void,
    ) {
        this.contentClient.on('active', this.notify)
        this.previousState = this.view!.state
    }

    public destroy(): void {
        this.contentClient.off('active', this.notify)
        if (this.stream) {
            this.stream.destroy()
        }
    }

    public isDone(): boolean {
        return !this.view
    }

    async work() {
        /* istanbul ignore if */
        if (!this.view) return
        const { state } = this.view
        const pluginState = key.getState(state)
        /* istanbul ignore if */
        if (!pluginState) return

        const { previousState } = this
        this.previousState = state

        // Allow any operation version on submit,
        // if the new state is not derived from the previous state.
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

        const hasValidStream =
            !!this.stream &&
            !this.stream.destroyed &&
            this.streamType === pluginState.type &&
            this.streamId === pluginState.id &&
            this.streamVersion === pluginState.version

        if (!hasValidStream && this.stream) {
            this.stream.destroy()
        }
        if (!this.contentClient.active) {
            return
        }
        if (pluginState.version < 0) {
            return this.initState(state, pluginState)
        }
        if (!hasValidStream) {
            return this.initStream(state, pluginState)
        }
        return this.submitOperation(state, pluginState)
    }

    private async initState(
        state: EditorState<EditorSchema>,
        pluginState: PluginState,
    ): Promise<void> {
        const userId = this.contentClient.userId!
        const { type, id } = pluginState
        const schema = getSchema(type, state.schema)

        // Load the latest document snapshot.
        let snapshot = await this.contentClient.getSnapshot(
            type,
            id,
            maxVersion,
        )

        // Create a new document, if it does not exist yet.
        if (snapshot.version === minVersion) {
            await this.contentClient.registerSchema(schema)
            const operationKey = createOperationKey(userId)
            const operation: Operation = {
                key: operationKey,
                type,
                id,
                version: snapshot.version + 1,
                schema: schema.hash,
                data: state.doc.toJSON(),
                meta: null,
            }
            await this.contentClient.submitOperation(operation)
            snapshot = operation
        }

        // Migrate the document to the new schema, if necessary.
        if (snapshot.schema !== schema.hash) {
            // const oldSchema = (await this.contentClient.getSchema(
            //     snapshot.schema,
            // ))!
            // const oldEditorSchema = createProseMirrorSchema(oldSchema)
            throw new Error('Schema mismatch')
        }

        // Handle state changed in the meantime.
        if (!this.view) return
        const newState = this.view.state
        const newPluginState = key.getState(newState)
        if (
            !newPluginState ||
            newPluginState.type !== pluginState.type ||
            newPluginState.id !== pluginState.id ||
            newPluginState.version !== pluginState.version ||
            newState.schema !== state.schema
        )
            return

        // Update the state.
        const nextPluginState: PluginState = {
            ...pluginState,
            version: snapshot.version,
            pendingSteps: [],
        }
        const nextState = EditorState.create({
            schema: state.schema,
            doc: Node.fromJSON(state.schema, snapshot.data),
            plugins: newState.plugins,
        })
        this.view.updateState(
            nextState.apply(nextState.tr.setMeta(key, nextPluginState)),
        )
    }

    private async initStream(
        _state: EditorState,
        pluginState: PluginState,
    ): Promise<void> {
        // Create a new stream.
        const stream = await this.contentClient.streamOperations(
            pluginState.type,
            pluginState.id,
            pluginState.version + 1,
            maxVersion + 1,
        )
        this.streamType = pluginState.type
        this.streamId = pluginState.id
        this.streamVersion = pluginState.version
        this.stream = stream
        this.stream.on('data', this.receiveOperation)
        this.stream.on('error', this.onError)
        this.stream.on('close', this.notify)
    }

    private async submitOperation(
        state: EditorState,
        pluginState: PluginState,
    ): Promise<void> {
        // Check, if there's anything to submit.
        if (pluginState.pendingSteps.length === 0) return

        // Make sure that some steps have an operationKey assigned.
        const { operationKey } = pluginState.pendingSteps[0]
        if (operationKey == null) {
            const newOperationKey = createOperationKey(
                this.contentClient.userId!,
            )
            const nextPluginState = {
                ...pluginState,
                pendingSteps: pluginState.pendingSteps.map(
                    ({ step, invertedStep }) =>
                        new Rebaseable(step, invertedStep, newOperationKey),
                ),
            }
            return this.view!.dispatch(state.tr.setMeta(key, nextPluginState))
        }

        const operationVersion = pluginState.version + 1

        // Make sure we're up to date with the server before submitting.
        if (operationVersion < this.minVersionForSubmit) return

        // Record the minimum version for the next operation to submit.
        this.minVersionForSubmit = operationVersion + 1

        try {
            // Prepare the steps.
            const operationSteps: Step[] = []
            for (const pendingStep of pluginState.pendingSteps) {
                if (pendingStep.operationKey === operationKey) {
                    operationSteps.push(pendingStep.step)
                } else {
                    break
                }
            }

            // Submit the operation.
            await this.contentClient.submitOperation({
                key: operationKey,
                type: pluginState.type,
                id: pluginState.id,
                version: operationVersion,
                schema: getSchema(pluginState.type, state.schema).hash,
                data: operationSteps,
                meta: null,
            })
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
            this.minVersionForSubmit = operationVersion
            throw error
        }
    }

    /**
     * Applies the operation to the state.
     * @param operation The operation to apply.
     */
    private receiveOperation = (operation: Operation): void => {
        this.streamVersion = operation.version

        if (!this.view) return
        const { state } = this.view
        const pluginState = key.getState(state)
        if (!pluginState) return

        const { type, id, version, pendingSteps } = pluginState
        const nextVersion = version + 1
        assert(operation.type === type, 'Unexpected operation.type.')
        assert(operation.id === id, 'Unexpected operation.id.')
        assert(
            operation.version === nextVersion,
            'Unexpected operation.version.',
        )
        const { tr } = state

        // Handle our own operation being confirmed by the authority.
        if (
            pendingSteps.length > 0 &&
            pendingSteps[0].operationKey === operation.key
        ) {
            // Update the "syncOT" plugin's state.
            const nextPluginState: PluginState = {
                ...pluginState,
                version: nextVersion,
                pendingSteps: pendingSteps.filter(
                    (step) => step.operationKey == null,
                ),
            }
            return this.view.dispatch(tr.setMeta(key, nextPluginState))
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
                            pendingStep.operationKey,
                        ),
                    )
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

        {
            const nextPluginState: PluginState = {
                ...pluginState,
                version: nextVersion,
                pendingSteps: rebasedPendingSteps,
            }
            return this.view.dispatch(
                tr
                    // Tell the "prosemirror-history" plugin to rebase its items.
                    // This is based on the "prosemirror-collab" plugin.
                    .setMeta('rebased', pendingSteps.length)
                    // Tell the "prosemirror-history" plugin to not add this transaction to the undo list.
                    .setMeta('addToHistory', false)
                    // Update the "syncOT" plugin's state.
                    .setMeta(key, nextPluginState),
            )
        }
    }
}

interface JsonObject {
    [key: string]: any
}

export class Rebaseable {
    constructor(
        public step: Step,
        public invertedStep: Step,
        public operationKey: OperationKey | undefined,
    ) {}
}

/**
 * The `syncOT` plugin's state.
 */
export interface PluginState {
    /**
     * The type of the document in SyncOT.
     */
    type: string
    /**
     * The ID of the document in SyncOT.
     */
    id: string
    /**
     * The version number of the document in SyncOT with content corresponding to this state.
     */
    version: number
    /**
     * A list of steps which have not been recorded and confirmed by the server.
     */
    pendingSteps: Rebaseable[]
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

const cachedSchemas: WeakMap<EditorSchema, Map<string, Schema>> = new WeakMap()
/**
 * Gets a SyncOT Schema for the given type and EditorSchema.
 */
export function getSchema(type: string, editorSchema: EditorSchema): Schema {
    let nestedCachedSchemas = cachedSchemas.get(editorSchema)
    if (!nestedCachedSchemas) {
        nestedCachedSchemas = new Map()
        cachedSchemas.set(editorSchema, nestedCachedSchemas)
    }

    const cachedSchema = nestedCachedSchemas.get(type)
    if (cachedSchema) return cachedSchema

    const { spec } = editorSchema
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
    const data = { nodes, marks, topNode }
    const schema = {
        hash: createSchemaHash(type, data),
        type,
        data,
        meta: null,
    }
    nestedCachedSchemas.set(type, schema)
    return schema
}
