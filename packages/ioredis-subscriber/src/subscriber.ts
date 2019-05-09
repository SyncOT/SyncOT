import { Interface, ScalarMap } from '@syncot/util'
import { strict as assert } from 'assert'
import { EventEmitter } from 'events'
import Redis from 'ioredis'

/**
 * A utility for managing multiple Redis subscriptions that is simple and efficient.
 * Messages are dispatched to listeners based on the channel or pattern.
 * Multiple listeners can be registered for the same channel or pattern without exchanging
 * any additional data with the Redis server.
 * For simplicity and efficiency, channels, patterns and messages are Buffers.
 */
export interface Subscriber extends Interface<RedisSubscriber> {}

/**
 * Returns a message subscriber backed by the specified ioredis client.
 * The subscriber is cached, so that the same subscriber is returned given the
 * same ioredis instance.
 *
 * @param redis An ioredis client used for interacting with a Redis server.
 *   It must be be configured with:
 *   - `dropBufferSupport: false`
 *   - `autoResubscribe: false`
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

type Channel = Buffer
type Pattern = Buffer
type ChannelListener = (channel: Channel, message: any) => void
type PatternListener = (
    pattern: Pattern,
    channel: Channel,
    message: any,
) => void

const subscriberCache = new WeakMap<Redis.Redis, Subscriber>()

class RedisSubscriber extends EventEmitter {
    private channelSubscribers: ScalarMap<
        Channel,
        ChannelListener[]
    > = new ScalarMap()
    private patternSubscribers: ScalarMap<
        Pattern,
        PatternListener[]
    > = new ScalarMap()

    public constructor(private redis: Redis.Redis) {
        super()

        assert.equal(
            (redis as any).options.autoResubscribe,
            false,
            'Redis must be configured with autoResubscribe=false.',
        )
        assert.equal(
            (redis as any).options.dropBufferSupport,
            false,
            'Redis must be configured with dropBufferSupport=false.',
        )
        assert.equal(
            (redis as any).options.enableReadyCheck,
            true,
            'Redis must be configured with enableReadyCheck=true.',
        )

        this.redis.on('messageBuffer', (channel: Channel, message: any) => {
            const listeners = this.channelSubscribers.get(channel)

            if (listeners) {
                const listenersCopy = listeners.slice()

                for (let i = 0, l = listenersCopy.length; i < l; ++i) {
                    listenersCopy[i](channel, message)
                }
            }
        })

        this.redis.on(
            'pmessageBuffer',
            (pattern: Pattern, channel: Channel, message: any) => {
                // Work around an issue in ioredis, where the pattern is not always a Buffer,
                // even though the event name is `pmessageBuffer`.
                if (typeof pattern === 'string') {
                    // tslint:disable-next-line:no-parameter-reassignment
                    pattern = Buffer.from(pattern)
                }

                const listeners = this.patternSubscribers.get(pattern)

                if (listeners) {
                    const listenersCopy = listeners.slice()

                    for (let i = 0, l = listenersCopy.length; i < l; ++i) {
                        listenersCopy[i](pattern, channel, message)
                    }
                }
            },
        )

        this.redis.on('ready', this.onReady)
    }

    public onChannel(channel: Channel, listener: ChannelListener): void {
        let subscribers = this.channelSubscribers.get(channel)

        if (!subscribers) {
            subscribers = [listener]
            this.channelSubscribers.set(channel, subscribers)
            if (this.redis.status === 'ready') {
                this.redis.subscribe(channel).catch(this.onError)
            }
        } else {
            subscribers.push(listener)
        }
    }

    public offChannel(channel: Channel, listener: ChannelListener): void {
        const subscribers = this.channelSubscribers.get(channel)

        if (!subscribers) {
            return
        }

        const index = subscribers.lastIndexOf(listener)

        if (index < 0) {
            return
        }

        subscribers.splice(index, 1)

        if (subscribers.length === 0) {
            this.channelSubscribers.delete(channel)
            if (this.redis.status === 'ready') {
                this.redis.unsubscribe(channel as any).catch(this.onError)
            }
        }
    }

    public onPattern(pattern: Pattern, listener: PatternListener): void {
        let subscribers = this.patternSubscribers.get(pattern)

        if (!subscribers) {
            subscribers = [listener]
            this.patternSubscribers.set(pattern, subscribers)
            if (this.redis.status === 'ready') {
                this.redis.psubscribe(pattern as any).catch(this.onError)
            }
        } else {
            subscribers.push(listener)
        }
    }

    public offPattern(pattern: Pattern, listener: PatternListener): void {
        const subscribers = this.patternSubscribers.get(pattern)

        if (!subscribers) {
            return
        }

        const index = subscribers.lastIndexOf(listener)

        if (index < 0) {
            return
        }

        subscribers.splice(index, 1)

        if (subscribers.length === 0) {
            this.patternSubscribers.delete(pattern)
            if (this.redis.status === 'ready') {
                this.redis.punsubscribe(pattern as any).catch(this.onError)
            }
        }
    }

    private onReady = () => {
        let index: number
        const channelCount = this.channelSubscribers.size

        if (channelCount > 0) {
            index = 0
            const channels = new Array(channelCount)
            this.channelSubscribers.forEach((_, channel: Channel) => {
                channels[index++] = channel
            })
            this.redis.subscribe(...channels).catch(this.onError)
        }

        const patternCount = this.patternSubscribers.size
        if (patternCount > 0) {
            index = 0
            const patterns = new Array(patternCount)
            this.patternSubscribers.forEach((_, pattern: Pattern) => {
                patterns[index++] = pattern
            })
            this.redis.psubscribe(...patterns).catch(this.onError)
        }
    }

    private onError = (error: Error): void => {
        if (this.redis.status === 'ready') {
            this.emit('error', error)
        }
    }
}
