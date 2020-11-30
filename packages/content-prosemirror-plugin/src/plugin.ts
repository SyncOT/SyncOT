import {
    ContentClient,
    createOperationKey,
    isAlreadyExistsError,
    Operation,
} from '@syncot/content'
import { assert, throwError } from '@syncot/util'
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
                return new PluginState(type, id, -1, [])
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
// TODO complete it
class PluginView implements PluginViewInterface {
    private view: EditorView | undefined
    private stream: Duplex | undefined
    private streamLoading: boolean = false
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
        assert(
            this.pluginState.pendingSteps.length === 0,
            'Unexpected pending steps in syncOT plugin state.',
        )
        this.ensureVersion()
        this.ensureStream()
        this.contentClient.on('active', this.onActive)
    }

    public update(_view: EditorView, previousState: EditorState): void {
        this.ensureVersion()
        this.ensureStream()
        const { pluginState } = this
        const previousPluginState = key.getState(previousState)!
        if (
            pluginState.type !== previousPluginState.type ||
            pluginState.id !== previousPluginState.id ||
            pluginState.version < previousPluginState.version
        ) {
            this.minVersionForSubmit = 0
        }
        this.submitOperation()
    }

    public destroy() {
        this.view = undefined
        this.contentClient.off('active', this.onActive)
        if (this.stream) {
            this.stream.destroy()
        }
    }

    private onActive = (): void => {
        this.ensureVersion()
        this.ensureStream()
        this.submitOperation()
    }

    private onData = (operation: Operation): void => {
        this.view!.dispatch(this.receiveOperation(operation))
    }

    private onClose = (): void => {
        this.stream = undefined
        this.ensureStream()
    }

    private async ensureVersion(): Promise<void> {
        const { type, id, version } = this.pluginState
        if (version >= 0 || !this.contentClient.active) {
            return
        }

        try {
            const oldState = this.state
            const snapshot = await this.contentClient.getSnapshot(type, id)
            if (!this.view || this.state !== oldState) return
            // TODO init state.doc from the snapshot
            this.view.dispatch(
                this.view.state.tr.setMeta(
                    key,
                    new PluginState(type, id, snapshot.version, []),
                ),
            )
        } catch (error) {
            queueMicrotask(() => this.onError(error))
            // TODO wait and retry
        }
    }

    private async ensureStream(): Promise<void> {
        // Handle plugin already destroyed.
        if (!this.view) {
            if (this.stream) {
                this.stream.destroy()
                this.stream = undefined
            }
            return
        }

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
            this.stream = undefined
            return
        }

        // Check if new stream can be created.
        if (version < 0) return // State version not initialized.
        if (!this.contentClient.active) return // Content client not active.
        if (this.streamLoading) return // Stream already initializing.

        // Create a new stream.
        try {
            this.streamLoading = true
            this.streamType = type
            this.streamId = id
            this.streamVersion = version
            this.stream = await this.contentClient.streamOperations(
                type,
                id,
                version + 1,
            )
            this.stream.on('data', this.onData)
            this.stream.on('error', this.onError)
            this.stream.on('close', this.onClose)
            // Make sure that we're still subscribed to the correct stream,
            // as the plugin's state might have changed in the meantime.
            this.ensureStream()
        } catch (error) {
            queueMicrotask(() => this.onError(error))
            // TODO wait and retry
        } finally {
            this.streamLoading = false
        }
    }

    private async submitOperation(): Promise<void> {
        if (!this.contentClient.active) {
            // Can't submit right now.
            return
        }

        const { type, id, version, pendingSteps } = this.pluginState
        if (pendingSteps.length === 0) {
            // Nothing to submit.
            return
        }

        const pendingOperation = pendingSteps[0].operation
        if (!pendingOperation) {
            // No operation to submit - create it first.
            const operation: Operation = {
                key: createOperationKey(this.contentClient.userId!),
                type,
                id,
                version: version + 1,
                schema: '',
                data: pendingSteps.map(({ step }) => step),
                meta: null,
            }
            this.view!.dispatch(
                this.state.tr.setMeta(
                    key,
                    new PluginState(
                        type,
                        id,
                        version,
                        pendingSteps.map(
                            ({ step, invertedStep }) =>
                                new Rebaseable(step, invertedStep, operation),
                        ),
                    ),
                ),
            )
            return
        }

        if (pendingOperation.version < this.minVersionForSubmit) {
            // Must get operations from the server first.
            return
        }

        this.minVersionForSubmit = pendingOperation.version + 1

        try {
            await this.contentClient.submitOperation(pendingOperation)
        } catch (error) {
            if (isAlreadyExistsError(error)) {
                // Wait until the operation is confirmed.
                if (error.key === 'version') {
                    this.minVersionForSubmit = Math.max(
                        this.minVersionForSubmit,
                        error.value + 1,
                    )
                } // else: `minVersionForSubmit` is already set to the correct value.
            } else {
                queueMicrotask(() => this.onError(error))
                this.minVersionForSubmit = pendingOperation.version
                // TODO wait and retry
            }
        }
    }

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
        const { type, id, version, pendingSteps } = this.pluginState
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
                    new PluginState(type, id, nextVersion, rebasedPendingSteps),
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
