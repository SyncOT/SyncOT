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
     * The time in seconds after which presence data will expire, unless refreshed.
     * PresenceService automatically refreshes the presence data one second before it expires.
     * The ttl ensures the data is eventually removed in case the PresenceService
     * cannot remove it for any reason when necessary.
     *
     * Defaults to 60 seconds. Min value is 10 seconds. The smaller the ttl,
     * the more frequently the presence data needs to be refreshed, which may negatively
     * impact the performance.
     *
     * The ttl should be set to the same value for all PresenceService instances connecting
     * to the same Redis server to ensure predictable behavior.
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

/**
 * The fields in order are: sessionId, userId, locationId, data, lastModified.
 */
type EncodedPresence = [Buffer, Buffer, Buffer, Buffer, Buffer]

class RedisPresenceService extends SyncOtEmitter<PresenceServiceEvents>
    implements PresenceService {
    private readonly redis: Redis.Redis & PresenceCommands
    private ttl: number = 60
    private encodedPresence: EncodedPresence | undefined = undefined
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

        try {
            const encodedPresence = await this.redis.presenceGetBySessionIdBuffer(
                Buffer.from(encode(sessionId)),
            )
            return decodePresence(encodedPresence)
        } catch (error) {
            throw createPresenceError(
                'Failed to load presence by sessionId.',
                error,
            )
        }
    }

    public async getPresenceByUserId(userId: Id): Promise<Presence[]> {
        this.assertOk()

        try {
            const encodedPresenceArray = await this.redis.presenceGetByUserIdBuffer(
                Buffer.from(encode(userId)),
            )
            return encodedPresenceArray
                .map(decodePresence)
                .filter(presence => !!presence) as Presence[]
        } catch (error) {
            throw createPresenceError(
                'Failed to load presence by userId.',
                error,
            )
        }
    }

    public async getPresenceByLocationId(locationId: Id): Promise<Presence[]> {
        this.assertOk()

        try {
            const encodedPresenceArray = await this.redis.presenceGetByLocationIdBuffer(
                Buffer.from(encode(locationId)),
            )
            return encodedPresenceArray
                .map(decodePresence)
                .filter(presence => !!presence) as Presence[]
        } catch (error) {
            throw createPresenceError(
                'Failed to load presence by locationId.',
                error,
            )
        }
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

            if (this.shouldStorePresence) {
                await this.redis.presenceUpdate(
                    this.encodedPresence[0],
                    this.encodedPresence[1],
                    this.encodedPresence[2],
                    this.encodedPresence[3],
                    this.encodedPresence[4],
                    this.ttl,
                    wasModified ? 1 : 0,
                )
            } else if (wasModified) {
                await this.redis.presenceDelete(this.encodedPresence[0])
            }

            if (this.modified) {
                this.scheduleUpdateRedis()
            } else {
                this.emitInSync()
                if (this.encodedPresence) {
                    // Refresh after 90% of ttl has elapsed.
                    this.scheduleUpdateRedis(this.ttl - 1)
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
    presenceDelete(sessionId: Buffer): Promise<void>
    presenceGetBySessionIdBuffer(sessionId: Buffer): Promise<EncodedPresence>
    presenceGetByUserIdBuffer(userId: Buffer): Promise<EncodedPresence[]>
    presenceGetByLocationIdBuffer(
        locationId: Buffer,
    ): Promise<EncodedPresence[]>
}

const presenceUpdate = `
local sessionId = ARGV[1]
local userId = ARGV[2]
local locationId = ARGV[3]
local data = ARGV[4]
local lastModified = ARGV[5]
local ttl = tonumber(ARGV[6])
local modified = ARGV[7] == '1'

local presencePrefix = 'presence:sessionId='
local userPrefix = 'sessionIds:userId='
local locationPrefix = 'sessionIds:locationId='

local presenceKey = presencePrefix..sessionId
local userKey = userPrefix..userId
local locationKey = locationPrefix..locationId

-- Try to refresh the existing data only.
if (
    not modified and
    redis.call('expire', presenceKey, ttl) == 1 and
    redis.call('expire', userKey, ttl) == 1 and
    redis.call('expire', locationKey, ttl) == 1
)
then
    return redis.status_reply('OK')
end

-- Remove old indexes.
local oldPresence = redis.call('hmget', presenceKey, 'userId', 'locationId')
local oldUserId = oldPresence[1]
local oldLocationId = oldPresence[2]

redis.log(redis.LOG_WARNING, 'Hello '..cjson.encode(oldPresence))

if (oldUserId)
then
    redis.call('srem', userPrefix..oldUserId, sessionId)
end

if (oldLocationId)
then
    redis.call('srem', locationPrefix..oldLocationId, sessionId)
end

-- Store the modified data.
redis.call('hmset', presenceKey,
    'userId', userId,
    'locationId', locationId,
    'data', data,
    'lastModified', lastModified
)
redis.call('expire', presenceKey, ttl)

redis.call('sadd', userKey, sessionId)
redis.call('expire', userKey, ttl)

redis.call('sadd', locationKey, sessionId)
redis.call('expire', locationKey, ttl)

return redis.status_reply('OK')
`

const presenceDelete = `
local sessionId = ARGV[1]

local presencePrefix = 'presence:sessionId='
local userPrefix = 'sessionIds:userId='
local locationPrefix = 'sessionIds:locationId='

local presenceKey = presencePrefix..sessionId

local presence = redis.call('hmget', presenceKey, 'userId', 'locationId')
local userId = presence[1]
local locationId = presence[2]

if (userId)
then
    redis.call('srem', userPrefix..userId, sessionId)
end

if (locationId)
then
    redis.call('srem', locationPrefix..locationId, sessionId)
end

redis.call('del', presenceKey)

return redis.status_reply('OK')
`

const presenceGetBySessionId = `
local sessionId = ARGV[1]
local presence = redis.call('hmget', 'presence:sessionId='..sessionId,
    'sessionId', 'userId', 'locationId', 'data', 'lastModified'
)
presence[1] = sessionId
return presence
`

const presenceGetByUserId = `
local userId = ARGV[1]
local list = redis.call('smembers', 'sessionIds:userId='..userId)

for i = 1, #list
do
    local sessionId = list[i]
    local presence = redis.call('hmget', 'presence:sessionId='..sessionId,
        'sessionId', 'userId', 'locationId', 'data', 'lastModified'
    )
    presence[1] = sessionId
    list[i] = presence
end

return list
`

const presenceGetByLocationId = `
local locationId = ARGV[1]
local list = redis.call('smembers', 'sessionIds:locationId='..locationId)

for i = 1, #list
do
    local sessionId = list[i]
    local presence = redis.call('hmget', 'presence:sessionId='..sessionId,
        'sessionId', 'userId', 'locationId', 'data', 'lastModified'
    )
    presence[1] = sessionId
    list[i] = presence
end

return list
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

    if (!(redis as any).presenceDelete) {
        redis.defineCommand('presenceDelete', {
            lua: presenceDelete,
            numberOfKeys: 0,
        })
    }

    if (!(redis as any).presenceGetBySessionId) {
        redis.defineCommand('presenceGetBySessionId', {
            lua: presenceGetBySessionId,
            numberOfKeys: 0,
        })
    }

    if (!(redis as any).presenceGetByUserId) {
        redis.defineCommand('presenceGetByUserId', {
            lua: presenceGetByUserId,
            numberOfKeys: 0,
        })
    }

    if (!(redis as any).presenceGetByLocationId) {
        redis.defineCommand('presenceGetByLocationId', {
            lua: presenceGetByLocationId,
            numberOfKeys: 0,
        })
    }

    return redis as any
}

function decodePresence(encodedPresence: EncodedPresence): Presence | null {
    if (
        encodedPresence[0] === null ||
        encodedPresence[1] === null ||
        encodedPresence[2] === null ||
        encodedPresence[3] === null ||
        encodedPresence[4] === null
    ) {
        return null
    }

    try {
        const presence: Presence = {
            data: decode(encodedPresence[3]),
            lastModified: decode(encodedPresence[4]) as number,
            locationId: decode(encodedPresence[2]) as Id,
            sessionId: decode(encodedPresence[0]) as Id,
            userId: decode(encodedPresence[1]) as Id,
        }

        throwError(validatePresence(presence))

        return presence
    } catch (error) {
        throw createPresenceError('Invalid presence.', error)
    }
}
