import { Auth } from '@syncot/auth'
import { Connection } from '@syncot/connection'
import {
    createPresenceError,
    Presence,
    PresenceClient,
    PresenceClientEvents,
    PresenceService,
} from '@syncot/presence'
import { assert, TypedEventEmitter } from '@syncot/util'
import { Duplex } from 'readable-stream'

/**
 * Options expected by `createPresenceClient`.
 */
export interface CreatePresenceClientOptions {
    /**
     * The Connection used for communication with PresenceService.
     */
    connection: Connection
    /**
     * The Auth instance to use for authentication and authorization.
     */
    auth: Auth
    /**
     * The name of the PresenceService on the Connection.
     * Default is `presence`.
     */
    serviceName?: string
}

/**
 * Creates a new PresenceClient communicating with a PresenceService
 * through the specified Connection.
 */
export function createPresenceClient({
    connection,
    auth,
    serviceName = 'presence',
}: CreatePresenceClientOptions): PresenceClient {
    return new Client(connection, auth, serviceName)
}

export const requestNames = new Set([
    'submitPresence',
    'removePresence',
    'getPresenceBySessionId',
    'getPresenceByUserId',
    'getPresenceByLocationId',
    'streamPresenceBySessionId',
    'streamPresenceByLocationId',
    'streamPresenceByUserId',
])

class Client
    extends TypedEventEmitter<PresenceClientEvents>
    implements PresenceClient {
    public presence: Presence | undefined = undefined

    private _locationId: string | undefined = undefined
    public set locationId(locationId: string | undefined) {
        this._locationId = locationId
        this.updatePresence()
    }
    public get locationId(): string | undefined {
        return this._locationId
    }

    private _data: any = null
    public set data(data: any) {
        this._data = data
        this.updatePresence()
    }
    public get data(): any {
        return this._data
    }

    private readonly presenceService: PresenceService
    private syncPending: boolean = false

    public constructor(
        private readonly connection: Connection,
        public readonly auth: Auth,
        serviceName: string,
    ) {
        super()

        assert(
            this.connection && !this.connection.destroyed,
            'Argument "connection" must be a non-destroyed Connection.',
        )
        assert(
            this.auth && typeof this.auth === 'object',
            'Argument "authClient" must be an object.',
        )

        this.presenceService = this.connection.registerProxy({
            name: serviceName,
            requestNames,
        }) as PresenceService

        this.auth.on('active', this.updatePresence)
        this.auth.on('inactive', this.updatePresence)
        this.updatePresence()
    }

    public getPresenceBySessionId(sessionId: string): Promise<Presence | null> {
        return this.presenceService.getPresenceBySessionId(sessionId)
    }

    public getPresenceByUserId(userId: string): Promise<Presence[]> {
        return this.presenceService.getPresenceByUserId(userId)
    }

    public getPresenceByLocationId(locationId: string): Promise<Presence[]> {
        return this.presenceService.getPresenceByLocationId(locationId)
    }

    public streamPresenceBySessionId(sessionId: string): Promise<Duplex> {
        return this.presenceService.streamPresenceBySessionId(sessionId)
    }

    public streamPresenceByUserId(userId: string): Promise<Duplex> {
        return this.presenceService.streamPresenceByUserId(userId)
    }

    public streamPresenceByLocationId(locationId: string): Promise<Duplex> {
        return this.presenceService.streamPresenceByLocationId(locationId)
    }

    private updatePresence = (): void => {
        if (this.auth.active && this.locationId !== undefined) {
            this.presence = {
                data: this.data,
                lastModified: Date.now(),
                locationId: this.locationId,
                sessionId: this.auth.sessionId!,
                userId: this.auth.userId!,
            }
            this.sync()
        } else if (this.presence !== undefined) {
            this.presence = undefined
            this.sync()
        }
    }

    private sync(): void {
        // Scheduling the sync allows setting multiple presence properties synchronously
        // and syncing them all together using a single request.
        if (this.syncPending) return
        this.syncPending = true
        queueMicrotask(async () => {
            this.syncPending = false
            this.syncNow()
            this.emit('presence')
        })
    }

    private async syncNow(): Promise<void> {
        if (!this.auth.active) return
        try {
            if (this.presence) {
                await this.presenceService.submitPresence(this.presence)
            } else {
                await this.presenceService.removePresence()
            }
        } catch (error) {
            this.emit(
                'error',
                createPresenceError('Failed to sync presence.', error),
            )
        }
    }
}
