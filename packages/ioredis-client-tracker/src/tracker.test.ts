import { noop, randomInteger, whenNextTick } from '@syncot/util'
import Redis from 'ioredis'
import { Clock, install as installClock, InstalledClock } from 'lolex'
import RedisServer from 'redis-server'
import { extractClientIds, getRedisClientTracker } from '.'

let clock: InstalledClock<Clock>
let port: number
let redisServer: RedisServer
let redisOptions: Redis.RedisOptions
let redis1: Redis.Redis
let redis2: Redis.Redis

beforeAll(async () => {
    let attempt = 1
    while (true) {
        try {
            port = randomInteger(0x400, 0x10000)
            redisServer = new RedisServer(port)
            await redisServer.open()
            redisOptions = {
                autoResubscribe: false,
                lazyConnect: true,
                port,
                showFriendlyErrorStack: true,
            }
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

describe('extractClientIds', () => {
    test.each<[string, Set<number>]>([
        ['', new Set()],
        ['id=5', new Set([5])],
        [' id=5', new Set([5])],
        ['id=5 ', new Set([5])],
        ['id=567 ', new Set([567])],
        [' id=5 ', new Set([5])],
        ['id=5 id=6', new Set([5])],
        ['id=5\nid=6', new Set([5, 6])],
        ['id=5\nawd\n\nid=6\nasa', new Set([5, 6])],
        ['id=5 dd adw a\n awd id=6 adw ad asd', new Set([5, 6])],
        ['ID=5', new Set()],
        ['id=x', new Set()],
        ['id=', new Set()],
        ['cid=5', new Set()],
    ])('%#', (clientList, expectedResult) => {
        expect(extractClientIds(clientList)).toEqual(expectedResult)
    })
})

describe('getRedisClientTracker', () => {
    beforeEach(() => {
        clock = installClock()
        redis1 = new Redis(redisOptions)
        redis2 = new Redis(redisOptions)
    })

    afterEach(() => {
        clock.uninstall()
        redis1.disconnect()
        redis2.disconnect()
    })

    test('get the same tracker for the same client', async () => {
        const tracker = getRedisClientTracker(redis1)
        expect(getRedisClientTracker(redis1)).toBe(tracker)
    })

    test('get a different tracker for a different client', async () => {
        const tracker = getRedisClientTracker(redis1)
        expect(getRedisClientTracker(redis2)).not.toBe(tracker)
    })

    test('initially connected', async () => {
        await redis2.connect()
        await redis1.connect()

        const tracker = getRedisClientTracker(redis1)
        const onConnect = jest.fn()
        tracker.on('connect', onConnect)

        const clientIds = extractClientIds(
            await redis1.client('list', 'type', 'normal'),
        )
        expect(clientIds.size).toBe(2)
        await whenNextTick()
        expect(onConnect).toHaveBeenCalledTimes(2)
        clientIds.forEach(clientId => {
            expect(onConnect).toHaveBeenCalledWith(clientId)
            expect(tracker.isConnected(clientId)).toBeTrue()
        })
        expect(tracker.isConnected(-1)).toBeFalse()
        expect(clock.countTimers()).toBe(1)
    })

    test('initially disconnected', async () => {
        const tracker = getRedisClientTracker(redis1)
        const onConnect = jest.fn()
        tracker.on('connect', onConnect)

        await redis2.connect()
        await redis1.connect()

        const clientIds = extractClientIds(
            await redis1.client('list', 'type', 'normal'),
        )
        expect(clientIds.size).toBe(2)
        await whenNextTick()
        expect(onConnect).toHaveBeenCalledTimes(2)
        clientIds.forEach(clientId => {
            expect(onConnect).toHaveBeenCalledWith(clientId)
            expect(tracker.isConnected(clientId)).toBeTrue()
        })
        expect(tracker.isConnected(-1)).toBeFalse()
        expect(clock.countTimers()).toBe(1)
    })

    test('disconnect peer', async () => {
        await redis2.connect()
        await redis1.connect()

        const tracker = getRedisClientTracker(redis1)
        const onDisconnect = jest.fn()
        tracker.on('disconnect', onDisconnect)

        const clientIds = extractClientIds(
            await redis1.client('list', 'type', 'normal'),
        )
        expect(clientIds.size).toBe(2)
        redis2.disconnect()
        await redis2.ping().catch(noop)
        clock.next() // Trigger tracker refresh.
        const ownClientId = await redis1.client('id')
        await whenNextTick()
        expect(onDisconnect).toHaveBeenCalledTimes(1)
        clientIds.forEach(clientId => {
            if (clientId === ownClientId) {
                expect(tracker.isConnected(clientId)).toBeTrue()
            } else {
                expect(onDisconnect).toHaveBeenCalledWith(clientId)
                expect(tracker.isConnected(clientId)).toBeFalse()
            }
        })
    })

    test('turn peer into a subscriber', async () => {
        await redis2.connect()
        await redis1.connect()

        const tracker = getRedisClientTracker(redis1)
        const onDisconnect = jest.fn()
        tracker.on('disconnect', onDisconnect)

        const clientIds = extractClientIds(
            await redis1.client('list', 'type', 'normal'),
        )
        expect(clientIds.size).toBe(2)
        await redis2.subscribe('topic')
        clock.next() // Trigger tracker refresh.
        const ownClientId = await redis1.client('id')
        await whenNextTick()
        expect(onDisconnect).toHaveBeenCalledTimes(1)
        clientIds.forEach(clientId => {
            if (clientId === ownClientId) {
                expect(tracker.isConnected(clientId)).toBeTrue()
            } else {
                expect(onDisconnect).toHaveBeenCalledWith(clientId)
                expect(tracker.isConnected(clientId)).toBeFalse()
            }
        })
    })

    test('disconnect and reconnect self', async () => {
        await redis2.connect()
        await redis1.connect()

        const tracker = getRedisClientTracker(redis1)
        const onDisconnect = jest.fn()
        tracker.on('disconnect', onDisconnect)

        let clientIds = extractClientIds(
            await redis1.client('list', 'type', 'normal'),
        )
        expect(clock.countTimers()).toBe(1)
        expect(clientIds.size).toBe(2)
        redis1.disconnect()
        await redis1.ping().catch(noop)
        expect(clock.countTimers()).toBe(0)
        expect(onDisconnect).toHaveBeenCalledTimes(2)
        clientIds.forEach(clientId => {
            expect(onDisconnect).toHaveBeenCalledWith(clientId)
            expect(tracker.isConnected(clientId)).toBeFalse()
        })

        const onConnect = jest.fn()
        tracker.on('connect', onConnect)

        await redis1.connect()

        clientIds = extractClientIds(
            await redis1.client('list', 'type', 'normal'),
        )
        expect(clientIds.size).toBe(2)
        await whenNextTick()
        expect(onConnect).toHaveBeenCalledTimes(2)
        clientIds.forEach(clientId => {
            expect(onConnect).toHaveBeenCalledWith(clientId)
            expect(tracker.isConnected(clientId)).toBeTrue()
        })
        expect(tracker.isConnected(-1)).toBeFalse()
        expect(clock.countTimers()).toBe(1)
    })

    test('refresh error', async () => {
        await redis2.connect()
        await redis1.connect()

        const tracker = getRedisClientTracker(redis1)
        const onDisconnect = jest.fn()
        const onError = jest.fn()
        tracker.on('disconnect', onDisconnect)
        tracker.on('error', onError)

        const clientIds = extractClientIds(
            await redis1.client('list', 'type', 'normal'),
        )
        expect(clock.countTimers()).toBe(1)
        expect(clientIds.size).toBe(2)
        redis1.disconnect()
        clock.next() // Trigger a tracker refresh.
        await redis1.ping().catch(noop)
        await whenNextTick()
        expect(clock.countTimers()).toBe(0)
        expect(onDisconnect).toHaveBeenCalledTimes(2)
        clientIds.forEach(clientId => {
            expect(onDisconnect).toHaveBeenCalledWith(clientId)
            expect(tracker.isConnected(clientId)).toBeFalse()
        })
        expect(onError).toHaveBeenCalledTimes(1)
        expect(onError).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Connection is closed.',
                name: 'Error',
            }),
        )
    })
})
