import { EmitterInterface, TypedEventEmitter } from '@syncot/util'
import Redis from 'ioredis'

export interface RedisClientTrackerEvents {
    connect: number
    disconnect: number
    error: Error
}

/**
 * Tracks clients that are of type "[normal](https://redis.io/commands/client-list)" and
 * are connected to the same Redis server as the current client.
 *
 * The data is cached in memory and refreshed periodically.
 *
 * @event connect A client with the specified ID has connected.
 * @event disconnect A client with the specified ID has disconnected.
 * @event error An error has occured while contacting the Redis server.
 */
export interface RedisClientTracker
    extends EmitterInterface<TypedEventEmitter<RedisClientTrackerEvents>> {
    isConnected(clientId: number): boolean
}

export function getRedisClientTracker(redis: Redis.Redis): RedisClientTracker {
    let tracker = trackerCache.get(redis)

    if (!tracker) {
        tracker = new Tracker(redis)
        trackerCache.set(redis, tracker)
    }

    return tracker
}

/**
 * Returns a Set of client IDs
 * obtained by parsing the string returned by the `CLIENT LIST` Redis command.
 */
export function extractClientIds(clientList: string): Set<number> {
    const clientIds: Set<number> = new Set()
    clientList.split('\n').forEach(line => {
        const match = /(?:^| )id=(\d+)(?: |$)/.exec(line)
        if (match) {
            clientIds.add(parseInt(match[1], 10))
        }
    })
    return clientIds
}

const refreshDelay = 1000
const trackerCache: WeakMap<Redis.Redis, Tracker> = new WeakMap()

class Tracker extends TypedEventEmitter<RedisClientTrackerEvents>
    implements RedisClientTracker {
    private clients: Set<number> = new Set()
    private timeout: NodeJS.Timeout | undefined = undefined

    public constructor(private readonly redis: Redis.Redis) {
        super()
        this.redis.on('ready', this.refresh)
        this.redis.on('close', this.onClose)
        if (this.redis.status === 'ready') {
            this.refresh()
        }
    }

    public isConnected(clientId: number): boolean {
        return this.clients.has(clientId)
    }

    private onClose = () => {
        if (this.timeout !== undefined) {
            clearTimeout(this.timeout)
            this.timeout = undefined
        }
        this.setClients(new Set())
    }

    private refresh = (): void => {
        this.redis.client('list', 'type', 'normal').then(
            (clientList: string) => {
                this.timeout = setTimeout(this.refresh, refreshDelay)
                this.setClients(extractClientIds(clientList))
            },
            (error: Error) => {
                this.timeout = undefined
                process.nextTick(() => {
                    this.emit('error', error)
                })
                this.setClients(new Set())
            },
        )
    }

    private setClients(newClients: Set<number>): void {
        const oldClients = this.clients
        this.clients = newClients

        process.nextTick(() => {
            newClients.forEach(clientId => {
                if (!oldClients.has(clientId)) {
                    this.emit('connect', clientId)
                }
            })
            oldClients.forEach(clientId => {
                if (!newClients.has(clientId)) {
                    this.emit('disconnect', clientId)
                }
            })
        })
    }
}
