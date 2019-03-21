import { AuthManager, UserId } from '@syncot/auth'
import { Connection } from '@syncot/core'
import { createPresenceError } from '@syncot/error'
import {
    Location,
    Presence,
    PresenceClient,
    PresenceClientEvents,
    PresenceService,
} from '@syncot/presence'
import { SessionId, SessionManager } from '@syncot/session'
import { SyncOtEmitter } from '@syncot/util'

/**
 * Creates a new presence client communicating with a presence service
 * through the specified `connection`. The `sessionClient` and `authClient` are
 * used for authentication and authorization.
 */
export function createPresenceClient({
    connection,
    sessionClient,
    authClient,
}: {
    connection: Connection
    sessionClient: SessionManager
    authClient: AuthManager
}): PresenceClient {
    return new GenericPresenceClient(connection, sessionClient, authClient)
}

class GenericPresenceClient extends SyncOtEmitter<PresenceClientEvents>
    implements PresenceClient {
    public get sessionId(): SessionId | undefined {
        return this.sessionClient.getSessionId()
    }

    public get userId(): UserId | undefined {
        return this.authClient.getUserId()
    }

    private _location: Location = null
    public set location(location: Location) {
        this._location = location
        this.updateLocalPresence()
    }
    public get location(): Location {
        return this._location
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

    public constructor(
        private connection: Connection,
        private sessionClient: SessionManager,
        private authClient: AuthManager,
    ) {
        super()

        this.connection.registerProxy({
            name: 'presence',
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

    public getPresenceBySessionId(
        sessionId: SessionId,
    ): Promise<Presence | undefined> {
        return this.presenceService.getPresenceBySessionId(sessionId)
    }

    public getPresenceByUserId(userId: UserId): Promise<Presence[]> {
        return this.presenceService.getPresenceByUserId(userId)
    }

    public getPresenceByLocation(location: Location): Promise<Presence[]> {
        return this.presenceService.getPresenceByLocation(location)
    }

    private updateLocalPresence = (): void => {
        if (this.sessionId !== undefined && this.userId !== undefined) {
            this._localPresence = {
                location: this.location,
                sessionId: this.sessionId,
                userId: this.userId,
            }
            this.emitAsync('localPresence')
            this.submitPresence()
        } else if (this._localPresence !== undefined) {
            this._localPresence = undefined
            this.emitAsync('localPresence')
        }
    }

    private updateOnline = (): void => {
        const online =
            this.sessionClient.hasActiveSession() &&
            this.authClient.hasAuthenticatedUserId()

        if (this._online !== online) {
            this._online = online
            this.emitAsync(online ? 'online' : 'offline')
            if (online) {
                this.submitPresence()
            }
        }
    }

    private submitPresence(): void {
        if (!this.destroyed && this.online && this.localPresence) {
            this.presenceService
                .submitPresence(this.localPresence)
                .catch(error => {
                    this.emitAsync(
                        'error',
                        createPresenceError(
                            'Failed to submit presence.',
                            error,
                        ),
                    )
                })
        }
    }
}
