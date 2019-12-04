import { AuthEvents, AuthService } from '@syncot/auth'
import { Connection, createConnection } from '@syncot/connection'
import { SyncOtEmitter } from '@syncot/events'
import { Presence, PresenceService } from '@syncot/presence'
import { invertedStreams } from '@syncot/stream'
import {
    delay,
    randomInteger,
    whenClose,
    whenData,
    whenError,
    whenEvent,
} from '@syncot/util'
import Redis from 'ioredis'
import { Duplex } from 'readable-stream'
import RedisServer from 'redis-server'
import { createPresenceService } from '.'
import {
    connectionPrefix,
    locationPrefix,
    sessionPrefix,
    userPrefix,
} from './commands'
import { getRedisConnectionManager } from './connection'
import { requestNames } from './service'

const now = 12345

const testError = new Error('test error')
const testErrorMatcher = expect.objectContaining({
    message: 'test error',
    name: 'Error',
})
const alreadyDestroyedMatcher = expect.objectContaining({
    message: 'Already destroyed.',
    name: 'SyncOtError Assert',
})
const throwTestError = () => {
    throw testError
}

const sessionId = 'test-session-id'
const sessionId2 = 'test-session-id-2'
const userId = 'test-user-id'
const userId2 = 'test-user-id-2'
const locationId = 'test-location-id'
const locationId2 = 'test-location-id-2'
const data = Object.freeze({ key: 'value' })
const data2 = Object.freeze({ key: 'value-2' })
const dataString = JSON.stringify(data)
const dataString2 = JSON.stringify(data2)
const lastModified = now
const lastModified2 = now
const connectionId = async (): Promise<number> => redis.client('id')

const sessionKey = sessionPrefix + sessionId
const sessionKey2 = sessionPrefix + sessionId2
const userKey = userPrefix + userId
const userKey2 = userPrefix + userId2
const locationKey = locationPrefix + locationId
const locationKey2 = locationPrefix + locationId2
const connectionKey = async (): Promise<string> =>
    connectionPrefix + (await connectionId())

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
let redis2: Redis.Redis
let redisSubscriber: Redis.Redis
let testSubscriber: Redis.Redis
let redisOptions: Redis.RedisOptions

let authService: MockAuthService

let stream1: Duplex
let stream2: Duplex
let connection1: Connection
let connection2: Connection
let presenceService: PresenceService
let presenceProxy: PresenceService

class MockAuthService extends SyncOtEmitter<AuthEvents> implements AuthService {
    public active: boolean = true
    public sessionId: string | undefined = sessionId
    public userId: string | undefined = userId
    public mayReadDocument = jest.fn().mockResolvedValue(true)
    public mayWriteDocument = jest.fn().mockResolvedValue(true)
    public mayReadPresence = jest.fn().mockReturnValue(true)
    public mayWritePresence = jest.fn().mockReturnValue(true)
}

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

const whenCalled = (fn: jest.Mock) =>
    new Promise(resolve => fn.mockImplementationOnce(resolve))

beforeAll(async () => {
    let attempt = 1
    while (true) {
        try {
            port = randomInteger(0x400, 0x10000)
            redisServer = new RedisServer(port)
            await redisServer.open()
            redisOptions = {
                autoResubscribe: false,
                enableOfflineQueue: false,
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

beforeEach(async () => {
    redis = new Redis(redisOptions)
    redis2 = new Redis(redisOptions)
    redisSubscriber = new Redis(redisOptions)
    testSubscriber = new Redis(redisOptions)
    await redis.connect()
    await redis2.connect()
    await redisSubscriber.connect()
    await testSubscriber.connect()
    await testSubscriber.psubscribe('presence:*')
    await whenEvent('connectionId')(getRedisConnectionManager(redis))

    authService = new MockAuthService()

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
    })
    connection2.registerProxy({
        name: 'presence',
        requestNames,
    })
    presenceProxy = connection2.getProxy('presence') as PresenceService
})

afterEach(async () => {
    connection1.disconnect()
    connection2.disconnect()
    presenceService.destroy()
    await redis.flushall()
    redis.disconnect()
    redis2.disconnect()
    redisSubscriber.disconnect()
    testSubscriber.disconnect()
})

test('throw on redis autoResubscribe=true', () => {
    expect(() =>
        createPresenceService({
            authService,
            connection: connection1,
            redis: new Redis({
                ...redisOptions,
                autoResubscribe: true,
            }),
            redisSubscriber,
        }),
    ).toThrow(
        expect.objectContaining({
            message: 'Redis must be configured with autoResubscribe=false.',
            name: 'SyncOtError Assert',
        }),
    )
})

test('throw on redis enableOfflineQueue=true', () => {
    expect(() =>
        createPresenceService({
            authService,
            connection: connection1,
            redis: new Redis({
                ...redisOptions,
                enableOfflineQueue: true,
            }),
            redisSubscriber,
        }),
    ).toThrow(
        expect.objectContaining({
            message: 'Redis must be configured with enableOfflineQueue=false.',
            name: 'SyncOtError Assert',
        }),
    )
})

test('throw on redis enableReadyCheck=false', () => {
    expect(() =>
        createPresenceService({
            authService,
            connection: connection1,
            redis: new Redis({
                ...redisOptions,
                enableReadyCheck: false,
            }),
            redisSubscriber,
        }),
    ).toThrow(
        expect.objectContaining({
            message: 'Redis must be configured with enableReadyCheck=true.',
            name: 'SyncOtError Assert',
        }),
    )
})

test('throw on redisSubscriber autoResubscribe=true', () => {
    expect(() =>
        createPresenceService({
            authService,
            connection: connection1,
            redis,
            redisSubscriber: new Redis({
                ...redisOptions,
                autoResubscribe: true,
            }),
        }),
    ).toThrow(
        expect.objectContaining({
            message:
                'Redis subscriber must be configured with autoResubscribe=false.',
            name: 'SyncOtError Assert',
        }),
    )
})

test('throw on redisSubscriber enableOfflineQueue=true', () => {
    expect(() =>
        createPresenceService({
            authService,
            connection: connection1,
            redis,
            redisSubscriber: new Redis({
                ...redisOptions,
                enableOfflineQueue: true,
            }),
        }),
    ).toThrow(
        expect.objectContaining({
            message:
                'Redis subscriber must be configured with enableOfflineQueue=false.',
            name: 'SyncOtError Assert',
        }),
    )
})

test('throw on redisSubscriber enableReadyCheck=false', () => {
    expect(() =>
        createPresenceService({
            authService,
            connection: connection1,
            redis,
            redisSubscriber: new Redis({
                ...redisOptions,
                enableReadyCheck: false,
            }),
        }),
    ).toThrow(
        expect.objectContaining({
            message:
                'Redis subscriber must be configured with enableReadyCheck=true.',
            name: 'SyncOtError Assert',
        }),
    )
})

test('invalid connection (missing)', () => {
    expect(() =>
        createPresenceService({
            authService,
            connection: undefined as any,
            redis,
            redisSubscriber,
        }),
    ).toThrow(
        expect.objectContaining({
            message:
                'Argument "connection" must be a non-destroyed Connection.',
            name: 'SyncOtError Assert',
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
        }),
    ).toThrow(
        expect.objectContaining({
            message:
                'Argument "connection" must be a non-destroyed Connection.',
            name: 'SyncOtError Assert',
        }),
    )
})

test('destroy on connection destroy', async () => {
    connection1.destroy()
    await new Promise(resolve => presenceService.once('destroy', resolve))
})

test('invalid authService (missing)', () => {
    expect(() =>
        createPresenceService({
            authService: undefined as any,
            connection: connection1,
            redis,
            redisSubscriber,
        }),
    ).toThrow(
        expect.objectContaining({
            message:
                'Argument "authService" must be a non-destroyed AuthService.',
            name: 'SyncOtError Assert',
        }),
    )
})

test('invalid authService (destroyed)', () => {
    const newAuthService = new MockAuthService()
    newAuthService.destroy()
    expect(() =>
        createPresenceService({
            authService: newAuthService,
            connection: connection1,
            redis,
            redisSubscriber,
        }),
    ).toThrow(
        expect.objectContaining({
            message:
                'Argument "authService" must be a non-destroyed AuthService.',
            name: 'SyncOtError Assert',
        }),
    )
})

test('destroy on authService destroy', async () => {
    authService.destroy()
    await new Promise(resolve => presenceService.once('destroy', resolve))
})

test('create twice on the same connection', () => {
    expect(() =>
        createPresenceService({
            authService,
            connection: connection1,
            redis,
            redisSubscriber,
        }),
    ).toThrow(
        expect.objectContaining({
            message: 'Service "presence" has been already registered.',
            name: 'SyncOtError Assert',
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

    await whenMessage(sessionKey, sessionId)
    await expect(redis.exists(sessionKey)).resolves.toBe(1)
    await expect(redis.sismember(userKey, sessionId)).resolves.toBe(1)
    await expect(redis.sismember(locationKey, sessionId)).resolves.toBe(1)
    await expect(
        redis.sismember(await connectionKey(), sessionId),
    ).resolves.toBe(1)

    presenceService.destroy()

    await whenMessage(sessionKey, sessionId)
    await expect(redis.exists(sessionKey)).resolves.toBe(0)
    await expect(redis.sismember(userKey, sessionId)).resolves.toBe(0)
    await expect(redis.sismember(locationKey, sessionId)).resolves.toBe(0)
    await expect(
        redis.sismember(await connectionKey(), sessionId),
    ).resolves.toBe(0)

    expect(onDestroy).toHaveBeenCalledTimes(1)
})

test('remove presence on AuthService "inactive" event', async () => {
    await presenceService.submitPresence(presence)

    await whenMessage(sessionKey, sessionId)
    await expect(redis.exists(sessionKey)).resolves.toBe(1)
    await expect(redis.sismember(userKey, sessionId)).resolves.toBe(1)
    await expect(redis.sismember(locationKey, sessionId)).resolves.toBe(1)
    await expect(
        redis.sismember(await connectionKey(), sessionId),
    ).resolves.toBe(1)

    authService.active = false
    authService.emit('inactive')

    await whenMessage(sessionKey, sessionId)
    await expect(redis.exists(sessionKey)).resolves.toBe(0)
    await expect(redis.sismember(userKey, sessionId)).resolves.toBe(0)
    await expect(redis.sismember(locationKey, sessionId)).resolves.toBe(0)
    await expect(
        redis.sismember(await connectionKey(), sessionId),
    ).resolves.toBe(0)
})

test('reuse service with a different client', async () => {
    // Client 1 submits presence.
    await presenceService.submitPresence(presence)
    await whenMessage(sessionKey, sessionId)
    await expect(redis.exists(sessionKey)).resolves.toBe(1)
    await expect(redis.sismember(userKey, sessionId)).resolves.toBe(1)
    await expect(redis.sismember(locationKey, sessionId)).resolves.toBe(1)
    await expect(
        redis.sismember(await connectionKey(), sessionId),
    ).resolves.toBe(1)
    // Client 1 disconnects.
    authService.active = false
    authService.sessionId = undefined
    authService.userId = undefined
    authService.emit('inactive')
    await whenMessage(sessionKey, sessionId)
    await expect(redis.exists(sessionKey)).resolves.toBe(0)
    await expect(redis.sismember(userKey, sessionId)).resolves.toBe(0)
    await expect(redis.sismember(locationKey, sessionId)).resolves.toBe(0)
    await expect(
        redis.sismember(await connectionKey(), sessionId),
    ).resolves.toBe(0)

    // Client 2 connects.
    authService.active = true
    authService.sessionId = sessionId2
    authService.userId = userId2

    // Client 2 submits presence.
    await presenceService.submitPresence(presence2)
    await whenMessage(sessionKey2, sessionId2)
    await expect(redis.exists(sessionKey2)).resolves.toBe(1)
    await expect(redis.sismember(userKey2, sessionId2)).resolves.toBe(1)
    await expect(redis.sismember(locationKey2, sessionId2)).resolves.toBe(1)
    await expect(
        redis.sismember(await connectionKey(), sessionId2),
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

    test('no authenticated user', async () => {
        authService.active = false
        authService.sessionId = undefined
        authService.userId = undefined
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

    test('store', async () => {
        const onMessage = jest.fn()
        testSubscriber.on('pmessage', onMessage)

        await presenceProxy.submitPresence(presence)
        await whenMessage(sessionKey, sessionId)

        const savedPresence = await presenceProxy.getPresenceBySessionId(
            sessionId,
        )
        expect(savedPresence).toEqual({
            ...presence,
            lastModified: expect.toBeNumber(),
        })
        expect(savedPresence!.lastModified).toBeLessThanOrEqual(Date.now())
        expect(savedPresence!.lastModified).toBeGreaterThanOrEqual(
            Date.now() - 1000,
        )
        await expect(redis.sismember(userKey, sessionId)).resolves.toBe(1)
        await expect(redis.sismember(locationKey, sessionId)).resolves.toBe(1)
        await expect(
            redis.sismember(await connectionKey(), sessionId),
        ).resolves.toBe(1)
    })

    test('storage error and store after reconnect', async () => {
        const onError = jest.fn()
        const invalidValue = 'invalid-value-type-to-block-presence-update'

        await redis.set(sessionKey, invalidValue)
        presenceService.once('error', onError)
        await Promise.all([
            presenceProxy.submitPresence(presence),
            new Promise(resolve => presenceService.once('error', resolve)),
        ])
        expect(onError).toHaveBeenCalledWith(
            expect.objectContaining({
                cause: expect.objectContaining({
                    message: expect.stringContaining(
                        'ERR Error running script',
                    ),
                    name: 'ReplyError',
                }),
                message: expect.stringContaining(
                    'Failed to store presence in Redis. => ReplyError: ERR Error running script',
                ),
                name: 'SyncOtError Presence',
            }),
        )

        await expect(redis.get(sessionKey)).resolves.toBe(invalidValue)
        await expect(redis.sismember(userKey, sessionId)).resolves.toBe(0)
        await expect(redis.sismember(locationKey, sessionId)).resolves.toBe(0)
        await expect(
            redis.sismember(await connectionKey(), sessionId),
        ).resolves.toBe(0)

        // retry after reconnect
        await redis.del(sessionKey)
        redis.disconnect()
        await whenClose(redis)
        await redis.connect()

        await whenMessage(sessionKey, sessionId)
        await expect(redis.exists(sessionKey)).resolves.toBe(1)
        await expect(redis.sismember(userKey, sessionId)).resolves.toBe(1)
        await expect(redis.sismember(locationKey, sessionId)).resolves.toBe(1)
        await expect(
            redis.sismember(await connectionKey(), sessionId),
        ).resolves.toBe(1)
    })

    test('store after reconnect', async () => {
        await presenceProxy.submitPresence(presence)
        await whenMessage(sessionKey, sessionId)
        await expect(redis.exists(sessionKey)).resolves.toBe(1)
        await expect(redis.sismember(userKey, sessionId)).resolves.toBe(1)
        await expect(redis.sismember(locationKey, sessionId)).resolves.toBe(1)
        await expect(
            redis.sismember(await connectionKey(), sessionId),
        ).resolves.toBe(1)
        await redis.flushall()
        redis.disconnect()
        await whenClose(redis)
        await redis.connect()

        await whenMessage(sessionKey, sessionId)
        await expect(redis.exists(sessionKey)).resolves.toBe(1)
        await expect(redis.sismember(userKey, sessionId)).resolves.toBe(1)
        await expect(redis.sismember(locationKey, sessionId)).resolves.toBe(1)
        await expect(
            redis.sismember(await connectionKey(), sessionId),
        ).resolves.toBe(1)
    })

    test('submit 2 presence objects', async () => {
        const onMessage = jest.fn()
        testSubscriber.on('pmessage', onMessage)

        await presenceProxy.submitPresence(presence)
        await whenMessage(userKey, sessionId)
        await expect(
            presenceProxy.getPresenceBySessionId(sessionId),
        ).resolves.toEqual({ ...presence, lastModified: expect.toBeNumber() })
        await expect(redis.sismember(userKey2, sessionId)).resolves.toBe(0)
        await expect(redis.sismember(locationKey2, sessionId)).resolves.toBe(0)
        await expect(redis.sismember(userKey, sessionId)).resolves.toBe(1)
        await expect(redis.sismember(locationKey, sessionId)).resolves.toBe(1)
        await expect(
            redis.sismember(await connectionKey(), sessionId),
        ).resolves.toBe(1)

        // User ID would not change like this in practice, however, we do it
        // to test that the presence indexes are updated correctly even in this
        // extreme case.
        authService.userId = userId2
        await presenceProxy.submitPresence({
            ...presence2,
            sessionId,
        })
        await whenMessage(userKey2, sessionId)

        await expect(
            presenceProxy.getPresenceBySessionId(sessionId),
        ).resolves.toEqual({
            ...presence2,
            lastModified: expect.toBeNumber(),
            sessionId,
        })
        await expect(redis.sismember(userKey2, sessionId)).resolves.toBe(1)
        await expect(redis.sismember(locationKey2, sessionId)).resolves.toBe(1)
        await expect(redis.sismember(userKey, sessionId)).resolves.toBe(0)
        await expect(redis.sismember(locationKey, sessionId)).resolves.toBe(0)
        await expect(
            redis.sismember(await connectionKey(), sessionId),
        ).resolves.toBe(1)

        expect(onMessage).toHaveBeenCalledTimes(8)

        // Store first presence.
        expect(onMessage).toHaveBeenNthCalledWith(
            1,
            expect.anything(),
            sessionKey,
            sessionId,
        )
        expect(onMessage).toHaveBeenNthCalledWith(
            2,
            expect.anything(),
            userKey,
            sessionId,
        )
        expect(onMessage).toHaveBeenNthCalledWith(
            3,
            expect.anything(),
            locationKey,
            sessionId,
        )

        // Remove first presence indexes.
        expect(onMessage).toHaveBeenNthCalledWith(
            4,
            expect.anything(),
            userKey,
            sessionId,
        )
        expect(onMessage).toHaveBeenNthCalledWith(
            5,
            expect.anything(),
            locationKey,
            sessionId,
        )

        // Store second presence.
        expect(onMessage).toHaveBeenNthCalledWith(
            6,
            expect.anything(),
            sessionKey,
            sessionId,
        )
        expect(onMessage).toHaveBeenNthCalledWith(
            7,
            expect.anything(),
            userKey2,
            sessionId,
        )
        expect(onMessage).toHaveBeenNthCalledWith(
            8,
            expect.anything(),
            locationKey2,
            sessionId,
        )
    })

    test('submit while disconnected and store after reconnect', async () => {
        redis.disconnect()
        await whenClose(redis)
        await presenceProxy.submitPresence(presence)
        await redis.connect()
        await whenMessage(sessionKey, sessionId)
        await expect(redis.exists(sessionKey)).resolves.toBe(1)
        await expect(redis.sismember(userKey, sessionId)).resolves.toBe(1)
        await expect(redis.sismember(locationKey, sessionId)).resolves.toBe(1)
        await expect(
            redis.sismember(await connectionKey(), sessionId),
        ).resolves.toBe(1)
    })

    test('restore data after reconnect', async () => {
        await presenceProxy.submitPresence(presence)
        await whenMessage(sessionKey, sessionId)
        await expect(redis.exists(sessionKey)).resolves.toBe(1)
        redis.disconnect()
        await whenClose(redis)

        // Emulate the RedisConnectionManager removing abandoned data.
        await redis2.flushall()

        await redis.connect()
        await whenMessage(sessionKey, sessionId)
        // The PresenceManager should restore the removed Presence.
        await expect(redis.exists(sessionKey)).resolves.toBe(1)
    })
})

describe('removePresence', () => {
    test('already destroyed', async () => {
        presenceService.destroy()
        await expect(presenceProxy.removePresence()).rejects.toEqual(
            expect.objectContaining({
                message: 'Already destroyed.',
                name: 'SyncOtError Assert',
            }),
        )
    })

    test('has no presence', async () => {
        await presenceProxy.removePresence()
    })

    test('has presence', async () => {
        await presenceProxy.submitPresence(presence)
        await whenMessage(sessionKey, sessionId)
        await expect(redis.exists(sessionKey)).resolves.toBe(1)
        await expect(redis.sismember(userKey, sessionId)).resolves.toBe(1)
        await expect(redis.sismember(locationKey, sessionId)).resolves.toBe(1)

        const onMessage = jest.fn()
        testSubscriber.on('pmessage', onMessage)
        await presenceProxy.removePresence()
        await whenMessage(sessionKey, sessionId)
        await expect(redis.exists(sessionKey)).resolves.toBe(0)
        await expect(redis.sismember(userKey, sessionId)).resolves.toBe(0)
        await expect(redis.sismember(locationKey, sessionId)).resolves.toBe(0)

        expect(onMessage).toHaveBeenCalledTimes(3)
        expect(onMessage).toHaveBeenNthCalledWith(
            1,
            expect.anything(),
            userKey,
            sessionId,
        )
        expect(onMessage).toHaveBeenNthCalledWith(
            2,
            expect.anything(),
            locationKey,
            sessionId,
        )
        expect(onMessage).toHaveBeenNthCalledWith(
            3,
            expect.anything(),
            sessionKey,
            sessionId,
        )
    })

    test('has presence but no authentication', async () => {
        await presenceProxy.submitPresence(presence)
        await whenMessage(sessionKey, sessionId)
        await expect(redis.exists(sessionKey)).resolves.toBe(1)
        authService.active = false

        await presenceProxy.removePresence()
        await whenMessage(sessionKey, sessionId)
        await expect(redis.exists(sessionKey)).resolves.toBe(0)
    })

    test('while disconnected', async () => {
        await presenceProxy.submitPresence(presence)
        await whenMessage(sessionKey, sessionId)
        await expect(redis.exists(sessionKey)).resolves.toBe(1)
        redis.disconnect()
        await whenClose(redis)
        await presenceProxy.removePresence()

        // Emulate the RedisConnectionManager removing abandoned data.
        await redis2.flushall()

        await redis.connect()
        // Unfortunately, we have to wait to ensure that the Presence is not restored,
        // as no events are generated in this case.
        await delay(200)
        // The PresenceManager should not restore the removed Presence.
        await expect(redis.exists(sessionKey)).resolves.toBe(0)
    })
})

describe('getPresenceBySessionId', () => {
    test('get existing presence', async () => {
        await redis.hmset(sessionKey, {
            data: dataString,
            lastModified,
            locationId,
            userId,
        })
        await expect(
            presenceProxy.getPresenceBySessionId(sessionId),
        ).resolves.toEqual(presence)
    })

    test('not authorized', async () => {
        authService.mayReadPresence.mockReturnValue(false)
        await redis.hmset(sessionKey, {
            data: dataString,
            lastModified,
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
        await redis.hmset(sessionKey, {
            data: dataString,
            lastModified,
            locationId,
            userId,
        })
        await expect(
            presenceProxy.getPresenceBySessionId('does not exist'),
        ).resolves.toBeNull()
    })

    test('get presence with missing userId', async () => {
        await redis.hmset(sessionKey, {
            data: dataString,
            lastModified,
            locationId,
            // userId,
        })
        await expect(
            presenceProxy.getPresenceBySessionId(sessionId),
        ).resolves.toBeNull()
    })

    test('get presence with missing locationId', async () => {
        await redis.hmset(sessionKey, {
            data: dataString,
            lastModified,
            // locationId,
            userId,
        })
        await expect(
            presenceProxy.getPresenceBySessionId(sessionId),
        ).resolves.toBeNull()
    })

    test('get presence with missing data', async () => {
        await redis.hmset(sessionKey, {
            // data: dataString,
            lastModified,
            locationId,
            userId,
        })
        await expect(
            presenceProxy.getPresenceBySessionId(sessionId),
        ).resolves.toBeNull()
    })

    test('get presence with missing lastModified', async () => {
        await redis.hmset(sessionKey, {
            data: dataString,
            // lastModified: lastModified,
            locationId,
            userId,
        })
        await expect(
            presenceProxy.getPresenceBySessionId(sessionId),
        ).resolves.toBeNull()
    })

    test('invalid data', async () => {
        const message =
            'Failed to load presence by sessionId. => ' +
            'SyntaxError: Unexpected token o in JSON at position 1'
        const name = 'SyncOtError Presence'
        await redis.hmset(sessionKey, {
            data: 'not-json',
            lastModified,
            locationId,
            userId,
        })
        await expect(
            presenceProxy.getPresenceBySessionId(sessionId),
        ).rejects.toEqual(expect.objectContaining({ message, name }))
    })

    test('invalid lastModified', async () => {
        await redis.hmset(sessionKey, {
            data: dataString,
            lastModified: 'not-a-number',
            locationId,
            userId,
        })
        await expect(
            presenceProxy.getPresenceBySessionId(sessionId),
        ).rejects.toEqual(
            expect.objectContaining({
                message:
                    'Failed to load presence by sessionId. => ' +
                    'SyncOtError InvalidEntity: Invalid "Presence.lastModified".',
                name: 'SyncOtError Presence',
            }),
        )
    })

    test('no authenticated user', async () => {
        authService.active = false
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
        await whenClose(redis)
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
        await redis.hmset(sessionKey, {
            data: dataString,
            lastModified,
            locationId,
            userId,
        })
        await redis.sadd(userKey, sessionId)
        await expect(
            presenceProxy.getPresenceByUserId(userId),
        ).resolves.toEqual([presence])
    })

    test('get two presence objects', async () => {
        await redis.hmset(sessionKey, {
            data: dataString,
            lastModified,
            locationId,
            userId,
        })
        await redis.hmset(sessionKey2, {
            data: dataString2,
            lastModified: lastModified2,
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
        await redis.hmset(sessionKey, {
            data: dataString,
            lastModified,
            locationId,
            userId,
        })
        await redis.hmset(sessionKey2, {
            data: dataString2,
            lastModified: lastModified2,
            locationId: locationId2,
            userId,
        })
        await redis.sadd(userKey, sessionId, sessionId2)

        authService.mayReadPresence.mockImplementation(
            loadedPresence => loadedPresence.sessionId === sessionId,
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
        await redis.hmset(sessionKey, {
            data: dataString,
            lastModified,
            locationId,
            userId,
        })
        await redis.hmset(sessionKey2, {
            data: dataString2,
            lastModified: lastModified2,
            locationId: locationId2,
            // userId,
        })
        await redis.sadd(userKey, sessionId, sessionId2)
        await expect(
            presenceProxy.getPresenceByUserId(userId),
        ).resolves.toEqual([presence])
    })

    test('get presence with missing locationId', async () => {
        await redis.hmset(sessionKey, {
            data: dataString,
            lastModified,
            locationId,
            userId,
        })
        await redis.hmset(sessionKey2, {
            data: dataString2,
            lastModified: lastModified2,
            // locationId: locationId2,
            userId,
        })
        await redis.sadd(userKey, sessionId, sessionId2)
        await expect(
            presenceProxy.getPresenceByUserId(userId),
        ).resolves.toEqual([presence])
    })

    test('get presence with missing data', async () => {
        await redis.hmset(sessionKey, {
            data: dataString,
            lastModified,
            locationId,
            userId,
        })
        await redis.hmset(sessionKey2, {
            // data: dataString2,
            lastModified: lastModified2,
            locationId: locationId2,
            userId,
        })
        await redis.sadd(userKey, sessionId, sessionId2)
        await expect(
            presenceProxy.getPresenceByUserId(userId),
        ).resolves.toEqual([presence])
    })

    test('get presence with missing lastModified', async () => {
        await redis.hmset(sessionKey, {
            data: dataString,
            lastModified,
            locationId,
            userId,
        })
        await redis.hmset(sessionKey2, {
            data: dataString2,
            // lastModified: lastModified2,
            locationId: locationId2,
            userId,
        })
        await redis.sadd(userKey, sessionId, sessionId2)
        await expect(
            presenceProxy.getPresenceByUserId(userId),
        ).resolves.toEqual([presence])
    })

    test('get presence which is missing', async () => {
        await redis.hmset(sessionKey, {
            data: dataString,
            lastModified,
            locationId,
            userId,
        })
        await redis.sadd(userKey, sessionId, sessionId2)
        await expect(
            presenceProxy.getPresenceByUserId(userId),
        ).resolves.toEqual([presence])
    })

    test('invalid data', async () => {
        const message =
            'Failed to load presence by userId. => ' +
            'SyntaxError: Unexpected token o in JSON at position 1'
        const name = 'SyncOtError Presence'
        await redis.hmset(sessionKey, {
            data: 'not-json',
            lastModified,
            locationId,
            userId,
        })
        await redis.sadd(userKey, sessionId)
        await expect(presenceProxy.getPresenceByUserId(userId)).rejects.toEqual(
            expect.objectContaining({ message, name }),
        )
    })

    test('invalid lastModified', async () => {
        await redis.hmset(sessionKey, {
            data: dataString,
            lastModified: 'not-a-number',
            locationId,
            userId,
        })
        await redis.sadd(userKey, sessionId)
        await expect(presenceProxy.getPresenceByUserId(userId)).rejects.toEqual(
            expect.objectContaining({
                message:
                    'Failed to load presence by userId. => ' +
                    'SyncOtError InvalidEntity: Invalid "Presence.lastModified".',
                name: 'SyncOtError Presence',
            }),
        )
    })

    test('no authenticated user', async () => {
        authService.active = false
        await expect(presenceProxy.getPresenceByUserId(userId)).rejects.toEqual(
            expect.objectContaining({
                message: 'No authenticated user.',
                name: 'SyncOtError Auth',
            }),
        )
    })

    test('not connected', async () => {
        redis.disconnect()
        await whenClose(redis)
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
        await redis.hmset(sessionKey, {
            data: dataString,
            lastModified,
            locationId,
            userId,
        })
        await redis.sadd(locationKey, sessionId)
        await expect(
            presenceProxy.getPresenceByLocationId(locationId),
        ).resolves.toEqual([presence])
    })

    test('get two presence objects', async () => {
        await redis.hmset(sessionKey, {
            data: dataString,
            lastModified,
            locationId,
            userId,
        })
        await redis.hmset(sessionKey2, {
            data: dataString2,
            lastModified: lastModified2,
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
        await redis.hmset(sessionKey, {
            data: dataString,
            lastModified,
            locationId,
            userId,
        })
        await redis.hmset(sessionKey2, {
            data: dataString2,
            lastModified: lastModified2,
            locationId,
            userId: userId2,
        })
        await redis.sadd(locationKey, sessionId, sessionId2)

        authService.mayReadPresence.mockImplementation(
            loadedPresence => loadedPresence.sessionId === sessionId,
        )
        expect(
            await presenceProxy.getPresenceByLocationId(locationId),
        ).toEqual([presence])
        expect(authService.mayReadPresence).toHaveBeenCalledTimes(2)
        expect(authService.mayReadPresence).toHaveBeenCalledWith(presence)
        expect(authService.mayReadPresence).toHaveBeenCalledWith({
            ...presence,
            locationId,
        })
    })

    test('get presence with missing userId', async () => {
        await redis.hmset(sessionKey, {
            data: dataString,
            lastModified,
            locationId,
            userId,
        })
        await redis.hmset(sessionKey2, {
            data: dataString2,
            lastModified: lastModified2,
            locationId,
            // userId: userId2,
        })
        await redis.sadd(locationKey, sessionId, sessionId2)
        await expect(
            presenceProxy.getPresenceByLocationId(locationId),
        ).resolves.toEqual([presence])
    })

    test('get presence with missing locationId', async () => {
        await redis.hmset(sessionKey, {
            data: dataString,
            lastModified,
            locationId,
            userId,
        })
        await redis.hmset(sessionKey2, {
            data: dataString2,
            lastModified: lastModified2,
            // locationId,
            userId: userId2,
        })
        await redis.sadd(locationKey, sessionId, sessionId2)
        await expect(
            presenceProxy.getPresenceByLocationId(locationId),
        ).resolves.toEqual([presence])
    })

    test('get presence with missing data', async () => {
        await redis.hmset(sessionKey, {
            data: dataString,
            lastModified,
            locationId,
            userId,
        })
        await redis.hmset(sessionKey2, {
            // data: dataString2,
            lastModified: lastModified2,
            locationId,
            userId: userId2,
        })
        await redis.sadd(locationKey, sessionId, sessionId2)
        await expect(
            presenceProxy.getPresenceByLocationId(locationId),
        ).resolves.toEqual([presence])
    })

    test('get presence with missing lastModified', async () => {
        await redis.hmset(sessionKey, {
            data: dataString,
            lastModified,
            locationId,
            userId,
        })
        await redis.hmset(sessionKey2, {
            data: dataString2,
            // lastModified: lastModified2,
            locationId,
            userId: userId2,
        })
        await redis.sadd(locationKey, sessionId, sessionId2)
        await expect(
            presenceProxy.getPresenceByLocationId(locationId),
        ).resolves.toEqual([presence])
    })

    test('get presence which is missing', async () => {
        await redis.hmset(sessionKey, {
            data: dataString,
            lastModified,
            locationId,
            userId,
        })
        await redis.sadd(locationKey, sessionId, sessionId2)
        await expect(
            presenceProxy.getPresenceByLocationId(locationId),
        ).resolves.toEqual([presence])
    })

    test('invalid data', async () => {
        const message =
            'Failed to load presence by locationId. => ' +
            'SyntaxError: Unexpected token o in JSON at position 1'
        const name = 'SyncOtError Presence'
        await redis.hmset(sessionKey, {
            data: 'not-json',
            lastModified,
            locationId,
            userId,
        })
        await redis.sadd(locationKey, sessionId)
        await expect(
            presenceProxy.getPresenceByLocationId(locationId),
        ).rejects.toEqual(
            expect.objectContaining({
                message,
                name,
            }),
        )
    })

    test('invalid lastModified', async () => {
        await redis.hmset(sessionKey, {
            data: dataString,
            lastModified: 'not-a-number',
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
                    'SyncOtError InvalidEntity: Invalid "Presence.lastModified".',
                name: 'SyncOtError Presence',
            }),
        )
    })

    test('no authenticated user', async () => {
        authService.active = false
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
        await whenClose(redis)
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
    test('no authenticated user', async () => {
        authService.active = false
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
        const presenceStream1 = await presenceProxy.streamPresenceBySessionId(
            sessionId,
        )
        const presenceStream2 = await presenceProxy.streamPresenceBySessionId(
            sessionId,
        )
        presenceService.destroy()
        await Promise.all([
            whenClose(presenceStream1),
            whenClose(presenceStream2),
        ])
    })

    test('stream error handling', async () => {
        const onError = jest.fn()
        const presenceStream = await presenceProxy.streamPresenceBySessionId(
            sessionId,
        )
        presenceStream.on('error', onError)
        stream1.destroy()
        await Promise.all([
            whenError(presenceStream),
            whenClose(presenceStream),
        ])
        expect(onError).toHaveBeenCalledTimes(1)
        expect(onError).toHaveBeenCalledWith(
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
        await redis.ping()
        await redis.ping()
        expect(onData).toHaveBeenCalledTimes(0)
        presenceStream.destroy()
        await whenClose(presenceStream)
    })

    test('start with some presence', async () => {
        presenceProxy.submitPresence(presence)
        await whenMessage(sessionKey, sessionId)

        const onData = jest.fn()
        const presenceStream = await presenceProxy.streamPresenceBySessionId(
            sessionId,
        )
        presenceStream.on('data', onData)
        await whenCalled(onData)
        expect(onData).toHaveBeenCalledTimes(1)
        expect(onData).toHaveBeenCalledWith([
            true,
            { ...presence, lastModified: expect.toBeNumber() },
        ])
        presenceStream.destroy()
        await whenClose(presenceStream)
    })

    test('remove presence on redis disconnect', async () => {
        await redis.hmset(sessionKey, {
            data: dataString,
            lastModified,
            locationId,
            userId,
        })
        const presenceStream = await presenceProxy.streamPresenceBySessionId(
            sessionId,
        )
        await whenData(presenceStream)

        const onData = jest.fn()
        presenceStream.on('data', onData)
        redis.disconnect()
        await whenData(presenceStream)
        expect(onData).toHaveBeenCalledTimes(1)
        expect(onData).toHaveBeenCalledWith([false, sessionId])

        presenceStream.destroy()
        await redis.connect()
    })

    test('load presence on redis reconnect', async () => {
        const onData = jest.fn()
        const presenceStream = await presenceProxy.streamPresenceBySessionId(
            sessionId,
        )
        presenceStream.on('data', onData)
        await redis.ping()
        await redis.ping()
        await redis.ping()
        await redis.ping()
        await redis2.hmset(sessionKey, {
            data: dataString,
            lastModified,
            locationId,
            userId,
        })
        expect(onData).toHaveBeenCalledTimes(0)

        redis.disconnect()
        await whenClose(redis)
        redis.connect()
        await whenData(presenceStream)
        expect(onData).toHaveBeenCalledTimes(1)
        expect(onData).toHaveBeenCalledWith([true, presence])
        presenceStream.destroy()
        await whenClose(presenceStream)
    })

    test('do not load presence on redis reconnect when redisSubscriber is disconnected', async () => {
        const onData = jest.fn()
        const presenceStream = await presenceProxy.streamPresenceBySessionId(
            sessionId,
        )
        presenceStream.on('data', onData)
        await redis.ping()
        await redis.ping()
        await redis.ping()
        await redis.ping()
        await redis2.hmset(sessionKey, {
            data: dataString,
            lastModified,
            locationId,
            userId,
        })
        redisSubscriber.disconnect()
        await whenClose(redisSubscriber)
        redis.disconnect()
        await whenClose(redis)
        redis.connect()
        await whenEvent('connectionId')(getRedisConnectionManager(redis))
        await delay(50)
        expect(onData).toHaveBeenCalledTimes(0)
        presenceStream.destroy()
        await whenClose(presenceStream)
    })

    test('load presence on redisSubscriber reconnect', async () => {
        const onData = jest.fn()
        const presenceStream = await presenceProxy.streamPresenceBySessionId(
            sessionId,
        )
        presenceStream.on('data', onData)
        await redis.ping()
        await redis.ping()
        await redis.ping()
        await redis.ping()
        await redis2.hmset(sessionKey, {
            data: dataString,
            lastModified,
            locationId,
            userId,
        })
        expect(onData).toHaveBeenCalledTimes(0)

        redisSubscriber.disconnect()
        await whenClose(redisSubscriber)
        redisSubscriber.connect()
        await whenData(presenceStream)
        expect(onData).toHaveBeenCalledTimes(1)
        expect(onData).toHaveBeenCalledWith([true, presence])
        presenceStream.destroy()
        await whenClose(presenceStream)
    })

    test('remove presence on redisSubscriber reconnect - loading failure', async () => {
        await presenceProxy.submitPresence(presence)
        await whenMessage(sessionKey, sessionId)

        const presenceStream = await presenceProxy.streamPresenceBySessionId(
            sessionId,
        )
        const onData = jest.fn()
        const onError = jest.fn()
        presenceStream.on('data', onData)
        presenceService.on('error', onError)
        await whenData(presenceStream)
        expect(onData).toHaveBeenCalledTimes(1)
        expect(onData).toHaveBeenCalledWith([
            true,
            { ...presence, lastModified: expect.toBeNumber() },
        ])
        expect(onError).toHaveBeenCalledTimes(0)
        onData.mockClear()

        redisSubscriber.disconnect()
        await Promise.all([
            whenData(presenceStream),
            whenClose(redisSubscriber),
        ])
        expect(onData).toHaveBeenCalledTimes(1)
        expect(onData).toHaveBeenCalledWith([false, sessionId])

        authService.mayReadPresence.mockImplementation(throwTestError)
        await Promise.all([
            redisSubscriber.connect(),
            whenError(presenceService),
        ])
        expect(onError).toHaveBeenCalledTimes(1)
        expect(onError).toHaveBeenCalledWith(
            expect.objectContaining({
                cause: expect.objectContaining({
                    message: 'test error',
                    name: 'Error',
                }),
                message:
                    'Failed to load presence by sessionId. => Error: test error',
                name: 'SyncOtError Presence',
            }),
        )

        presenceStream.destroy()
        await whenClose(presenceStream)
    })

    test('add presence on message', async () => {
        const onData = jest.fn()
        const presenceStream = await presenceProxy.streamPresenceBySessionId(
            sessionId,
        )
        presenceStream.on('data', onData)
        await redis.ping()
        await redis.ping()
        expect(onData).toHaveBeenCalledTimes(0)

        await presenceProxy.submitPresence(presence)
        await whenData(presenceStream)
        expect(onData).toHaveBeenCalledTimes(1)
        expect(onData).toHaveBeenCalledWith([
            true,
            { ...presence, lastModified: expect.toBeNumber() },
        ])
        presenceStream.destroy()
        await whenClose(presenceStream)
    })

    test('remove presence on message', async () => {
        await presenceProxy.submitPresence(presence)
        await whenMessage(sessionKey, sessionId)

        const presenceStream = await presenceProxy.streamPresenceBySessionId(
            sessionId,
        )
        await whenData(presenceStream)

        const onData = jest.fn()
        presenceStream.on('data', onData)
        await presenceProxy.removePresence()
        await whenData(presenceStream)
        expect(onData).toHaveBeenCalledTimes(1)
        expect(onData).toHaveBeenCalledWith([false, sessionId])
        presenceStream.destroy()
        await whenClose(presenceStream)
    })

    test('remove presence on message - loading failure', async () => {
        await presenceProxy.submitPresence(presence)
        await whenMessage(sessionKey, sessionId)

        const presenceStream = await presenceProxy.streamPresenceBySessionId(
            sessionId,
        )
        await whenData(presenceStream)

        const onError = jest.fn()
        const onData = jest.fn()
        presenceService.on('error', onError)
        presenceStream.on('data', onData)

        authService.mayReadPresence.mockImplementation(throwTestError)
        redis.publish(sessionKey, sessionId)
        await Promise.all([
            whenError(presenceService),
            whenData(presenceStream),
        ])
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
        await whenClose(presenceStream)
    })

    test('remove presence on message - no connection', async () => {
        await presenceProxy.submitPresence(presence)
        await whenMessage(sessionKey, sessionId)

        const presenceStream = await presenceProxy.streamPresenceBySessionId(
            sessionId,
        )
        await whenData(presenceStream)

        redis.disconnect()
        await whenData(presenceStream)

        authService.mayReadPresence.mockClear()
        await redis2.publish(sessionKey, sessionId)
        await redis2.ping()
        await redis2.ping()
        expect(authService.mayReadPresence).toHaveBeenCalledTimes(0)

        presenceStream.destroy()
        await whenClose(presenceStream)
        await redis.connect()
    })
})

// Most of the streamPresenceByUserId implementation is shared with streamPresenceBySessionId,
// so the tests cover only the differences between the two functions.
describe('streamPresenceByUserId', () => {
    let presenceStream: Duplex

    beforeEach(async () => {
        await redis.hmset(sessionKey, {
            data: dataString,
            lastModified,
            locationId,
            userId,
        })
        await redis.hmset(sessionKey2, {
            data: dataString2,
            lastModified: lastModified2,
            locationId: locationId2,
            userId,
        })
        await redis.sadd(userKey, sessionId, sessionId2)
        presenceStream = await presenceProxy.streamPresenceByUserId(userId)
    })

    afterEach(async () => {
        presenceStream.destroy()
        await whenClose(presenceStream)
    })

    test('load 2 presence objects', async () => {
        const onData = jest.fn()
        presenceStream.on('data', onData)
        await whenData(presenceStream)
        expect(onData).toHaveBeenCalledTimes(1)
        expect(onData.mock.calls[0][0]).toBeArray()
        expect(onData.mock.calls[0][0].length).toBe(3)
        expect(onData.mock.calls[0][0][0]).toBe(true)
        expect(onData.mock.calls[0][0]).toContainEqual(presence)
        expect(onData.mock.calls[0][0]).toContainEqual({ ...presence2, userId })
    })

    test('update a presence object', async () => {
        await whenData(presenceStream)
        const onData = jest.fn()
        presenceStream.on('data', onData)

        await redis.hmset(sessionKey2, {
            data: dataString2,
            lastModified: lastModified2 + 1,
            locationId,
            userId,
        })
        redis.publish(userKey, sessionId2)
        await whenData(presenceStream)
        expect(onData).toHaveBeenCalledTimes(1)
        expect(onData).toHaveBeenCalledWith([
            true,
            {
                ...presence2,
                lastModified: lastModified2 + 1,
                locationId,
                userId,
            },
        ])
    })

    test('remove and add a presence object', async () => {
        await whenData(presenceStream)
        const onData = jest.fn()
        presenceStream.on('data', onData)

        await redis.del(sessionKey2)
        redis.publish(userKey, sessionId2)
        await whenData(presenceStream)
        expect(onData).toHaveBeenCalledTimes(1)
        expect(onData).toHaveBeenCalledWith([false, sessionId2])

        onData.mockClear()
        await redis.hmset(sessionKey2, {
            data: dataString2,
            lastModified: lastModified2,
            locationId: locationId2,
            userId,
        })
        redis.publish(userKey, sessionId2)
        await whenData(presenceStream)
        expect(onData).toHaveBeenCalledTimes(1)
        expect(onData).toHaveBeenCalledWith([true, { ...presence2, userId }])
    })

    test('update userId', async () => {
        await whenData(presenceStream)
        const onData = jest.fn()
        presenceStream.on('data', onData)

        await redis.hmset(sessionKey2, {
            data: dataString2,
            lastModified: lastModified2,
            locationId: locationId2,
            userId: userId2,
        })
        redis.publish(userKey, sessionId2)
        await whenData(presenceStream)
        expect(onData).toHaveBeenCalledTimes(1)
        expect(onData).toHaveBeenCalledWith([false, sessionId2])

        onData.mockClear()
        await redis.hmset(sessionKey2, {
            data: dataString2,
            lastModified: lastModified2,
            locationId: locationId2,
            userId,
        })
        redis.publish(userKey, sessionId2)
        await whenData(presenceStream)
        expect(onData).toHaveBeenCalledTimes(1)
        expect(onData).toHaveBeenCalledWith([true, { ...presence2, userId }])
    })
})

// Most of the streamPresenceByLocationId implementation is shared with streamPresenceBySessionId,
// so the tests cover only the differences between the two functions.
describe('streamPresenceByLocationId', () => {
    let presenceStream: Duplex

    beforeEach(async () => {
        await redis.hmset(sessionKey, {
            data: dataString,
            lastModified,
            locationId,
            userId,
        })
        await redis.hmset(sessionKey2, {
            data: dataString2,
            lastModified: lastModified2,
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
        await whenClose(presenceStream)
    })

    test('load 2 presence objects', async () => {
        const onData = jest.fn()
        presenceStream.on('data', onData)
        await whenData(presenceStream)
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
        await whenData(presenceStream)
        const onData = jest.fn()
        presenceStream.on('data', onData)

        await redis.hmset(sessionKey2, {
            data: dataString2,
            lastModified: lastModified2 + 1,
            locationId,
            userId,
        })
        redis.publish(locationKey, sessionId2)
        await whenData(presenceStream)
        expect(onData).toHaveBeenCalledTimes(1)
        expect(onData).toHaveBeenCalledWith([
            true,
            {
                ...presence2,
                lastModified: lastModified2 + 1,
                locationId,
                userId,
            },
        ])
    })

    test('remove and add a presence object', async () => {
        await whenData(presenceStream)
        const onData = jest.fn()
        presenceStream.on('data', onData)

        await redis.del(sessionKey2)
        redis.publish(locationKey, sessionId2)
        await whenData(presenceStream)
        expect(onData).toHaveBeenCalledTimes(1)
        expect(onData).toHaveBeenCalledWith([false, sessionId2])

        onData.mockClear()
        await redis.hmset(sessionKey2, {
            data: dataString2,
            lastModified: lastModified2,
            locationId,
            userId: userId2,
        })
        redis.publish(locationKey, sessionId2)
        await whenData(presenceStream)
        expect(onData).toHaveBeenCalledTimes(1)
        expect(onData).toHaveBeenCalledWith([
            true,
            { ...presence2, locationId },
        ])
    })

    test('update locationId', async () => {
        await whenData(presenceStream)
        const onData = jest.fn()
        presenceStream.on('data', onData)

        await redis.hmset(sessionKey2, {
            data: dataString2,
            lastModified: lastModified2,
            locationId: locationId2,
            userId: userId2,
        })
        redis.publish(locationKey, sessionId2)
        await whenData(presenceStream)
        expect(onData).toHaveBeenCalledTimes(1)
        expect(onData).toHaveBeenCalledWith([false, sessionId2])

        onData.mockClear()
        await redis.hmset(sessionKey2, {
            data: dataString2,
            lastModified: lastModified2,
            locationId,
            userId: userId2,
        })
        redis.publish(locationKey, sessionId2)
        await whenData(presenceStream)
        expect(onData).toHaveBeenCalledTimes(1)
        expect(onData).toHaveBeenCalledWith([
            true,
            { ...presence2, locationId },
        ])
    })
})
