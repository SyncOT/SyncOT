import { AuthClient } from '@syncot/auth'
import { Connection } from '@syncot/connection'
import { createPresenceError } from '@syncot/error'
import {
    Presence,
    PresenceClient,
    PresenceClientEvents,
    PresenceService,
} from '@syncot/presence'
import { SessionManager } from '@syncot/session'
import { Id, isId, SyncOtEmitter } from '@syncot/util'

/**
 * Creates a new presence client communicating with a presence service
 * through the specified `connection`. The `sessionClient` and `authClient` are
 * needed to get the `sessionId` and `userId` respectively.
 */
export function createPresenceClient({
    connection,
    sessionClient,
    authClient,
}: {
    connection: Connection
    sessionClient: SessionManager
    authClient: AuthClient
}): PresenceClient {
    return new GenericPresenceClient(connection, sessionClient, authClient)
}

class GenericPresenceClient extends SyncOtEmitter<PresenceClientEvents>
    implements PresenceClient {
    public get sessionId(): Id | undefined {
        return this.sessionClient.getSessionId()
    }

    public get userId(): Id | undefined {
        return this.authClient.getUserId()
    }

    private _locationId: Id | undefined = undefined
    public set locationId(locationId: Id | undefined) {
        this._locationId = locationId
        this.updateLocalPresence()
    }
    public get locationId(): Id | undefined {
        return this._locationId
    }

    private _data: any = null
    public set data(presenceData: any) {
        this._data = presenceData
        this.updateLocalPresence()
    }
    public get data(): any {
        return this._data
    }

    private _localPresence: Presence | undefined = undefined
    public get localPresence(): Presence | undefined {
        return this._localPresence
    }

    private _online: boolean = false
    public get online(): boolean {
        return this._online
    }

    private readonly presenceService: PresenceService

    private syncPending: boolean = false

    public constructor(
        private connection: Connection,
        private sessionClient: SessionManager,
        private authClient: AuthClient,
    ) {
        super()

        this.connection.registerProxy({
            name: 'presence',
            requestNames: new Set([
                'submitPresence',
                'removePresence',
                'getPresenceBySessionId',
                'getPresenceByUserId',
                'getPresenceByLocationId',
            ]),
        })
        this.presenceService = this.connection.getProxy(
            'presence',
        ) as PresenceService

        this.sessionClient.on('sessionOpen', this.updateLocalPresence)
        this.sessionClient.on('sessionActive', this.updateOnline)
        this.sessionClient.on('sessionInactive', this.updateOnline)
        this.sessionClient.on('sessionClose', this.updateLocalPresence)
        this.authClient.on('user', this.updateLocalPresence)
        this.authClient.on('auth', this.updateOnline)
        this.authClient.on('authEnd', this.updateOnline)
        this.authClient.on('userEnd', this.updateLocalPresence)

        this.updateOnline()
    }

    public destroy(): void {
        if (this.destroyed) {
            return
        }
        this.sessionClient.off('sessionOpen', this.updateLocalPresence)
        this.sessionClient.off('sessionActive', this.updateOnline)
        this.sessionClient.off('sessionInactive', this.updateOnline)
        this.sessionClient.off('sessionClose', this.updateLocalPresence)
        this.authClient.off('user', this.updateLocalPresence)
        this.authClient.off('auth', this.updateOnline)
        this.authClient.off('authEnd', this.updateOnline)
        this.authClient.off('userEnd', this.updateLocalPresence)
        super.destroy()
    }

    public getPresenceBySessionId(sessionId: Id): Promise<Presence | null> {
        return this.presenceService.getPresenceBySessionId(sessionId)
    }

    public getPresenceByUserId(userId: Id): Promise<Presence[]> {
        return this.presenceService.getPresenceByUserId(userId)
    }

    public getPresenceByLocationId(locationId: Id): Promise<Presence[]> {
        return this.presenceService.getPresenceByLocationId(locationId)
    }

    private updateLocalPresence = (): void => {
        if (
            isId(this.sessionId) &&
            isId(this.userId) &&
            isId(this.locationId)
        ) {
            this._localPresence = {
                data: this.data,
                lastModified: Date.now(),
                locationId: this.locationId,
                sessionId: this.sessionId,
                userId: this.userId,
            }
            this.emitAsync('localPresence')
            this.scheduleSyncPresence()
        } else if (this._localPresence !== undefined) {
            this._localPresence = undefined
            this.emitAsync('localPresence')
            this.scheduleSyncPresence()
        }
    }

    private updateOnline = (): void => {
        const online =
            this.sessionClient.hasActiveSession() &&
            this.authClient.hasAuthenticatedUserId()

        if (this._online === online) {
            return
        }

        this._online = online

        if (online) {
            this.emitAsync('online')
            if (this.localPresence) {
                this.scheduleSyncPresence()
            }
        } else {
            this.emitAsync('offline')
        }
    }

    private scheduleSyncPresence(): void {
        if (!this.syncPending) {
            this.syncPending = true
            Promise.resolve()
                .then(this.syncPresence)
                .catch(this.onSyncError)
        }
    }

    private syncPresence = async (): Promise<void> => {
        this.syncPending = false

        if (this.destroyed || !this.online) {
            return
        }

        if (this.localPresence) {
            await this.presenceService.submitPresence(this.localPresence)
        } else {
            await this.presenceService.removePresence()
        }
    }

    private onSyncError = (error: Error): void => {
        this.emitAsync(
            'error',
            createPresenceError('Failed to sync presence.', error),
        )
    }
}
