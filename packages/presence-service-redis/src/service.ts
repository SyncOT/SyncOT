import { Auth, createAuthError } from '@syncot/auth'
import { Connection } from '@syncot/connection'
import { globalEventLoop } from '@syncot/event-loop'
import {
    EventType,
    getRedisSubscriber,
    Subscriber,
} from '@syncot/ioredis-subscriber'
import {
    createPresenceError,
    Presence,
    PresenceService,
    PresenceServiceEvents,
    validatePresence,
} from '@syncot/presence'
import { assert, SyncOTEmitter } from '@syncot/util'
import Redis from 'ioredis'
import { Duplex } from 'readable-stream'
import {
    defineRedisCommands,
    locationPrefix,
    PresenceCommands,
    PresenceResult,
    sessionPrefix,
    userPrefix,
} from './commands'
import { getRedisConnectionManager, RedisConnectionManager } from './connection'
import { PresenceStream } from './stream'

export interface CreatePresenceServiceOptions {
    connection: Connection
    authService: Auth
    redis: Redis.Redis
    redisSubscriber: Redis.Redis
}

/**
 * Creates a new presence service based on Redis and communicating with a presence client
 * through the specified `connection`.
 * The `authService` is used for authentication and authorization.
 * `redis` is used for storage and publishing events.
 * `redisSubscriber` is used for subscribing to events.
 *
 * `redis` and `redisSubscriber` must:
 *
 * - be different Redis client instances
 * - connected to the same single Redis server
 * - configured with the following options:
 *   - `autoResubscribe: false`
 *   - `enableOfflineQueue: false`
 *   - `enableReadyCheck: true`
 *
 * The service [defines some commands](https://github.com/luin/ioredis/#lua-scripting)
 * on `redis` with names starting with `presence`.
 *
 * This service uses `getRedisSubscriber` from `@syncot/ioredis-subscriber` and
 * `getRedisConnectionManager` from `@syncot/presence-service-redis`.
 * Both of those functions return an object cached per Redis client instance and
 * may occasionally emit errors that should be handled.
 */
export function createPresenceService({
    connection,
    authService,
    redis,
    redisSubscriber,
}: CreatePresenceServiceOptions): PresenceService {
    return new RedisPresenceService(
        connection,
        authService,
        redis,
        redisSubscriber,
    )
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

const eventLoop = globalEventLoop()

class RedisPresenceService
    extends SyncOTEmitter<PresenceServiceEvents>
    implements PresenceService {
    private readonly redis: Redis.Redis & PresenceCommands
    private readonly connectionManager: RedisConnectionManager
    private readonly subscriber: Subscriber
    private presence: Presence | undefined = undefined
    private presenceStreams: Set<PresenceStream> = new Set()

    public constructor(
        private readonly connection: Connection,
        private readonly authService: Auth,
        redis: Redis.Redis,
        redisSubscriber: Redis.Redis,
    ) {
        super()

        assert(
            (redis as any).options.autoResubscribe === false,
            'Redis must be configured with autoResubscribe=false.',
        )
        assert(
            (redis as any).options.enableOfflineQueue === false,
            'Redis must be configured with enableOfflineQueue=false.',
        )
        assert(
            (redis as any).options.enableReadyCheck === true,
            'Redis must be configured with enableReadyCheck=true.',
        )
        assert(
            (redisSubscriber as any).options.autoResubscribe === false,
            'Redis subscriber must be configured with autoResubscribe=false.',
        )
        assert(
            (redisSubscriber as any).options.enableOfflineQueue === false,
            'Redis subscriber must be configured with enableOfflineQueue=false.',
        )
        assert(
            (redisSubscriber as any).options.enableReadyCheck === true,
            'Redis subscriber must be configured with enableReadyCheck=true.',
        )

        assert(
            this.connection && !this.connection.destroyed,
            'Argument "connection" must be a non-destroyed Connection.',
        )
        assert(
            this.authService && !this.authService.destroyed,
            'Argument "authService" must be a non-destroyed Auth service.',
        )

        this.connection.registerService({
            instance: this,
            name: 'presence',
            requestNames,
        })

        this.redis = defineRedisCommands(redis)
        this.subscriber = getRedisSubscriber(redisSubscriber)
        this.connectionManager = getRedisConnectionManager(this.redis)
        this.connectionManager.on('connectionId', this.onConnectionId)
        this.connection.on('destroy', this.onDestroy)
        this.authService.on('destroy', this.onDestroy)
        this.authService.on('inactive', this.onInactive)
    }

    public destroy(): void {
        if (this.destroyed) {
            return
        }

        this.connectionManager.off('connectionId', this.onConnectionId)
        this.connection.off('destroy', this.onDestroy)
        this.authService.off('destroy', this.onDestroy)
        this.authService.off('inactive', this.onInactive)

        this.deleteFromRedis()
        this.presenceStreams.forEach((stream) => stream.destroy())
        this.presenceStreams.clear()
        super.destroy()
    }

    public async submitPresence(presence: Presence): Promise<void> {
        this.assertOk()
        validatePresence(presence)

        if (presence.sessionId !== this.authService.sessionId) {
            throw createPresenceError('Session ID mismatch.')
        }

        if (presence.userId !== this.authService.userId) {
            throw createPresenceError('User ID mismatch.')
        }

        if (!this.authService.mayWritePresence(presence)) {
            throw createAuthError(
                'Not authorized to submit this presence object.',
            )
        }

        this.presence = presence
        this.storeInRedis()
        return
    }

    public async removePresence(): Promise<void> {
        this.assertNotDestroyed()
        // Explicit authentication is not needed because if the user is not authenticated,
        // then any existing presence is automatically removed and new presence cannot be
        // submitted. Consequently, the state of this service cannot be affected by an
        // unauthenticated user.
        this.deleteFromRedis()
    }

    public async getPresenceBySessionId(
        sessionId: string,
    ): Promise<Presence | null> {
        this.assertOk()
        try {
            return this.processPresenceResult(
                await this.redis.presenceGetBySessionId(sessionId),
            )
        } catch (error) {
            throw createPresenceError(
                'Failed to load presence by sessionId.',
                error,
            )
        }
    }

    public async getPresenceByUserId(userId: string): Promise<Presence[]> {
        this.assertOk()
        try {
            return this.processPresenceResults(
                await this.redis.presenceGetByUserId(userId),
            )
        } catch (error) {
            throw createPresenceError(
                'Failed to load presence by userId.',
                error,
            )
        }
    }

    public async getPresenceByLocationId(
        locationId: string,
    ): Promise<Presence[]> {
        this.assertOk()
        try {
            return this.processPresenceResults(
                await this.redis.presenceGetByLocationId(locationId),
            )
        } catch (error) {
            throw createPresenceError(
                'Failed to load presence by locationId.',
                error,
            )
        }
    }

    public async streamPresenceBySessionId(sessionId: string): Promise<Duplex> {
        this.assertOk()

        const channel = sessionPrefix + sessionId
        const getPresence = async (): Promise<Presence[]> => {
            const presence = await this.getPresenceBySessionId(sessionId)
            return presence ? [presence] : []
        }
        const shouldAdd = (presence: Presence | null): presence is Presence =>
            !!presence
        return this.streamPresence(channel, getPresence, shouldAdd)
    }

    public async streamPresenceByUserId(userId: string): Promise<Duplex> {
        this.assertOk()
        const channel = userPrefix + userId
        const getPresence = (): Promise<Presence[]> =>
            this.getPresenceByUserId(userId)
        const shouldAdd = (presence: Presence | null): presence is Presence =>
            !!presence && presence.userId === userId
        return this.streamPresence(channel, getPresence, shouldAdd)
    }

    public async streamPresenceByLocationId(
        locationId: string,
    ): Promise<Duplex> {
        this.assertOk()
        const channel = locationPrefix + locationId
        const getPresence = (): Promise<Presence[]> =>
            this.getPresenceByLocationId(locationId)
        const shouldAdd = (presence: Presence | null): presence is Presence =>
            !!presence && presence.locationId === locationId
        return this.streamPresence(channel, getPresence, shouldAdd)
    }

    private async streamPresence(
        channel: string,
        getPresence: () => Promise<Presence[]>,
        shouldAdd: (presence: Presence | null) => presence is Presence,
    ): Promise<Duplex> {
        this.assertOk()

        const stream = new PresenceStream()

        stream.channel = channel
        stream.loadAll = () =>
            eventLoop.execute(async () => {
                try {
                    stream.resetPresence(
                        this.connectionManager.connectionId !== undefined
                            ? await getPresence()
                            : [],
                    )
                } catch (error) {
                    stream.resetPresence([])
                    this.emitAsync('error', error)
                }
            })

        stream.loadOne = (id: string) =>
            eventLoop.execute(async () => {
                try {
                    const presence =
                        this.connectionManager.connectionId !== undefined
                            ? await this.getPresenceBySessionId(id)
                            : null
                    if (shouldAdd(presence)) {
                        stream.addPresence(presence)
                    } else {
                        stream.removePresence(id)
                    }
                } catch (error) {
                    stream.removePresence(id)
                    this.emitAsync('error', error)
                }
            })

        const onMessage = (type: EventType, _topic: string, id: string) => {
            if (type === 'message') {
                stream.loadOne(id)
            } else if (type === 'active') {
                stream.loadAll()
            } else {
                stream.resetPresence([])
            }
        }

        this.subscriber.onChannel(channel, onMessage)
        this.presenceStreams.add(stream)
        stream.on('close', () => {
            this.subscriber.offChannel(channel, onMessage)
            this.presenceStreams.delete(stream)
        })

        return stream
    }

    private assertOk(): void {
        this.assertNotDestroyed()
        this.assertAuthenticated()
    }

    private assertAuthenticated(): void {
        if (!this.authService.active) {
            throw createAuthError('No authenticated user.')
        }
    }

    private async storeInRedis(): Promise<void> {
        const presence = this.presence
        if (presence === undefined) {
            return
        }

        const connectionId = this.connectionManager.connectionId
        if (connectionId === undefined) {
            return
        }

        try {
            await this.redis.presenceUpdate(
                presence.sessionId,
                presence.userId,
                presence.locationId,
                JSON.stringify(presence.data),
                connectionId,
            )
        } catch (error) {
            this.emitAsync(
                'error',
                createPresenceError(
                    'Failed to store presence in Redis.',
                    error,
                ),
            )
        }
    }

    private async deleteFromRedis(): Promise<void> {
        const presence = this.presence
        if (presence === undefined) {
            return
        }

        const sessionId = presence.sessionId
        this.presence = undefined

        const connectionId = this.connectionManager.connectionId
        if (connectionId === undefined) {
            return
        }

        try {
            await this.redis.presenceDelete(sessionId)
        } catch (error) {
            /* istanbul ignore next */
            this.emitAsync(
                'error',
                createPresenceError(
                    'Failed to delete presence from Redis.',
                    error,
                ),
            )
        }
    }

    private onConnectionId = (): void => {
        if (this.connectionManager.connectionId !== undefined) {
            this.storeInRedis()
        }
        for (const stream of this.presenceStreams) {
            if (this.subscriber.isChannelActive(stream.channel)) {
                stream.loadAll()
            }
        }
    }

    private onInactive = (): void => {
        this.deleteFromRedis()
    }

    private onDestroy = (): void => {
        this.destroy()
    }

    private processPresenceResult(
        presenceResult: PresenceResult,
    ): Presence | null {
        if (
            presenceResult[0] === null ||
            presenceResult[1] === null ||
            presenceResult[2] === null ||
            presenceResult[3] === null ||
            presenceResult[4] === null
        ) {
            return null
        }

        const presence = validatePresence({
            data: JSON.parse(presenceResult[3]),
            lastModified: Number(presenceResult[4]),
            locationId: presenceResult[2],
            sessionId: presenceResult[0],
            userId: presenceResult[1],
        })

        return this.authService.mayReadPresence(presence) ? presence : null
    }

    private processPresenceResults(
        presenceResults: PresenceResult[],
    ): Presence[] {
        const presenceList: Presence[] = []
        for (let i = 0, l = presenceResults.length; i < l; ++i) {
            const presence = this.processPresenceResult(presenceResults[i])
            if (presence) {
                presenceList.push(presence)
            }
        }
        return presenceList
    }
}
