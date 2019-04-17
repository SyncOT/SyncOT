import { randomInteger } from '@syncot/util'
import { EventEmitter } from 'events'
import Redis from 'ioredis'
import RedisServer from 'redis-server'
import { getRedisSubscriber, Subscriber } from '.'

const channel1 = Buffer.from('channel 1!')
const channel2 = Buffer.from('channel 2!')
const channel3 = Buffer.from('channel 3!')

const pattern1 = Buffer.from('channel 1!')
const pattern2 = Buffer.from('channel [23]!')
const pattern3 = Buffer.from('channel ?!')
const pattern4 = Buffer.from('channel*')

const message1 = Buffer.from('message 1')
const message2 = Buffer.from('message 2')
const message3 = Buffer.from('message 3')

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

describe('channel', () => {
    test('message with no listeners', () => {
        redisSubscriber.emit('messageBuffer', channel1, message1)
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
        redis.publish(channel1 as any, message1 as any)
        redis.publish(channel2 as any, message2 as any)
        redis.publish(channel3 as any, message3 as any)
        await whenRedisEvent('messageBuffer', 3)
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
        redis.publish(channel1 as any, message1 as any)
        await whenRedisEvent('messageBuffer', 1)
        expect(onChannel1).toHaveBeenCalledTimes(2)
        expect(onChannel1).toHaveBeenNthCalledWith(1, channel1, message1)
        expect(onChannel1).toHaveBeenNthCalledWith(2, channel1, message1)
        expect(onChannel2).toHaveBeenCalledTimes(1)
        expect(onChannel2).toHaveBeenNthCalledWith(1, channel1, message1)
        onChannel1.mockClear()
        onChannel2.mockClear()

        subscriber.offChannel(channel1, onChannel1)
        redis.publish(channel1 as any, message2 as any)
        await whenRedisEvent('messageBuffer', 1)
        expect(onChannel1).toHaveBeenCalledTimes(1)
        expect(onChannel1).toHaveBeenNthCalledWith(1, channel1, message2)
        expect(onChannel2).toHaveBeenCalledTimes(1)
        expect(onChannel2).toHaveBeenNthCalledWith(1, channel1, message2)
        onChannel1.mockClear()
        onChannel2.mockClear()

        subscriber.offChannel(channel1, onChannel1)
        subscriber.offChannel(channel1, onChannel2)
        redis.publish(channel1 as any, message2 as any)
        await whenRedisCommandExecuted('unsubscribe')
        expect(onChannel1).toHaveBeenCalledTimes(0)
        expect(onChannel2).toHaveBeenCalledTimes(0)

        expect(subscribeCalls).toBe(1)
        expect(unsubscribeCalls).toBe(1)
    })
})

describe('pattern', () => {
    test('pattern with no listeners', () => {
        redisSubscriber.emit('pmessageBuffer', pattern4, channel1, message1)
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
        redis.publish(channel1 as any, message1 as any)
        redis.publish(channel2 as any, message2 as any)
        redis.publish(channel3 as any, message3 as any)
        await whenRedisEvent('pmessageBuffer', 3)
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
        redis.publish(channel1 as any, message1 as any)
        await whenRedisEvent('pmessageBuffer', 1)
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
        redis.publish(channel1 as any, message2 as any)
        await whenRedisEvent('pmessageBuffer', 1)
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
        redis.publish(channel1 as any, message2 as any)
        await whenRedisCommandExecuted('punsubscribe')
        expect(onPattern1).toHaveBeenCalledTimes(0)
        expect(onPattern2).toHaveBeenCalledTimes(0)

        expect(subscribeCalls).toBe(1)
        expect(unsubscribeCalls).toBe(1)
    })
})
