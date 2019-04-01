import { AuthManager } from '@syncot/auth'
import { Connection, throwError } from '@syncot/core'
import { createAuthError, createPresenceError } from '@syncot/error'
import {
    Presence,
    PresenceService,
    PresenceServiceEvents,
    validatePresence,
} from '@syncot/presence'
import { SessionManager } from '@syncot/session'
import { encode } from '@syncot/tson'
import { Id, idEqual, SyncOtEmitter } from '@syncot/util'
import { strict as assert } from 'assert'
import Redis from 'ioredis'

export interface PresenceServiceConfig {
    connection: Connection
    sessionService: SessionManager
    authService: AuthManager
    redis: Redis.Redis
    redisPublisher: Redis.Redis
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
 * `redis` is used for storing data in and retrieving it from Redis.
 * `redisPublisher` is used for publishing events to Redis.
 * It can be the same instance as `redis`.
 * `redisSubscriber` is used for subscribing to Redis events.
 * It must be a different instance from `redis` and `redisPublisher`.
 * It must be connected to the same Redis instance as `redisPublisher`.
 */
export function createPresenceService(
    {
        connection,
        sessionService,
        authService,
        redis,
        redisPublisher,
        redisSubscriber,
    }: PresenceServiceConfig,
    options: PresenceServiceOptions = {},
): PresenceService {
    return new RedisPresenceService(
        connection,
        sessionService,
        authService,
        redis,
        redisPublisher,
        redisSubscriber,
        options,
    )
}

class RedisPresenceService extends SyncOtEmitter<PresenceServiceEvents>
    implements PresenceService {
    private ttl: number = 600
    private sessionId: Id | undefined = undefined
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
        private readonly redisPublisher: Redis.Redis,
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
                'removePresence',
                'getPresenceBySessionId',
                'getPresenceByUserId',
                'getPresenceByLocationId',
            ]),
            instance: this,
            name: 'presence',
        })

        this.authService.on('authEnd', this.onAuthEnd)
        this.sessionService.on('sessionInactive', this.onSessionInactive)
    }

    public destroy(): void {
        if (this.destroyed) {
            return
        }
        this.authService.off('authEnd', this.onAuthEnd)
        this.sessionService.off('sessionInactive', this.onSessionInactive)
        this.ensureNoPresence()
        super.destroy()
    }

    public async submitPresence(presence: Presence): Promise<void> {
        this.assertOk()
        throwError(validatePresence(presence))

        const sessionId = this.sessionService.getSessionId()!
        if (!idEqual(presence.sessionId, sessionId)) {
            throw createPresenceError('Session ID mismatch.')
        }

        const userId = this.authService.getUserId()!
        if (!idEqual(presence.userId, userId)) {
            throw createPresenceError('User ID mismatch.')
        }

        if (!idEqual(this.sessionId, presence.sessionId)) {
            this.sessionId = presence.sessionId
            this.presenceKey = getPresenceKey(presence)
        }
        this.presenceValue = getPresenceValue(presence)
        this.modified = true
        this.scheduleUpdateRedis()

        return
    }

    public async removePresence(): Promise<void> {
        // Explicit authentication is not needed because if the user is not authenticated,
        // then any existing presence is automatically removed and new presence cannot be
        // submitted. Consequently, the state of this service cannot be affected by an
        // unauthenticated user.
        this.ensureNoPresence()
    }

    public async getPresenceBySessionId(
        _sessionId: Id,
    ): Promise<Presence | undefined> {
        this.assertOk()
        return
    }

    public async getPresenceByUserId(_userId: Id): Promise<Presence[]> {
        this.assertOk()
        return []
    }

    public async getPresenceByLocationId(_locationId: Id): Promise<Presence[]> {
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

    private scheduleUpdateRedis(delaySeconds: number = 0): void {
        if (this.destroyed) {
            return
        }
        this.cancelUpdateRedis()
        this.updateHandle = setTimeout(() => {
            this.updateHandle = undefined
            this.updateRedis()
        }, Math.max(0, Math.floor(delaySeconds * 1000)))
    }

    private cancelUpdateRedis(): void {
        if (this.updateHandle) {
            clearTimeout(this.updateHandle)
            this.updateHandle = undefined
        }
    }

    private async updateRedis(): Promise<void> {
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
                if (
                    wasModified ||
                    !(await this.redis.expire(this.presenceKey, this.ttl))
                ) {
                    await this.redis.setex(
                        this.presenceKey,
                        this.ttl,
                        this.presenceValue,
                    )
                    this.emitAsync('publish')
                }
            } else {
                await this.redis.del(this.presenceKey)
                this.emitAsync('publish')
            }

            if (this.modified) {
                this.scheduleUpdateRedis()
            } else {
                this.emitInSync()
                if (this.presenceValue) {
                    // Refresh after 90% of ttl has elapsed.
                    this.scheduleUpdateRedis(this.ttl * 0.9)
                }
            }
        } catch (error) {
            if (wasModified) {
                this.modified = true
            }
            this.emitAsync(
                'error',
                createPresenceError(
                    'Failed to sync presence with Redis.',
                    error,
                ),
            )
            // Retry after between 1 and 10 seconds.
            this.scheduleUpdateRedis(1 + Math.random() * 9)
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

    private ensureNoPresence(): void {
        if (this.presenceValue) {
            this.presenceValue = undefined
            this.modified = true
        }
        this.scheduleUpdateRedis()
    }

    private onAuthEnd = (): void => {
        this.ensureNoPresence()
    }

    private onSessionInactive = (): void => {
        this.ensureNoPresence()
    }
}

const presencePrefixString = 'presence:sessionId='
const presencePrefixByteLength = Buffer.byteLength(presencePrefixString)
const presencePrefixBuffer = Buffer.allocUnsafeSlow(presencePrefixByteLength)
presencePrefixBuffer.write(presencePrefixString)

function getPresenceKey(presence: Presence): Buffer {
    const sessionIdBuffer = Buffer.from(encode(presence.sessionId))
    // We're going to keep this buffer for an indeterminate amount of time and we're
    // likely to have lots of these buffers, so it's preferable to allocate separate memory
    // in this case and keep the internal nodejs buffer available for other uses.
    // See https://nodejs.org/api/buffer.html#buffer_class_method_buffer_allocunsafeslow_size
    const buffer = Buffer.allocUnsafeSlow(
        presencePrefixByteLength + sessionIdBuffer.length,
    )
    presencePrefixBuffer.copy(buffer)
    sessionIdBuffer.copy(buffer, presencePrefixByteLength)
    return buffer
}

function getPresenceValue(presence: Presence): Buffer {
    return Buffer.from(
        encode([
            // sessionId is already encoded in the presence key.
            presence.userId,
            presence.locationId,
            presence.data,
            Date.now(),
        ]),
    )
}
