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
import { encode } from '@syncot/tson'
import { SyncOtEmitter, toBuffer } from '@syncot/util'
import { strict as assert } from 'assert'
import Redis from 'ioredis'

export interface PresenceServiceConfig {
    connection: Connection
    sessionService: SessionManager
    authService: AuthManager
    redis: Redis.Redis
    redisSubscriber: Redis.Redis
}

export interface PresenceServiceOptions {
    /**
     * The time in seconds after which presence data will expire, unless refrehed.
     * PresenceService automatically refreshes the presence data it stored after
     * 90% of ttl has elapsed. The ttl ensures the data is eventually removed in
     * case the PresenceService cannot remove it when the PresenceClient disconnects.
     *
     * Defaults to 600 (10 minutes). Min value is 10 (10 seconds). The smaller the ttl,
     * the more frequently the presence data needs to be refreshed, which may negatively
     * impact the performance.
     */
    ttl?: number
}

/**
 * Creates a new presence service based on Redis and communicating with a presence client
 * through the specified `connection`.
 * The `sessionService` and `authService` are used for authentication and authorization.
 */
export function createPresenceService(
    {
        connection,
        sessionService,
        authService,
        redis,
        redisSubscriber,
    }: PresenceServiceConfig,
    options: PresenceServiceOptions = {},
): PresenceService {
    return new RedisPresenceService(
        connection,
        sessionService,
        authService,
        redis,
        redisSubscriber,
        options,
    )
}

class RedisPresenceService extends SyncOtEmitter<PresenceServiceEvents>
    implements PresenceService {
    private ttl: number = 600

    public constructor(
        private readonly connection: Connection,
        private readonly sessionService: SessionManager,
        private readonly authService: AuthManager,
        private readonly redis: Redis.Redis,
        private readonly redisSubscriber: Redis.Redis,
        options: PresenceServiceOptions,
    ) {
        super()

        if (typeof options.ttl !== 'undefined') {
            assert.ok(
                Number.isSafeInteger(options.ttl),
                'Argument "options.ttl" must be undefined or a safe integer.',
            )
            this.ttl = Math.max(options.ttl, 10)
        }

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

        // TODO remove this - a workaround for the unused property warning
        this.redisSubscriber = this.redisSubscriber
    }

    public async submitPresence(presence: Presence): Promise<void> {
        this.assertOk()
        throwError(validatePresence(presence))

        const sessionId = this.sessionService.getSessionId()!
        if (!sessionIdEqual(presence.sessionId, sessionId)) {
            throw createPresenceError('Session ID mismatch.')
        }

        const userId = this.authService.getUserId()!
        if (!userIdEqual(presence.userId, userId)) {
            throw createPresenceError('User ID mismatch.')
        }

        const presenceKey = getPresenceKey(sessionId)
        await this.redis.setex(
            presenceKey,
            this.ttl,
            toBuffer(
                encode([
                    // sessionId is already encoded in the presenceKey.
                    userId,
                    presence.locationId,
                    presence.data,
                    presence.lastModified,
                ]),
            ),
        )

        return
    }

    public async getPresenceBySessionId(
        _sessionId: SessionId,
    ): Promise<Presence | undefined> {
        this.assertOk()
        return
    }

    public async getPresenceByUserId(_userId: UserId): Promise<Presence[]> {
        this.assertOk()
        return []
    }

    public async getPresenceByLocationId(
        _locationId: LocationId,
    ): Promise<Presence[]> {
        this.assertOk()
        return []
    }

    private assertOk(): void {
        this.assertNotDestroyed()
        this.assertAuthenticated()
    }

    private assertAuthenticated(): void {
        if (!this.authService.hasAuthenticatedUserId()) {
            throw createAuthError('No authenticated user.')
        }

        if (!this.sessionService.hasActiveSession()) {
            throw createAuthError('No active session.')
        }
    }
}

const presencePrefixString = 'presence:'
const presencePrefixBuffer = Buffer.allocUnsafeSlow(
    Buffer.byteLength(presencePrefixString),
)
presencePrefixBuffer.write(presencePrefixString)

function getPresenceKey(sessionId: SessionId): Buffer {
    const sessionIdBuffer = toBuffer(sessionId)
    const buffer = Buffer.allocUnsafe(
        presencePrefixBuffer.length + sessionIdBuffer.length,
    )
    presencePrefixBuffer.copy(buffer)
    sessionIdBuffer.copy(buffer, presencePrefixBuffer.length)
    return buffer
}
