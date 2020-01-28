import { assert, Interface } from '@syncot/util'
import { EventEmitter } from 'events'
import Redis from 'ioredis'

/**
 * A utility for managing multiple Redis subscriptions that is simple and efficient.
 * Messages are dispatched to listeners based on the channel or pattern.
 * Multiple listeners can be registered for the same channel or pattern without exchanging
 * any additional data with the Redis server.
 * For simplicity, channels, patterns and messages are strings.
 */
export interface Subscriber extends Interface<RedisSubscriber> {}

/**
 * Returns a message subscriber backed by the specified ioredis client.
 * The subscriber is cached, so that the same subscriber is returned given the
 * same ioredis instance.
 *
 * @param redis An ioredis client used for interacting with a Redis server.
 *   It must be be configured with:
 *   - `autoResubscribe: false`
 *   - `enableOfflineQueue: false`
 *   - `enableReadyCheck: true`
 *   It is used for subscribing to messages, so it cannot be used for sending ordinary commands.
 *   No subscriptions should be added nor removed directly using the passed in `redis`, as doing
 *   so would likely break the returned subscriber.
 */
export function getRedisSubscriber(redis: Redis.Redis): Subscriber {
    let subscriber = subscriberCache.get(redis)

    if (!subscriber) {
        subscriber = new RedisSubscriber(redis)
        subscriberCache.set(redis, subscriber)
    }

    return subscriber
}

export type EventType = 'active' | 'inactive' | 'message'
export type Channel = string
export type Pattern = string
export type ChannelListener = (
    type: EventType,
    channel: Channel,
    message?: any,
) => void
export type PatternListener = (
    type: EventType,
    pattern: Pattern,
    channel?: Channel,
    message?: any,
) => void

const subscriberCache = new WeakMap<Redis.Redis, Subscriber>()

// See https://github.com/nodejs/node/blob/ed8fc7e11d688cbcdf33d0d149830064758bdcd2/lib/events.js#L472
function copyArray<T>(array: T[], length: number): T[] {
    const copy = new Array(length)
    for (let i = 0; i < length; ++i) {
        copy[i] = array[i]
    }
    return copy
}

// See https://github.com/nodejs/node/blob/ed8fc7e11d688cbcdf33d0d149830064758bdcd2/lib/internal/util.js#L330
function spliceOne<T>(array: T[], index: number): void {
    // tslint:disable:no-parameter-reassignment
    for (; index + 1 < array.length; ++index) {
        array[index] = array[index + 1]
    }
    array.pop()
}

function removeLast<T>(array: T[], item: T): void {
    const index = array.lastIndexOf(item)

    if (index >= 0) {
        spliceOne(array, index)
    }
}

const setActive = (
    map: Map<
        Channel | Pattern,
        { active: boolean; listeners: (ChannelListener | PatternListener)[] }
    >,
    key: Channel | Pattern,
    active: boolean,
) => {
    const value = map.get(key)
    if (value && value.active !== active) {
        value.active = active
        const type = active ? 'active' : 'inactive'
        const listeners = value.listeners
        const length = listeners.length
        const listenersCopy = copyArray(listeners, length)
        for (let i = 0; i < length; i++) {
            listenersCopy[i](type, key)
        }
    }
}

class RedisSubscriber extends EventEmitter {
    private channels: Map<
        Channel,
        { active: boolean; listeners: ChannelListener[] }
    > = new Map()
    private patterns: Map<
        Pattern,
        { active: boolean; listeners: PatternListener[] }
    > = new Map()

    public constructor(private redis: Redis.Redis) {
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

        this.redis.on('message', (channel: Channel, message: any) => {
            const value = this.channels.get(channel)

            if (value && value.active) {
                const listeners = value.listeners
                const length = listeners.length
                const listenersCopy = copyArray(listeners, length)

                for (let i = 0; i < length; ++i) {
                    listenersCopy[i]('message', channel, message)
                }
            }
        })

        this.redis.on(
            'pmessage',
            (pattern: Pattern, channel: Channel, message: any) => {
                const value = this.patterns.get(pattern)

                if (value && value.active) {
                    const listeners = value.listeners
                    const length = listeners.length
                    const listenersCopy = copyArray(listeners, length)

                    for (let i = 0; i < length; ++i) {
                        listenersCopy[i]('message', pattern, channel, message)
                    }
                }
            },
        )

        this.redis.on('ready', this.onReady)
        this.redis.on('close', this.onClose)
    }

    public onChannel(channel: Channel, listener: ChannelListener): void {
        let value = this.channels.get(channel)

        if (!value) {
            value = { active: false, listeners: [listener] }
            this.channels.set(channel, value)
            this.redis
                .subscribe(channel)
                .then(
                    () => setActive(this.channels, channel, true),
                    this.onError,
                )
        } else {
            value.listeners.push(listener)
            if (value.active) {
                process.nextTick(listener, 'active', channel)
            }
        }
    }

    public offChannel(channel: Channel, listener: ChannelListener): void {
        const value = this.channels.get(channel)

        if (value) {
            removeLast(value.listeners, listener)
            if (value.listeners.length === 0) {
                this.channels.delete(channel)
                this.redis.unsubscribe(channel).catch(this.onError)
            }
        }
    }

    public isChannelActive(channel: Channel): boolean {
        const value = this.channels.get(channel)
        return !!value && value.active
    }

    public onPattern(pattern: Pattern, listener: PatternListener): void {
        let value = this.patterns.get(pattern)
        if (!value) {
            value = { active: false, listeners: [listener] }
            this.patterns.set(pattern, value)
            this.redis
                .psubscribe(pattern)
                .then(
                    () => setActive(this.patterns, pattern, true),
                    this.onError,
                )
        } else {
            value.listeners.push(listener)
            if (value.active) {
                process.nextTick(listener, 'active', pattern)
            }
        }
    }

    public offPattern(pattern: Pattern, listener: PatternListener): void {
        const value = this.patterns.get(pattern)
        if (value) {
            removeLast(value.listeners, listener)
            if (value.listeners.length === 0) {
                this.patterns.delete(pattern)
                this.redis.punsubscribe(pattern).catch(this.onError)
            }
        }
    }

    public isPatternActive(pattern: Pattern): boolean {
        const value = this.patterns.get(pattern)
        return !!value && value.active
    }

    private onReady = () => {
        if (this.channels.size > 0) {
            const channels = Array.from(this.channels.keys())
            this.redis
                .subscribe(...channels)
                .then(
                    () =>
                        channels.forEach(channel =>
                            setActive(this.channels, channel, true),
                        ),
                    this.onError,
                )
        }

        if (this.patterns.size > 0) {
            const patterns = Array.from(this.patterns.keys())
            this.redis
                .psubscribe(...patterns)
                .then(
                    () =>
                        patterns.forEach(pattern =>
                            setActive(this.patterns, pattern, true),
                        ),
                    this.onError,
                )
        }
    }

    private onClose = () => {
        Array.from(this.patterns.keys()).forEach(pattern =>
            setActive(this.patterns, pattern, false),
        )
        Array.from(this.channels.keys()).forEach(channel =>
            setActive(this.channels, channel, false),
        )
    }

    private onError = (error: Error): void => {
        if (
            error.message !==
                `Stream isn't writeable and enableOfflineQueue options is false` &&
            error.message !== 'Connection is closed.'
        ) {
            this.emit('error', error)
        }
    }
}
