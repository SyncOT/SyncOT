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
import { randomInteger, SyncOtEmitter, toBuffer } from '@syncot/util'
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
    private presenceKey: Buffer | undefined = undefined
    private presenceValue: Buffer | undefined = undefined
    private updatingRedis: boolean = false
    private updateHandle: NodeJS.Timeout | undefined
    private modified: boolean = false
    private inSync: boolean = true

    public constructor(
        private readonly connection: Connection,
        private readonly sessionService: SessionManager,
        private readonly authService: AuthManager,
        private readonly redis: Redis.Redis,
        // @ts-ignore Unused parameter.
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
    }

    public destroy(): void {
        if (this.destroyed) {
            return
        }
        this.presenceValue = undefined
        this.modified = true
        this.updateRedis()
        super.destroy()
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

        this.presenceKey = getPresenceKey(presence)
        this.presenceValue = getPresenceValue(presence)
        this.modified = true
        this.updateRedis()

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

    private updateRedis(delay: number = 0): void {
        if (this.destroyed) {
            return
        }
        this.cancelUpdateRedis()
        this.updateHandle = setTimeout(() => {
            this.updateHandle = undefined
            this.updateRedisImpl()
        }, delay)
    }

    private cancelUpdateRedis(): void {
        if (this.updateHandle) {
            clearTimeout(this.updateHandle)
            this.updateHandle = undefined
        }
    }

    private async updateRedisImpl(): Promise<void> {
        if (this.updatingRedis || !this.presenceKey) {
            return
        }

        const wasModified = this.modified

        try {
            this.updatingRedis = true

            if (this.modified) {
                this.emitOutOfSync()
                this.modified = false
            }

            if (this.presenceValue) {
                await this.redis.setex(
                    this.presenceKey,
                    this.ttl,
                    this.presenceValue,
                )
            } else {
                await this.redis.del(this.presenceKey)
            }

            if (this.modified) {
                this.updateRedis()
            } else {
                this.emitInSync()
            }
        } catch (error) {
            if (wasModified) {
                this.modified = true
            }
            this.emitAsync('error', error)
            this.updateRedis(randomInteger(1000, 10000))
        } finally {
            this.updatingRedis = false
        }
    }

    private emitInSync(): void {
        if (!this.inSync) {
            this.inSync = true
            this.emitAsync('inSync')
        }
    }

    private emitOutOfSync(): void {
        if (this.inSync) {
            this.inSync = false
            this.emitAsync('outOfSync')
        }
    }
}

const presencePrefixString = 'presence:'
const presencePrefixBuffer = Buffer.allocUnsafeSlow(
    Buffer.byteLength(presencePrefixString),
)
presencePrefixBuffer.write(presencePrefixString)

function getPresenceKey(presence: Presence): Buffer {
    const sessionIdBuffer = toBuffer(presence.sessionId)
    const buffer = Buffer.allocUnsafe(
        presencePrefixBuffer.length + sessionIdBuffer.length,
    )
    presencePrefixBuffer.copy(buffer)
    sessionIdBuffer.copy(buffer, presencePrefixBuffer.length)
    return buffer
}

function getPresenceValue(presence: Presence): Buffer {
    return toBuffer(
        encode([
            // sessionId is already encoded in the presence key.
            presence.userId,
            presence.locationId,
            presence.data,
            Date.now(),
        ]),
    )
}
