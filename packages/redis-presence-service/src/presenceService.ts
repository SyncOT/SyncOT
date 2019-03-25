import { AuthManager, UserId, userIdEqual } from '@syncot/auth'
import { Connection, throwError } from '@syncot/core'
import { createAuthError, createPresenceError } from '@syncot/error'
import {
    LocationId,
    Presence,
    PresenceService,
    PresenceServiceEvents,
    validatePresence,
} from '@syncot/presence'
import { SessionId, sessionIdEqual, SessionManager } from '@syncot/session'
import { SyncOtEmitter } from '@syncot/util'
import { Redis } from 'ioredis'

export interface PresenceServiceConfig {
    connection: Connection
    sessionService: SessionManager
    authService: AuthManager
    redis: Redis
    redisSubscriber: Redis
}

/**
 * Creates a new presence service based on Redis and communicating with a presence client
 * through the specified `connection`.
 * The `sessionService` and `authService` are used for authentication and authorization.
 */
export function createPresenceService({
    connection,
    sessionService,
    authService,
}: PresenceServiceConfig): PresenceService {
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
    }

    public async submitPresence(presence: Presence): Promise<void> {
        this.assertNotDestroyed()
        this.assertAuthenticated()
        throwError(validatePresence(presence))

        if (
            !sessionIdEqual(
                presence.sessionId,
                this.sessionService.getSessionId(),
            )
        ) {
            throw createPresenceError('Session ID mismatch.')
        }

        if (!userIdEqual(presence.userId, this.authService.getUserId())) {
            throw createPresenceError('User ID mismatch.')
        }

        return
    }
    public async getPresenceBySessionId(
        _sessionId: SessionId,
    ): Promise<Presence | undefined> {
        this.assertNotDestroyed()
        this.assertAuthenticated()
        return
    }
    public async getPresenceByUserId(_userId: UserId): Promise<Presence[]> {
        this.assertNotDestroyed()
        this.assertAuthenticated()
        return []
    }
    public async getPresenceByLocationId(
        _locationId: LocationId,
    ): Promise<Presence[]> {
        this.assertNotDestroyed()
        this.assertAuthenticated()
        return []
    }

    private assertAuthenticated(): void {
        if (
            !this.authService.hasAuthenticatedUserId() ||
            !this.sessionService.hasActiveSession()
        ) {
            throw createAuthError('Not authenticated.')
        }
    }
}
