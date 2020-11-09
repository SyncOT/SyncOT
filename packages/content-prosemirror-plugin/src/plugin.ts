import {
    ContentClient,
    createOperationKey,
    isAlreadyExistsError,
    Operation,
} from '@syncot/content'
import { assert } from '@syncot/util'
import {
    getVersion,
    receiveTransaction,
    sendableSteps,
} from 'prosemirror-collab'
import {
    EditorState,
    Plugin,
    PluginKey,
    PluginSpec,
    Transaction,
} from 'prosemirror-state'
import { Step } from 'prosemirror-transform'
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
}

/**
 * Creates an instance of the `syncOT` ProseMirror plugin
 * which synchronizes the document content and presence with the server and peer clients.
 */
export function syncOT({ type, id, contentClient }: SyncOTConfig): Plugin {
    assert(typeof type === 'string', 'Argument "type" must be a string.')
    assert(typeof id === 'string', 'Argument "id" must be a string.')
    assert(
        typeof contentClient === 'object' && contentClient != null,
        'Argument "contentClient" must be an object.',
    )
    return new Plugin<PluginState>({
        key,
        state: {
            init(_config: EditorStateConfig, state: EditorState): PluginState {
                // console.log('init state', _config)
                assertCollab(state)
                return {
                    type,
                    id,
                    version: null,
                }
            },

            apply(
                _tr: Transaction,
                value: PluginState,
                _oldState: EditorState,
                newState: EditorState,
            ): PluginState {
                // console.log('apply state')
                assertCollab(newState)
                return value
            },
        },
        view(view: EditorView) {
            return new PluginView(view, type, id, contentClient)
        },
    })
}

const key = new PluginKey<PluginState>('syncOT')

interface PluginState {
    /**
     * The type of the document in SyncOT.
     */
    type: string
    /**
     * The ID of the document in SyncOT.
     */
    id: string
    /**
     * The version number of the document in SyncOT with content corresponding to this state, if known.
     */
    version: number | null
}

interface EditorStateConfig {
    [key: string]: any
}

type PluginViewInterface = ReturnType<
    NonNullable<PluginSpec<PluginState>['view']>
>
class PluginView implements PluginViewInterface {
    /**
     * Indicates if this plugin view has been destroyed.
     */
    private destroyed: boolean = false
    /**
     * The next version number to use for submitting operations.
     */
    private nextVersion: number = 1
    /**
     * The clientID used by the "prosemirror-collab" plugin.
     */
    private collabClientId: number | string = ''
    /**
     * A stream of Operation objects recorded by the server.
     */
    private stream: Duplex | undefined
    /**
     * The operation which has been submitted to the server but not confirmed yet.
     */
    private pendingOperation: Operation | undefined

    public constructor(
        private view: EditorView,
        private type: string,
        private id: string,
        private contentClient: ContentClient,
    ) {
        assertCollab(this.view.state)
        this.init()
    }

    public update(_view: EditorView, _previousState: EditorState): void {
        assertCollab(this.view.state)
        this.submitOperation()
    }

    public destroy() {
        if (this.destroyed) {
            return
        }
        this.destroyed = true
    }

    private async init(): Promise<void> {
        // TODO recover from errors
        await new Promise((resolve) => setTimeout(resolve, 1000))
        const snapshot = await this.contentClient.getSnapshot(
            this.type,
            this.id,
        )
        this.nextVersion = snapshot.version + 1
        const stream = await this.contentClient.streamOperations(
            this.type,
            this.id,
            this.nextVersion,
        )
        if (this.destroyed) {
            stream.destroy()
        }

        this.stream = stream
        this.stream.on('data', this.receiveOperation)

        // TODO handle stream errors and the destroy event (maybe)
    }

    private async submitOperation(): Promise<void> {
        // console.log(
        //     `submitOperation: pending=${!!this
        //         .pendingOperation}; sendable=${!!sendableSteps(
        //         this.view.state,
        //     )}`,
        // )
        if (!this.contentClient.active) {
            return
        }
        if (this.pendingOperation != null) {
            return
        }

        const sendable = sendableSteps(this.view.state)
        if (!sendable) {
            return
        }

        const { clientID, steps } = sendable

        this.collabClientId = clientID
        this.pendingOperation = {
            key: createOperationKey(this.contentClient.userId!),
            type: this.type,
            id: this.id,
            version: this.nextVersion,
            schema: '',
            data: steps,
            meta: null,
        }

        try {
            await this.contentClient.submitOperation(this.pendingOperation)
        } catch (error) {
            if (isAlreadyExistsError(error)) {
                this.pendingOperation = undefined
            } else {
                throw error
            }
        }
    }

    private receiveOperation = (operation: Operation): void => {
        // console.log('receiveOperation', operation)
        assert(
            operation.version === this.nextVersion,
            `Expected operation version ${this.nextVersion}, got ${operation.version}.`,
        )

        const isOwnOperation =
            !!this.pendingOperation &&
            this.pendingOperation.key === operation.key
        const { view } = this
        const { state } = view
        const { schema } = state
        const steps = operation.data.map((step: any) =>
            Step.fromJSON(schema, step),
        )
        const clientId = isOwnOperation
            ? this.collabClientId
            : operation.meta!.session!
        const clientIds = new Array<string | number>(steps.length).fill(
            clientId,
        )
        const transaction = receiveTransaction(state, steps, clientIds)

        // console.log('transaction', transaction)

        if (isOwnOperation) {
            this.pendingOperation = undefined
        }
        this.nextVersion++
        view.dispatch(transaction)
        // TODO verify that the transaction was applied
    }
}

function assertCollab(state: EditorState): void {
    try {
        getVersion(state)
    } catch (error) {
        assert(
            false,
            'Cannot access the "prosemirror-collab" plugin instance. Make sure it is added to the State.',
        )
    }
}
