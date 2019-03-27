import { AuthEvents, AuthManager, UserId, userIdEqual } from '@syncot/auth'
import { Connection, createConnection } from '@syncot/core'
import {
    LocationId,
    locationIdEqual,
    Presence,
    PresenceService,
} from '@syncot/presence'
import { SessionEvents, SessionManager } from '@syncot/session'
import { decode } from '@syncot/tson'
import {
    invertedStreams,
    randomInteger,
    SyncOtEmitter,
    toArrayBuffer,
} from '@syncot/util'
import Redis from 'ioredis'
import { Clock, install as installClock, InstalledClock } from 'lolex'
import RedisServer from 'redis-server'
import { Duplex } from 'stream'
import { createPresenceService } from '.'

const now = 12345
let clock: InstalledClock<Clock>

const alreadyDestroyedMatcher = expect.objectContaining({
    message: 'Already destroyed.',
    name: 'AssertionError [ERR_ASSERTION]',
})

const userId = 'test-user-id'
const sessionIdArray = [0, 1, 2, 3]
const sessionId = toArrayBuffer(Buffer.from(sessionIdArray))
const presenceKey = Buffer.from(
    'presence:'
        .split('')
        .map(c => c.charCodeAt(0))
        .concat(sessionIdArray),
)
const locationId = 'test-location-id'
const lastModified = 123
const data = Object.freeze({ key: 'value' })
const presence: Presence = Object.freeze({
    data,
    lastModified,
    locationId,
    sessionId,
    userId,
})

let port: number
let redisServer: RedisServer
let redis: Redis.Redis
let redisPublisher: Redis.Redis
let redisSubscriber: Redis.Redis

let authService: MockAuthService
let sessionService: MockSessionService

let stream1: Duplex
let stream2: Duplex
let connection1: Connection
let connection2: Connection
let presenceService: PresenceService
let presenceProxy: PresenceService

class MockAuthService extends SyncOtEmitter<AuthEvents> implements AuthManager {
    public getUserId = jest.fn().mockReturnValue(userId)
    public hasUserId = jest.fn().mockReturnValue(true)
    public hasAuthenticatedUserId = jest.fn().mockReturnValue(true)
    public mayRead = jest.fn().mockResolvedValue(true)
    public mayWrite = jest.fn().mockResolvedValue(true)
}

class MockSessionService extends SyncOtEmitter<SessionEvents>
    implements SessionManager {
    public getSessionId = jest.fn().mockReturnValue(sessionId)
    public hasSession = jest.fn().mockReturnValue(true)
    public hasActiveSession = jest.fn().mockReturnValue(true)
}

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
    clock = installClock({ now })
    const options = {
        lazyConnect: true,
        port,
        showFriendlyErrorStack: true,
    }
    redis = new Redis(options)
    redisPublisher = new Redis(options)
    redisSubscriber = new Redis(options)
    await redis.connect()
    await redisPublisher.connect()
    await redisSubscriber.connect()

    authService = new MockAuthService()
    sessionService = new MockSessionService()

    connection1 = createConnection()
    connection2 = createConnection()
    ;[stream1, stream2] = invertedStreams({ objectMode: true })
    connection1.connect(stream1)
    connection2.connect(stream2)

    presenceService = createPresenceService({
        authService,
        connection: connection1,
        redis,
        redisPublisher,
        redisSubscriber,
        sessionService,
    })
    connection2.registerProxy({
        actions: new Set([
            'submitPresence',
            'getPresenceBySessionId',
            'getPresenceByUserId',
            'getPresenceByLocationId',
        ]),
        name: 'presence',
    })
    presenceProxy = connection2.getProxy('presence') as PresenceService
})

afterEach(() => {
    clock.uninstall()
    connection1.disconnect()
    connection2.disconnect()
    presenceService.destroy()
    redis.flushall()
    redis.disconnect()
    redisPublisher.disconnect()
    redisSubscriber.disconnect()
})

test('destroy', async () => {
    const onDestroy = jest.fn()
    presenceService.on('destroy', onDestroy)
    presenceService.destroy()
    await new Promise(resolve => presenceService.once('destroy', resolve))
    expect(onDestroy).toHaveBeenCalledTimes(1)
    await expect(presenceProxy.submitPresence(presence)).rejects.toEqual(
        alreadyDestroyedMatcher,
    )
    await expect(
        presenceProxy.getPresenceBySessionId(sessionId),
    ).rejects.toEqual(alreadyDestroyedMatcher)
    await expect(presenceProxy.getPresenceByUserId(userId)).rejects.toEqual(
        alreadyDestroyedMatcher,
    )
    await expect(
        presenceProxy.getPresenceByLocationId(locationId),
    ).rejects.toEqual(alreadyDestroyedMatcher)
})

describe('submitPresence', () => {
    test('wrong userId', async () => {
        await expect(
            presenceProxy.submitPresence({
                ...presence,
                userId: 'different-user',
            }),
        ).rejects.toEqual(
            expect.objectContaining({
                message: 'User ID mismatch.',
                name: 'SyncOtError Presence',
            }),
        )
    })
    test('wrong sessionId', async () => {
        await expect(
            presenceProxy.submitPresence({
                ...presence,
                sessionId: new ArrayBuffer(0),
            }),
        ).rejects.toEqual(
            expect.objectContaining({
                message: 'Session ID mismatch.',
                name: 'SyncOtError Presence',
            }),
        )
    })
    test('invalid presence', async () => {
        await expect(presenceProxy.submitPresence(null as any)).rejects.toEqual(
            expect.objectContaining({
                entity: null,
                entityName: 'Presence',
                key: null,
                message: 'Invalid "Presence".',
                name: 'SyncOtError InvalidEntity',
            }),
        )
    })
    test('no active session', async () => {
        sessionService.hasActiveSession.mockReturnValue(false)
        await expect(presenceProxy.submitPresence(presence)).rejects.toEqual(
            expect.objectContaining({
                message: 'No active session.',
                name: 'SyncOtError Auth',
            }),
        )
    })
    test('no authenticated user', async () => {
        authService.hasAuthenticatedUserId.mockReturnValue(false)
        await expect(presenceProxy.submitPresence(presence)).rejects.toEqual(
            expect.objectContaining({
                message: 'No authenticated user.',
                name: 'SyncOtError Auth',
            }),
        )
    })
    test('invalid ttl', () => {
        connection1.disconnect()
        connection2.disconnect()
        connection1 = createConnection()
        expect(() =>
            createPresenceService(
                {
                    authService,
                    connection: connection1,
                    redis,
                    redisPublisher,
                    redisSubscriber,
                    sessionService,
                },
                {
                    ttl: '123' as any,
                },
            ),
        ).toThrow(
            expect.objectContaining({
                message:
                    'Argument "options.ttl" must be undefined or a safe integer.',
                name: 'AssertionError [ERR_ASSERTION]',
            }),
        )
    })
    test('create twice on the same connection', () => {
        expect(() =>
            createPresenceService({
                authService,
                connection: connection1,
                redis,
                redisPublisher,
                redisSubscriber,
                sessionService,
            }),
        ).toThrow(
            expect.objectContaining({
                message: 'Service "presence" has been already registered.',
                name: 'AssertionError [ERR_ASSERTION]',
            }),
        )
    })
    test('storage error', async () => {
        const onError = jest.fn()
        const onOutOfSync = jest.fn()
        const onInSync = jest.fn()
        presenceService.on('outOfSync', onOutOfSync)
        presenceService.on('inSync', onInSync)

        redis.disconnect()
        await presenceProxy.submitPresence(presence)
        presenceService.once('error', onError)
        clock.next() // Attempt to store presence.
        await new Promise(resolve => presenceService.once('error', resolve))
        expect(onError).toHaveBeenCalledWith(
            expect.objectContaining({
                cause: expect.objectContaining({
                    message: 'Connection is closed.',
                    name: 'Error',
                }),
                message:
                    'Failed to sync presence with Redis. => Error: Connection is closed.',
                name: 'SyncOtError Presence',
            }),
        )

        await redis.connect()
        await expect(redis.exists(presenceKey)).resolves.toBe(0)
        clock.next() // Attempt to store presence again.
        await new Promise(resolve => presenceService.once('inSync', resolve))
        // Detailed validation of the stored data is in the "storage" test below.
        await expect(redis.exists(presenceKey)).resolves.toBe(1)
        // The retry is scheduled with a random delay between 1 and 10 seconds.
        expect(Date.now()).toBeGreaterThanOrEqual(now + 1000)
        expect(Date.now()).toBeLessThan(now + 11000)

        expect(onOutOfSync).toHaveBeenCalledTimes(1)
        expect(onInSync).toHaveBeenCalledTimes(1)
        expect(onInSync).toHaveBeenCalledAfter(onOutOfSync)
    })

    describe.each<[undefined | number, number]>([
        [undefined, 600],
        [1, 10],
        [3600, 3600],
    ])('ttlOption = %d', (ttlOption, effectiveTtl) => {
        if (ttlOption !== undefined) {
            beforeEach(() => {
                connection1.disconnect()
                connection2.disconnect()
                connection1 = createConnection()
                ;[stream1, stream2] = invertedStreams({ objectMode: true })
                connection1.connect(stream1)
                connection2.connect(stream2)

                presenceService = createPresenceService(
                    {
                        authService,
                        connection: connection1,
                        redis,
                        redisPublisher,
                        redisSubscriber,
                        sessionService,
                    },
                    {
                        ttl: ttlOption,
                    },
                )
            })
        }

        test('storage', async () => {
            const onOutOfSync = jest.fn()
            const onInSync = jest.fn()
            presenceService.on('outOfSync', onOutOfSync)
            presenceService.on('inSync', onInSync)

            await presenceProxy.submitPresence(presence)
            clock.runAll()
            await new Promise(resolve =>
                presenceService.once('inSync', resolve),
            )

            expect(onOutOfSync).toHaveBeenCalledTimes(1)
            expect(onInSync).toHaveBeenCalledTimes(1)
            expect(onInSync).toHaveBeenCalledAfter(onOutOfSync)

            const ttl = await redis.ttl(presenceKey)
            expect(ttl).toBeLessThanOrEqual(effectiveTtl)
            expect(ttl).toBeGreaterThanOrEqual(effectiveTtl - 1)

            const [
                loadedUserId,
                loadedLocationId,
                loadedData,
                loadedLastModified,
            ] = decode(await redis.getBuffer(presenceKey)) as [
                UserId,
                LocationId,
                any,
                number
            ]
            expect(userIdEqual(loadedUserId, userId)).toBeTrue()
            expect(locationIdEqual(loadedLocationId, locationId)).toBeTrue()
            expect(loadedData).toEqual(data)
            expect(loadedLastModified).toBe(now)
        })
    })
})
