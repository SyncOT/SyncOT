import { AuthManager, UserId } from '@syncot/auth'
import { Connection } from '@syncot/core'
import { createAuthError } from '@syncot/error'
import {
    LocationId,
    Presence,
    PresenceService,
    PresenceServiceEvents,
} from '@syncot/presence'
import { SessionId, SessionManager } from '@syncot/session'
import { SyncOtEmitter } from '@syncot/util'

/**
 * Creates a new presence service based on Redis and communicating with a presence client
 * through the specified `connection`.
 * The `sessionService` and `authService` are used for authentication and authorization.
 */
export function createPresenceService({
    connection,
    sessionService,
    authService,
}: {
    connection: Connection
    sessionService: SessionManager
    authService: AuthManager
}): PresenceService {
    return new RedisPresenceService(connection, sessionService, authService)
}

class RedisPresenceService extends SyncOtEmitter<PresenceServiceEvents>
    implements PresenceService {
    public constructor(
        private connection: Connection,
        private sessionService: SessionManager,
        private authService: AuthManager,
    ) {
        super()

        this.connection.registerService({
            actions: new Set([
                'submitPresence',
                'getPresenceBySessionId',
                'getPresenceByUserId',
                'getPresenceByLocationId',
            ]),
            instance: this,
            name: 'presence',
        })

        // TODO remove
        this.sessionService.getSessionId()
    }

    public async submitPresence(_presence: Presence): Promise<void> {
        this.assertAuthenticated()

        return
    }
    public async getPresenceBySessionId(
        _sessionId: SessionId,
    ): Promise<Presence | undefined> {
        this.assertAuthenticated()
        return
    }
    public async getPresenceByUserId(_userId: UserId): Promise<Presence[]> {
        this.assertAuthenticated()
        return []
    }
    public async getPresenceByLocationId(
        _locationId: LocationId,
    ): Promise<Presence[]> {
        this.assertAuthenticated()
        return []
    }

    private assertAuthenticated(): void {
        if (!this.authService.hasAuthenticatedUserId()) {
            throw createAuthError('Not authenticated.')
        }
    }
}
