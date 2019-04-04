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
import { decode, encode } from '@syncot/tson'
import { Id, idEqual, SyncOtEmitter } from '@syncot/util'
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
 * `redis` is used for storage and publishing events.
 * `redisSubscriber` is used for subscribing to events.
 *
 * `redis` and `redisSubscriber` must:
 *
 * - be different Redis client instances
 * - connected to the same single Redis server
 * - configured with the following options:
 *   - dropBufferSupport: false (the same as default)
 *   - autoResubscribe: true (the same as default)
 *
 * The service [defines some commands](https://github.com/luin/ioredis/#lua-scripting)
 * on `redis` with names starting with `presence`.
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
    private readonly redis: Redis.Redis & PresenceCommands
    private ttl: number = 600
    private encodedPresence:
        | [Buffer, Buffer, Buffer, Buffer, Buffer]
        | undefined = undefined
    private shouldStorePresence: boolean = false
    private updatingRedis: boolean = false
    private updateHandle: NodeJS.Timeout | undefined
    private modified: boolean = false
    private inSync: boolean = true

    public constructor(
        private readonly connection: Connection,
        private readonly sessionService: SessionManager,
        private readonly authService: AuthManager,
        redis: Redis.Redis,
        // @ts-ignore Unused parameter.
        private readonly redisSubscriber: Redis.Redis,
        options: PresenceServiceOptions,
    ) {
        super()

        this.redis = defineRedisCommands(redis)

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

        const sessionId = this.sessionService.getSessionId()
        if (!idEqual(presence.sessionId, sessionId)) {
            throw createPresenceError('Session ID mismatch.')
        }

        const userId = this.authService.getUserId()
        if (!idEqual(presence.userId, userId)) {
            throw createPresenceError('User ID mismatch.')
        }

        this.encodedPresence = [
            Buffer.from(encode(presence.sessionId)),
            Buffer.from(encode(presence.userId)),
            Buffer.from(encode(presence.locationId)),
            Buffer.from(encode(presence.data)),
            Buffer.from(encode(Date.now())),
        ]
        this.shouldStorePresence = true
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
        sessionId: Id,
    ): Promise<Presence | null> {
        this.assertOk()

        let userId: Buffer
        let locationId: Buffer
        let data: Buffer
        let lastModified: Buffer
        let presence: Presence

        try {
            ;[
                userId,
                locationId,
                data,
                lastModified,
            ] = await this.redis.presenceGetBySessionIdBuffer(
                Buffer.from(encode(sessionId)),
            )
        } catch (error) {
            throw createPresenceError('Failed to load presence.', error)
        }

        if (
            !Buffer.isBuffer(userId) ||
            !Buffer.isBuffer(locationId) ||
            !Buffer.isBuffer(data) ||
            !Buffer.isBuffer(lastModified)
        ) {
            return null
        }

        try {
            presence = {
                data: decode(data),
                lastModified: decode(lastModified) as number,
                locationId: decode(locationId) as Id,
                sessionId,
                userId: decode(userId) as Id,
            }

            throwError(validatePresence(presence))
        } catch (error) {
            throw createPresenceError('Invalid presence.', error)
        }

        return presence
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
        if (this.updatingRedis || !this.encodedPresence) {
            return
        }

        const wasModified = this.modified

        try {
            this.updatingRedis = true

            if (this.modified) {
                this.emitOutOfSync()
                this.modified = false
            }

            await this.redis.presenceUpdate(
                this.encodedPresence[0],
                this.encodedPresence[1],
                this.encodedPresence[2],
                this.encodedPresence[3],
                this.encodedPresence[4],
                this.shouldStorePresence ? this.ttl : 0,
                wasModified ? 1 : 0,
            )

            if (this.modified) {
                this.scheduleUpdateRedis()
            } else {
                this.emitInSync()
                if (this.encodedPresence) {
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
        if (this.shouldStorePresence) {
            this.shouldStorePresence = false
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

interface PresenceCommands {
    presenceUpdate(
        sessionId: Buffer,
        userId: Buffer,
        locationId: Buffer,
        data: Buffer,
        lastModified: Buffer,
        ttl: number,
        modified: 0 | 1,
    ): Promise<void>
    presenceGetBySessionIdBuffer(
        sessionId: Buffer,
    ): Promise<[Buffer, Buffer, Buffer, Buffer]>
}

const presenceUpdate = `
local sessionId = ARGV[1]
local userId = ARGV[2]
local locationId = ARGV[3]
local data = ARGV[4]
local lastModified = ARGV[5]
local ttl = tonumber(ARGV[6])
local modified = ARGV[7] == '1'
local presenceKey = 'presence:sessionId='..sessionId

if (ttl <= 0)
then
    redis.call('del', presenceKey)
    return redis.status_reply('OK')
end

if (not modified and redis.call('expire', presenceKey, ttl) == 1)
then
    return redis.status_reply('OK')
end

redis.call('hmset', presenceKey,
    'userId', ARGV[2],
    'locationId', ARGV[3],
    'data', ARGV[4],
    'lastModified', ARGV[5]
)

redis.call('expire', presenceKey, ttl)

return redis.status_reply('OK')
`

const presenceGetBySessionId = `
local presenceKey = 'presence:sessionId='..ARGV[1]
return redis.call('hmget', presenceKey, 'userId', 'locationId', 'data', 'lastModified')
`

function defineRedisCommands(
    redis: Redis.Redis,
): Redis.Redis & PresenceCommands {
    if (!(redis as any).presenceUpdate) {
        redis.defineCommand('presenceUpdate', {
            lua: presenceUpdate,
            numberOfKeys: 0,
        })
    }

    if (!(redis as any).presenceGetBySessionId) {
        redis.defineCommand('presenceGetBySessionId', {
            lua: presenceGetBySessionId,
            numberOfKeys: 0,
        })
    }

    return redis as any
}
