import { noop, randomInteger } from '@syncot/util'
import { EventEmitter } from 'events'
import Redis from 'ioredis'
import RedisServer from 'redis-server'
import { getRedisSubscriber, Subscriber } from '.'

const testError = new Error('test error')
const testErrorMatcher = expect.objectContaining({
    message: 'test error',
    name: 'Error',
})

const channel1 = 'channel 1!'
const channel2 = 'channel 2!'
const channel3 = 'channel 3!'

const pattern1 = 'channel 1!'
const pattern2 = 'channel [23]!'
const pattern3 = 'channel ?!'
const pattern4 = 'channel*'

const message1 = 'message 1'
const message2 = 'message 2'
const message3 = 'message 3'

const whenRedisEvent = (name: string, count: number) =>
    new Promise(resolve => {
        let call = 0
        function callback() {
            if (++call >= count) {
                redisSubscriber.off(name, callback)
                resolve()
            }
        }
        redisSubscriber.on(name, callback)
    })

const whenRedisCommandExecuted = (commandName: string) =>
    new Promise(resolve => {
        const listener = (_: any, args: any[]) => {
            if (args[0].toLowerCase() === commandName.toLowerCase()) {
                monitor.off('monitor', listener)
                resolve(commandName)
            }
        }
        monitor.on('monitor', listener)
    })

let port: number
let redisServer: RedisServer
let redis: Redis.Redis
let redisSubscriber: Redis.Redis
let monitor: EventEmitter
let subscriber: Subscriber

beforeAll(async () => {
    let attempt = 1
    while (true) {
        try {
            port = randomInteger(0x400, 0x10000)
            redisServer = new RedisServer(port)
            await redisServer.open()
            return
        } catch (error) {
            if (attempt++ > 10) {
                throw error
            }
        }
    }
})

afterAll(async () => {
    if (redisServer) {
        await redisServer.close()
    }
})

beforeEach(async () => {
    const options = {
        autoResubscribe: false,
        lazyConnect: true,
        port,
        showFriendlyErrorStack: true,
    }
    redis = new Redis(options)
    redisSubscriber = new Redis(options)
    await redis.connect()
    await redisSubscriber.connect()
    monitor = await redis.monitor()
    subscriber = getRedisSubscriber(redisSubscriber)
})

afterEach(async () => {
    await redis.flushall()
    redis.disconnect()
    redisSubscriber.disconnect()
    ;(monitor as any).disconnect()
})

test('get the same subscriber given the same Redis client', () => {
    const subscriber2 = getRedisSubscriber(redisSubscriber)
    expect(subscriber2).toBeObject()
    expect(subscriber2).toBe(subscriber)
})

test('get a different subscriber given a different Redis client', () => {
    const subscriber2 = getRedisSubscriber(redis)
    expect(subscriber2).toBeObject()
    expect(subscriber2).not.toBe(subscriber)
})

test('throw on autoResubscribe=true', () => {
    expect(() =>
        getRedisSubscriber(
            new Redis({
                autoResubscribe: true,
                enableReadyCheck: true,
                lazyConnect: true,
            }),
        ),
    ).toThrow(
        expect.objectContaining({
            message: 'Redis must be configured with autoResubscribe=false.',
            name: 'AssertionError',
        }),
    )
})

test('throw on enableReadyCheck=false', () => {
    expect(() =>
        getRedisSubscriber(
            new Redis({
                autoResubscribe: false,
                enableReadyCheck: false,
                lazyConnect: true,
            }),
        ),
    ).toThrow(
        expect.objectContaining({
            message: 'Redis must be configured with enableReadyCheck=true.',
            name: 'AssertionError',
        }),
    )
})

describe('channel', () => {
    test('message with no listeners', () => {
        redisSubscriber.emit('message', channel1, message1)
    })
    test('unsubscribe a non-registered listener', () => {
        const listener1 = jest.fn()
        const listener2 = jest.fn()
        subscriber.onChannel(channel1, listener1)
        subscriber.offChannel(channel1, listener2) // non-existent
        subscriber.offChannel(channel1, listener1)
        subscriber.offChannel(channel1, listener1) // non-existent
    })
    test('call listeners', async () => {
        const onChannel1 = jest.fn()
        const onChannel2 = jest.fn()
        const onChannel3 = jest.fn()
        subscriber.onChannel(channel1, onChannel1)
        subscriber.onChannel(channel2, onChannel2)
        subscriber.onChannel(channel3, onChannel3)
        redis.publish(channel1, message1)
        redis.publish(channel2, message2)
        redis.publish(channel3, message3)
        await whenRedisEvent('message', 3)
        expect(onChannel1).toHaveBeenCalledTimes(1)
        expect(onChannel1).toHaveBeenCalledWith(channel1, message1)
        expect(onChannel2).toHaveBeenCalledTimes(1)
        expect(onChannel2).toHaveBeenCalledWith(channel2, message2)
        expect(onChannel3).toHaveBeenCalledTimes(1)
        expect(onChannel3).toHaveBeenCalledWith(channel3, message3)
    })
    test('subscribe and unsubscribe', async () => {
        let subscribeCalls = 0
        let unsubscribeCalls = 0

        monitor.on('monitor', (_, args) => {
            if (args[0] === 'subscribe') {
                subscribeCalls++
            } else if (args[0] === 'unsubscribe') {
                unsubscribeCalls++
            }
        })

        const onChannel1 = jest.fn()
        const onChannel2 = jest.fn()
        subscriber.onChannel(channel1, onChannel1)
        subscriber.onChannel(channel1, onChannel1)
        subscriber.onChannel(channel1, onChannel2)
        redis.publish(channel1, message1)
        await whenRedisEvent('message', 1)
        expect(onChannel1).toHaveBeenCalledTimes(2)
        expect(onChannel1).toHaveBeenNthCalledWith(1, channel1, message1)
        expect(onChannel1).toHaveBeenNthCalledWith(2, channel1, message1)
        expect(onChannel2).toHaveBeenCalledTimes(1)
        expect(onChannel2).toHaveBeenNthCalledWith(1, channel1, message1)
        onChannel1.mockClear()
        onChannel2.mockClear()

        subscriber.offChannel(channel1, onChannel1)
        redis.publish(channel1, message2)
        await whenRedisEvent('message', 1)
        expect(onChannel1).toHaveBeenCalledTimes(1)
        expect(onChannel1).toHaveBeenNthCalledWith(1, channel1, message2)
        expect(onChannel2).toHaveBeenCalledTimes(1)
        expect(onChannel2).toHaveBeenNthCalledWith(1, channel1, message2)
        onChannel1.mockClear()
        onChannel2.mockClear()

        subscriber.offChannel(channel1, onChannel1)
        subscriber.offChannel(channel1, onChannel2)
        redis.publish(channel1, message2)
        await whenRedisCommandExecuted('unsubscribe')
        expect(onChannel1).toHaveBeenCalledTimes(0)
        expect(onChannel2).toHaveBeenCalledTimes(0)

        expect(subscribeCalls).toBe(1)
        expect(unsubscribeCalls).toBe(1)
    })

    test('disconnect, subscribe', async () => {
        redisSubscriber.disconnect()
        await redisSubscriber.ping().catch(noop) // wait until disconnected
        const onChannel1 = jest.fn()
        const onChannel2 = jest.fn()
        subscriber.onChannel(channel1, onChannel1)
        subscriber.onChannel(channel2, onChannel2)
        await redisSubscriber.connect()
        await whenRedisCommandExecuted('SUBSCRIBE')
        redis.publish(channel1, message1)
        redis.publish(channel2, message2)
        await whenRedisEvent('message', 2)
        expect(onChannel1).toHaveBeenCalledTimes(1)
        expect(onChannel1).toHaveBeenCalledWith(channel1, message1)
        expect(onChannel2).toHaveBeenCalledTimes(1)
        expect(onChannel2).toHaveBeenCalledWith(channel2, message2)
    })

    test('subscribe, disconnect, unsubscribe, re-connect', async () => {
        // Just ensure that there are no uncaught errors.
        const onChannel1 = jest.fn()
        const onChannel2 = jest.fn()
        subscriber.onChannel(channel1, onChannel1)
        subscriber.onChannel(channel2, onChannel2)
        await whenRedisCommandExecuted('SUBSCRIBE')
        redisSubscriber.disconnect()
        await redisSubscriber.ping().catch(noop) // wait until disconnected
        subscriber.offChannel(channel1, onChannel1)
        subscriber.offChannel(channel2, onChannel2)
        await redisSubscriber.connect()
    })

    test('subscribe, disconnect, re-connect', async () => {
        const onChannel1 = jest.fn()
        const onChannel2 = jest.fn()
        subscriber.onChannel(channel1, onChannel1)
        subscriber.onChannel(channel2, onChannel2)
        redisSubscriber.disconnect()
        await redisSubscriber.ping().catch(noop) // wait until disconnected
        await redisSubscriber.connect()
        await whenRedisCommandExecuted('SUBSCRIBE')
        redis.publish(channel1, message1)
        redis.publish(channel2, message2)
        await whenRedisEvent('message', 2)
        expect(onChannel1).toHaveBeenCalledTimes(1)
        expect(onChannel1).toHaveBeenCalledWith(channel1, message1)
        expect(onChannel2).toHaveBeenCalledTimes(1)
        expect(onChannel2).toHaveBeenCalledWith(channel2, message2)
    })

    test('error handling', async () => {
        const onError = jest.fn()
        subscriber.on('error', onError)
        subscriber.onChannel(channel1, noop)
        const subscribe = jest
            .spyOn(redisSubscriber, 'subscribe')
            .mockRejectedValue(testError)
        const unsubscribe = jest
            .spyOn(redisSubscriber, 'unsubscribe')
            .mockRejectedValue(testError)
        subscriber.offChannel(channel1, noop)
        subscriber.onChannel(channel1, noop)
        redisSubscriber.disconnect()
        await redisSubscriber.ping().catch(noop)
        await redisSubscriber.connect()
        expect(onError).toHaveBeenCalledTimes(3)
        expect(onError).toHaveBeenNthCalledWith(1, testErrorMatcher)
        expect(onError).toHaveBeenNthCalledWith(2, testErrorMatcher)
        expect(onError).toHaveBeenNthCalledWith(3, testErrorMatcher)
        subscribe.mockRestore()
        unsubscribe.mockRestore()
    })
})

describe('pattern', () => {
    test('pattern with no listeners', () => {
        redisSubscriber.emit('pmessage', pattern4, channel1, message1)
    })
    test('unsubscribe a non-registered listener', () => {
        const listener1 = jest.fn()
        const listener2 = jest.fn()
        subscriber.onPattern(pattern1, listener1)
        subscriber.offPattern(pattern1, listener2) // non-existent
        subscriber.offPattern(pattern1, listener1)
        subscriber.offPattern(pattern1, listener1) // non-existent
    })
    test('call listeners', async () => {
        const onPattern1 = jest.fn()
        const onPattern2 = jest.fn()
        const onPattern3 = jest.fn()
        const onPattern4 = jest.fn()
        subscriber.onPattern(pattern1, onPattern1)
        subscriber.onPattern(pattern2, onPattern2)
        subscriber.onPattern(pattern3, onPattern3)
        subscriber.onPattern(pattern4, onPattern4)
        redis.publish(channel1, message1)
        redis.publish(channel2, message2)
        redis.publish(channel3, message3)
        await whenRedisEvent('pmessage', 3)
        expect(onPattern1).toHaveBeenCalledTimes(1)
        expect(onPattern1).toHaveBeenCalledWith(pattern1, channel1, message1)
        expect(onPattern2).toHaveBeenCalledTimes(2)
        expect(onPattern2).toHaveBeenCalledWith(pattern2, channel2, message2)
        expect(onPattern2).toHaveBeenCalledWith(pattern2, channel3, message3)
        expect(onPattern3).toHaveBeenCalledTimes(3)
        expect(onPattern3).toHaveBeenCalledWith(pattern3, channel1, message1)
        expect(onPattern3).toHaveBeenCalledWith(pattern3, channel2, message2)
        expect(onPattern3).toHaveBeenCalledWith(pattern3, channel3, message3)
        expect(onPattern4).toHaveBeenCalledTimes(3)
        expect(onPattern4).toHaveBeenCalledWith(pattern4, channel1, message1)
        expect(onPattern4).toHaveBeenCalledWith(pattern4, channel2, message2)
        expect(onPattern4).toHaveBeenCalledWith(pattern4, channel3, message3)
    })
    test('subscribe and unsubscribe', async () => {
        let subscribeCalls = 0
        let unsubscribeCalls = 0

        monitor.on('monitor', (_, args) => {
            if (args[0] === 'psubscribe') {
                subscribeCalls++
            } else if (args[0] === 'punsubscribe') {
                unsubscribeCalls++
            }
        })

        const onPattern1 = jest.fn()
        const onPattern2 = jest.fn()
        subscriber.onPattern(pattern1, onPattern1)
        subscriber.onPattern(pattern1, onPattern1)
        subscriber.onPattern(pattern1, onPattern2)
        redis.publish(channel1, message1)
        await whenRedisEvent('pmessage', 1)
        expect(onPattern1).toHaveBeenCalledTimes(2)
        expect(onPattern1).toHaveBeenNthCalledWith(
            1,
            pattern1,
            channel1,
            message1,
        )
        expect(onPattern1).toHaveBeenNthCalledWith(
            2,
            pattern1,
            channel1,
            message1,
        )
        expect(onPattern2).toHaveBeenCalledTimes(1)
        expect(onPattern2).toHaveBeenNthCalledWith(
            1,
            pattern1,
            channel1,
            message1,
        )
        onPattern1.mockClear()
        onPattern2.mockClear()

        subscriber.offPattern(pattern1, onPattern1)
        redis.publish(channel1, message2)
        await whenRedisEvent('pmessage', 1)
        expect(onPattern1).toHaveBeenCalledTimes(1)
        expect(onPattern1).toHaveBeenNthCalledWith(
            1,
            pattern1,
            channel1,
            message2,
        )
        expect(onPattern2).toHaveBeenCalledTimes(1)
        expect(onPattern2).toHaveBeenNthCalledWith(
            1,
            pattern1,
            channel1,
            message2,
        )
        onPattern1.mockClear()
        onPattern2.mockClear()

        subscriber.offPattern(pattern1, onPattern1)
        subscriber.offPattern(pattern1, onPattern2)
        redis.publish(channel1, message2)
        await whenRedisCommandExecuted('punsubscribe')
        expect(onPattern1).toHaveBeenCalledTimes(0)
        expect(onPattern2).toHaveBeenCalledTimes(0)

        expect(subscribeCalls).toBe(1)
        expect(unsubscribeCalls).toBe(1)
    })

    test('disconnect, subscribe', async () => {
        redisSubscriber.disconnect()
        await redisSubscriber.ping().catch(noop) // wait until disconnected
        const onPattern1 = jest.fn()
        const onPattern2 = jest.fn()
        subscriber.onPattern(pattern1, onPattern1)
        subscriber.onPattern(pattern2, onPattern2)
        await redisSubscriber.connect()
        await whenRedisCommandExecuted('PSUBSCRIBE')
        redis.publish(channel1, message1)
        redis.publish(channel2, message2)
        await whenRedisEvent('pmessage', 2)
        expect(onPattern1).toHaveBeenCalledTimes(1)
        expect(onPattern1).toHaveBeenCalledWith(pattern1, channel1, message1)
        expect(onPattern2).toHaveBeenCalledTimes(1)
        expect(onPattern2).toHaveBeenCalledWith(pattern2, channel2, message2)
    })

    test('subscribe, disconnect, unsubscribe, re-connect', async () => {
        // Just ensure that there are no uncaught errors.
        const onPattern1 = jest.fn()
        const onPattern2 = jest.fn()
        subscriber.onPattern(pattern1, onPattern1)
        subscriber.onPattern(pattern2, onPattern2)
        await whenRedisCommandExecuted('PSUBSCRIBE')
        redisSubscriber.disconnect()
        await redisSubscriber.ping().catch(noop) // wait until disconnected
        subscriber.offPattern(pattern1, onPattern1)
        subscriber.offPattern(pattern2, onPattern2)
        await redisSubscriber.connect()
    })

    test('subscribe, disconnect, re-connect', async () => {
        const onPattern1 = jest.fn()
        const onPattern2 = jest.fn()
        subscriber.onPattern(pattern1, onPattern1)
        subscriber.onPattern(pattern2, onPattern2)
        redisSubscriber.disconnect()
        await redisSubscriber.ping().catch(noop) // wait until disconnected
        await redisSubscriber.connect()
        await whenRedisCommandExecuted('PSUBSCRIBE')
        redis.publish(channel1, message1)
        redis.publish(channel2, message2)
        await whenRedisEvent('pmessage', 2)
        expect(onPattern1).toHaveBeenCalledTimes(1)
        expect(onPattern1).toHaveBeenCalledWith(pattern1, channel1, message1)
        expect(onPattern2).toHaveBeenCalledTimes(1)
        expect(onPattern2).toHaveBeenCalledWith(pattern2, channel2, message2)
    })

    test('error handling', async () => {
        const onError = jest.fn()
        subscriber.on('error', onError)
        subscriber.onPattern(pattern1, noop)
        const psubscribe = jest
            .spyOn(redisSubscriber, 'psubscribe')
            .mockRejectedValue(testError)
        const punsubscribe = jest
            .spyOn(redisSubscriber, 'punsubscribe')
            .mockRejectedValue(testError)
        subscriber.offPattern(pattern1, noop)
        subscriber.onPattern(pattern1, noop)
        redisSubscriber.disconnect()
        await redisSubscriber.ping().catch(noop)
        await redisSubscriber.connect()
        expect(onError).toHaveBeenCalledTimes(3)
        expect(onError).toHaveBeenNthCalledWith(1, testErrorMatcher)
        expect(onError).toHaveBeenNthCalledWith(2, testErrorMatcher)
        expect(onError).toHaveBeenNthCalledWith(3, testErrorMatcher)
        psubscribe.mockRestore()
        punsubscribe.mockRestore()
    })
})
