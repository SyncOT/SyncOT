import { AuthClient } from '@syncot/auth'
import { Connection } from '@syncot/connection'
import {
    Presence,
    PresenceClient,
    PresenceClientEvents,
    PresenceService,
} from '@syncot/presence'
import { assert, createPresenceError, SyncOtEmitter } from '@syncot/util'
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
     * The AuthClient used for authentication and authorization.
     */
    authClient: AuthClient
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
    authClient,
    serviceName = 'presence',
}: CreatePresenceClientOptions): PresenceClient {
    return new Client(connection, authClient, serviceName)
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

class Client extends SyncOtEmitter<PresenceClientEvents>
    implements PresenceClient {
    public active: boolean = false
    public sessionId: string | undefined = undefined
    public userId: string | undefined = undefined
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
        private readonly authClient: AuthClient,
        serviceName: string,
    ) {
        super()

        assert(
            this.connection && !this.connection.destroyed,
            'Argument "connection" must be a non-destroyed Connection.',
        )
        assert(
            this.authClient && !this.authClient.destroyed,
            'Argument "authClient" must be a non-destroyed AuthClient.',
        )

        this.connection.registerProxy({
            name: serviceName,
            requestNames,
        })
        this.presenceService = this.connection.getProxy(
            'presence',
        ) as PresenceService

        this.connection.on('destroy', this.onDestroy)
        this.authClient.on('destroy', this.onDestroy)
        this.authClient.on('active', this.updateActive)
        this.authClient.on('inactive', this.updateActive)
        this.updateActive()
    }

    public destroy(): void {
        if (this.destroyed) {
            return
        }
        this.active = false
        this.sessionId = undefined
        this.userId = undefined
        this.presence = undefined
        this.connection.off('destroy', this.onDestroy)
        this.authClient.off('destroy', this.onDestroy)
        this.authClient.off('active', this.updateActive)
        this.authClient.off('inactive', this.updateActive)
        super.destroy()
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

    private updatePresence(): void {
        if (
            this.sessionId !== undefined &&
            this.userId !== undefined &&
            this.locationId !== undefined
        ) {
            this.presence = {
                data: this.data,
                lastModified: Date.now(),
                locationId: this.locationId,
                sessionId: this.sessionId,
                userId: this.userId,
            }
            this.emitAsync('presence')
            this.scheduleSyncPresence()
        } else if (this.presence !== undefined) {
            this.presence = undefined
            this.emitAsync('presence')
            this.scheduleSyncPresence()
        }
    }
    private updateActive = (): void => {
        if (this.active === this.authClient.active) {
            return
        }

        if (this.authClient.active) {
            this.active = true
            this.sessionId = this.authClient.sessionId
            this.userId = this.authClient.userId
            this.updatePresence()
            this.emitAsync('active')
        } else {
            this.active = false
            this.sessionId = undefined
            this.userId = undefined
            this.updatePresence()
            this.emitAsync('inactive')
        }
    }

    /**
     * Thanks to scheduling the sync to happen in `nextTick`, setting multiple presence
     * properties synchronously results in a single request only.
     */
    private scheduleSyncPresence(): void {
        if (this.syncPending) {
            return
        }

        this.syncPending = true
        process.nextTick(() => {
            this.syncPending = false
            this.syncPresence()
        })
    }

    private syncPresence(): void {
        if (!this.active) {
            return
        }

        if (this.presence) {
            this.presenceService
                .submitPresence(this.presence)
                .catch(this.onSyncError)
        } else {
            this.presenceService.removePresence().catch(this.onSyncError)
        }
    }

    private onSyncError = (error: Error): void => {
        this.emitAsync(
            'error',
            createPresenceError('Failed to sync presence.', error),
        )
    }

    private onDestroy = (): void => {
        this.destroy()
    }
}
