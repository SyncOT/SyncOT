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
        this.loop()
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

    private loop = asyncLoop<PluginView>({
        create(notify) {
            this.on('update', notify)
            this.on('destroy', notify)
            this.contentClient.on('active', notify)
        },
        destroy(notify) {
            this.off('update', notify)
            this.off('destroy', notify)
            this.contentClient.off('active', notify)
            if (this.stream) {
                this.stream.destroy()
            }
        },
        done(): boolean {
            return !this.view
        },
        onError: this.onError,
        retryDelay: backOffStrategy,
        async update(notify) {
            if (!this.view) return
            const { state } = this.view
            const pluginState = key.getState(state)
            if (!pluginState) return

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
            if (pluginState.schema == null) {
                return this.initSchema(state, pluginState)
            }
            if (pluginState.version < 0) {
                return this.initState(state, pluginState)
            }
            if (!hasValidStream) {
                return this.initStream(state, pluginState, notify)
            }
            if (pluginState.pendingSteps.length > 0) {
                const operation = pluginState.pendingSteps[0].operation
                if (operation) {
                    return this.submitOperation(operation)
                } else {
                    return this.createOperation(state, pluginState)
                }
            }
        },
    })

    private async initSchema(
        state: EditorState,
        pluginState: PluginState,
    ): Promise<void> {
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
            type: pluginState.type,
            data: { nodes, marks, topNode },
            meta: null,
        })

        // Handle state changed in the meantime.
        if (!this.view) return
        const newState = this.view.state
        const newPluginState = key.getState(newState)
        if (
            !newPluginState ||
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
    }

    private async initState(
        _state: EditorState,
        pluginState: PluginState,
    ): Promise<void> {
        // Load the latest document snapshot.
        const snapshot = await this.contentClient.getSnapshot(
            pluginState.type,
            pluginState.id,
        )

        // Handle state changed in the meantime.
        if (!this.view) return
        const newState = this.view.state
        const newPluginState = key.getState(newState)
        if (
            !newPluginState ||
            newPluginState.type !== pluginState.type ||
            newPluginState.id !== pluginState.id ||
            newPluginState.version !== pluginState.version ||
            newPluginState.schema !== pluginState.schema
        )
            return

        // TODO init state.doc from the snapshot

        // Update the state.
        const newVersion = snapshot ? snapshot.version : 0
        this.view.dispatch(
            this.view.state.tr.setMeta(
                key,
                new PluginState(
                    pluginState.type,
                    pluginState.id,
                    newVersion,
                    pluginState.schema,
                    [],
                ),
            ),
        )
    }

    private async initStream(
        _state: EditorState,
        pluginState: PluginState,
        notify: () => void,
    ): Promise<void> {
        // Create a new stream.
        const stream = await this.contentClient.streamOperations(
            pluginState.type,
            pluginState.id,
            pluginState.version + 1,
        )
        this.streamType = pluginState.type
        this.streamId = pluginState.id
        this.streamVersion = pluginState.version
        this.stream = stream
        this.stream.on('data', (operation: Operation) => {
            this.streamVersion = operation.version
            this.receiveOperation(operation)
        })
        this.stream.on('error', this.onError)
        this.stream.on('close', notify)
    }

    private async createOperation(
        state: EditorState,
        { type, id, version, schema, pendingSteps }: PluginState,
    ): Promise<void> {
        const operation: Operation = {
            key: createOperationKey(this.contentClient.userId!),
            type,
            id,
            version: version + 1,
            schema: schema!,
            data: pendingSteps.map(({ step }) => step),
            meta: null,
        }
        this.view!.dispatch(
            state.tr.setMeta(
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

    private async submitOperation(operation: Operation): Promise<void> {
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
    }

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

function asyncLoop<T>({
    create,
    update,
    destroy,
    done,
    onError,
    retryDelay,
}: {
    create(this: T, notify: () => void): void
    update: (this: T, notify: () => void) => Promise<void>
    destroy(this: T, notify: () => void): void
    done: (this: T) => boolean
    onError: (this: T, error: Error) => void
    retryDelay: (this: T, attempt: number) => number
}): (this: T) => Promise<void> {
    // tslint:disable-next-line:only-arrow-functions
    return async function (): Promise<void> {
        await Promise.resolve()
        let retryAttempt = 0
        let change: Promise<void>
        let triggerChange = noop
        function notify() {
            triggerChange()
        }

        create.call(this, notify)
        try {
            while (!done.call(this)) {
                change = new Promise((resolve) => (triggerChange = resolve))
                try {
                    await update.call(this, notify)
                    await change
                    retryAttempt = 0
                } catch (error) {
                    queueMicrotask(() => onError.call(this, error))
                    await Promise.race([
                        change,
                        delay(retryDelay.call(this, retryAttempt++)),
                    ])
                }
            }
        } finally {
            destroy.call(this, notify)
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
