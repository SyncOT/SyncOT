import { AuthClient, AuthEvents, AuthService } from '@syncot/auth'
import { Connection, createConnection } from '@syncot/connection'
import { Presence, PresenceClient, PresenceService } from '@syncot/presence'
import { createPresenceClient } from '@syncot/presence-client'
import { SessionEvents, SessionManager } from '@syncot/session'
import {
    delay,
    invertedStreams,
    randomInteger,
    SyncOtEmitter,
} from '@syncot/util'
import { EventEmitter } from 'events'
import Redis from 'ioredis'
import { Duplex } from 'readable-stream'
import RedisServer from 'redis-server'
import { createPresenceService } from '.'

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
let redisOptions: Redis.RedisOptions
let redisServer: RedisServer
let redis: Redis.Redis
let monitor: EventEmitter
let session1: Session
let session2: Session

class MockAuthService extends SyncOtEmitter<AuthEvents> implements AuthService {
    public getUserId = jest.fn()
    public hasUserId = jest.fn().mockReturnValue(true)
    public hasAuthenticatedUserId = jest.fn().mockReturnValue(true)
    public mayReadDocument = jest.fn().mockResolvedValue(true)
    public mayWriteDocument = jest.fn().mockResolvedValue(true)
    public mayReadPresence = jest.fn().mockResolvedValue(true)
    public mayWritePresence = jest.fn().mockResolvedValue(true)
    public constructor(userId: string) {
        super()
        this.getUserId.mockReturnValue(userId)
    }
}

class MockAuthClient extends SyncOtEmitter<AuthEvents> implements AuthClient {
    public getUserId = jest.fn()
    public hasUserId = jest.fn().mockReturnValue(true)
    public hasAuthenticatedUserId = jest.fn().mockReturnValue(true)
    public constructor(userId: string) {
        super()
        this.getUserId.mockReturnValue(userId)
    }
}

class MockSessionService extends SyncOtEmitter<SessionEvents>
    implements SessionManager {
    public getSessionId = jest.fn()
    public hasSession = jest.fn().mockReturnValue(true)
    public hasActiveSession = jest.fn().mockReturnValue(true)
    public constructor(sessionId: string) {
        super()
        this.getSessionId.mockReturnValue(sessionId)
    }
}

class MockSessionClient extends SyncOtEmitter<SessionEvents>
    implements SessionManager {
    public getSessionId = jest.fn()
    public hasSession = jest.fn().mockReturnValue(true)
    public hasActiveSession = jest.fn().mockReturnValue(true)
    public constructor(sessionId: string) {
        super()
        this.getSessionId.mockReturnValue(sessionId)
    }
}

class Session {
    public readonly sessionId: string
    public readonly userId: string
    public readonly locationId: string
    public readonly data: any
    public readonly lastModified: number = 0
    public readonly presence: Presence
    public readonly presenceMatcher: Presence & { lastModified: any }

    public readonly redis: Redis.Redis
    public readonly redisSubscriber: Redis.Redis

    public readonly serviceStream: Duplex
    public readonly clientStream: Duplex

    public readonly serviceConnection: Connection
    public readonly clientConnection: Connection

    public readonly authService: MockAuthService
    public readonly authClient: MockAuthClient
    public readonly sessionService: MockSessionService
    public readonly sessionClient: MockSessionClient

    public readonly presenceService: PresenceService
    public readonly presenceClient: PresenceClient

    public constructor(name: string) {
        this.sessionId = `test-session-id-${name}`
        this.userId = `test-user-id-${name}`
        this.locationId = `test-location-id-${name}`
        this.data = Object.freeze({ name })
        this.presence = Object.freeze({
            data: this.data,
            lastModified: this.lastModified,
            locationId: this.locationId,
            sessionId: this.sessionId,
            userId: this.userId,
        })
        this.presenceMatcher = {
            ...this.presence,
            lastModified: expect.toBeNumber(),
        }

        this.redis = new Redis(redisOptions)
        this.redisSubscriber = new Redis(redisOptions)

        this.serviceConnection = createConnection()
        this.clientConnection = createConnection()
        ;[this.serviceStream, this.clientStream] = invertedStreams({
            allowHalfOpen: false,
            objectMode: true,
        })
        this.serviceConnection.connect(this.serviceStream)
        this.clientConnection.connect(this.clientStream)

        this.authService = new MockAuthService(this.userId)
        this.authClient = new MockAuthClient(this.userId)
        this.sessionService = new MockSessionService(this.sessionId)
        this.sessionClient = new MockSessionClient(this.sessionId)

        this.presenceService = createPresenceService({
            authService: this.authService,
            connection: this.serviceConnection,
            redis: this.redis,
            redisSubscriber: this.redisSubscriber,
            sessionService: this.sessionService,
        })
        this.presenceClient = createPresenceClient({
            authClient: this.authClient,
            connection: this.clientConnection,
            sessionClient: this.sessionClient,
        })
    }

    public async init(): Promise<void> {
        await this.redis.connect()
        await this.redisSubscriber.connect()
    }

    public destroy(): void {
        this.presenceService.destroy()
        this.presenceClient.destroy()
        this.redis.disconnect()
        this.redisSubscriber.disconnect()
        this.serviceConnection.disconnect()
        this.clientConnection.disconnect()
    }
}

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

beforeEach(async () => {
    redis = new Redis(redisOptions)
    session1 = new Session('1')
    session2 = new Session('2')
    await Promise.all([redis.connect(), session1.init(), session2.init()])
    monitor = await redis.monitor()
})

afterEach(async () => {
    session1.destroy()
    session2.destroy()
    await redis.flushall()
    redis.disconnect()
    ;(monitor as any).disconnect()
})

test('submit 2 presence objects which share nothing', async () => {
    const onPresenceData = jest.fn()
    const onUserData = jest.fn()
    const onLocationData = jest.fn()
    const presenceStream = await session1.presenceClient.streamPresenceBySessionId(
        session2.sessionId,
    )
    const userStream = await session1.presenceClient.streamPresenceByUserId(
        session2.userId,
    )
    const locationStream = await session1.presenceClient.streamPresenceByLocationId(
        session2.locationId,
    )
    presenceStream.on('data', onPresenceData)
    userStream.on('data', onUserData)
    locationStream.on('data', onLocationData)

    // Add presence 1.
    session1.presenceClient.locationId = session1.locationId
    session1.presenceClient.data = session1.data
    await whenRedisCommandExecuted('EXPIRE')

    // Add presence 2.
    session2.presenceClient.locationId = session2.locationId
    session2.presenceClient.data = session2.data
    await whenRedisCommandExecuted('EXPIRE')

    await expect(
        session1.presenceClient.getPresenceBySessionId(session1.sessionId),
    ).resolves.toEqual(session1.presenceMatcher)
    await expect(
        session1.presenceClient.getPresenceBySessionId(session2.sessionId),
    ).resolves.toEqual(session2.presenceMatcher)
    await expect(
        session1.presenceClient.getPresenceBySessionId('does-not-exist'),
    ).resolves.toBeNull()

    await expect(
        session1.presenceClient.getPresenceByUserId(session1.userId),
    ).resolves.toEqual([session1.presenceMatcher])
    await expect(
        session1.presenceClient.getPresenceByUserId(session2.userId),
    ).resolves.toEqual([session2.presenceMatcher])
    await expect(
        session1.presenceClient.getPresenceByUserId('does-not-exist'),
    ).resolves.toEqual([])

    await expect(
        session1.presenceClient.getPresenceByLocationId(session1.locationId),
    ).resolves.toEqual([session1.presenceMatcher])
    await expect(
        session1.presenceClient.getPresenceByLocationId(session2.locationId),
    ).resolves.toEqual([session2.presenceMatcher])
    await expect(
        session1.presenceClient.getPresenceByLocationId('does-not-exist'),
    ).resolves.toEqual([])

    expect(onPresenceData).toHaveBeenCalledTimes(1)
    expect(onPresenceData).toHaveBeenCalledWith([
        true,
        session2.presenceMatcher,
    ])
    expect(onUserData).toHaveBeenCalledTimes(1)
    expect(onUserData).toHaveBeenCalledWith([true, session2.presenceMatcher])
    expect(onLocationData).toHaveBeenCalledTimes(1)
    expect(onLocationData).toHaveBeenCalledWith([
        true,
        session2.presenceMatcher,
    ])
    presenceStream.destroy()
    userStream.destroy()
    locationStream.destroy()
    await delay()
})

test('submit 2 presence objects which share the same location', async () => {
    const onPresenceData = jest.fn()
    const onUserData = jest.fn()
    const onLocationData = jest.fn()
    const presenceStream = await session1.presenceClient.streamPresenceBySessionId(
        session2.sessionId,
    )
    const userStream = await session1.presenceClient.streamPresenceByUserId(
        session2.userId,
    )
    const locationStream = await session1.presenceClient.streamPresenceByLocationId(
        session1.locationId,
    )
    presenceStream.on('data', onPresenceData)
    userStream.on('data', onUserData)
    locationStream.on('data', onLocationData)

    // Add presence 1.
    session1.presenceClient.locationId = session1.locationId
    session1.presenceClient.data = session1.data
    await whenRedisCommandExecuted('EXPIRE')

    // Add presence 2.
    session2.presenceClient.locationId = session1.locationId
    session2.presenceClient.data = session2.data
    await whenRedisCommandExecuted('EXPIRE')

    const presence2Matcher = {
        ...session2.presenceMatcher,
        locationId: session1.locationId,
    }

    await expect(
        session1.presenceClient.getPresenceBySessionId(session1.sessionId),
    ).resolves.toEqual(session1.presenceMatcher)
    await expect(
        session1.presenceClient.getPresenceBySessionId(session2.sessionId),
    ).resolves.toEqual(presence2Matcher)
    await expect(
        session1.presenceClient.getPresenceBySessionId('does-not-exist'),
    ).resolves.toBeNull()

    await expect(
        session1.presenceClient.getPresenceByUserId(session1.userId),
    ).resolves.toEqual([session1.presenceMatcher])
    await expect(
        session1.presenceClient.getPresenceByUserId(session2.userId),
    ).resolves.toEqual([presence2Matcher])
    await expect(
        session1.presenceClient.getPresenceByUserId('does-not-exist'),
    ).resolves.toEqual([])

    const presenceInLocationId1 = await session1.presenceClient.getPresenceByLocationId(
        session1.locationId,
    )
    expect(presenceInLocationId1.length).toBe(2)
    expect(presenceInLocationId1).toContainEqual(session1.presenceMatcher)
    expect(presenceInLocationId1).toContainEqual(presence2Matcher)
    await expect(
        session1.presenceClient.getPresenceByLocationId(session2.locationId),
    ).resolves.toEqual([])
    await expect(
        session1.presenceClient.getPresenceByLocationId('does-not-exist'),
    ).resolves.toEqual([])

    expect(onPresenceData).toHaveBeenCalledTimes(1)
    expect(onPresenceData).toHaveBeenCalledWith([
        true,
        { ...session2.presenceMatcher, locationId: session1.locationId },
    ])
    expect(onUserData).toHaveBeenCalledTimes(1)
    expect(onUserData).toHaveBeenCalledWith([
        true,
        { ...session2.presenceMatcher, locationId: session1.locationId },
    ])
    expect(onLocationData).toHaveBeenCalledTimes(2)
    expect(onLocationData).toHaveBeenNthCalledWith(1, [
        true,
        session1.presenceMatcher,
    ])
    expect(onLocationData).toHaveBeenNthCalledWith(2, [
        true,
        { ...session2.presenceMatcher, locationId: session1.locationId },
    ])
    presenceStream.destroy()
    userStream.destroy()
    locationStream.destroy()
    await delay()
})

test('remove one presence object', async () => {
    const onPresenceData = jest.fn()
    const onUserData = jest.fn()
    const onLocationData = jest.fn()
    const presenceStream = await session1.presenceClient.streamPresenceBySessionId(
        session2.sessionId,
    )
    const userStream = await session1.presenceClient.streamPresenceByUserId(
        session2.userId,
    )
    const locationStream = await session1.presenceClient.streamPresenceByLocationId(
        session2.locationId,
    )
    presenceStream.on('data', onPresenceData)
    userStream.on('data', onUserData)
    locationStream.on('data', onLocationData)

    // Add presence 1.
    session1.presenceClient.locationId = session1.locationId
    session1.presenceClient.data = session1.data
    await whenRedisCommandExecuted('EXPIRE')

    // Add presence 2.
    session2.presenceClient.locationId = session2.locationId
    session2.presenceClient.data = session2.data
    await whenRedisCommandExecuted('EXPIRE')

    // Remove presence 2.
    session2.presenceClient.locationId = undefined
    await whenRedisCommandExecuted('DEL')

    await expect(
        session1.presenceClient.getPresenceBySessionId(session1.sessionId),
    ).resolves.toEqual(session1.presenceMatcher)
    await expect(
        session1.presenceClient.getPresenceBySessionId(session2.sessionId),
    ).resolves.toBeNull()
    await expect(
        session1.presenceClient.getPresenceBySessionId('does-not-exist'),
    ).resolves.toBeNull()

    expect(onPresenceData).toHaveBeenCalledTimes(2)
    expect(onPresenceData).toHaveBeenNthCalledWith(1, [
        true,
        session2.presenceMatcher,
    ])
    expect(onPresenceData).toHaveBeenNthCalledWith(2, [
        false,
        session2.sessionId,
    ])
    expect(onUserData).toHaveBeenCalledTimes(2)
    expect(onUserData).toHaveBeenNthCalledWith(1, [
        true,
        session2.presenceMatcher,
    ])
    expect(onUserData).toHaveBeenNthCalledWith(2, [false, session2.sessionId])
    expect(onLocationData).toHaveBeenCalledTimes(2)
    expect(onLocationData).toHaveBeenNthCalledWith(1, [
        true,
        session2.presenceMatcher,
    ])
    expect(onLocationData).toHaveBeenNthCalledWith(2, [
        false,
        session2.sessionId,
    ])
    presenceStream.destroy()
    userStream.destroy()
    locationStream.destroy()
    await delay()
})
