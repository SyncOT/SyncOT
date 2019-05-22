import { AuthEvents, AuthService } from '@syncot/auth'
import { Connection, createConnection } from '@syncot/connection'
import { Presence, PresenceService } from '@syncot/presence'
import { SessionEvents, SessionManager } from '@syncot/session'
import { encode } from '@syncot/tson'
import { invertedStreams, randomInteger, SyncOtEmitter } from '@syncot/util'
import { EventEmitter } from 'events'
import Redis from 'ioredis'
import { Clock, install as installClock, InstalledClock } from 'lolex'
import { Duplex } from 'readable-stream'
import RedisServer from 'redis-server'
import { createPresenceService } from '.'

const now = 12345
let clock: InstalledClock<Clock>

const testError = new Error('test error')
const testErrorMatcher = expect.objectContaining({
    message: 'test error',
    name: 'Error',
})
const alreadyDestroyedMatcher = expect.objectContaining({
    message: 'Already destroyed.',
    name: 'AssertionError',
})

const presencePrefix = 'presence:sessionId='
const userPrefix = 'presence:userId='
const locationPrefix = 'presence:locationId='

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

const dataBuffer = encode(data)
const dataBuffer2 = encode(data2)
const lastModifiedBuffer = encode(lastModified)
const lastModifiedBuffer2 = encode(lastModified2)

const presenceKey = presencePrefix + sessionId
const presenceKey2 = presencePrefix + sessionId2
const userKey = userPrefix + userId
const userKey2 = userPrefix + userId2
const locationKey = locationPrefix + locationId
const locationKey2 = locationPrefix + locationId2

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
let testSubscriber: Redis.Redis

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

const whenMessage = (expectedTopic: string, expectedMessage: string) =>
    new Promise(resolve => {
        const listener = (_pattern: string, topic: string, message: string) => {
            if (topic === expectedTopic && message === expectedMessage) {
                testSubscriber.off('pmessage', listener)
                resolve()
            }
        }
        testSubscriber.on('pmessage', listener)
    })

const whenNextTick = () => new Promise(resolve => process.nextTick(resolve))

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
        autoResubscribe: false,
        lazyConnect: true,
        port,
        showFriendlyErrorStack: true,
    }
    redis = new Redis(options)
    redisSubscriber = new Redis(options)
    testSubscriber = new Redis(options)
    await redis.connect()
    await redisSubscriber.connect()
    await testSubscriber.connect()
    monitor = await redis.monitor()
    await testSubscriber.psubscribe('presence:*')

    authService = new MockAuthService()
    sessionService = new MockSessionService()

    connection1 = createConnection()
    connection2 = createConnection()
    ;[stream1, stream2] = invertedStreams({
        allowHalfOpen: false,
        objectMode: true,
    })
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
            'streamPresenceBySessionId',
            'streamPresenceByUserId',
            'streamPresenceByLocationId',
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
    testSubscriber.disconnect()
})

test('invalid connection (missing)', () => {
    expect(() =>
        createPresenceService({
            authService,
            connection: undefined as any,
            redis,
            redisSubscriber,
            sessionService,
        }),
    ).toThrow(
        expect.objectContaining({
            message:
                'Argument "connection" must be a non-destroyed Connection.',
            name: 'AssertionError',
        }),
    )
})

test('invalid connection (destroyed)', () => {
    const newConnection = createConnection()
    newConnection.destroy()
    expect(() =>
        createPresenceService({
            authService,
            connection: newConnection,
            redis,
            redisSubscriber,
            sessionService,
        }),
    ).toThrow(
        expect.objectContaining({
            message:
                'Argument "connection" must be a non-destroyed Connection.',
            name: 'AssertionError',
        }),
    )
})

test('destroy on connection destroy', async () => {
    connection1.destroy()
    await new Promise(resolve => presenceService.once('destroy', resolve))
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
            name: 'AssertionError',
        }),
    )
})

test.each(['123', 2] as any[])(
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
                    'Argument "options.presenceSizeLimit" must be undefined or a safe integer >= 3.',
                name: 'AssertionError',
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
            name: 'AssertionError',
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
    await expect(
        presenceProxy.streamPresenceBySessionId(sessionId),
    ).rejects.toEqual(alreadyDestroyedMatcher)
    await expect(presenceProxy.streamPresenceByUserId(userId)).rejects.toEqual(
        alreadyDestroyedMatcher,
    )
    await expect(
        presenceProxy.streamPresenceByLocationId(locationId),
    ).rejects.toEqual(alreadyDestroyedMatcher)
})

test('remove presence on destroy', async () => {
    const onDestroy = jest.fn()
    presenceService.on('destroy', onDestroy)

    await presenceProxy.submitPresence(presence)
    clock.next() // Save presence in Redis.

    await new Promise(resolve => presenceService.once('inSync', resolve))
    await expect(redis.exists(presenceKey)).resolves.toBe(1)
    await expect(redis.sismember(userKey, sessionId)).resolves.toBe(1)
    await expect(redis.sismember(locationKey, sessionId)).resolves.toBe(1)

    presenceService.destroy()
    clock.next() // Delete presence from Redis.

    await whenMessage(presenceKey, sessionId)
    await expect(redis.exists(presenceKey)).resolves.toBe(0)
    await expect(redis.sismember(userKey, sessionId)).resolves.toBe(0)
    await expect(redis.sismember(locationKey, sessionId)).resolves.toBe(0)

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
    await expect(redis.sismember(userKey, sessionId)).resolves.toBe(1)
    await expect(redis.sismember(locationKey, sessionId)).resolves.toBe(1)

    const onOutOfSync = jest.fn()
    const onInSync = jest.fn()
    presenceService.on('outOfSync', onOutOfSync)
    presenceService.on('inSync', onInSync)

    emitEvent()
    clock.next() // Remove presence.

    await new Promise(resolve => presenceService.once('inSync', resolve))
    await expect(redis.exists(presenceKey)).resolves.toBe(0)
    await expect(redis.sismember(userKey, sessionId)).resolves.toBe(0)
    await expect(redis.sismember(locationKey, sessionId)).resolves.toBe(0)

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
    await expect(redis.sismember(userKey, sessionId)).resolves.toBe(1)
    await expect(redis.sismember(locationKey, sessionId)).resolves.toBe(1)

    // Client 1 disconnects.
    sessionService.hasActiveSession.mockReturnValue(false)
    authService.hasAuthenticatedUserId.mockReturnValue(false)
    sessionService.emit('sessionInactive')
    authService.emit('authEnd')
    clock.next()
    await new Promise(resolve => presenceService.once('inSync', resolve))
    await expect(redis.exists(presenceKey)).resolves.toBe(0)
    await expect(redis.sismember(userKey, sessionId)).resolves.toBe(0)
    await expect(redis.sismember(locationKey, sessionId)).resolves.toBe(0)

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
    await expect(redis.sismember(userKey2, sessionId2)).resolves.toBe(1)
    await expect(redis.sismember(locationKey2, sessionId2)).resolves.toBe(1)
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
                sessionId: '',
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
        authService.mayWritePresence.mockResolvedValue(false)
        await expect(presenceProxy.submitPresence(presence)).rejects.toEqual(
            expect.objectContaining({
                message: 'Not authorized to submit this presence object.',
                name: 'SyncOtError Auth',
            }),
        )
        expect(authService.mayWritePresence).toHaveBeenCalledTimes(1)
        expect(authService.mayWritePresence).toHaveBeenCalledWith(presence)
    })

    test.each([undefined, 3, 20])(
        'presence size limit exceeded (%p)',
        async presenceSizeLimit => {
            connection1 = createConnection()
            connection2 = createConnection()
            ;[stream1, stream2] = invertedStreams({
                allowHalfOpen: false,
                objectMode: true,
            })
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
            authService.getUserId.mockReturnValue('')
            sessionService.getSessionId.mockReturnValue('')
            await expect(
                presenceProxy.submitPresence({
                    data: Buffer.allocUnsafe(effectiveLimit - 3), // (type + int8 or int16 length + binary data)
                    lastModified: Date.now(), // 3 bytes (type + int16)
                    locationId: '', // 0 bytes
                    sessionId: '', // 0 bytes
                    userId: '', // 0 bytes
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

    test('storage error on refresh', async () => {
        await presenceProxy.submitPresence(presence)
        clock.next() // Store presence.
        await new Promise(resolve => presenceService.once('inSync', resolve))

        const onError = jest.fn()
        const onOutOfSync = jest.fn()
        const onInSync = jest.fn()
        presenceService.on('error', onError)
        presenceService.on('outOfSync', onOutOfSync)
        presenceService.on('inSync', onInSync)

        redis.disconnect()
        clock.next() // Attempt to refresh presence.
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
        await redis.hset(presenceKey, 'lastModified', encode(7))
        await redis.expire(presenceKey, 1)
        await redis.expire(userKey, 1)
        await redis.expire(locationKey, 1)

        clock.next() // Refresh presence
        // lastModified is 7 as set above, rather than `now`, because the PresenceService realised that
        // the previously stored hash still exists, so it updated only its TTL without checking
        // the stored values in order to reduce the load on the Redis server.
        await expect(
            presenceProxy.getPresenceBySessionId(sessionId),
        ).resolves.toEqual({ ...presence, lastModified: 7 })
        await expect(redis.ttl(presenceKey)).resolves.toBe(60)
        await expect(redis.sismember(userKey, sessionId)).resolves.toBe(1)
        await expect(redis.ttl(userKey)).resolves.toBe(60)
        await expect(redis.sismember(locationKey, sessionId)).resolves.toBe(1)
        await expect(redis.ttl(locationKey)).resolves.toBe(60)

        expect(onOutOfSync).not.toHaveBeenCalled()
        expect(onInSync).not.toHaveBeenCalled()
    })

    test('submit new presence while saving old to Redis', async () => {
        const onMessage = jest.fn()
        const onOutOfSync = jest.fn()
        const onInSync = jest.fn()
        testSubscriber.on('pmessage', onMessage)
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
        await whenMessage(presenceKey, sessionId)
        await expect(
            presenceProxy.getPresenceBySessionId(sessionId),
        ).resolves.toEqual({ ...presence, lastModified: now })
        await expect(redis.sismember(userKey, sessionId)).resolves.toBe(1)
        await expect(redis.sismember(locationKey, sessionId)).resolves.toBe(1)
        expect(onMessage).toHaveBeenCalledTimes(3)
        expect(onMessage).toHaveBeenCalledWith(
            expect.anything(),
            presenceKey,
            sessionId,
        )
        expect(onMessage).toHaveBeenCalledWith(
            expect.anything(),
            userKey,
            sessionId,
        )
        expect(onMessage).toHaveBeenCalledWith(
            expect.anything(),
            locationKey,
            sessionId,
        )
        onMessage.mockClear()

        // New presence.
        clock.next() // Start saving the new presence to Redis.
        await whenMessage(presenceKey, sessionId)
        await expect(
            presenceProxy.getPresenceBySessionId(sessionId),
        ).resolves.toEqual({
            ...presence2,
            lastModified: now,
            sessionId,
        })
        await expect(redis.sismember(userKey, sessionId)).resolves.toBe(0)
        await expect(redis.sismember(locationKey, sessionId)).resolves.toBe(0)
        await expect(redis.sismember(userKey2, sessionId)).resolves.toBe(1)
        await expect(redis.sismember(locationKey2, sessionId)).resolves.toBe(1)
        expect(onMessage).toHaveBeenCalledTimes(5)
        expect(onMessage).toHaveBeenCalledWith(
            expect.anything(),
            presenceKey, // Presence updated.
            sessionId,
        )
        expect(onMessage).toHaveBeenCalledWith(
            expect.anything(),
            userKey, // Old index removed.
            sessionId,
        )
        expect(onMessage).toHaveBeenCalledWith(
            expect.anything(),
            locationKey, // Old index removed.
            sessionId,
        )
        expect(onMessage).toHaveBeenCalledWith(
            expect.anything(),
            userKey2, // New index added.
            sessionId,
        )
        expect(onMessage).toHaveBeenCalledWith(
            expect.anything(),
            locationKey2, // New index added.
            sessionId,
        )

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
                ;[stream1, stream2] = invertedStreams({
                    allowHalfOpen: false,
                    objectMode: true,
                })
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
            const onMessage = jest.fn()
            const onOutOfSync = jest.fn()
            const onInSync = jest.fn()
            testSubscriber.on('pmessage', onMessage)
            presenceService.on('outOfSync', onOutOfSync)
            presenceService.on('inSync', onInSync)

            await presenceProxy.submitPresence(presence)
            clock.next()
            await Promise.all([
                new Promise(resolve => presenceService.once('inSync', resolve)),
                whenMessage(presenceKey, sessionId),
            ])

            expect(onOutOfSync).toHaveBeenCalledTimes(1)
            expect(onInSync).toHaveBeenCalledTimes(1)
            expect(onOutOfSync).toHaveBeenCalledBefore(onInSync)

            await expect(
                presenceProxy.getPresenceBySessionId(sessionId),
            ).resolves.toEqual({ ...presence, lastModified: now })
            await expect(redis.ttl(presenceKey)).resolves.toBe(effectiveTtl)
            await expect(redis.sismember(userKey, sessionId)).resolves.toBe(1)
            await expect(redis.ttl(userKey)).resolves.toBe(effectiveTtl)
            await expect(redis.sismember(locationKey, sessionId)).resolves.toBe(
                1,
            )
            await expect(redis.ttl(locationKey)).resolves.toBe(effectiveTtl)
            expect(onMessage).toHaveBeenCalledTimes(3)
            expect(onMessage).toHaveBeenCalledWith(
                expect.anything(),
                presenceKey,
                sessionId,
            )
            expect(onMessage).toHaveBeenCalledWith(
                expect.anything(),
                userKey,
                sessionId,
            )
            expect(onMessage).toHaveBeenCalledWith(
                expect.anything(),
                locationKey,
                sessionId,
            )
        })

        test('refresh before expired', async () => {
            await presenceProxy.submitPresence(presence)
            clock.next()
            await Promise.all([
                new Promise(resolve => presenceService.once('inSync', resolve)),
                whenMessage(presenceKey, sessionId),
            ])

            const onMessage = jest.fn()
            const onOutOfSync = jest.fn()
            const onInSync = jest.fn()
            testSubscriber.on('pmessage', onMessage)
            presenceService.on('outOfSync', onOutOfSync)
            presenceService.on('inSync', onInSync)

            await redis.hset(presenceKey, 'lastModified', encode(7))
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
            await expect(redis.sismember(userKey, sessionId)).resolves.toBe(1)
            await expect(redis.ttl(userKey)).resolves.toBe(effectiveTtl)
            await expect(redis.sismember(locationKey, sessionId)).resolves.toBe(
                1,
            )
            await expect(redis.ttl(locationKey)).resolves.toBe(effectiveTtl)

            expect(onMessage).not.toHaveBeenCalled()
            expect(onOutOfSync).not.toHaveBeenCalled()
            expect(onInSync).not.toHaveBeenCalled()
        })

        test('refresh after expired', async () => {
            await presenceProxy.submitPresence(presence)
            clock.next()
            await Promise.all([
                new Promise(resolve => presenceService.once('inSync', resolve)),
                whenMessage(presenceKey, sessionId),
            ])

            const onMessage = jest.fn()
            const onOutOfSync = jest.fn()
            const onInSync = jest.fn()
            testSubscriber.on('pmessage', onMessage)
            presenceService.on('outOfSync', onOutOfSync)
            presenceService.on('inSync', onInSync)

            await redis.del(presenceKey)
            await redis.srem(userKey, sessionId)
            await redis.srem(locationKey, sessionId)
            clock.tick((effectiveTtl - 1) * 1000) // Trigger a refresh.

            await whenMessage(presenceKey, sessionId)

            await expect(
                presenceProxy.getPresenceBySessionId(sessionId),
            ).resolves.toEqual({ ...presence, lastModified: now })
            await expect(redis.ttl(presenceKey)).resolves.toBe(effectiveTtl)
            await expect(redis.sismember(userKey, sessionId)).resolves.toBe(1)
            await expect(redis.ttl(userKey)).resolves.toBe(effectiveTtl)
            await expect(redis.sismember(locationKey, sessionId)).resolves.toBe(
                1,
            )
            await expect(redis.ttl(locationKey)).resolves.toBe(effectiveTtl)

            expect(onOutOfSync).not.toHaveBeenCalled()
            expect(onInSync).not.toHaveBeenCalled()
            expect(onMessage).toHaveBeenCalledTimes(3)
            expect(onMessage).toHaveBeenCalledWith(
                expect.anything(),
                presenceKey,
                sessionId,
            )
            expect(onMessage).toHaveBeenCalledWith(
                expect.anything(),
                userKey,
                sessionId,
            )
            expect(onMessage).toHaveBeenCalledWith(
                expect.anything(),
                locationKey,
                sessionId,
            )
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
        await Promise.all([
            new Promise(resolve => presenceService.once('inSync', resolve)),
            whenMessage(presenceKey, sessionId),
        ])
        await expect(redis.exists(presenceKey)).resolves.toBe(1)
        await expect(redis.sismember(userKey, sessionId)).resolves.toBe(1)
        await expect(redis.sismember(locationKey, sessionId)).resolves.toBe(1)

        const onMessage = jest.fn()
        testSubscriber.on('pmessage', onMessage)
        await presenceProxy.removePresence()
        const onOutOfSync = jest.fn()
        const onInSync = jest.fn()
        presenceService.on('outOfSync', onOutOfSync)
        presenceService.on('inSync', onInSync)
        clock.next()
        await Promise.all([
            new Promise(resolve => presenceService.once('inSync', resolve)),
            whenMessage(presenceKey, sessionId),
        ])
        await expect(redis.exists(presenceKey)).resolves.toBe(0)
        await expect(redis.sismember(userKey, sessionId)).resolves.toBe(0)
        await expect(redis.sismember(locationKey, sessionId)).resolves.toBe(0)

        expect(onOutOfSync).toHaveBeenCalledTimes(1)
        expect(onInSync).toHaveBeenCalledTimes(1)
        expect(onOutOfSync).toHaveBeenCalledBefore(onInSync)
        expect(onMessage).toHaveBeenCalledTimes(3)
        expect(onMessage).toHaveBeenCalledWith(
            expect.anything(),
            presenceKey,
            sessionId,
        )
        expect(onMessage).toHaveBeenCalledWith(
            expect.anything(),
            userKey,
            sessionId,
        )
        expect(onMessage).toHaveBeenCalledWith(
            expect.anything(),
            locationKey,
            sessionId,
        )
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
            locationId,
            userId,
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
            locationId,
            userId,
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
            locationId,
            userId,
        })
        await expect(
            presenceProxy.getPresenceBySessionId('does not exist'),
        ).resolves.toBeNull()
    })

    test('get presence with missing userId', async () => {
        await redis.hmset(presenceKey, {
            data: dataBuffer,
            lastModified: lastModifiedBuffer,
            locationId,
            // userId,
        })
        await expect(
            presenceProxy.getPresenceBySessionId(sessionId),
        ).resolves.toBeNull()
    })

    test('get presence with missing locationId', async () => {
        await redis.hmset(presenceKey, {
            data: dataBuffer,
            lastModified: lastModifiedBuffer,
            // locationId,
            userId,
        })
        await expect(
            presenceProxy.getPresenceBySessionId(sessionId),
        ).resolves.toBeNull()
    })

    test('get presence with missing data', async () => {
        await redis.hmset(presenceKey, {
            // data: dataBuffer,
            lastModified: lastModifiedBuffer,
            locationId,
            userId,
        })
        await expect(
            presenceProxy.getPresenceBySessionId(sessionId),
        ).resolves.toBeNull()
    })

    test('get presence with missing lastModified', async () => {
        await redis.hmset(presenceKey, {
            data: dataBuffer,
            // lastModified: lastModifiedBuffer,
            locationId,
            userId,
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
            lastModified: encode(true),
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
                    'SyncOtError InvalidEntity: Invalid "Presence.lastModified".',
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
            locationId,
            userId,
        })
        await redis.sadd(userKey, sessionId)
        await expect(
            presenceProxy.getPresenceByUserId(userId),
        ).resolves.toEqual([presence])
    })

    test('get two presence objects', async () => {
        await redis.hmset(presenceKey, {
            data: dataBuffer,
            lastModified: lastModifiedBuffer,
            locationId,
            userId,
        })
        await redis.hmset(presenceKey2, {
            data: dataBuffer2,
            lastModified: lastModifiedBuffer2,
            locationId: locationId2,
            userId,
        })
        await redis.sadd(userKey, sessionId, sessionId2)

        const presenceObjects = await presenceProxy.getPresenceByUserId(userId)
        expect(presenceObjects.length).toBe(2)
        expect(presenceObjects).toContainEqual(presence)
        expect(presenceObjects).toContainEqual({ ...presence2, userId })
    })

    test('not authorized to get one of 2 presence objects', async () => {
        await redis.hmset(presenceKey, {
            data: dataBuffer,
            lastModified: lastModifiedBuffer,
            locationId,
            userId,
        })
        await redis.hmset(presenceKey2, {
            data: dataBuffer2,
            lastModified: lastModifiedBuffer2,
            locationId: locationId2,
            userId,
        })
        await redis.sadd(userKey, sessionId, sessionId2)

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
            locationId,
            userId,
        })
        await redis.hmset(presenceKey2, {
            data: dataBuffer2,
            lastModified: lastModifiedBuffer2,
            locationId: locationId2,
            // userId,
        })
        await redis.sadd(userKey, sessionId, sessionId2)
        await expect(
            presenceProxy.getPresenceByUserId(userId),
        ).resolves.toEqual([presence])
    })

    test('get presence with missing locationId', async () => {
        await redis.hmset(presenceKey, {
            data: dataBuffer,
            lastModified: lastModifiedBuffer,
            locationId,
            userId,
        })
        await redis.hmset(presenceKey2, {
            data: dataBuffer2,
            lastModified: lastModifiedBuffer2,
            // locationId: locationId2,
            userId,
        })
        await redis.sadd(userKey, sessionId, sessionId2)
        await expect(
            presenceProxy.getPresenceByUserId(userId),
        ).resolves.toEqual([presence])
    })

    test('get presence with missing data', async () => {
        await redis.hmset(presenceKey, {
            data: dataBuffer,
            lastModified: lastModifiedBuffer,
            locationId,
            userId,
        })
        await redis.hmset(presenceKey2, {
            // data: dataBuffer2,
            lastModified: lastModifiedBuffer2,
            locationId: locationId2,
            userId,
        })
        await redis.sadd(userKey, sessionId, sessionId2)
        await expect(
            presenceProxy.getPresenceByUserId(userId),
        ).resolves.toEqual([presence])
    })

    test('get presence with missing lastModified', async () => {
        await redis.hmset(presenceKey, {
            data: dataBuffer,
            lastModified: lastModifiedBuffer,
            locationId,
            userId,
        })
        await redis.hmset(presenceKey2, {
            data: dataBuffer2,
            // lastModified: lastModifiedBuffer2,
            locationId: locationId2,
            userId,
        })
        await redis.sadd(userKey, sessionId, sessionId2)
        await expect(
            presenceProxy.getPresenceByUserId(userId),
        ).resolves.toEqual([presence])
    })

    test('get presence which is missing', async () => {
        await redis.hmset(presenceKey, {
            data: dataBuffer,
            lastModified: lastModifiedBuffer,
            locationId,
            userId,
        })
        await redis.sadd(userKey, sessionId, sessionId2)
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
        await redis.sadd(userKey, sessionId)
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
            lastModified: encode(true),
            locationId,
            userId,
        })
        await redis.sadd(userKey, sessionId)
        await expect(presenceProxy.getPresenceByUserId(userId)).rejects.toEqual(
            expect.objectContaining({
                message:
                    'Failed to load presence by userId. => ' +
                    'SyncOtError Presence: Invalid presence. => ' +
                    'SyncOtError InvalidEntity: Invalid "Presence.lastModified".',
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
            locationId,
            userId,
        })
        await redis.sadd(locationKey, sessionId)
        await expect(
            presenceProxy.getPresenceByLocationId(locationId),
        ).resolves.toEqual([presence])
    })

    test('get two presence objects', async () => {
        await redis.hmset(presenceKey, {
            data: dataBuffer,
            lastModified: lastModifiedBuffer,
            locationId,
            userId,
        })
        await redis.hmset(presenceKey2, {
            data: dataBuffer2,
            lastModified: lastModifiedBuffer2,
            locationId,
            userId: userId2,
        })
        await redis.sadd(locationKey, sessionId, sessionId2)

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
            locationId,
            userId,
        })
        await redis.hmset(presenceKey2, {
            data: dataBuffer2,
            lastModified: lastModifiedBuffer2,
            locationId,
            userId: userId2,
        })
        await redis.sadd(locationKey, sessionId, sessionId2)

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
            locationId,
            userId,
        })
        await redis.hmset(presenceKey2, {
            data: dataBuffer2,
            lastModified: lastModifiedBuffer2,
            locationId,
            // userId: userId2,
        })
        await redis.sadd(locationKey, sessionId, sessionId2)
        await expect(
            presenceProxy.getPresenceByLocationId(locationId),
        ).resolves.toEqual([presence])
    })

    test('get presence with missing locationId', async () => {
        await redis.hmset(presenceKey, {
            data: dataBuffer,
            lastModified: lastModifiedBuffer,
            locationId,
            userId,
        })
        await redis.hmset(presenceKey2, {
            data: dataBuffer2,
            lastModified: lastModifiedBuffer2,
            // locationId,
            userId: userId2,
        })
        await redis.sadd(locationKey, sessionId, sessionId2)
        await expect(
            presenceProxy.getPresenceByLocationId(locationId),
        ).resolves.toEqual([presence])
    })

    test('get presence with missing data', async () => {
        await redis.hmset(presenceKey, {
            data: dataBuffer,
            lastModified: lastModifiedBuffer,
            locationId,
            userId,
        })
        await redis.hmset(presenceKey2, {
            // data: dataBuffer2,
            lastModified: lastModifiedBuffer2,
            locationId,
            userId: userId2,
        })
        await redis.sadd(locationKey, sessionId, sessionId2)
        await expect(
            presenceProxy.getPresenceByLocationId(locationId),
        ).resolves.toEqual([presence])
    })

    test('get presence with missing lastModified', async () => {
        await redis.hmset(presenceKey, {
            data: dataBuffer,
            lastModified: lastModifiedBuffer,
            locationId,
            userId,
        })
        await redis.hmset(presenceKey2, {
            data: dataBuffer2,
            // lastModified: lastModifiedBuffer2,
            locationId,
            userId: userId2,
        })
        await redis.sadd(locationKey, sessionId, sessionId2)
        await expect(
            presenceProxy.getPresenceByLocationId(locationId),
        ).resolves.toEqual([presence])
    })

    test('get presence which is missing', async () => {
        await redis.hmset(presenceKey, {
            data: dataBuffer,
            lastModified: lastModifiedBuffer,
            locationId,
            userId,
        })
        await redis.sadd(locationKey, sessionId, sessionId2)
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
        await redis.sadd(locationKey, sessionId)
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
            lastModified: encode(true),
            locationId,
            userId,
        })
        await redis.sadd(locationKey, sessionId)
        await expect(
            presenceProxy.getPresenceByLocationId(locationId),
        ).rejects.toEqual(
            expect.objectContaining({
                message:
                    'Failed to load presence by locationId. => ' +
                    'SyncOtError Presence: Invalid presence. => ' +
                    'SyncOtError InvalidEntity: Invalid "Presence.lastModified".',
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

describe('streamPresenceBySessionId', () => {
    test('no active session', async () => {
        sessionService.hasActiveSession.mockReturnValue(false)
        await expect(
            presenceProxy.streamPresenceBySessionId(sessionId),
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
            presenceProxy.streamPresenceBySessionId(sessionId),
        ).rejects.toEqual(
            expect.objectContaining({
                message: 'No authenticated user.',
                name: 'SyncOtError Auth',
            }),
        )
    })

    test('destroy presence streams when destroying the presenceService', async () => {
        const onClose1 = jest.fn()
        const onClose2 = jest.fn()
        const presenceStream1 = await presenceProxy.streamPresenceBySessionId(
            sessionId,
        )
        const presenceStream2 = await presenceProxy.streamPresenceBySessionId(
            sessionId,
        )
        presenceStream1.on('close', onClose1)
        presenceStream2.on('close', onClose2)
        presenceService.destroy()
        await whenNextTick()
        expect(onClose1).toHaveBeenCalledTimes(1)
        expect(onClose2).toHaveBeenCalledTimes(1)
    })

    test('stream error handling', async () => {
        const onError = jest.fn()
        const presenceStream = await presenceProxy.streamPresenceBySessionId(
            sessionId,
        )
        presenceStream.on('error', onError)
        stream1.destroy()
        await whenNextTick()
        await whenNextTick()
        expect(onError).toBeCalledTimes(1)
        expect(onError).toBeCalledWith(
            expect.objectContaining({
                message: 'Disconnected, stream destroyed.',
                name: 'SyncOtError Disconnected',
            }),
        )
    })

    test('start with no presence', async () => {
        const onData = jest.fn()
        const presenceStream = await presenceProxy.streamPresenceBySessionId(
            sessionId,
        )
        presenceStream.on('data', onData)

        // Load the presence to delay the test a bit.
        await presenceProxy.getPresenceBySessionId(sessionId)

        expect(onData).toHaveBeenCalledTimes(0)

        // Poll for changes.
        clock.tick(60000)
        await whenRedisCommandExecuted('HMGET')

        // Load the presence to delay the test a bit.
        await presenceProxy.getPresenceBySessionId(sessionId)

        // No redundant message.
        expect(onData).toHaveBeenCalledTimes(0)

        presenceStream.destroy()
        await whenNextTick()
    })

    test('start with some presence', async () => {
        await presenceProxy.submitPresence(presence)
        clock.next()
        await whenMessage(presenceKey, sessionId)

        const onData = jest.fn()
        const presenceStream = await presenceProxy.streamPresenceBySessionId(
            sessionId,
        )
        presenceStream.on('data', onData)

        // Load the presence to delay the test a bit.
        await presenceProxy.getPresenceBySessionId(sessionId)

        expect(onData).toHaveBeenCalledTimes(1)
        expect(onData).toHaveBeenCalledWith([
            true,
            { ...presence, lastModified: now },
        ])
        onData.mockClear()

        // Poll for changes.
        clock.tick(60000)
        await whenRedisCommandExecuted('HMGET')

        // Load the presence to delay the test a bit.
        await presenceProxy.getPresenceBySessionId(sessionId)

        // No redundant message.
        expect(onData).toHaveBeenCalledTimes(0)

        presenceStream.destroy()
        await whenNextTick()
    })

    test('add presence on interval', async () => {
        const onData = jest.fn()
        const presenceStream = await presenceProxy.streamPresenceBySessionId(
            sessionId,
        )
        presenceStream.on('data', onData)

        await redis.hmset(presenceKey, {
            data: dataBuffer,
            lastModified: lastModifiedBuffer,
            locationId,
            userId,
        })
        expect(onData).toHaveBeenCalledTimes(0)

        // Trigger presence reload.
        clock.tick(60000)
        await new Promise(resolve => presenceStream.once('data', resolve))

        expect(onData).toHaveBeenCalledTimes(1)
        expect(onData).toHaveBeenCalledWith([true, presence])
        presenceStream.destroy()
        await whenNextTick()
    })

    test('remove presence on interval', async () => {
        await redis.hmset(presenceKey, {
            data: dataBuffer,
            lastModified: lastModifiedBuffer,
            locationId,
            userId,
        })

        const onData = jest.fn()
        const presenceStream = await presenceProxy.streamPresenceBySessionId(
            sessionId,
        )
        await new Promise(resolve => presenceStream.once('data', resolve))

        presenceStream.on('data', onData)
        await redis.del(presenceKey)
        expect(onData).toHaveBeenCalledTimes(0)

        // Trigger presence reload.
        clock.tick(60000)
        await new Promise(resolve => presenceStream.once('data', resolve))

        expect(onData).toHaveBeenCalledTimes(1)
        expect(onData).toHaveBeenCalledWith([false, sessionId])
        presenceStream.destroy()
        await whenNextTick()
    })

    test('update presence on interval', async () => {
        await redis.hmset(presenceKey, {
            data: dataBuffer,
            lastModified: lastModifiedBuffer,
            locationId,
            userId,
        })

        const onData = jest.fn()
        const presenceStream = await presenceProxy.streamPresenceBySessionId(
            sessionId,
        )
        await new Promise(resolve => presenceStream.once('data', resolve))

        presenceStream.on('data', onData)
        await redis.hmset(presenceKey, {
            data: dataBuffer2,
            lastModified: lastModifiedBuffer2,
            locationId,
            userId,
        })
        expect(onData).toHaveBeenCalledTimes(0)

        // Trigger presence reload.
        clock.tick(60000)
        await new Promise(resolve => presenceStream.once('data', resolve))

        expect(onData).toHaveBeenCalledTimes(1)
        expect(onData).toHaveBeenCalledWith([
            true,
            { ...presence, data: data2, lastModified: lastModified2 },
        ])
        presenceStream.destroy()
        await whenNextTick()
    })

    test('remove presence on interval with error', async () => {
        await redis.hmset(presenceKey, {
            data: dataBuffer,
            lastModified: lastModifiedBuffer,
            locationId,
            userId,
        })

        const onError = jest.fn()
        const onData = jest.fn()
        const presenceStream = await presenceProxy.streamPresenceBySessionId(
            sessionId,
        )
        await new Promise(resolve => presenceStream.once('data', resolve))

        presenceService.on('error', onError)
        presenceStream.on('data', onData)
        authService.mayReadPresence.mockRejectedValue(testError)

        // Trigger presence reload.
        clock.tick(60000)
        await new Promise(resolve => presenceService.once('error', resolve))

        expect(onError).toHaveBeenCalledTimes(1)
        expect(onError).toHaveBeenCalledWith(
            expect.objectContaining({
                cause: testErrorMatcher,
                message:
                    'Failed to load presence by sessionId. => Error: test error',
                name: 'SyncOtError Presence',
            }),
        )
        expect(onData).toHaveBeenCalledTimes(1)
        expect(onData).toHaveBeenCalledWith([false, sessionId])
        presenceStream.destroy()
        await whenNextTick()
    })

    test('remove presence on disconnect', async () => {
        await redis.hmset(presenceKey, {
            data: dataBuffer,
            lastModified: lastModifiedBuffer,
            locationId,
            userId,
        })
        const presenceStream = await presenceProxy.streamPresenceBySessionId(
            sessionId,
        )
        await new Promise(resolve => presenceStream.once('data', resolve))

        const onData = jest.fn()
        presenceStream.on('data', onData)
        redis.disconnect()
        await new Promise(resolve => presenceStream.once('data', resolve))
        expect(onData).toHaveBeenCalledTimes(1)
        expect(onData).toHaveBeenCalledWith([false, sessionId])

        presenceStream.destroy()
        await redis.connect()
    })

    test('load presence on reconnection', async () => {
        const onData = jest.fn()
        const presenceStream = await presenceProxy.streamPresenceBySessionId(
            sessionId,
        )
        presenceStream.on('data', onData)
        await redis.exists(presenceKey) // Just a delay.

        await redis.hmset(presenceKey, {
            data: dataBuffer,
            lastModified: lastModifiedBuffer,
            locationId,
            userId,
        })
        expect(onData).toBeCalledTimes(0)

        redis.disconnect()
        // Delay until the Redis connection is fully closed.
        await expect(redis.exists(presenceKey)).rejects.toBeInstanceOf(Error)
        await Promise.all([
            redis.connect(),
            new Promise(resolve => presenceStream.once('data', resolve)),
        ])
        expect(onData).toBeCalledTimes(1)
        expect(onData).toBeCalledWith([true, presence])
        presenceStream.destroy()
        await whenNextTick()
    })

    test('add presence on message', async () => {
        const onData = jest.fn()
        const presenceStream = await presenceProxy.streamPresenceBySessionId(
            sessionId,
        )
        presenceStream.on('data', onData)
        await redis.exists(presenceKey) // Just a delay.
        expect(onData).toBeCalledTimes(0)

        await presenceProxy.submitPresence(presence)
        clock.next()
        await new Promise(resolve => presenceStream.once('data', resolve))
        expect(onData).toBeCalledTimes(1)
        expect(onData).toBeCalledWith([
            true,
            { ...presence, lastModified: now },
        ])
        presenceStream.destroy()
        await whenNextTick()
    })

    test('remove presence on message', async () => {
        await presenceProxy.submitPresence(presence)
        clock.next()
        await whenMessage(presenceKey, sessionId)

        const onData = jest.fn()
        const presenceStream = await presenceProxy.streamPresenceBySessionId(
            sessionId,
        )
        presenceStream.on('data', onData)

        // Load the presence to delay the test a bit.
        await presenceProxy.getPresenceBySessionId(sessionId)

        expect(onData).toHaveBeenCalledTimes(1)
        onData.mockClear()

        await presenceProxy.removePresence()
        clock.next()
        await new Promise(resolve => presenceStream.once('data', resolve))
        expect(onData).toHaveBeenCalledTimes(1)
        expect(onData).toHaveBeenCalledWith([false, sessionId])
        presenceStream.destroy()
        await whenNextTick()
    })

    test('remove presence on message - loading failure', async () => {
        await presenceProxy.submitPresence(presence)
        clock.next()
        await whenMessage(presenceKey, sessionId)

        const onError = jest.fn()
        const onData = jest.fn()
        const presenceStream = await presenceProxy.streamPresenceBySessionId(
            sessionId,
        )
        presenceStream.on('data', onData)

        // Load the presence to delay the test a bit.
        await presenceProxy.getPresenceBySessionId(sessionId)

        expect(onData).toHaveBeenCalledTimes(1)
        onData.mockClear()

        presenceService.on('error', onError)
        authService.mayReadPresence.mockRejectedValue(testError)
        redis.publish(presenceKey as any, sessionId)
        await new Promise(resolve => presenceService.once('error', resolve))
        expect(onError).toHaveBeenCalledTimes(1)
        expect(onError).toHaveBeenCalledWith(
            expect.objectContaining({
                cause: testErrorMatcher,
                message:
                    'Failed to load presence by sessionId. => Error: test error',
                name: 'SyncOtError Presence',
            }),
        )
        await whenNextTick()
        expect(onData).toHaveBeenCalledTimes(1)
        expect(onData).toHaveBeenCalledWith([false, sessionId])
        presenceStream.destroy()
        await whenNextTick()
    })
})

// Most of the streamPresenceByUserId implementation is shared with streamPresenceBySessionId,
// so the tests cover only the differences between the two functions.
describe('streamPresenceByUserId', () => {
    let presenceStream: Duplex
    const whenData = () =>
        new Promise(resolve => presenceStream.once('data', resolve))

    beforeEach(async () => {
        await redis.hmset(presenceKey, {
            data: dataBuffer,
            lastModified: lastModifiedBuffer,
            locationId,
            userId,
        })
        await redis.hmset(presenceKey2, {
            data: dataBuffer2,
            lastModified: lastModifiedBuffer2,
            locationId: locationId2,
            userId,
        })
        await redis.sadd(userKey, sessionId, sessionId2)
        presenceStream = await presenceProxy.streamPresenceByUserId(userId)
    })

    afterEach(async () => {
        presenceStream.destroy()
        await whenNextTick()
    })

    test('load 2 presence objects', async () => {
        const onData = jest.fn()
        presenceStream.on('data', onData)
        await whenData()
        expect(onData).toHaveBeenCalledTimes(1)
        expect(onData.mock.calls[0][0]).toBeArray()
        expect(onData.mock.calls[0][0].length).toBe(3)
        expect(onData.mock.calls[0][0][0]).toBe(true)
        expect(onData.mock.calls[0][0]).toContainEqual(presence)
        expect(onData.mock.calls[0][0]).toContainEqual({ ...presence2, userId })
    })

    test('update a presence object', async () => {
        await whenData()
        const onData = jest.fn()
        presenceStream.on('data', onData)

        await redis.hmset(presenceKey2, {
            data: dataBuffer2,
            lastModified: lastModifiedBuffer2,
            locationId,
            userId,
        })
        redis.publish(userKey as any, sessionId2)
        await whenData()
        expect(onData).toHaveBeenCalledTimes(1)
        expect(onData).toHaveBeenCalledWith([
            true,
            { ...presence2, locationId, userId },
        ])
    })

    test('remove and add a presence object', async () => {
        await whenData()
        const onData = jest.fn()
        presenceStream.on('data', onData)

        await redis.del(presenceKey2)
        redis.publish(userKey as any, sessionId2)
        await whenData()
        expect(onData).toHaveBeenCalledTimes(1)
        expect(onData).toHaveBeenCalledWith([false, sessionId2])

        onData.mockClear()
        await redis.hmset(presenceKey2, {
            data: dataBuffer2,
            lastModified: lastModifiedBuffer2,
            locationId: locationId2,
            userId,
        })
        redis.publish(userKey as any, sessionId2)
        await whenData()
        expect(onData).toHaveBeenCalledTimes(1)
        expect(onData).toHaveBeenCalledWith([true, { ...presence2, userId }])
    })

    test('update userId', async () => {
        await whenData()
        const onData = jest.fn()
        presenceStream.on('data', onData)

        await redis.hmset(presenceKey2, {
            data: dataBuffer2,
            lastModified: lastModifiedBuffer2,
            locationId: locationId2,
            userId: userId2,
        })
        redis.publish(userKey as any, sessionId2)
        await whenData()
        expect(onData).toHaveBeenCalledTimes(1)
        expect(onData).toHaveBeenCalledWith([false, sessionId2])

        onData.mockClear()
        await redis.hmset(presenceKey2, {
            data: dataBuffer2,
            lastModified: lastModifiedBuffer2,
            locationId: locationId2,
            userId,
        })
        redis.publish(userKey as any, sessionId2)
        await whenData()
        expect(onData).toHaveBeenCalledTimes(1)
        expect(onData).toHaveBeenCalledWith([true, { ...presence2, userId }])
    })
})

// Most of the streamPresenceByLocationId implementation is shared with streamPresenceBySessionId,
// so the tests cover only the differences between the two functions.
describe('streamPresenceByLocationId', () => {
    let presenceStream: Duplex
    const whenData = () =>
        new Promise(resolve => presenceStream.once('data', resolve))

    beforeEach(async () => {
        await redis.hmset(presenceKey, {
            data: dataBuffer,
            lastModified: lastModifiedBuffer,
            locationId,
            userId,
        })
        await redis.hmset(presenceKey2, {
            data: dataBuffer2,
            lastModified: lastModifiedBuffer2,
            locationId,
            userId: userId2,
        })
        await redis.sadd(locationKey, sessionId, sessionId2)
        presenceStream = await presenceProxy.streamPresenceByLocationId(
            locationId,
        )
    })

    afterEach(async () => {
        presenceStream.destroy()
        await whenNextTick()
    })

    test('load 2 presence objects', async () => {
        const onData = jest.fn()
        presenceStream.on('data', onData)
        await whenData()
        expect(onData).toHaveBeenCalledTimes(1)
        expect(onData.mock.calls[0][0]).toBeArray()
        expect(onData.mock.calls[0][0].length).toBe(3)
        expect(onData.mock.calls[0][0][0]).toBe(true)
        expect(onData.mock.calls[0][0]).toContainEqual(presence)
        expect(onData.mock.calls[0][0]).toContainEqual({
            ...presence2,
            locationId,
        })
    })

    test('update a presence object', async () => {
        await whenData()
        const onData = jest.fn()
        presenceStream.on('data', onData)

        await redis.hmset(presenceKey2, {
            data: dataBuffer2,
            lastModified: lastModifiedBuffer2,
            locationId,
            userId,
        })
        redis.publish(locationKey as any, sessionId2)
        await whenData()
        expect(onData).toHaveBeenCalledTimes(1)
        expect(onData).toHaveBeenCalledWith([
            true,
            { ...presence2, locationId, userId },
        ])
    })

    test('remove and add a presence object', async () => {
        await whenData()
        const onData = jest.fn()
        presenceStream.on('data', onData)

        await redis.del(presenceKey2)
        redis.publish(locationKey as any, sessionId2)
        await whenData()
        expect(onData).toHaveBeenCalledTimes(1)
        expect(onData).toHaveBeenCalledWith([false, sessionId2])

        onData.mockClear()
        await redis.hmset(presenceKey2, {
            data: dataBuffer2,
            lastModified: lastModifiedBuffer2,
            locationId,
            userId: userId2,
        })
        redis.publish(locationKey as any, sessionId2)
        await whenData()
        expect(onData).toHaveBeenCalledTimes(1)
        expect(onData).toHaveBeenCalledWith([
            true,
            { ...presence2, locationId },
        ])
    })

    test('update locationId', async () => {
        await whenData()
        const onData = jest.fn()
        presenceStream.on('data', onData)

        await redis.hmset(presenceKey2, {
            data: dataBuffer2,
            lastModified: lastModifiedBuffer2,
            locationId: locationId2,
            userId: userId2,
        })
        redis.publish(locationKey as any, sessionId2)
        await whenData()
        expect(onData).toHaveBeenCalledTimes(1)
        expect(onData).toHaveBeenCalledWith([false, sessionId2])

        onData.mockClear()
        await redis.hmset(presenceKey2, {
            data: dataBuffer2,
            lastModified: lastModifiedBuffer2,
            locationId,
            userId: userId2,
        })
        redis.publish(locationKey as any, sessionId2)
        await whenData()
        expect(onData).toHaveBeenCalledTimes(1)
        expect(onData).toHaveBeenCalledWith([
            true,
            { ...presence2, locationId },
        ])
    })
})
