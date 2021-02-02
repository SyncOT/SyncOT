import { Auth, AuthEvents } from '@syncot/auth'
import { Connection, createConnection } from '@syncot/connection'
import {
    Presence,
    PresenceService,
    PresenceServiceEvents,
} from '@syncot/presence'
import {
    invertedStreams,
    noop,
    TypedEventEmitter,
    whenNextTick,
} from '@syncot/util'
import { install as installClock, InstalledClock } from '@sinonjs/fake-timers'
import { Duplex } from 'readable-stream'
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

function createPresenceStream(): Duplex {
    return new Duplex({ read: noop })
}

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

let stream: Duplex
let serverStream: Duplex
let connection: Connection
let serverConnection: Connection
let auth: MockAuthClient
let presenceService: MockPresenceService

class MockAuthClient extends TypedEventEmitter<AuthEvents> implements Auth {
    public active = true
    public sessionId = sessionId
    public userId = userId
    public logIn = jest.fn()
    public logOut = jest.fn()
    public mayReadContent = jest.fn()
    public mayWriteContent = jest.fn()
    public mayReadPresence = jest.fn()
    public mayWritePresence = jest.fn()
}

class MockPresenceService
    extends TypedEventEmitter<PresenceServiceEvents>
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

beforeEach(() => {
    clock = installClock({ now })
    connection = createConnection()
    serverConnection = createConnection()
    ;[stream, serverStream] = invertedStreams({
        allowHalfOpen: false,
        objectMode: true,
    })
    connection.connect(stream)
    serverConnection.connect(serverStream)
    auth = new MockAuthClient()
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
    connection.destroy()
    serverConnection.destroy()
})

test('invalid connection (missing)', () => {
    expect(() =>
        createPresenceClient({
            auth,
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
    connection.destroy()
    expect(() =>
        createPresenceClient({
            auth,
            connection,
        }),
    ).toThrow(
        expect.objectContaining({
            message:
                'Argument "connection" must be a non-destroyed Connection.',
            name: 'SyncOTError Assert',
        }),
    )
})

test('invalid authClient (null)', () => {
    expect(() =>
        createPresenceClient({
            auth: null as any,
            connection,
        }),
    ).toThrow(
        expect.objectContaining({
            message: 'Argument "authClient" must be an object.',
            name: 'SyncOTError Assert',
        }),
    )
})

test('invalid authClient (true)', () => {
    expect(() =>
        createPresenceClient({
            auth: true as any,
            connection,
        }),
    ).toThrow(
        expect.objectContaining({
            message: 'Argument "authClient" must be an object.',
            name: 'SyncOTError Assert',
        }),
    )
})

test('register twice on the same connection', () => {
    createPresenceClient({ auth, connection })
    expect(() => createPresenceClient({ auth, connection })).toThrow(
        expect.objectContaining({
            message: 'Proxy "presence" has been already registered.',
            name: 'SyncOTError Assert',
        }),
    )
})

test('initially active without presence', async () => {
    const presenceClient = createPresenceClient({ auth, connection })
    expect(presenceClient.presence).toBeUndefined()

    const onPresence = jest.fn()
    presenceClient.on('presence', onPresence)
    await whenNextTick()
    expect(onPresence).toHaveBeenCalledTimes(0)
    expect(presenceService.submitPresence).toHaveBeenCalledTimes(0)
    expect(presenceService.removePresence).toHaveBeenCalledTimes(0)
})

test('initially active with presence', async () => {
    const presenceClient = createPresenceClient({ auth, connection })
    presenceClient.locationId = locationId
    presenceClient.data = data
    expect(presenceClient.presence).toEqual(presence)
    const onPresence = jest.fn()
    presenceClient.on('presence', onPresence)
    await whenNextTick()
    expect(onPresence).toHaveBeenCalledTimes(1)
    expect(presenceService.submitPresence).toHaveBeenCalledTimes(1)
    expect(presenceService.submitPresence).toHaveBeenCalledWith(presence)
    expect(presenceService.removePresence).toHaveBeenCalledTimes(0)
})

test('initially inactive', async () => {
    auth.active = false
    const presenceClient = createPresenceClient({ auth, connection })
    const onPresence = jest.fn()
    presenceClient.on('presence', onPresence)
    expect(presenceClient.presence).toBeUndefined()
    await whenNextTick()
    expect(onPresence).toHaveBeenCalledTimes(0)
    expect(presenceService.submitPresence).toHaveBeenCalledTimes(0)
    expect(presenceService.removePresence).toHaveBeenCalledTimes(0)
})

test('handle Auth client "active" event without presence', async () => {
    auth.active = false
    const presenceClient = createPresenceClient({ auth, connection })
    const onPresence = jest.fn()
    presenceClient.on('presence', onPresence)
    auth.active = true
    auth.emit('active', { sessionId, userId })
    await whenNextTick()
    expect(presenceClient.presence).toBeUndefined()
    expect(onPresence).toHaveBeenCalledTimes(0)
    expect(presenceService.submitPresence).toHaveBeenCalledTimes(0)
    expect(presenceService.removePresence).toHaveBeenCalledTimes(0)
})

test('handle Auth client "active" event with presence', async () => {
    auth.active = false
    const presenceClient = createPresenceClient({ auth, connection })
    const onPresence = jest.fn()
    presenceClient.on('presence', onPresence)
    presenceClient.locationId = locationId
    presenceClient.data = data
    auth.active = true
    auth.emit('active', { sessionId, userId })
    await whenNextTick()
    expect(presenceClient.presence).toEqual(presence)
    expect(onPresence).toHaveBeenCalledTimes(1)
    expect(presenceService.submitPresence).toHaveBeenCalledTimes(1)
    expect(presenceService.submitPresence).toHaveBeenCalledWith(presence)
    expect(presenceService.removePresence).toHaveBeenCalledTimes(0)
})

test('handle Auth client "inactive" event without presence', async () => {
    const presenceClient = createPresenceClient({ auth, connection })
    const onPresence = jest.fn()
    presenceClient.on('presence', onPresence)
    auth.active = false
    auth.emit('inactive')
    await whenNextTick()
    expect(presenceClient.presence).toBeUndefined()
    expect(onPresence).toHaveBeenCalledTimes(0)
    expect(presenceService.submitPresence).toHaveBeenCalledTimes(0)
    expect(presenceService.removePresence).toHaveBeenCalledTimes(0)
})

test('handle Auth client "inactive" event with presence', async () => {
    const presenceClient = createPresenceClient({ auth, connection })
    const onPresence = jest.fn()
    presenceClient.on('presence', onPresence)
    presenceClient.locationId = locationId
    presenceClient.data = data

    await whenNextTick()
    expect(presenceClient.presence).toEqual(presence)
    expect(onPresence).toHaveBeenCalledTimes(1)
    expect(presenceService.submitPresence).toHaveBeenCalledTimes(1)
    expect(presenceService.submitPresence).toHaveBeenCalledWith(presence)
    expect(presenceService.removePresence).toHaveBeenCalledTimes(0)
    onPresence.mockClear()
    presenceService.submitPresence.mockClear()

    auth.active = false
    auth.emit('inactive')
    await whenNextTick()
    expect(presenceClient.presence).toBeUndefined()
    expect(onPresence).toHaveBeenCalledTimes(1)
    expect(presenceService.submitPresence).toHaveBeenCalledTimes(0)
    // removePresence is not called because the Auth service is not active.
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
    const presenceClient = createPresenceClient({ auth, connection })
    const onPresence = jest.fn()
    presenceClient.on('presence', onPresence)
    presenceClient.locationId = locationId
    expect(presenceClient.presence).toEqual(presence1)
    await whenNextTick()
    expect(onPresence).toHaveBeenCalledTimes(1)
    expect(presenceService.submitPresence).toHaveBeenCalledTimes(1)
    expect(presenceService.submitPresence).toHaveBeenCalledWith(presence1)
    expect(presenceService.removePresence).toHaveBeenCalledTimes(0)
    onPresence.mockClear()
    presenceService.submitPresence.mockClear()

    presenceClient.locationId = differentLocationId
    expect(presenceClient.presence).toEqual(presence2)
    await whenNextTick()
    expect(onPresence).toHaveBeenCalledTimes(1)
    expect(presenceService.submitPresence).toHaveBeenCalledTimes(1)
    expect(presenceService.submitPresence).toHaveBeenCalledWith(presence2)
    expect(presenceService.removePresence).toHaveBeenCalledTimes(0)
    onPresence.mockClear()
    presenceService.submitPresence.mockClear()

    presenceClient.locationId = undefined
    expect(presenceClient.presence).toBeUndefined()
    await whenNextTick()
    expect(onPresence).toHaveBeenCalledTimes(1)
    expect(presenceService.submitPresence).toHaveBeenCalledTimes(0)
    expect(presenceService.removePresence).toHaveBeenCalledTimes(1)
})

test('change data when active', async () => {
    const presence1 = { ...presence, data: null }
    const presenceClient = createPresenceClient({ auth, connection })
    const onPresence = jest.fn()
    presenceClient.on('presence', onPresence)
    presenceClient.locationId = locationId
    expect(presenceClient.presence).toEqual(presence1)
    await whenNextTick()
    expect(onPresence).toHaveBeenCalledTimes(1)
    expect(presenceService.submitPresence).toHaveBeenCalledTimes(1)
    expect(presenceService.submitPresence).toHaveBeenCalledWith(presence1)
    expect(presenceService.removePresence).toHaveBeenCalledTimes(0)
    onPresence.mockClear()
    presenceService.submitPresence.mockClear()

    presenceClient.data = data
    expect(presenceClient.presence).toEqual(presence)
    await whenNextTick()
    expect(onPresence).toHaveBeenCalledTimes(1)
    expect(presenceService.submitPresence).toHaveBeenCalledTimes(1)
    expect(presenceService.submitPresence).toHaveBeenCalledWith(presence)
    expect(presenceService.removePresence).toHaveBeenCalledTimes(0)
})

test('error when submitting presence', async () => {
    const presenceClient = createPresenceClient({ auth, connection })
    const onError = jest.fn()
    const onPresence = jest.fn()
    presenceClient.on('error', onError)
    presenceClient.on('presence', onPresence)
    presenceClient.locationId = locationId
    presenceService.submitPresence.mockRejectedValue(testError)
    await whenNextTick()
    expect(onPresence).toHaveBeenCalledTimes(1)
    expect(presenceService.submitPresence).toHaveBeenCalledTimes(1)
    expect(presenceService.removePresence).toHaveBeenCalledTimes(0)
    await whenNextTick()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(syncErrorMatcher)
})

test('error when removing presence', async () => {
    const presenceClient = createPresenceClient({ auth, connection })
    const onError = jest.fn()
    const onPresence = jest.fn()
    presenceClient.on('error', onError)
    presenceClient.on('presence', onPresence)
    presenceClient.locationId = locationId
    await whenNextTick()
    expect(onPresence).toHaveBeenCalledTimes(1)
    expect(presenceService.submitPresence).toHaveBeenCalledTimes(1)
    expect(presenceService.removePresence).toHaveBeenCalledTimes(0)
    onPresence.mockClear()
    presenceService.submitPresence.mockClear()

    presenceClient.locationId = undefined
    presenceService.removePresence.mockRejectedValue(testError)
    await whenNextTick()
    expect(onPresence).toHaveBeenCalledTimes(1)
    expect(presenceService.submitPresence).toHaveBeenCalledTimes(0)
    expect(presenceService.removePresence).toHaveBeenCalledTimes(1)
    await whenNextTick()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(syncErrorMatcher)
})

describe('getPresenceBySessionId', () => {
    test('success', async () => {
        const presenceClient = createPresenceClient({ auth, connection })
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
        const presenceClient = createPresenceClient({ auth, connection })
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
    test('success', async () => {
        const presenceClient = createPresenceClient({ auth, connection })
        presenceService.getPresenceByUserId.mockResolvedValue([presence])
        await expect(
            presenceClient.getPresenceByUserId(userId),
        ).resolves.toEqual([presence])
        expect(presenceService.getPresenceByUserId).toHaveBeenCalledTimes(1)
        expect(presenceService.getPresenceByUserId).toHaveBeenCalledWith(userId)
    })
    test('error', async () => {
        const presenceClient = createPresenceClient({ auth, connection })
        presenceService.getPresenceByUserId.mockRejectedValue(testError)
        await expect(
            presenceClient.getPresenceByUserId(userId),
        ).rejects.toEqual(testErrorMatcher)
        expect(presenceService.getPresenceByUserId).toHaveBeenCalledTimes(1)
        expect(presenceService.getPresenceByUserId).toHaveBeenCalledWith(userId)
    })
})

describe('getPresenceByLocationId', () => {
    test('success', async () => {
        const presenceClient = createPresenceClient({ auth, connection })
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
        const presenceClient = createPresenceClient({ auth, connection })
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
    test('success', async () => {
        const presenceClient = createPresenceClient({ auth, connection })
        presenceService.streamPresenceBySessionId.mockResolvedValue(
            createPresenceStream(),
        )
        const presenceStream = await presenceClient.streamPresenceBySessionId(
            sessionId,
        )
        expect(presenceStream).toBeInstanceOf(Duplex)
        expect(presenceService.streamPresenceBySessionId).toHaveBeenCalledTimes(
            1,
        )
        expect(presenceService.streamPresenceBySessionId).toHaveBeenCalledWith(
            sessionId,
        )
    })
    test('error', async () => {
        const presenceClient = createPresenceClient({ auth, connection })
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
    test('success', async () => {
        const presenceClient = createPresenceClient({ auth, connection })
        presenceService.streamPresenceByUserId.mockResolvedValue(
            createPresenceStream(),
        )
        const presenceStream = await presenceClient.streamPresenceByUserId(
            userId,
        )
        expect(presenceStream).toBeInstanceOf(Duplex)
        expect(presenceService.streamPresenceByUserId).toHaveBeenCalledTimes(1)
        expect(presenceService.streamPresenceByUserId).toHaveBeenCalledWith(
            userId,
        )
    })
    test('error', async () => {
        const presenceClient = createPresenceClient({ auth, connection })
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
    test('success', async () => {
        const presenceClient = createPresenceClient({ auth, connection })
        presenceService.streamPresenceByLocationId.mockResolvedValue(
            createPresenceStream(),
        )
        const presenceStream = await presenceClient.streamPresenceByLocationId(
            locationId,
        )
        expect(presenceStream).toBeInstanceOf(Duplex)
        expect(
            presenceService.streamPresenceByLocationId,
        ).toHaveBeenCalledTimes(1)
        expect(presenceService.streamPresenceByLocationId).toHaveBeenCalledWith(
            locationId,
        )
    })
    test('error', async () => {
        const presenceClient = createPresenceClient({ auth, connection })
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
