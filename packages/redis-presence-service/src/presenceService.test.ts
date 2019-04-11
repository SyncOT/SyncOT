import { AuthEvents, AuthService } from '@syncot/auth'
import { Connection, createConnection } from '@syncot/connection'
import { Presence, PresenceService } from '@syncot/presence'
import { SessionEvents, SessionManager } from '@syncot/session'
import { encode } from '@syncot/tson'
import { invertedStreams, randomInteger, SyncOtEmitter } from '@syncot/util'
import { EventEmitter } from 'events'
import Redis from 'ioredis'
import { Clock, install as installClock, InstalledClock } from 'lolex'
import RedisServer from 'redis-server'
import { SmartBuffer } from 'smart-buffer'
import { Duplex } from 'stream'
import { createPresenceService } from '.'

const now = 12345
let clock: InstalledClock<Clock>

const alreadyDestroyedMatcher = expect.objectContaining({
    message: 'Already destroyed.',
    name: 'AssertionError [ERR_ASSERTION]',
})

const presencePrefix = 'presence:sessionId='
const userPrefix = 'sessionIds:userId='
const locationPrefix = 'sessionIds:locationId='

const sessionId = 'test-session-id'
const sessionId2 = 'test-session-id-2'
const userId = 'test-user-id'
const userId2 = 'test-user-id-2'
const locationId = 'test-location-id'
const locationId2 = 'test-location-id-2'
const data = Object.freeze({ key: 'value' })
const data2 = Object.freeze({ key: 'value-2' })
const lastModified = 1
const lastModified2 = 2

const sessionIdBuffer = Buffer.from(encode(sessionId))
const sessionIdBuffer2 = Buffer.from(encode(sessionId2))
const userIdBuffer = Buffer.from(encode(userId))
const userIdBuffer2 = Buffer.from(encode(userId2))
const locationIdBuffer = Buffer.from(encode(locationId))
const locationIdBuffer2 = Buffer.from(encode(locationId2))
const dataBuffer = Buffer.from(encode(data))
const dataBuffer2 = Buffer.from(encode(data2))
const lastModifiedBuffer = Buffer.from(encode(lastModified))
const lastModifiedBuffer2 = Buffer.from(encode(lastModified2))

const presenceKey = new SmartBuffer()
    .writeString(presencePrefix)
    .writeBuffer(sessionIdBuffer)
    .toBuffer()
const presenceKey2 = new SmartBuffer()
    .writeString(presencePrefix)
    .writeBuffer(sessionIdBuffer2)
    .toBuffer()
const userKey = new SmartBuffer()
    .writeString(userPrefix)
    .writeBuffer(userIdBuffer)
    .toBuffer()
const userKey2 = new SmartBuffer()
    .writeString(userPrefix)
    .writeBuffer(userIdBuffer2)
    .toBuffer()
const locationKey = new SmartBuffer()
    .writeString(locationPrefix)
    .writeBuffer(locationIdBuffer)
    .toBuffer()
const locationKey2 = new SmartBuffer()
    .writeString(locationPrefix)
    .writeBuffer(locationIdBuffer2)
    .toBuffer()

const presence: Presence = Object.freeze({
    data,
    lastModified,
    locationId,
    sessionId,
    userId,
})

const presence2: Presence = Object.freeze({
    data: data2,
    lastModified: lastModified2,
    locationId: locationId2,
    sessionId: sessionId2,
    userId: userId2,
})

let port: number
let redisServer: RedisServer
let redis: Redis.Redis
let redisSubscriber: Redis.Redis
let monitor: EventEmitter

let authService: MockAuthService
let sessionService: MockSessionService

let stream1: Duplex
let stream2: Duplex
let connection1: Connection
let connection2: Connection
let presenceService: PresenceService
let presenceProxy: PresenceService

class MockAuthService extends SyncOtEmitter<AuthEvents> implements AuthService {
    public getUserId = jest.fn().mockReturnValue(userId)
    public hasUserId = jest.fn().mockReturnValue(true)
    public hasAuthenticatedUserId = jest.fn().mockReturnValue(true)
    public mayReadDocument = jest.fn().mockResolvedValue(true)
    public mayWriteDocument = jest.fn().mockResolvedValue(true)
    public mayReadPresence = jest.fn().mockResolvedValue(true)
    public mayWritePresence = jest.fn().mockResolvedValue(true)
}

class MockSessionService extends SyncOtEmitter<SessionEvents>
    implements SessionManager {
    public getSessionId = jest.fn().mockReturnValue(sessionId)
    public hasSession = jest.fn().mockReturnValue(true)
    public hasActiveSession = jest.fn().mockReturnValue(true)
}

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
    redisSubscriber = new Redis(options)
    await redis.connect()
    await redisSubscriber.connect()
    monitor = await redis.monitor()

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
        redisSubscriber,
        sessionService,
    })
    connection2.registerProxy({
        name: 'presence',
        requestNames: new Set([
            'submitPresence',
            'removePresence',
            'getPresenceBySessionId',
            'getPresenceByUserId',
            'getPresenceByLocationId',
        ]),
    })
    presenceProxy = connection2.getProxy('presence') as PresenceService
})

afterEach(async () => {
    clock.uninstall()
    connection1.disconnect()
    connection2.disconnect()
    presenceService.destroy()
    await redis.flushall()
    redis.disconnect()
    redisSubscriber.disconnect()
    ;(monitor as any).disconnect()
})

test.each(['123', 9] as any[])('invalid ttl: %p', ttl => {
    connection1.disconnect()
    connection2.disconnect()
    connection1 = createConnection()
    expect(() =>
        createPresenceService(
            {
                authService,
                connection: connection1,
                redis,
                redisSubscriber,
                sessionService,
            },
            {
                ttl,
            },
        ),
    ).toThrow(
        expect.objectContaining({
            message:
                'Argument "options.ttl" must be undefined or a safe integer >= 10.',
            name: 'AssertionError [ERR_ASSERTION]',
        }),
    )
})

test.each(['123', 8] as any[])(
    'invalid presenceSizeLimit: %p',
    presenceSizeLimit => {
        connection1.disconnect()
        connection2.disconnect()
        connection1 = createConnection()
        expect(() =>
            createPresenceService(
                {
                    authService,
                    connection: connection1,
                    redis,
                    redisSubscriber,
                    sessionService,
                },
                {
                    presenceSizeLimit,
                },
            ),
        ).toThrow(
            expect.objectContaining({
                message:
                    'Argument "options.presenceSizeLimit" must be undefined or a safe integer >= 9.',
                name: 'AssertionError [ERR_ASSERTION]',
            }),
        )
    },
)

test('create twice on the same connection', () => {
    expect(() =>
        createPresenceService({
            authService,
            connection: connection1,
            redis,
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

test('remove presence on destroy', async () => {
    const onDestroy = jest.fn()
    presenceService.on('destroy', onDestroy)

    await presenceProxy.submitPresence(presence)
    clock.next() // Save presence in Redis.

    await new Promise(resolve => presenceService.once('inSync', resolve))
    await expect(redis.exists(presenceKey)).resolves.toBe(1)
    await expect(
        redis.sismember(userKey, sessionIdBuffer as any),
    ).resolves.toBe(1)
    await expect(
        redis.sismember(locationKey, sessionIdBuffer as any),
    ).resolves.toBe(1)

    presenceService.destroy()
    clock.next() // Delete presence from Redis.

    await whenRedisCommandExecuted('DEL')
    await expect(redis.exists(presenceKey)).resolves.toBe(0)
    await expect(
        redis.sismember(userKey, sessionIdBuffer as any),
    ).resolves.toBe(0)
    await expect(
        redis.sismember(locationKey, sessionIdBuffer as any),
    ).resolves.toBe(0)

    expect(onDestroy).toHaveBeenCalledTimes(1)
})

test.each<[string, () => void]>([
    [
        'sessionInactive',
        () => {
            sessionService.hasActiveSession.mockReturnValue(false)
            sessionService.emit('sessionInactive')
        },
    ],
    [
        'authEnd',
        () => {
            authService.hasAuthenticatedUserId.mockReturnValue(false)
            authService.emit('authEnd')
        },
    ],
])('remove presence on %s', async (_, emitEvent) => {
    await presenceService.submitPresence(presence)
    clock.next()
    await new Promise(resolve => presenceService.once('inSync', resolve))

    await expect(redis.exists(presenceKey)).resolves.toBe(1)
    await expect(
        redis.sismember(userKey, sessionIdBuffer as any),
    ).resolves.toBe(1)
    await expect(
        redis.sismember(locationKey, sessionIdBuffer as any),
    ).resolves.toBe(1)

    const onOutOfSync = jest.fn()
    const onInSync = jest.fn()
    presenceService.on('outOfSync', onOutOfSync)
    presenceService.on('inSync', onInSync)

    emitEvent()
    clock.next() // Remove presence.

    await new Promise(resolve => presenceService.once('inSync', resolve))
    await expect(redis.exists(presenceKey)).resolves.toBe(0)
    await expect(
        redis.sismember(userKey, sessionIdBuffer as any),
    ).resolves.toBe(0)
    await expect(
        redis.sismember(locationKey, sessionIdBuffer as any),
    ).resolves.toBe(0)

    expect(onOutOfSync).toHaveBeenCalledTimes(1)
    expect(onInSync).toHaveBeenCalledTimes(1)
    expect(onOutOfSync).toHaveBeenCalledBefore(onInSync)
})

test('reuse service with a different client', async () => {
    // Client 1 submits presence.
    await presenceService.submitPresence(presence)
    clock.next()
    await new Promise(resolve => presenceService.once('inSync', resolve))
    await expect(redis.exists(presenceKey)).resolves.toBe(1)
    await expect(
        redis.sismember(userKey, sessionIdBuffer as any),
    ).resolves.toBe(1)
    await expect(
        redis.sismember(locationKey, sessionIdBuffer as any),
    ).resolves.toBe(1)

    // Client 1 disconnects.
    sessionService.hasActiveSession.mockReturnValue(false)
    authService.hasAuthenticatedUserId.mockReturnValue(false)
    sessionService.emit('sessionInactive')
    authService.emit('authEnd')
    clock.next()
    await new Promise(resolve => presenceService.once('inSync', resolve))
    await expect(redis.exists(presenceKey)).resolves.toBe(0)
    await expect(
        redis.sismember(userKey, sessionIdBuffer as any),
    ).resolves.toBe(0)
    await expect(
        redis.sismember(locationKey, sessionIdBuffer as any),
    ).resolves.toBe(0)

    // Client 2 connects.
    sessionService.getSessionId.mockReturnValue(sessionId2)
    sessionService.hasActiveSession.mockReturnValue(true)
    authService.getUserId.mockReturnValue(userId2)
    authService.hasAuthenticatedUserId.mockReturnValue(true)

    // Client 2 submits presence.
    await presenceService.submitPresence(presence2)
    clock.next()
    await new Promise(resolve => presenceService.once('inSync', resolve))

    await expect(redis.exists(presenceKey2)).resolves.toBe(1)
    await expect(
        redis.sismember(userKey2, sessionIdBuffer2 as any),
    ).resolves.toBe(1)
    await expect(
        redis.sismember(locationKey2, sessionIdBuffer2 as any),
    ).resolves.toBe(1)
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

    test('not authorized', async () => {
        authService.mayWritePresence.mockReturnValue(false)
        await expect(presenceProxy.submitPresence(presence)).rejects.toEqual(
            expect.objectContaining({
                message: 'Not authorized to submit this presence object.',
                name: 'SyncOtError Auth',
            }),
        )
        expect(authService.mayWritePresence).toHaveBeenCalledTimes(1)
        expect(authService.mayWritePresence).toHaveBeenCalledWith(presence)
    })

    test.each([undefined, 9, 20])(
        'presence size limit exceeded (%p)',
        async presenceSizeLimit => {
            connection1 = createConnection()
            connection2 = createConnection()
            ;[stream1, stream2] = invertedStreams({ objectMode: true })
            connection1.connect(stream1)
            connection2.connect(stream2)

            presenceService = createPresenceService(
                {
                    authService,
                    connection: connection1,
                    redis,
                    redisSubscriber,
                    sessionService,
                },
                {
                    presenceSizeLimit,
                },
            )
            connection2.registerProxy({
                name: 'presence',
                requestNames: new Set([
                    'submitPresence',
                    'removePresence',
                    'getPresenceBySessionId',
                    'getPresenceByUserId',
                    'getPresenceByLocationId',
                ]),
            })
            presenceProxy = connection2.getProxy('presence') as PresenceService

            const effectiveLimit = presenceSizeLimit || 1024
            authService.getUserId.mockReturnValue(123)
            sessionService.getSessionId.mockReturnValue(34)
            await expect(
                presenceProxy.submitPresence({
                    data: new ArrayBuffer(effectiveLimit - 9), // (type + int8 or int16 length + binary data)
                    lastModified: Date.now(), // 3 bytes (type + int16)
                    locationId: 99, // 2 bytes (type + int8)
                    sessionId: 34, // 2 bytes (type + int8)
                    userId: 123, // 2 bytes (type + int8)
                }),
            ).rejects.toEqual(
                expect.objectContaining({
                    message: 'Presence size limit exceeded.',
                    name: 'SyncOtError Presence',
                }),
            )
        },
    )

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
        expect(Date.now()).toBeLessThan(now + 10000)

        expect(onOutOfSync).toHaveBeenCalledTimes(1)
        expect(onInSync).toHaveBeenCalledTimes(1)
        expect(onOutOfSync).toHaveBeenCalledBefore(onInSync)
    })

    test('submit new presence while saving old to Redis', async () => {
        const onOutOfSync = jest.fn()
        const onInSync = jest.fn()
        presenceService.on('outOfSync', onOutOfSync)
        presenceService.on('inSync', onInSync)

        await presenceProxy.submitPresence(presence) // Submit old.
        clock.next() // Start saving the old presence to Redis.
        // User ID would not change like this in practice, however, we do it
        // to test that the presence indexes are updated correctly even in this
        // extreme case.
        authService.getUserId.mockReturnValue(userId2)
        await presenceProxy.submitPresence({
            ...presence2,
            sessionId,
        }) // Submit new.

        // Old presence.
        await whenRedisCommandExecuted('EXPIRE')
        await expect(
            presenceProxy.getPresenceBySessionId(sessionId),
        ).resolves.toEqual({ ...presence, lastModified: now })
        await expect(
            redis.sismember(userKey, sessionIdBuffer as any),
        ).resolves.toBe(1)
        await expect(
            redis.sismember(locationKey, sessionIdBuffer as any),
        ).resolves.toBe(1)

        // New presence.
        clock.next() // Start saving the new presence to Redis.
        await whenRedisCommandExecuted('EXPIRE')
        await expect(
            presenceProxy.getPresenceBySessionId(sessionId),
        ).resolves.toEqual({
            ...presence2,
            lastModified: now,
            sessionId,
        })
        await expect(
            redis.sismember(userKey, sessionIdBuffer as any),
        ).resolves.toBe(0)
        await expect(
            redis.sismember(locationKey, sessionIdBuffer as any),
        ).resolves.toBe(0)
        await expect(
            redis.sismember(userKey2, sessionIdBuffer as any),
        ).resolves.toBe(1)
        await expect(
            redis.sismember(locationKey2, sessionIdBuffer as any),
        ).resolves.toBe(1)

        expect(onOutOfSync).toHaveBeenCalledTimes(1)
        expect(onInSync).toHaveBeenCalledTimes(1)
    })

    describe.each<[undefined | number, number]>([
        [undefined, 60],
        [3600, 3600],
    ])('ttl option = %d', (ttlOption, effectiveTtl) => {
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
                        redisSubscriber,
                        sessionService,
                    },
                    {
                        ttl: ttlOption,
                    },
                )
            })
        }

        test('store', async () => {
            const onOutOfSync = jest.fn()
            const onInSync = jest.fn()
            presenceService.on('outOfSync', onOutOfSync)
            presenceService.on('inSync', onInSync)

            await presenceProxy.submitPresence(presence)
            clock.next()
            await new Promise(resolve =>
                presenceService.once('inSync', resolve),
            )

            expect(onOutOfSync).toHaveBeenCalledTimes(1)
            expect(onInSync).toHaveBeenCalledTimes(1)
            expect(onOutOfSync).toHaveBeenCalledBefore(onInSync)

            await expect(
                presenceProxy.getPresenceBySessionId(sessionId),
            ).resolves.toEqual({ ...presence, lastModified: now })
            await expect(redis.ttl(presenceKey)).resolves.toBe(effectiveTtl)
            await expect(
                redis.sismember(userKey, sessionIdBuffer as any),
            ).resolves.toBe(1)
            await expect(redis.ttl(userKey)).resolves.toBe(effectiveTtl)
            await expect(
                redis.sismember(locationKey, sessionIdBuffer as any),
            ).resolves.toBe(1)
            await expect(redis.ttl(locationKey)).resolves.toBe(effectiveTtl)
        })

        test('refresh before expired', async () => {
            await presenceProxy.submitPresence(presence)
            clock.next()
            await new Promise(resolve =>
                presenceService.once('inSync', resolve),
            )

            const onOutOfSync = jest.fn()
            const onInSync = jest.fn()
            presenceService.on('outOfSync', onOutOfSync)
            presenceService.on('inSync', onInSync)

            await redis.hset(
                presenceKey,
                'lastModified',
                Buffer.from(encode(7)),
            )
            await redis.expire(presenceKey, 1)
            await redis.expire(userKey, 1)
            await redis.expire(locationKey, 1)
            clock.tick((effectiveTtl - 1) * 1000) // Trigger a refresh.

            await whenRedisCommandExecuted('EXPIRE')

            // lastModified is 7 as set above, rather than `now`, because the PresenceService realised that
            // the previously stored hash still exists, so it updated only its TTL without checking
            // the stored values in order to reduce the load on the Redis server.
            await expect(
                presenceProxy.getPresenceBySessionId(sessionId),
            ).resolves.toEqual({ ...presence, lastModified: 7 })
            await expect(redis.ttl(presenceKey)).resolves.toBe(effectiveTtl)
            await expect(
                redis.sismember(userKey, sessionIdBuffer as any),
            ).resolves.toBe(1)
            await expect(redis.ttl(userKey)).resolves.toBe(effectiveTtl)
            await expect(
                redis.sismember(locationKey, sessionIdBuffer as any),
            ).resolves.toBe(1)
            await expect(redis.ttl(locationKey)).resolves.toBe(effectiveTtl)

            expect(onOutOfSync).not.toHaveBeenCalled()
            expect(onInSync).not.toHaveBeenCalled()
        })

        test('refresh after expired', async () => {
            await presenceProxy.submitPresence(presence)
            clock.next()
            await new Promise(resolve =>
                presenceService.once('inSync', resolve),
            )

            const onOutOfSync = jest.fn()
            const onInSync = jest.fn()
            presenceService.on('outOfSync', onOutOfSync)
            presenceService.on('inSync', onInSync)

            await redis.del(presenceKey)
            await redis.srem(userKey, sessionId)
            await redis.srem(locationKey, sessionId)
            clock.tick((effectiveTtl - 1) * 1000) // Trigger a refresh.

            await whenRedisCommandExecuted('EXPIRE')

            await expect(
                presenceProxy.getPresenceBySessionId(sessionId),
            ).resolves.toEqual({ ...presence, lastModified: now })
            await expect(redis.ttl(presenceKey)).resolves.toBe(effectiveTtl)
            await expect(
                redis.sismember(userKey, sessionIdBuffer as any),
            ).resolves.toBe(1)
            await expect(redis.ttl(userKey)).resolves.toBe(effectiveTtl)
            await expect(
                redis.sismember(locationKey, sessionIdBuffer as any),
            ).resolves.toBe(1)
            await expect(redis.ttl(locationKey)).resolves.toBe(effectiveTtl)

            expect(onOutOfSync).not.toHaveBeenCalled()
            expect(onInSync).not.toHaveBeenCalled()
        })
    })
})

describe('removePresence', () => {
    test('has no presence', async () => {
        const onOutOfSync = jest.fn()
        const onInSync = jest.fn()
        presenceService.on('outOfSync', onOutOfSync)
        presenceService.on('inSync', onInSync)

        await presenceProxy.removePresence()
        expect(clock.countTimers()).toBe(1)
        clock.next()
        expect(clock.countTimers()).toBe(0)
        await Promise.resolve()

        expect(onOutOfSync).not.toHaveBeenCalled()
        expect(onInSync).not.toHaveBeenCalled()
    })

    test('has presence', async () => {
        await presenceProxy.submitPresence(presence)
        clock.next()
        await new Promise(resolve => presenceService.once('inSync', resolve))
        await expect(redis.exists(presenceKey)).resolves.toBe(1)
        await expect(
            redis.sismember(userKey, sessionIdBuffer as any),
        ).resolves.toBe(1)
        await expect(
            redis.sismember(locationKey, sessionIdBuffer as any),
        ).resolves.toBe(1)

        await presenceProxy.removePresence()
        const onOutOfSync = jest.fn()
        const onInSync = jest.fn()
        presenceService.on('outOfSync', onOutOfSync)
        presenceService.on('inSync', onInSync)
        clock.next()
        await new Promise(resolve => presenceService.once('inSync', resolve))
        await expect(redis.exists(presenceKey)).resolves.toBe(0)
        await expect(
            redis.sismember(userKey, sessionIdBuffer as any),
        ).resolves.toBe(0)
        await expect(
            redis.sismember(locationKey, sessionIdBuffer as any),
        ).resolves.toBe(0)

        expect(onOutOfSync).toHaveBeenCalledTimes(1)
        expect(onInSync).toHaveBeenCalledTimes(1)
        expect(onOutOfSync).toHaveBeenCalledBefore(onInSync)
    })

    test('no authentication', async () => {
        sessionService.hasActiveSession.mockReturnValue(false)
        authService.hasAuthenticatedUserId.mockReturnValue(false)

        await presenceProxy.removePresence()
        expect(clock.countTimers()).toBe(1)
        clock.next()
        expect(clock.countTimers()).toBe(0)
    })

    // Note that it's not possible to have presence without authentication,
    // thus the `removePresence` method does not perform any authentication,
    // which makes testing that case redundant.
})

describe('getPresenceBySessionId', () => {
    test('get existing presence', async () => {
        await redis.hmset(presenceKey, {
            data: dataBuffer,
            lastModified: lastModifiedBuffer,
            locationId: locationIdBuffer,
            userId: userIdBuffer,
        })
        await expect(
            presenceProxy.getPresenceBySessionId(sessionId),
        ).resolves.toEqual(presence)
    })

    test('not authorized', async () => {
        authService.mayReadPresence.mockResolvedValue(false)
        await redis.hmset(presenceKey, {
            data: dataBuffer,
            lastModified: lastModifiedBuffer,
            locationId: locationIdBuffer,
            userId: userIdBuffer,
        })
        await expect(
            presenceProxy.getPresenceBySessionId(sessionId),
        ).resolves.toBeNull()
        expect(authService.mayReadPresence).toHaveBeenCalledTimes(1)
        expect(authService.mayReadPresence).toHaveBeenCalledWith(presence)
    })

    test('get non-existant presence', async () => {
        await redis.hmset(presenceKey, {
            data: dataBuffer,
            lastModified: lastModifiedBuffer,
            locationId: locationIdBuffer,
            userId: userIdBuffer,
        })
        await expect(
            presenceProxy.getPresenceBySessionId(
                Buffer.from(encode('does not exist')),
            ),
        ).resolves.toBeNull()
    })

    test('get presence with missing userId', async () => {
        await redis.hmset(presenceKey, {
            data: dataBuffer,
            lastModified: lastModifiedBuffer,
            locationId: locationIdBuffer,
            // userId: userIdBuffer,
        })
        await expect(
            presenceProxy.getPresenceBySessionId(sessionId),
        ).resolves.toBeNull()
    })

    test('get presence with missing locationId', async () => {
        await redis.hmset(presenceKey, {
            data: dataBuffer,
            lastModified: lastModifiedBuffer,
            // locationId: locationIdBuffer,
            userId: userIdBuffer,
        })
        await expect(
            presenceProxy.getPresenceBySessionId(sessionId),
        ).resolves.toBeNull()
    })

    test('get presence with missing data', async () => {
        await redis.hmset(presenceKey, {
            // data: dataBuffer,
            lastModified: lastModifiedBuffer,
            locationId: locationIdBuffer,
            userId: userIdBuffer,
        })
        await expect(
            presenceProxy.getPresenceBySessionId(sessionId),
        ).resolves.toBeNull()
    })

    test('get presence with missing lastModified', async () => {
        await redis.hmset(presenceKey, {
            data: dataBuffer,
            // lastModified: lastModifiedBuffer,
            locationId: locationIdBuffer,
            userId: userIdBuffer,
        })
        await expect(
            presenceProxy.getPresenceBySessionId(sessionId),
        ).resolves.toBeNull()
    })

    test('get not encoded presence', async () => {
        await redis.hmset(presenceKey, {
            data,
            lastModified,
            locationId,
            userId,
        })
        await expect(
            presenceProxy.getPresenceBySessionId(sessionId),
        ).rejects.toEqual(
            expect.objectContaining({
                message:
                    'Failed to load presence by sessionId. => ' +
                    'SyncOtError Presence: Invalid presence. => ' +
                    'SyncOtError TSON: Unknown type.',
                name: 'SyncOtError Presence',
            }),
        )
    })

    test('get invalid presence', async () => {
        await redis.hmset(presenceKey, {
            data: dataBuffer,
            lastModified: lastModifiedBuffer,
            locationId: locationIdBuffer,
            userId: Buffer.from(encode(true)),
        })
        await expect(
            presenceProxy.getPresenceBySessionId(sessionId),
        ).rejects.toEqual(
            expect.objectContaining({
                message:
                    'Failed to load presence by sessionId. => ' +
                    'SyncOtError Presence: Invalid presence. => ' +
                    'SyncOtError InvalidEntity: Invalid "Presence.userId".',
                name: 'SyncOtError Presence',
            }),
        )
    })

    test('no active session', async () => {
        sessionService.hasActiveSession.mockReturnValue(false)
        await expect(
            presenceProxy.getPresenceBySessionId(sessionId),
        ).rejects.toEqual(
            expect.objectContaining({
                message: 'No active session.',
                name: 'SyncOtError Auth',
            }),
        )
    })

    test('no authenticated user', async () => {
        authService.hasAuthenticatedUserId.mockReturnValue(false)
        await expect(
            presenceProxy.getPresenceBySessionId(sessionId),
        ).rejects.toEqual(
            expect.objectContaining({
                message: 'No authenticated user.',
                name: 'SyncOtError Auth',
            }),
        )
    })

    test('not connected', async () => {
        redis.disconnect()
        await expect(
            presenceProxy.getPresenceBySessionId(sessionId),
        ).rejects.toEqual(
            expect.objectContaining({
                message:
                    'Failed to load presence by sessionId. => Error: Connection is closed.',
                name: 'SyncOtError Presence',
            }),
        )
        await redis.connect()
    })
})

describe('getPresenceByUserId', () => {
    test('get no presence objects', async () => {
        await expect(
            presenceProxy.getPresenceByUserId(userId),
        ).resolves.toEqual([])
    })

    test('get one presence object', async () => {
        await redis.hmset(presenceKey, {
            data: dataBuffer,
            lastModified: lastModifiedBuffer,
            locationId: locationIdBuffer,
            userId: userIdBuffer,
        })
        await redis.sadd(userKey, sessionIdBuffer)
        await expect(
            presenceProxy.getPresenceByUserId(userId),
        ).resolves.toEqual([presence])
    })

    test('get two presence objects', async () => {
        await redis.hmset(presenceKey, {
            data: dataBuffer,
            lastModified: lastModifiedBuffer,
            locationId: locationIdBuffer,
            userId: userIdBuffer,
        })
        await redis.hmset(presenceKey2, {
            data: dataBuffer2,
            lastModified: lastModifiedBuffer2,
            locationId: locationIdBuffer2,
            userId: userIdBuffer,
        })
        await redis.sadd(userKey, sessionIdBuffer, sessionIdBuffer2)

        const presenceObjects = await presenceProxy.getPresenceByUserId(userId)
        expect(presenceObjects.length).toBe(2)
        expect(presenceObjects).toContainEqual(presence)
        expect(presenceObjects).toContainEqual({ ...presence2, userId })
    })

    test('not authorized to get one of 2 presence objects', async () => {
        await redis.hmset(presenceKey, {
            data: dataBuffer,
            lastModified: lastModifiedBuffer,
            locationId: locationIdBuffer,
            userId: userIdBuffer,
        })
        await redis.hmset(presenceKey2, {
            data: dataBuffer2,
            lastModified: lastModifiedBuffer2,
            locationId: locationIdBuffer2,
            userId: userIdBuffer,
        })
        await redis.sadd(userKey, sessionIdBuffer, sessionIdBuffer2)

        authService.mayReadPresence.mockImplementation(
            async loadedPresence => loadedPresence.sessionId === sessionId,
        )
        expect(await presenceProxy.getPresenceByUserId(userId)).toEqual([
            presence,
        ])
        expect(authService.mayReadPresence).toHaveBeenCalledTimes(2)
        expect(authService.mayReadPresence).toHaveBeenCalledWith(presence)
        expect(authService.mayReadPresence).toHaveBeenCalledWith({
            ...presence2,
            userId,
        })
    })

    test('get presence with missing userId', async () => {
        await redis.hmset(presenceKey, {
            data: dataBuffer,
            lastModified: lastModifiedBuffer,
            locationId: locationIdBuffer,
            userId: userIdBuffer,
        })
        await redis.hmset(presenceKey2, {
            data: dataBuffer2,
            lastModified: lastModifiedBuffer2,
            locationId: locationIdBuffer2,
            // userId: userIdBuffer,
        })
        await redis.sadd(userKey, sessionIdBuffer, sessionIdBuffer2)
        await expect(
            presenceProxy.getPresenceByUserId(userId),
        ).resolves.toEqual([presence])
    })

    test('get presence with missing locationId', async () => {
        await redis.hmset(presenceKey, {
            data: dataBuffer,
            lastModified: lastModifiedBuffer,
            locationId: locationIdBuffer,
            userId: userIdBuffer,
        })
        await redis.hmset(presenceKey2, {
            data: dataBuffer2,
            lastModified: lastModifiedBuffer2,
            // locationId: locationIdBuffer2,
            userId: userIdBuffer,
        })
        await redis.sadd(userKey, sessionIdBuffer, sessionIdBuffer2)
        await expect(
            presenceProxy.getPresenceByUserId(userId),
        ).resolves.toEqual([presence])
    })

    test('get presence with missing data', async () => {
        await redis.hmset(presenceKey, {
            data: dataBuffer,
            lastModified: lastModifiedBuffer,
            locationId: locationIdBuffer,
            userId: userIdBuffer,
        })
        await redis.hmset(presenceKey2, {
            // data: dataBuffer2,
            lastModified: lastModifiedBuffer2,
            locationId: locationIdBuffer2,
            userId: userIdBuffer,
        })
        await redis.sadd(userKey, sessionIdBuffer, sessionIdBuffer2)
        await expect(
            presenceProxy.getPresenceByUserId(userId),
        ).resolves.toEqual([presence])
    })

    test('get presence with missing lastModified', async () => {
        await redis.hmset(presenceKey, {
            data: dataBuffer,
            lastModified: lastModifiedBuffer,
            locationId: locationIdBuffer,
            userId: userIdBuffer,
        })
        await redis.hmset(presenceKey2, {
            data: dataBuffer2,
            // lastModified: lastModifiedBuffer2,
            locationId: locationIdBuffer2,
            userId: userIdBuffer,
        })
        await redis.sadd(userKey, sessionIdBuffer, sessionIdBuffer2)
        await expect(
            presenceProxy.getPresenceByUserId(userId),
        ).resolves.toEqual([presence])
    })

    test('get presence which is missing', async () => {
        await redis.hmset(presenceKey, {
            data: dataBuffer,
            lastModified: lastModifiedBuffer,
            locationId: locationIdBuffer,
            userId: userIdBuffer,
        })
        await redis.sadd(userKey, sessionIdBuffer, sessionIdBuffer2)
        await expect(
            presenceProxy.getPresenceByUserId(userId),
        ).resolves.toEqual([presence])
    })

    test('get not encoded presence', async () => {
        await redis.hmset(presenceKey, {
            data,
            lastModified,
            locationId,
            userId,
        })
        await redis.sadd(userKey, sessionIdBuffer)
        await expect(presenceProxy.getPresenceByUserId(userId)).rejects.toEqual(
            expect.objectContaining({
                message:
                    'Failed to load presence by userId. => ' +
                    'SyncOtError Presence: Invalid presence. => ' +
                    'SyncOtError TSON: Unknown type.',
                name: 'SyncOtError Presence',
            }),
        )
    })

    test('get invalid presence', async () => {
        await redis.hmset(presenceKey, {
            data: dataBuffer,
            lastModified: lastModifiedBuffer,
            locationId: locationIdBuffer,
            userId: Buffer.from(encode(true)),
        })
        await redis.sadd(userKey, sessionIdBuffer)
        await expect(presenceProxy.getPresenceByUserId(userId)).rejects.toEqual(
            expect.objectContaining({
                message:
                    'Failed to load presence by userId. => ' +
                    'SyncOtError Presence: Invalid presence. => ' +
                    'SyncOtError InvalidEntity: Invalid "Presence.userId".',
                name: 'SyncOtError Presence',
            }),
        )
    })

    test('no active session', async () => {
        sessionService.hasActiveSession.mockReturnValue(false)
        await expect(presenceProxy.getPresenceByUserId(userId)).rejects.toEqual(
            expect.objectContaining({
                message: 'No active session.',
                name: 'SyncOtError Auth',
            }),
        )
    })

    test('no authenticated user', async () => {
        authService.hasAuthenticatedUserId.mockReturnValue(false)
        await expect(presenceProxy.getPresenceByUserId(userId)).rejects.toEqual(
            expect.objectContaining({
                message: 'No authenticated user.',
                name: 'SyncOtError Auth',
            }),
        )
    })

    test('not connected', async () => {
        redis.disconnect()
        await expect(presenceProxy.getPresenceByUserId(userId)).rejects.toEqual(
            expect.objectContaining({
                message:
                    'Failed to load presence by userId. => Error: Connection is closed.',
                name: 'SyncOtError Presence',
            }),
        )
        await redis.connect()
    })
})

describe('getPresenceByLocationId', () => {
    test('get no presence objects', async () => {
        await expect(
            presenceProxy.getPresenceByLocationId(locationId),
        ).resolves.toEqual([])
    })

    test('get one presence object', async () => {
        await redis.hmset(presenceKey, {
            data: dataBuffer,
            lastModified: lastModifiedBuffer,
            locationId: locationIdBuffer,
            userId: userIdBuffer,
        })
        await redis.sadd(locationKey, sessionIdBuffer)
        await expect(
            presenceProxy.getPresenceByLocationId(locationId),
        ).resolves.toEqual([presence])
    })

    test('get two presence objects', async () => {
        await redis.hmset(presenceKey, {
            data: dataBuffer,
            lastModified: lastModifiedBuffer,
            locationId: locationIdBuffer,
            userId: userIdBuffer,
        })
        await redis.hmset(presenceKey2, {
            data: dataBuffer2,
            lastModified: lastModifiedBuffer2,
            locationId: locationIdBuffer,
            userId: userIdBuffer2,
        })
        await redis.sadd(locationKey, sessionIdBuffer, sessionIdBuffer2)

        const presenceObjects = await presenceProxy.getPresenceByLocationId(
            locationId,
        )
        expect(presenceObjects.length).toBe(2)
        expect(presenceObjects).toContainEqual(presence)
        expect(presenceObjects).toContainEqual({ ...presence2, locationId })
    })

    test('get two presence objects', async () => {
        await redis.hmset(presenceKey, {
            data: dataBuffer,
            lastModified: lastModifiedBuffer,
            locationId: locationIdBuffer,
            userId: userIdBuffer,
        })
        await redis.hmset(presenceKey2, {
            data: dataBuffer2,
            lastModified: lastModifiedBuffer2,
            locationId: locationIdBuffer,
            userId: userIdBuffer2,
        })
        await redis.sadd(locationKey, sessionIdBuffer, sessionIdBuffer2)

        authService.mayReadPresence.mockImplementation(
            async loadedPresence => loadedPresence.sessionId === sessionId,
        )
        expect(await presenceProxy.getPresenceByLocationId(locationId)).toEqual(
            [presence],
        )
        expect(authService.mayReadPresence).toHaveBeenCalledTimes(2)
        expect(authService.mayReadPresence).toHaveBeenCalledWith(presence)
        expect(authService.mayReadPresence).toHaveBeenCalledWith({
            ...presence,
            locationId,
        })
    })

    test('get presence with missing userId', async () => {
        await redis.hmset(presenceKey, {
            data: dataBuffer,
            lastModified: lastModifiedBuffer,
            locationId: locationIdBuffer,
            userId: userIdBuffer,
        })
        await redis.hmset(presenceKey2, {
            data: dataBuffer2,
            lastModified: lastModifiedBuffer2,
            locationId: locationIdBuffer,
            // userId: userIdBuffer2,
        })
        await redis.sadd(locationKey, sessionIdBuffer, sessionIdBuffer2)
        await expect(
            presenceProxy.getPresenceByLocationId(locationId),
        ).resolves.toEqual([presence])
    })

    test('get presence with missing locationId', async () => {
        await redis.hmset(presenceKey, {
            data: dataBuffer,
            lastModified: lastModifiedBuffer,
            locationId: locationIdBuffer,
            userId: userIdBuffer,
        })
        await redis.hmset(presenceKey2, {
            data: dataBuffer2,
            lastModified: lastModifiedBuffer2,
            // locationId: locationIdBuffer,
            userId: userIdBuffer2,
        })
        await redis.sadd(locationKey, sessionIdBuffer, sessionIdBuffer2)
        await expect(
            presenceProxy.getPresenceByLocationId(locationId),
        ).resolves.toEqual([presence])
    })

    test('get presence with missing data', async () => {
        await redis.hmset(presenceKey, {
            data: dataBuffer,
            lastModified: lastModifiedBuffer,
            locationId: locationIdBuffer,
            userId: userIdBuffer,
        })
        await redis.hmset(presenceKey2, {
            // data: dataBuffer2,
            lastModified: lastModifiedBuffer2,
            locationId: locationIdBuffer,
            userId: userIdBuffer2,
        })
        await redis.sadd(locationKey, sessionIdBuffer, sessionIdBuffer2)
        await expect(
            presenceProxy.getPresenceByLocationId(locationId),
        ).resolves.toEqual([presence])
    })

    test('get presence with missing lastModified', async () => {
        await redis.hmset(presenceKey, {
            data: dataBuffer,
            lastModified: lastModifiedBuffer,
            locationId: locationIdBuffer,
            userId: userIdBuffer,
        })
        await redis.hmset(presenceKey2, {
            data: dataBuffer2,
            // lastModified: lastModifiedBuffer2,
            locationId: locationIdBuffer,
            userId: userIdBuffer2,
        })
        await redis.sadd(locationKey, sessionIdBuffer, sessionIdBuffer2)
        await expect(
            presenceProxy.getPresenceByLocationId(locationId),
        ).resolves.toEqual([presence])
    })

    test('get presence which is missing', async () => {
        await redis.hmset(presenceKey, {
            data: dataBuffer,
            lastModified: lastModifiedBuffer,
            locationId: locationIdBuffer,
            userId: userIdBuffer,
        })
        await redis.sadd(locationKey, sessionIdBuffer, sessionIdBuffer2)
        await expect(
            presenceProxy.getPresenceByLocationId(locationId),
        ).resolves.toEqual([presence])
    })

    test('get not encoded presence', async () => {
        await redis.hmset(presenceKey, {
            data,
            lastModified,
            locationId,
            userId,
        })
        await redis.sadd(locationKey, sessionIdBuffer)
        await expect(
            presenceProxy.getPresenceByLocationId(locationId),
        ).rejects.toEqual(
            expect.objectContaining({
                message:
                    'Failed to load presence by locationId. => ' +
                    'SyncOtError Presence: Invalid presence. => ' +
                    'SyncOtError TSON: Unknown type.',
                name: 'SyncOtError Presence',
            }),
        )
    })

    test('get invalid presence', async () => {
        await redis.hmset(presenceKey, {
            data: dataBuffer,
            lastModified: lastModifiedBuffer,
            locationId: locationIdBuffer,
            userId: Buffer.from(encode(true)),
        })
        await redis.sadd(locationKey, sessionIdBuffer)
        await expect(
            presenceProxy.getPresenceByLocationId(locationId),
        ).rejects.toEqual(
            expect.objectContaining({
                message:
                    'Failed to load presence by locationId. => ' +
                    'SyncOtError Presence: Invalid presence. => ' +
                    'SyncOtError InvalidEntity: Invalid "Presence.userId".',
                name: 'SyncOtError Presence',
            }),
        )
    })

    test('no active session', async () => {
        sessionService.hasActiveSession.mockReturnValue(false)
        await expect(
            presenceProxy.getPresenceByLocationId(locationId),
        ).rejects.toEqual(
            expect.objectContaining({
                message: 'No active session.',
                name: 'SyncOtError Auth',
            }),
        )
    })

    test('no authenticated user', async () => {
        authService.hasAuthenticatedUserId.mockReturnValue(false)
        await expect(
            presenceProxy.getPresenceByLocationId(locationId),
        ).rejects.toEqual(
            expect.objectContaining({
                message: 'No authenticated user.',
                name: 'SyncOtError Auth',
            }),
        )
    })

    test('not connected', async () => {
        redis.disconnect()
        await expect(
            presenceProxy.getPresenceByLocationId(locationId),
        ).rejects.toEqual(
            expect.objectContaining({
                message:
                    'Failed to load presence by locationId. => Error: Connection is closed.',
                name: 'SyncOtError Presence',
            }),
        )
        await redis.connect()
    })
})
