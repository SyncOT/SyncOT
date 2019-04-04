import { AuthEvents, AuthManager } from '@syncot/auth'
import { Connection, createConnection } from '@syncot/core'
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

const userId = 'test-user-id'
const sessionId = 'test-session-id'
const presenceKey = new SmartBuffer()
    .writeString('presence:sessionId=')
    .writeBuffer(Buffer.from(encode(sessionId)))
    .toBuffer()

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
        actions: new Set([
            'submitPresence',
            'removePresence',
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
    redisSubscriber.disconnect()
    ;(monitor as any).disconnect()
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
    clock.tick(0) // Save presence in Redis.
    await new Promise(resolve => presenceService.once('inSync', resolve))
    await expect(redis.exists(presenceKey)).resolves.toBe(1)

    presenceService.destroy()
    await expect(redis.exists(presenceKey)).resolves.toBe(1)
    expect(onDestroy).toHaveBeenCalledTimes(1)
    clock.tick(0) // Delete presence from Redis.

    await whenRedisCommandExecuted('DEL')

    // Ensure the data is gone.
    await expect(redis.exists(presenceKey)).resolves.toBe(0)
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

    const onOutOfSync = jest.fn()
    const onInSync = jest.fn()
    presenceService.on('outOfSync', onOutOfSync)
    presenceService.on('inSync', onInSync)

    emitEvent()
    clock.next() // Remove presence.
    await new Promise(resolve => presenceService.once('inSync', resolve))
    await expect(redis.exists(presenceKey)).resolves.toBe(0)
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

    // Client 1 disconnects.
    sessionService.hasActiveSession.mockReturnValue(false)
    authService.hasAuthenticatedUserId.mockReturnValue(false)
    sessionService.emit('sessionInactive')
    authService.emit('authEnd')
    clock.next()
    await new Promise(resolve => presenceService.once('inSync', resolve))
    await expect(redis.exists(presenceKey)).resolves.toBe(0)

    // Client 2 connects.
    const sessionId2 = 'test-session-id-2'
    const userId2 = 'test-user-id-2'
    const locationId2 = 'test-location-id-2'
    const presence2: Presence = {
        data: { key: "Another user's data" },
        lastModified: Date.now(),
        locationId: locationId2,
        sessionId: sessionId2,
        userId: userId2,
    }
    const presenceKey2 = new SmartBuffer()
        .writeString('presence:sessionId=')
        .writeBuffer(Buffer.from(encode(sessionId2)))
        .toBuffer()
    sessionService.getSessionId.mockReturnValue(sessionId2)
    sessionService.hasActiveSession.mockReturnValue(true)
    authService.getUserId.mockReturnValue(userId2)
    authService.hasAuthenticatedUserId.mockReturnValue(true)

    // Client 2 submits presence.
    await presenceService.submitPresence(presence2)
    clock.next()
    await new Promise(resolve => presenceService.once('inSync', resolve))
    await expect(redis.exists(presenceKey2)).resolves.toBe(1)
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

        const newData = { key: 'different value' }
        await presenceProxy.submitPresence(presence) // Submit old.
        clock.next() // Start saving the old presence to Redis.
        await presenceProxy.submitPresence({ ...presence, data: newData }) // Submit new.

        // Old presence.
        await whenRedisCommandExecuted('EXPIRE')
        await expect(
            presenceProxy.getPresenceBySessionId(sessionId),
        ).resolves.toEqual({ ...presence, lastModified: now })

        // New presence.
        clock.tick(0) // Start saving the new presence to Redis.
        await whenRedisCommandExecuted('EXPIRE')
        await expect(
            presenceProxy.getPresenceBySessionId(sessionId),
        ).resolves.toEqual({ ...presence, data: newData, lastModified: now })

        expect(onOutOfSync).toHaveBeenCalledTimes(1)
        expect(onInSync).toHaveBeenCalledTimes(1)
    })

    describe.each<[undefined | number, number]>([
        [undefined, 60],
        [1, 10],
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

            await expect(redis.ttl(presenceKey)).resolves.toBe(effectiveTtl)
            await expect(
                presenceProxy.getPresenceBySessionId(sessionId),
            ).resolves.toEqual({ ...presence, lastModified: now })
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
            expect(await redis.ttl(presenceKey)).toBe(1)
            clock.tick((effectiveTtl - 1) * 1000)

            await whenRedisCommandExecuted('EXPIRE')

            await expect(redis.ttl(presenceKey)).resolves.toBe(effectiveTtl)
            // lastModified is 7, rather than `now`, because the PresenceService realised that
            // the previously stored hash still exists, so it updated only its TTL without checking
            // the stored values in order to reduce the load on the Redis server.
            await expect(
                presenceProxy.getPresenceBySessionId(sessionId),
            ).resolves.toEqual({ ...presence, lastModified: 7 })

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
            await expect(redis.exists(presenceKey)).resolves.toBe(0)
            clock.tick((effectiveTtl - 1) * 1000)

            await whenRedisCommandExecuted('EXPIRE')

            await expect(redis.ttl(presenceKey)).resolves.toBe(effectiveTtl)
            await expect(
                presenceProxy.getPresenceBySessionId(sessionId),
            ).resolves.toEqual({ ...presence, lastModified: now })

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

        await presenceProxy.removePresence()
        const onOutOfSync = jest.fn()
        const onInSync = jest.fn()
        presenceService.on('outOfSync', onOutOfSync)
        presenceService.on('inSync', onInSync)
        clock.next()
        await new Promise(resolve => presenceService.once('inSync', resolve))
        await expect(redis.exists(presenceKey)).resolves.toBe(0)

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
            data: Buffer.from(encode(data)),
            lastModified: Buffer.from(encode(lastModified)),
            locationId: Buffer.from(encode(locationId)),
            userId: Buffer.from(encode(userId)),
        })
        await expect(
            presenceProxy.getPresenceBySessionId(sessionId),
        ).resolves.toEqual(presence)
    })

    test('get non-existant presence', async () => {
        await redis.hmset(presenceKey, {
            data: Buffer.from(encode(data)),
            lastModified: Buffer.from(encode(lastModified)),
            locationId: Buffer.from(encode(locationId)),
            userId: Buffer.from(encode(userId)),
        })
        await expect(
            presenceProxy.getPresenceBySessionId(
                Buffer.from(encode('does not exist')),
            ),
        ).resolves.toBeNull()
    })

    test('get presence with missing userId', async () => {
        await redis.hmset(presenceKey, {
            data: Buffer.from(encode(data)),
            lastModified: Buffer.from(encode(lastModified)),
            locationId: Buffer.from(encode(locationId)),
            // userId: Buffer.from(encode(userId)),
        })
        await expect(
            presenceProxy.getPresenceBySessionId(sessionId),
        ).resolves.toBeNull()
    })

    test('get presence with missing locationId', async () => {
        await redis.hmset(presenceKey, {
            data: Buffer.from(encode(data)),
            lastModified: Buffer.from(encode(lastModified)),
            // locationId: Buffer.from(encode(locationId)),
            userId: Buffer.from(encode(userId)),
        })
        await expect(
            presenceProxy.getPresenceBySessionId(sessionId),
        ).resolves.toBeNull()
    })

    test('get presence with missing data', async () => {
        await redis.hmset(presenceKey, {
            // data: Buffer.from(encode(data)),
            lastModified: Buffer.from(encode(lastModified)),
            locationId: Buffer.from(encode(locationId)),
            userId: Buffer.from(encode(userId)),
        })
        await expect(
            presenceProxy.getPresenceBySessionId(sessionId),
        ).resolves.toBeNull()
    })

    test('get presence with missing lastModified', async () => {
        await redis.hmset(presenceKey, {
            data: Buffer.from(encode(data)),
            // lastModified: Buffer.from(encode(lastModified)),
            locationId: Buffer.from(encode(locationId)),
            userId: Buffer.from(encode(userId)),
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
                message: 'Invalid presence. => SyncOtError TSON: Unknown type.',
                name: 'SyncOtError Presence',
            }),
        )
    })

    test('get invalid presence', async () => {
        await redis.hmset(presenceKey, {
            data: Buffer.from(encode(data)),
            lastModified: Buffer.from(encode(lastModified)),
            locationId: Buffer.from(encode(locationId)),
            userId: Buffer.from(encode(true)),
        })
        await expect(
            presenceProxy.getPresenceBySessionId(sessionId),
        ).rejects.toEqual(
            expect.objectContaining({
                message:
                    'Invalid presence. => SyncOtError InvalidEntity: Invalid "Presence.userId".',
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
                    'Failed to load presence. => Error: Connection is closed.',
                name: 'SyncOtError Presence',
            }),
        )
        await redis.connect()
    })
})
