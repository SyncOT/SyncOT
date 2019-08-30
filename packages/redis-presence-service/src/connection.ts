import {
    assert,
    createPresenceError,
    EmitterInterface,
    TypedEventEmitter,
} from '@syncot/util'
import Redis from 'ioredis'
import { defineRedisCommands, PresenceCommands } from './commands'
import { connectionsKey, extractConnectionIds } from './util'

/**
 * Manages a Redis connection and removes dangling Presence data.
 *
 * @event connectionId Emitted when the value of the `connectionId` property changes.
 * @event error Emitted when Redis operations fail.
 */
export interface RedisConnectionManager
    extends EmitterInterface<TypedEventEmitter<RedisConnectionManagerEvents>> {
    /**
     * The id of the current connection. It is `undefined` when the connection
     * is down and for a short time after connecting while the connectionId is
     * retrieved and dangling data removed.
     */
    readonly connectionId: number | undefined
    /**
     * Determines how often, in milliseconds, to look for and prune dangling data.
     * The default is 1000.
     */
    pruningInterval: number
}

/**
 * Gets a RedisConnectionManager, which is cached per Redis client.
 *
 * The Redis client has to be configured with the following options:
 *
 * - `enableOfflineQueue: false`
 * - `enableReadyCheck: true`
 */
export function getRedisConnectionManager(
    redis: Redis.Redis,
): RedisConnectionManager {
    let collector = cache.get(redis)

    if (!collector) {
        collector = new Collector(redis)
        cache.set(redis, collector)
    }

    return collector
}

interface RedisConnectionManagerEvents {
    connectionId: void
    error: Error
}

const cache: WeakMap<Redis.Redis, RedisConnectionManager> = new WeakMap()

class Collector extends TypedEventEmitter<RedisConnectionManagerEvents>
    implements RedisConnectionManager {
    public connectionId: number | undefined = undefined
    public pruningInterval: number = 1000
    private readonly redis: Redis.Redis & PresenceCommands
    private timeout: NodeJS.Timeout | undefined = undefined

    public constructor(redis: Redis.Redis) {
        super()

        assert(
            (redis as any).options.enableOfflineQueue === false,
            'Redis must be configured with enableOfflineQueue=false.',
        )
        assert(
            (redis as any).options.enableReadyCheck === true,
            'Redis must be configured with enableReadyCheck=true.',
        )

        this.redis = defineRedisCommands(redis)
        this.redis.on('ready', this.onReady)
        this.redis.on('close', this.onClose)
        if (this.redis.status === 'ready') {
            this.onReady()
        }
    }

    private onReady = () => {
        this.prune()
        this.initConnectionId()
    }

    private onClose = () => {
        this.clearTimeout()
        this.clearConnectionId()
    }

    private onTimeout = () => {
        this.timeout = undefined
        this.prune()
    }

    private setTimeout(): void {
        this.clearTimeout()
        this.timeout = setTimeout(this.onTimeout, this.pruningInterval)
    }

    private clearTimeout(): void {
        if (this.timeout !== undefined) {
            clearTimeout(this.timeout)
            this.timeout = undefined
        }
    }

    private async initConnectionId(): Promise<void> {
        try {
            const connectionId: number = await this.redis.client('id')
            await this.redis.hincrby(connectionsKey, '' + connectionId, 1)
            await this.redis.presenceDeleteByConnectionId(connectionId)
            process.nextTick(() => {
                this.connectionId = connectionId
                this.emit('connectionId')
            })
        } catch (error) {
            process.nextTick(() => {
                if (
                    error.message !==
                    "Stream isn't writeable and enableOfflineQueue options is false"
                ) {
                    this.emit(
                        'error',
                        createPresenceError(
                            'Failed to initialize connectionId.',
                            error,
                        ),
                    )
                }
            })
        }
    }

    private clearConnectionId(): void {
        process.nextTick(() => {
            this.connectionId = undefined
            this.emit('connectionId')
        })
    }

    private prune = async (): Promise<void> => {
        try {
            const allConnections = await this.redis.hgetall(connectionsKey)
            const activeConnections = extractConnectionIds(
                await this.redis.client('list', 'type', 'normal'),
            )
            for (const key in allConnections) {
                /* istanbul ignore else */
                if (allConnections.hasOwnProperty(key)) {
                    const connectionId = Number(key)
                    const lock = allConnections[key]
                    if (!activeConnections.includes(connectionId)) {
                        await this.redis.presenceDeleteByConnectionId(
                            connectionId,
                            lock,
                        )
                    }
                }
            }
            this.setTimeout()
        } catch (error) {
            process.nextTick(() => {
                if (
                    error.message !==
                    "Stream isn't writeable and enableOfflineQueue options is false"
                ) {
                    this.emit(
                        'error',
                        createPresenceError(
                            'Failed to prune dangling data.',
                            error,
                        ),
                    )
                }
            })
        }
    }
}
