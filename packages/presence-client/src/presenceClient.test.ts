import { AuthClient, AuthEvents } from '@syncot/auth'
import { Connection, createConnection } from '@syncot/connection'
import { SyncOTEmitter } from '@syncot/events'
import {
    Presence,
    PresenceClient,
    PresenceService,
    PresenceServiceEvents,
} from '@syncot/presence'
import { invertedStreams } from '@syncot/stream'
import { whenNextTick } from '@syncot/util'
import { install as installClock, InstalledClock } from '@sinonjs/fake-timers'
import { Duplex, Stream } from 'readable-stream'
import { createPresenceClient } from '.'
import { requestNames } from './presenceClient'

const testError = new Error('test-error')
const testErrorMatcher = expect.objectContaining({
    message: 'test-error',
    name: 'Error',
})
const syncErrorMatcher = expect.objectContaining({
    cause: testErrorMatcher,
    message: 'Failed to sync presence. => Error: test-error',
    name: 'SyncOTError Presence',
})

const now = 12345
let clock: InstalledClock

const userId = 'test-user-id'
const sessionId = 'test-session-id'
const locationId = 'test-location-id'
const data = { key: 'value' }
const presence: Presence = {
    data,
    lastModified: now,
    locationId,
    sessionId,
    userId,
}

let clientStream: Duplex
let serverStream: Duplex
let clientConnection: Connection
let serverConnection: Connection
let authClient: MockAuthClient
let presenceService: MockPresenceService
let presenceClient: PresenceClient

class MockAuthClient extends SyncOTEmitter<AuthEvents> implements AuthClient {
    public active = true
    public sessionId = sessionId
    public userId = userId
}

class MockPresenceService
    extends SyncOTEmitter<PresenceServiceEvents>
    implements PresenceService {
    public submitPresence = jest
        .fn<Promise<void>, [Presence]>()
        .mockResolvedValue(undefined)
    public removePresence = jest
        .fn<Promise<void>, []>()
        .mockResolvedValue(undefined)
    public getPresenceBySessionId = jest
        .fn<Promise<Presence | null>, [string]>()
        .mockResolvedValue(null)
    public getPresenceByLocationId = jest
        .fn<Promise<Presence[]>, [string]>()
        .mockResolvedValue([])
    public getPresenceByUserId = jest
        .fn<Promise<Presence[]>, [string]>()
        .mockResolvedValue([])
    public streamPresenceBySessionId = jest
        .fn<Promise<Duplex>, [string]>()
        .mockRejectedValue(testError)
    public streamPresenceByLocationId = jest
        .fn<Promise<Duplex>, [string]>()
        .mockRejectedValue(testError)
    public streamPresenceByUserId = jest
        .fn<Promise<Duplex>, [string]>()
        .mockRejectedValue(testError)
}

const whenPresence = () =>
    new Promise((resolve) => presenceClient.once('presence', resolve))

const whenActive = () =>
    new Promise((resolve) => presenceClient.once('active', resolve))

const whenInactive = () =>
    new Promise((resolve) => presenceClient.once('inactive', resolve))

const whenDestroy = () =>
    new Promise((resolve) => presenceClient.once('destroy', resolve))

const whenSyncError = () =>
    new Promise((resolve, reject) =>
        presenceClient.once('error', (error) => {
            try {
                expect(error).toEqual(syncErrorMatcher)
                resolve()
            } catch (error) {
                reject(error)
            }
        }),
    )

const whenStreamData = (
    stream: Duplex,
    expectedData: string | number | boolean,
) =>
    new Promise((resolve, reject) =>
        stream.once('data', (streamData) => {
            try {
                expect(streamData).toBe(expectedData)
                resolve()
            } catch (error) {
                reject(error)
            }
        }),
    )

function initPresenceClient(): void {
    presenceClient = createPresenceClient({
        authClient,
        connection: clientConnection,
    })
}

beforeEach(() => {
    clock = installClock({ now })
    clientConnection = createConnection()
    serverConnection = createConnection()
    ;[clientStream, serverStream] = invertedStreams({
        allowHalfOpen: false,
        objectMode: true,
    })
    clientConnection.connect(clientStream)
    serverConnection.connect(serverStream)
    authClient = new MockAuthClient()
    presenceService = new MockPresenceService()
    serverConnection.registerService({
        instance: presenceService,
        name: 'presence',
        requestNames,
    })
})

afterEach(() => {
    expect(clock.countTimers()).toBe(0)
    clock.uninstall()
    clientConnection.destroy()
    serverConnection.destroy()
    // Ensure instances are not reused between tests.
    presenceClient = undefined as any
})

test('invalid connection (missing)', () => {
    expect(() =>
        createPresenceClient({
            authClient,
            connection: undefined as any,
        }),
    ).toThrow(
        expect.objectContaining({
            message:
                'Argument "connection" must be a non-destroyed Connection.',
            name: 'SyncOTError Assert',
        }),
    )
})

test('invalid connection (destroyed)', () => {
    clientConnection.destroy()
    expect(() =>
        createPresenceClient({
            authClient,
            connection: clientConnection,
        }),
    ).toThrow(
        expect.objectContaining({
            message:
                'Argument "connection" must be a non-destroyed Connection.',
            name: 'SyncOTError Assert',
        }),
    )
})

test('destroy on connection destroy', async () => {
    initPresenceClient()
    clientConnection.destroy()
    await whenDestroy()
})

test('invalid authClient (missing)', () => {
    expect(() =>
        createPresenceClient({
            authClient: undefined as any,
            connection: clientConnection,
        }),
    ).toThrow(
        expect.objectContaining({
            message:
                'Argument "authClient" must be a non-destroyed AuthClient.',
            name: 'SyncOTError Assert',
        }),
    )
})

test('invalid authClient (destroyed)', () => {
    authClient.destroy()
    expect(() =>
        createPresenceClient({
            authClient,
            connection: clientConnection,
        }),
    ).toThrow(
        expect.objectContaining({
            message:
                'Argument "authClient" must be a non-destroyed AuthClient.',
            name: 'SyncOTError Assert',
        }),
    )
})

test('destroy on authClient destroy', async () => {
    initPresenceClient()
    authClient.destroy()
    await whenDestroy()
})

test('register twice on the same connection', () => {
    initPresenceClient()
    expect(() =>
        createPresenceClient({
            authClient,
            connection: clientConnection,
        }),
    ).toThrow(
        expect.objectContaining({
            message: 'Proxy "presence" has been already registered.',
            name: 'SyncOTError Assert',
        }),
    )
})

test('destroy', async () => {
    initPresenceClient()
    presenceClient.locationId = locationId
    presenceClient.data = data
    expect(presenceClient.active).toBeTrue()
    expect(presenceClient.sessionId).toBe(sessionId)
    expect(presenceClient.userId).toBe(userId)
    expect(presenceClient.presence).toEqual(presence)
    const onDestroy = jest.fn()
    presenceClient.on('destroy', onDestroy)
    presenceClient.destroy()
    expect(presenceClient.active).toBeFalse()
    expect(presenceClient.sessionId).toBeUndefined()
    expect(presenceClient.userId).toBeUndefined()
    expect(presenceClient.presence).toBeUndefined()
    await whenNextTick()
    expect(onDestroy).toHaveBeenCalledTimes(1)
    presenceClient.destroy()
    await whenNextTick()
    expect(onDestroy).toHaveBeenCalledTimes(1)
})

test('initially active without presence', async () => {
    initPresenceClient()
    const onActive = jest.fn()
    const onInactive = jest.fn()
    presenceClient.on('active', onActive)
    presenceClient.on('inactive', onInactive)
    expect(presenceClient.active).toBeTrue()
    expect(presenceClient.sessionId).toBe(sessionId)
    expect(presenceClient.userId).toBe(userId)
    expect(presenceClient.presence).toBeUndefined()
    await whenNextTick()
    expect(onActive).toHaveBeenCalledTimes(1)
    expect(onInactive).toHaveBeenCalledTimes(0)
    expect(presenceService.submitPresence).toHaveBeenCalledTimes(0)
    expect(presenceService.removePresence).toHaveBeenCalledTimes(0)
})

test('initially active with presence', async () => {
    initPresenceClient()
    presenceClient.locationId = locationId
    presenceClient.data = data
    const onActive = jest.fn()
    const onInactive = jest.fn()
    presenceClient.on('active', onActive)
    presenceClient.on('inactive', onInactive)
    expect(presenceClient.active).toBeTrue()
    expect(presenceClient.sessionId).toBe(sessionId)
    expect(presenceClient.userId).toBe(userId)
    expect(presenceClient.presence).toEqual(presence)
    await whenNextTick()
    expect(onActive).toHaveBeenCalledTimes(1)
    expect(onInactive).toHaveBeenCalledTimes(0)
    expect(presenceService.submitPresence).toHaveBeenCalledTimes(1)
    expect(presenceService.submitPresence).toHaveBeenCalledWith(presence)
    expect(presenceService.removePresence).toHaveBeenCalledTimes(0)
})

test('initially inactive', async () => {
    authClient.active = false
    initPresenceClient()
    const onActive = jest.fn()
    const onInactive = jest.fn()
    presenceClient.on('active', onActive)
    presenceClient.on('inactive', onInactive)
    expect(presenceClient.active).toBeFalse()
    expect(presenceClient.sessionId).toBeUndefined()
    expect(presenceClient.userId).toBeUndefined()
    expect(presenceClient.presence).toBeUndefined()
    await whenNextTick()
    expect(onActive).toHaveBeenCalledTimes(0)
    expect(onInactive).toHaveBeenCalledTimes(0)
    expect(presenceService.submitPresence).toHaveBeenCalledTimes(0)
    expect(presenceService.removePresence).toHaveBeenCalledTimes(0)
})

test('handle AuthClient "active" event without presence', async () => {
    authClient.active = false
    initPresenceClient()
    authClient.active = true
    expect(presenceClient.active).toBeFalse()
    expect(presenceClient.sessionId).toBeUndefined()
    expect(presenceClient.userId).toBeUndefined()
    expect(presenceClient.presence).toBeUndefined()
    authClient.emitAsync('active')
    await whenActive()
    expect(presenceClient.active).toBeTrue()
    expect(presenceClient.sessionId).toBe(sessionId)
    expect(presenceClient.userId).toBe(userId)
    expect(presenceClient.presence).toBeUndefined()
    expect(presenceService.submitPresence).toHaveBeenCalledTimes(0)
    expect(presenceService.removePresence).toHaveBeenCalledTimes(0)
})

test('handle AuthClient "active" event with presence', async () => {
    authClient.active = false
    initPresenceClient()
    presenceClient.locationId = locationId
    presenceClient.data = data
    authClient.active = true
    expect(presenceClient.active).toBeFalse()
    expect(presenceClient.sessionId).toBeUndefined()
    expect(presenceClient.userId).toBeUndefined()
    expect(presenceClient.presence).toBeUndefined()
    authClient.emitAsync('active')
    await whenActive()
    expect(presenceClient.active).toBeTrue()
    expect(presenceClient.sessionId).toBe(sessionId)
    expect(presenceClient.userId).toBe(userId)
    expect(presenceClient.presence).toEqual(presence)
    expect(presenceService.submitPresence).toHaveBeenCalledTimes(1)
    expect(presenceService.submitPresence).toHaveBeenCalledWith(presence)
    expect(presenceService.removePresence).toHaveBeenCalledTimes(0)
})

test('handle AuthClient "inactive" event without presence', async () => {
    initPresenceClient()
    authClient.active = false
    expect(presenceClient.active).toBeTrue()
    expect(presenceClient.sessionId).toBe(sessionId)
    expect(presenceClient.userId).toBe(userId)
    expect(presenceClient.presence).toBeUndefined()
    authClient.emitAsync('inactive')
    await whenInactive()
    expect(presenceClient.active).toBeFalse()
    expect(presenceClient.sessionId).toBeUndefined()
    expect(presenceClient.userId).toBeUndefined()
    expect(presenceClient.presence).toBeUndefined()
    expect(presenceService.submitPresence).toHaveBeenCalledTimes(0)
    expect(presenceService.removePresence).toHaveBeenCalledTimes(0)
})

test('handle AuthClient "inactive" event with presence', async () => {
    initPresenceClient()
    presenceClient.locationId = locationId
    presenceClient.data = data
    authClient.active = false
    expect(presenceClient.active).toBeTrue()
    expect(presenceClient.sessionId).toBe(sessionId)
    expect(presenceClient.userId).toBe(userId)
    expect(presenceClient.presence).toEqual(presence)
    authClient.emitAsync('inactive')
    await whenInactive()
    expect(presenceClient.active).toBeFalse()
    expect(presenceClient.sessionId).toBeUndefined()
    expect(presenceClient.userId).toBeUndefined()
    expect(presenceClient.presence).toBeUndefined()
    expect(presenceService.submitPresence).toHaveBeenCalledTimes(1)
    expect(presenceService.submitPresence).toHaveBeenCalledWith(presence)
    expect(presenceService.removePresence).toHaveBeenCalledTimes(0)
})

test('change locationId when active', async () => {
    const differentLocationId = 'different-location-id'
    const presence1 = { ...presence, data: null }
    const presence2 = {
        ...presence,
        data: null,
        locationId: differentLocationId,
    }
    initPresenceClient()
    presenceClient.locationId = locationId
    expect(presenceClient.presence).toEqual(presence1)
    await whenPresence()
    await whenNextTick()
    expect(presenceService.submitPresence).toHaveBeenCalledTimes(1)
    expect(presenceService.submitPresence).toHaveBeenCalledWith(presence1)
    expect(presenceService.removePresence).toHaveBeenCalledTimes(0)

    presenceService.submitPresence.mockClear()
    presenceClient.locationId = differentLocationId
    expect(presenceClient.presence).toEqual(presence2)
    await whenPresence()
    await whenNextTick()
    expect(presenceService.submitPresence).toHaveBeenCalledTimes(1)
    expect(presenceService.submitPresence).toHaveBeenCalledWith(presence2)
    expect(presenceService.removePresence).toHaveBeenCalledTimes(0)

    presenceService.submitPresence.mockClear()
    presenceClient.locationId = undefined
    expect(presenceClient.presence).toBeUndefined()
    await whenPresence()
    await whenNextTick()
    expect(presenceService.submitPresence).toHaveBeenCalledTimes(0)
    expect(presenceService.removePresence).toHaveBeenCalledTimes(1)
})

test('change data when active', async () => {
    const presence1 = { ...presence, data: null }
    initPresenceClient()
    presenceClient.locationId = locationId
    expect(presenceClient.presence).toEqual(presence1)
    await whenPresence()
    await whenNextTick()
    expect(presenceService.submitPresence).toHaveBeenCalledTimes(1)
    expect(presenceService.submitPresence).toHaveBeenCalledWith(presence1)
    expect(presenceService.removePresence).toHaveBeenCalledTimes(0)

    presenceService.submitPresence.mockClear()
    presenceClient.data = data
    expect(presenceClient.presence).toEqual(presence)
    await whenPresence()
    await whenNextTick()
    expect(presenceService.submitPresence).toHaveBeenCalledTimes(1)
    expect(presenceService.submitPresence).toHaveBeenCalledWith(presence)
    expect(presenceService.removePresence).toHaveBeenCalledTimes(0)
})

test('error when submitting presence', async () => {
    initPresenceClient()
    presenceClient.locationId = locationId
    presenceService.submitPresence.mockRejectedValue(testError)
    await whenSyncError()
    expect(presenceService.submitPresence).toHaveBeenCalledTimes(1)
    expect(presenceService.removePresence).toHaveBeenCalledTimes(0)
})

test('error when removing presence', async () => {
    initPresenceClient()
    presenceClient.locationId = locationId
    await whenNextTick()
    expect(presenceService.submitPresence).toHaveBeenCalledTimes(1)
    presenceClient.locationId = undefined
    presenceService.removePresence.mockRejectedValue(testError)
    await whenSyncError()
    expect(presenceService.submitPresence).toHaveBeenCalledTimes(1)
    expect(presenceService.removePresence).toHaveBeenCalledTimes(1)
})

describe('getPresenceBySessionId', () => {
    beforeEach(initPresenceClient)
    test('success', async () => {
        presenceService.getPresenceBySessionId.mockResolvedValue(presence)
        await expect(
            presenceClient.getPresenceBySessionId(sessionId),
        ).resolves.toEqual(presence)
        expect(presenceService.getPresenceBySessionId).toHaveBeenCalledTimes(1)
        expect(presenceService.getPresenceBySessionId).toHaveBeenCalledWith(
            sessionId,
        )
    })
    test('error', async () => {
        presenceService.getPresenceBySessionId.mockRejectedValue(testError)
        await expect(
            presenceClient.getPresenceBySessionId(sessionId),
        ).rejects.toEqual(testErrorMatcher)
        expect(presenceService.getPresenceBySessionId).toHaveBeenCalledTimes(1)
        expect(presenceService.getPresenceBySessionId).toHaveBeenCalledWith(
            sessionId,
        )
    })
})

describe('getPresenceByUserId', () => {
    beforeEach(initPresenceClient)
    test('success', async () => {
        presenceService.getPresenceByUserId.mockResolvedValue([presence])
        await expect(
            presenceClient.getPresenceByUserId(userId),
        ).resolves.toEqual([presence])
        expect(presenceService.getPresenceByUserId).toHaveBeenCalledTimes(1)
        expect(presenceService.getPresenceByUserId).toHaveBeenCalledWith(userId)
    })
    test('error', async () => {
        presenceService.getPresenceByUserId.mockRejectedValue(testError)
        await expect(
            presenceClient.getPresenceByUserId(userId),
        ).rejects.toEqual(testErrorMatcher)
        expect(presenceService.getPresenceByUserId).toHaveBeenCalledTimes(1)
        expect(presenceService.getPresenceByUserId).toHaveBeenCalledWith(userId)
    })
})

describe('getPresenceByLocationId', () => {
    beforeEach(initPresenceClient)
    test('success', async () => {
        presenceService.getPresenceByLocationId.mockResolvedValue([presence])
        await expect(
            presenceClient.getPresenceByLocationId(locationId),
        ).resolves.toEqual([presence])
        expect(presenceService.getPresenceByLocationId).toHaveBeenCalledTimes(1)
        expect(presenceService.getPresenceByLocationId).toHaveBeenCalledWith(
            locationId,
        )
    })
    test('error', async () => {
        presenceService.getPresenceByLocationId.mockRejectedValue(testError)
        await expect(
            presenceClient.getPresenceByLocationId(locationId),
        ).rejects.toEqual(testErrorMatcher)
        expect(presenceService.getPresenceByLocationId).toHaveBeenCalledTimes(1)
        expect(presenceService.getPresenceByLocationId).toHaveBeenCalledWith(
            locationId,
        )
    })
})

describe('streamPresenceBySessionId', () => {
    beforeEach(initPresenceClient)
    test('success', async () => {
        const [serviceStream, serviceControllerStream] = invertedStreams({
            objectMode: true,
        })
        presenceService.streamPresenceBySessionId.mockResolvedValue(
            serviceStream,
        )
        const presenceStream = await presenceClient.streamPresenceBySessionId(
            sessionId,
        )
        expect(presenceStream).toBeInstanceOf(Stream)
        expect(presenceService.streamPresenceBySessionId).toHaveBeenCalledTimes(
            1,
        )
        expect(presenceService.streamPresenceBySessionId).toHaveBeenCalledWith(
            sessionId,
        )
        serviceControllerStream.write('test')
        await whenStreamData(presenceStream, 'test')
        presenceStream.destroy()
    })
    test('error', async () => {
        await expect(
            presenceClient.streamPresenceBySessionId(sessionId),
        ).rejects.toEqual(testErrorMatcher)
        expect(presenceService.streamPresenceBySessionId).toHaveBeenCalledTimes(
            1,
        )
        expect(presenceService.streamPresenceBySessionId).toHaveBeenCalledWith(
            sessionId,
        )
    })
})

describe('streamPresenceByUserId', () => {
    beforeEach(initPresenceClient)
    test('success', async () => {
        const [serviceStream, serviceControllerStream] = invertedStreams({
            objectMode: true,
        })
        presenceService.streamPresenceByUserId.mockResolvedValue(serviceStream)
        const presenceStream = await presenceClient.streamPresenceByUserId(
            userId,
        )
        expect(presenceStream).toBeInstanceOf(Stream)
        expect(presenceService.streamPresenceByUserId).toHaveBeenCalledTimes(1)
        expect(presenceService.streamPresenceByUserId).toHaveBeenCalledWith(
            userId,
        )
        serviceControllerStream.write('test')
        await whenStreamData(presenceStream, 'test')
        presenceStream.destroy()
    })
    test('error', async () => {
        await expect(
            presenceClient.streamPresenceByUserId(userId),
        ).rejects.toEqual(testErrorMatcher)
        expect(presenceService.streamPresenceByUserId).toHaveBeenCalledTimes(1)
        expect(presenceService.streamPresenceByUserId).toHaveBeenCalledWith(
            userId,
        )
    })
})

describe('streamPresenceByLocationId', () => {
    beforeEach(initPresenceClient)
    test('success', async () => {
        const [serviceStream, serviceControllerStream] = invertedStreams({
            objectMode: true,
        })
        presenceService.streamPresenceByLocationId.mockResolvedValue(
            serviceStream,
        )
        const presenceStream = await presenceClient.streamPresenceByLocationId(
            locationId,
        )
        expect(presenceStream).toBeInstanceOf(Stream)
        expect(
            presenceService.streamPresenceByLocationId,
        ).toHaveBeenCalledTimes(1)
        expect(presenceService.streamPresenceByLocationId).toHaveBeenCalledWith(
            locationId,
        )
        serviceControllerStream.write('test')
        await whenStreamData(presenceStream, 'test')
        presenceStream.destroy()
    })
    test('error', async () => {
        await expect(
            presenceClient.streamPresenceByLocationId(locationId),
        ).rejects.toEqual(testErrorMatcher)
        expect(
            presenceService.streamPresenceByLocationId,
        ).toHaveBeenCalledTimes(1)
        expect(presenceService.streamPresenceByLocationId).toHaveBeenCalledWith(
            locationId,
        )
    })
})
