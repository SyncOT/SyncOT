import {
    ContentClient,
    createSchemaConflictError,
    isAlreadyExistsError,
    maxVersion,
    minVersion,
    Operation,
    Schema,
} from '@syncot/content'
import {
    changeSchema,
    fromSyncOTSchema,
    toSyncOTSchema,
} from '@syncot/content-type-prosemirror'
import {
    assert,
    createId,
    exponentialBackOffStrategy,
    noop,
    throwError,
    workLoop,
} from '@syncot/util'
import { Node, Schema as EditorSchema } from 'prosemirror-model'
import {
    EditorState,
    Plugin,
    PluginKey,
    PluginSpec,
    TextSelection,
    Transaction,
} from 'prosemirror-state'
import { Step } from 'prosemirror-transform'
import { EditorView } from 'prosemirror-view'
import { Duplex } from 'readable-stream'
import { Rebaseable, rebaseableStepsFrom, rebaseSteps } from './rebaseable'

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
 * which synchronizes the document schema, content and presence with the server and peer clients.
 *
 * IMPORTANT!!!
 * As documents may be persisted on the server indefinitely,
 * it is critical to plan for the inevitable occasions when the schema needs to change.
 * Refer to the documentation of the `changeSchema` function in `@syncot/content-type-prosemirror`
 * for details on how content is migrated between schemas.
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
                return new PluginState(minVersion, [])
            },

            apply(tr: Transaction, pluginState: PluginState): PluginState {
                const newPluginState: PluginState = tr.getMeta(key)
                if (newPluginState) return newPluginState
                if (!tr.docChanged) return pluginState
                return new PluginState(
                    pluginState.version,
                    pluginState.pendingSteps.concat(rebaseableStepsFrom(tr)),
                )
            },
        },
        view(view: EditorView) {
            let localNotify = noop
            let localView: EditorView | undefined = view
            const getView = () => localView
            workLoop((notify) => {
                localNotify = notify
                return new PluginLoop(
                    type,
                    id,
                    contentClient,
                    onError,
                    getView,
                    notify,
                )
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
                return this.getState(state).version > minVersion
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

const initializedStates = new WeakSet<EditorState>()

class PluginLoop {
    private get view(): EditorView | undefined {
        return this.getView()
    }
    private readonly schema: Schema
    private stream: Duplex | undefined
    private streamVersion: number = minVersion
    private minVersionForSubmit: number = minVersion + 1
    public retryDelay = exponentialBackOffStrategy({
        minDelay: 1000,
        maxDelay: 10000,
        delayFactor: 1.5,
    })
    private initialized: boolean
    private allowSchemaChangeBefore: number = Date.now()

    public constructor(
        private readonly type: string,
        private readonly id: string,
        private readonly contentClient: ContentClient,
        public readonly onError: (error: Error) => void,
        private readonly getView: () => EditorView | undefined,
        private readonly notify: () => void,
    ) {
        const state = this.view!.state
        this.initialized = initializedStates.has(state)
        this.schema = toSyncOTSchema(this.type, state.schema)
        this.contentClient.on('active', this.notify)
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
        const { state } = this.view!
        const pluginState = key.getState(state)!

        if (!this.initialized) {
            if (
                pluginState.version === minVersion &&
                pluginState.pendingSteps.length === 0
            ) {
                this.initialized = true
            } else {
                return this.view!.dispatch(
                    state.tr.setMeta(key, new PluginState(minVersion, [])),
                )
            }
        }

        const hasValidStream =
            !!this.stream &&
            !this.stream.destroyed &&
            this.streamVersion === pluginState.version

        if (!hasValidStream && this.stream) {
            this.stream.destroy()
        }
        if (this.contentClient.active) {
            if (pluginState.version === minVersion) {
                await this.initState(state)
            } else if (!hasValidStream) {
                await this.initStream(pluginState.version)
            } else {
                await this.submitOperation(state, pluginState)
            }
        }
    }

    private async initState(state: EditorState<EditorSchema>): Promise<void> {
        const { type, id, schema } = this

        // Load the latest document snapshot.
        let snapshot = await this.contentClient.getSnapshot(
            type,
            id,
            maxVersion,
        )

        // Handle schema change.
        if (snapshot.schema !== schema.hash) {
            let node: Node | null
            if (snapshot.version === minVersion) {
                node = state.doc
            } else {
                if (
                    snapshot.meta != null &&
                    snapshot.meta.time != null &&
                    snapshot.meta.time >= this.allowSchemaChangeBefore
                ) {
                    throw createSchemaConflictError(
                        "Cannot convert the snapshot's schema because the local schema is out of date.",
                    )
                }
                const oldSchema = (await this.contentClient.getSchema(
                    snapshot.schema,
                ))!
                const oldNode = fromSyncOTSchema(oldSchema).nodeFromJSON(
                    snapshot.data,
                )
                node = changeSchema(oldNode, state.schema)
                if (!node)
                    throw createSchemaConflictError(
                        'Failed to convert the existing content to the new schema.',
                    )
            }

            await this.contentClient.registerSchema(schema)
            const operation: Operation = {
                key: createId(),
                type,
                id,
                version: snapshot.version + 1,
                schema: schema.hash,
                data: node.toJSON(),
                meta: {
                    user: this.contentClient.userId,
                    session: this.contentClient.sessionId,
                    time: Date.now(),
                },
            }
            await this.contentClient.submitOperation(operation)
            snapshot = {
                type: operation.type,
                id: operation.id,
                version: operation.version,
                schema: operation.type,
                data: operation.data,
                meta: operation.meta,
            }
        }

        // Handle state changed in the meantime.
        if (this.isDone()) return

        // Update the state.
        const nextPluginState = new PluginState(snapshot.version, [])
        let nextState = EditorState.create({
            schema: state.schema,
            doc: state.schema.nodeFromJSON(snapshot.data),
            plugins: state.plugins,
        })
        nextState = nextState.apply(nextState.tr.setMeta(key, nextPluginState))
        assert(
            key.getState(nextState) === nextPluginState,
            'Cannot update the syncOT plugin state.',
        )
        initializedStates.add(nextState)
        this.view!.updateState(nextState)
        initializedStates.delete(nextState)
    }

    private async initStream(version: number): Promise<void> {
        // Create a new stream.
        const stream = await this.contentClient.streamOperations(
            this.type,
            this.id,
            version + 1,
            maxVersion + 1,
        )
        this.streamVersion = version
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
            const newOperationKey = createId()
            const nextPluginState = new PluginState(
                pluginState.version,
                pluginState.pendingSteps.map(
                    ({ step, invertedStep }) =>
                        new Rebaseable(step, invertedStep, newOperationKey),
                ),
            )
            return this.view!.dispatch(state.tr.setMeta(key, nextPluginState))
        }

        const operationVersion = pluginState.version + 1

        // Make sure we're up to date with the server before submitting.
        if (operationVersion < this.minVersionForSubmit) return

        // Record the minimum version for the next operation to submit.
        this.minVersionForSubmit = operationVersion + 1

        try {
            // Prepare the steps.
            const operationSteps: any[] = []
            for (const pendingStep of pluginState.pendingSteps) {
                if (pendingStep.operationKey === operationKey) {
                    operationSteps.push(pendingStep.step.toJSON())
                } else {
                    break
                }
            }

            // Submit the operation.
            await this.contentClient.submitOperation({
                key: operationKey,
                type: this.type,
                id: this.id,
                version: operationVersion,
                schema: this.schema.hash,
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
        try {
            if (this.isDone()) return
            this.streamVersion = operation.version
            const { dispatch, state } = this.view!
            const pluginState = key.getState(state)!
            const { version, pendingSteps } = pluginState
            const nextVersion = version + 1
            if (operation.version !== nextVersion) return this.notify()

            if (operation.schema !== this.schema.hash) {
                // Receiving an operation with a different schema indicates that
                // another client uses a more recent schema. For that reason we
                // block changing the remote schema to our local schema.
                this.allowSchemaChangeBefore = -Infinity
                // Reset the plugin's state and report an error because we cannot
                // represent the remote document using our local schema.
                dispatch(state.tr.setMeta(key, new PluginState(minVersion, [])))
                throw createSchemaConflictError(
                    'Cannot process the operation because the local schema is out of date.',
                )
            }

            // Handle our own operation being confirmed by the authority.
            if (
                pendingSteps.length > 0 &&
                pendingSteps[0].operationKey === operation.key
            ) {
                // Update the "syncOT" plugin's state.
                const nextPluginState = new PluginState(
                    nextVersion,
                    pendingSteps.filter((step) => step.operationKey == null),
                )
                return dispatch(state.tr.setMeta(key, nextPluginState))
            }

            // Deserialize the steps from the operation.
            const operationSteps = (operation.data as JsonObject[]).map(
                (step) => Step.fromJSON(state.schema, step),
            )

            // Rebase pendingSteps.
            const { tr } = state
            const rebasedPendingSteps = rebaseSteps(
                tr,
                pendingSteps,
                operationSteps,
            )

            // Map the selection to positions before the characters which were inserted
            // at the initial selection positions.
            if (state.selection instanceof TextSelection) {
                tr.setSelection(
                    TextSelection.between(
                        tr.doc.resolve(
                            tr.mapping.map(state.selection.anchor, -1),
                        ),
                        tr.doc.resolve(
                            tr.mapping.map(state.selection.head, -1),
                        ),
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
                const nextPluginState = new PluginState(
                    nextVersion,
                    rebasedPendingSteps,
                )
                return dispatch(
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
        } catch (error) {
            this.onError(error)
        }
    }
}

interface JsonObject {
    [key: string]: any
}

/**
 * The `syncOT` plugin's state.
 */
export class PluginState {
    public constructor(
        /**
         * The version number of the document in SyncOT with content corresponding to this state.
         */
        public readonly version: number,
        /**
         * A list of steps which have not been recorded and confirmed by the server.
         */
        public readonly pendingSteps: Rebaseable[],
    ) {}
}
