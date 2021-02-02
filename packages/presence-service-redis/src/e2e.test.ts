import { Auth, AuthEvents } from '@syncot/auth'
import { Connection, createConnection } from '@syncot/connection'
import { Presence, PresenceClient, PresenceService } from '@syncot/presence'
import { createPresenceClient } from '@syncot/presence-client'
import {
    invertedStreams,
    randomInteger,
    TypedEventEmitter,
    whenClose,
    whenData,
} from '@syncot/util'
import Redis from 'ioredis'
import { Duplex } from 'readable-stream'
import RedisServer from 'redis-server'
import { createPresenceService } from '.'

let port: number
let redisOptions: Redis.RedisOptions
let redisServer: RedisServer
let session1: Session
let session2: Session

class MockAuthService extends TypedEventEmitter<AuthEvents> implements Auth {
    public active: boolean = true
    public sessionId: string | undefined = undefined
    public userId: string | undefined = undefined
    public logIn = jest.fn()
    public logOut = jest.fn()
    public mayReadContent = jest.fn().mockResolvedValue(true)
    public mayWriteContent = jest.fn().mockResolvedValue(true)
    public mayReadPresence = jest.fn().mockResolvedValue(true)
    public mayWritePresence = jest.fn().mockResolvedValue(true)
    public constructor(sessionId: string, userId: string) {
        super()
        this.sessionId = sessionId
        this.userId = userId
    }
}

class MockAuthClient extends TypedEventEmitter<AuthEvents> implements Auth {
    public active: boolean = true
    public sessionId: string | undefined = undefined
    public userId: string | undefined = undefined
    public logIn = jest.fn()
    public logOut = jest.fn()
    public mayReadContent = jest.fn().mockResolvedValue(true)
    public mayWriteContent = jest.fn().mockResolvedValue(true)
    public mayReadPresence = jest.fn().mockResolvedValue(true)
    public mayWritePresence = jest.fn().mockResolvedValue(true)
    public constructor(sessionId: string, userId: string) {
        super()
        this.sessionId = sessionId
        this.userId = userId
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

        this.authService = new MockAuthService(this.sessionId, this.userId)
        this.authClient = new MockAuthClient(this.sessionId, this.userId)

        this.presenceService = createPresenceService({
            auth: this.authService,
            connection: this.serviceConnection,
            redis: this.redis,
            redisSubscriber: this.redisSubscriber,
        })
        this.presenceClient = createPresenceClient({
            auth: this.authClient,
            connection: this.clientConnection,
        })
    }

    public async init(): Promise<void> {
        await this.redis.connect()
        await this.redisSubscriber.connect()
    }

    public destroy(): void {
        this.redis.disconnect()
        this.redisSubscriber.disconnect()
        this.serviceConnection.disconnect()
        this.clientConnection.disconnect()
    }
}

beforeEach(async () => {
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
            break
        } catch (error) {
            if (attempt++ > 10) {
                throw error
            }
        }
    }

    session1 = new Session('1')
    session2 = new Session('2')
    await Promise.all([session1.init(), session2.init()])
})

afterEach(async () => {
    session1.destroy()
    session2.destroy()
    if (redisServer) {
        await redisServer.close()
    }
})

test('submit 2 presence objects which share nothing', async () => {
    const onSession1Data = jest.fn()
    const onSession2Data = jest.fn()
    const onUserData = jest.fn()
    const onLocationData = jest.fn()
    const session1Stream = await session1.presenceClient.streamPresenceBySessionId(
        session1.sessionId,
    )
    const session2Stream = await session1.presenceClient.streamPresenceBySessionId(
        session2.sessionId,
    )
    const userStream = await session1.presenceClient.streamPresenceByUserId(
        session2.userId,
    )
    const locationStream = await session1.presenceClient.streamPresenceByLocationId(
        session2.locationId,
    )
    session1Stream.on('data', onSession1Data)
    session2Stream.on('data', onSession2Data)
    userStream.on('data', onUserData)
    locationStream.on('data', onLocationData)

    // Add presence 1.
    session1.presenceClient.locationId = session1.locationId
    session1.presenceClient.data = session1.data
    await whenData(session1Stream)

    // Add presence 2.
    session2.presenceClient.locationId = session2.locationId
    session2.presenceClient.data = session2.data
    await Promise.all([
        whenData(session2Stream),
        whenData(userStream),
        whenData(locationStream),
    ])

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

    expect(onSession1Data).toHaveBeenCalledTimes(1)
    expect(onSession1Data).toHaveBeenCalledWith([
        true,
        session1.presenceMatcher,
    ])
    expect(onSession2Data).toHaveBeenCalledTimes(1)
    expect(onSession2Data).toHaveBeenCalledWith([
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

    session1Stream.destroy()
    session2Stream.destroy()
    userStream.destroy()
    locationStream.destroy()
    await Promise.all([
        whenClose(session1Stream),
        whenClose(session2Stream),
        whenClose(userStream),
        whenClose(locationStream),
    ])
})

test('submit 2 presence objects which share the same location', async () => {
    const onSession1Data = jest.fn()
    const onSession2Data = jest.fn()
    const onUserData = jest.fn()
    const onLocationData = jest.fn()
    const session1Stream = await session1.presenceClient.streamPresenceBySessionId(
        session1.sessionId,
    )
    const session2Stream = await session1.presenceClient.streamPresenceBySessionId(
        session2.sessionId,
    )
    const userStream = await session1.presenceClient.streamPresenceByUserId(
        session2.userId,
    )
    const locationStream = await session1.presenceClient.streamPresenceByLocationId(
        session1.locationId,
    )
    session1Stream.on('data', onSession1Data)
    session2Stream.on('data', onSession2Data)
    userStream.on('data', onUserData)
    locationStream.on('data', onLocationData)

    // Add presence 1.
    session1.presenceClient.locationId = session1.locationId
    session1.presenceClient.data = session1.data
    await Promise.all([whenData(session1Stream), whenData(locationStream)])

    // Add presence 2.
    session2.presenceClient.locationId = session1.locationId
    session2.presenceClient.data = session2.data
    await Promise.all([
        whenData(session2Stream),
        whenData(locationStream),
        whenData(userStream),
    ])

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

    expect(onSession1Data).toHaveBeenCalledTimes(1)
    expect(onSession1Data).toHaveBeenCalledWith([
        true,
        session1.presenceMatcher,
    ])

    expect(onSession2Data).toHaveBeenCalledTimes(1)
    expect(onSession2Data).toHaveBeenCalledWith([
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

    session1Stream.destroy()
    session2Stream.destroy()
    userStream.destroy()
    locationStream.destroy()
    await Promise.all([
        whenClose(session1Stream),
        whenClose(session2Stream),
        whenClose(userStream),
        whenClose(locationStream),
    ])
})

test('remove one presence object', async () => {
    const onSession1Data = jest.fn()
    const onSession2Data = jest.fn()
    const onUserData = jest.fn()
    const onLocationData = jest.fn()
    const session1Stream = await session1.presenceClient.streamPresenceBySessionId(
        session1.sessionId,
    )
    const session2Stream = await session1.presenceClient.streamPresenceBySessionId(
        session2.sessionId,
    )
    const userStream = await session1.presenceClient.streamPresenceByUserId(
        session2.userId,
    )
    const locationStream = await session1.presenceClient.streamPresenceByLocationId(
        session2.locationId,
    )
    session1Stream.on('data', onSession1Data)
    session2Stream.on('data', onSession2Data)
    userStream.on('data', onUserData)
    locationStream.on('data', onLocationData)

    // Add presence 1.
    session1.presenceClient.locationId = session1.locationId
    session1.presenceClient.data = session1.data
    await whenData(session1Stream)

    // Add presence 2.
    session2.presenceClient.locationId = session2.locationId
    session2.presenceClient.data = session2.data
    await Promise.all([
        whenData(session2Stream),
        whenData(locationStream),
        whenData(userStream),
    ])

    // Remove presence 2.
    session2.presenceClient.locationId = undefined
    await Promise.all([
        whenData(session2Stream),
        whenData(locationStream),
        whenData(userStream),
    ])

    await expect(
        session1.presenceClient.getPresenceBySessionId(session1.sessionId),
    ).resolves.toEqual(session1.presenceMatcher)
    await expect(
        session1.presenceClient.getPresenceBySessionId(session2.sessionId),
    ).resolves.toBeNull()
    await expect(
        session1.presenceClient.getPresenceBySessionId('does-not-exist'),
    ).resolves.toBeNull()

    expect(onSession1Data).toHaveBeenCalledTimes(1)
    expect(onSession1Data).toHaveBeenNthCalledWith(1, [
        true,
        session1.presenceMatcher,
    ])

    expect(onSession2Data).toHaveBeenCalledTimes(2)
    expect(onSession2Data).toHaveBeenNthCalledWith(1, [
        true,
        session2.presenceMatcher,
    ])
    expect(onSession2Data).toHaveBeenNthCalledWith(2, [
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

    session1Stream.destroy()
    session2Stream.destroy()
    userStream.destroy()
    locationStream.destroy()
    await Promise.all([
        whenClose(session1Stream),
        whenClose(session2Stream),
        whenClose(userStream),
        whenClose(locationStream),
    ])
})
