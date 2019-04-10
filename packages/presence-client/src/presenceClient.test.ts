import { AuthClient, AuthEvents } from '@syncot/auth'
import { Connection, createConnection } from '@syncot/core'
import {
    Presence,
    PresenceClient,
    PresenceService,
    PresenceServiceEvents,
} from '@syncot/presence'
import { SessionEvents, SessionManager } from '@syncot/session'
import { Id, invertedStreams, SyncOtEmitter } from '@syncot/util'
import { Clock, install as installClock, InstalledClock } from 'lolex'
import { Duplex } from 'stream'
import { createPresenceClient } from '.'

// setTimeout is overridden by lolex.
const originalSetTimeout = setTimeout
const delay = () => new Promise(resolve => originalSetTimeout(resolve, 0))

const testError = new Error('test-error')
const syncErrorMatcher = expect.objectContaining({
    message: 'Failed to sync presence. => Error: test-error',
    name: 'SyncOtError Presence',
})

const now = 12345
let clock: InstalledClock<Clock>

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

let stream1: Duplex
let stream2: Duplex
let connection1: Connection
let connection2: Connection
let authClient: MockAuthClient
let sessionClient: MockSessionClient
let presenceService: MockPresenceService
let presenceClient: PresenceClient

class MockAuthClient extends SyncOtEmitter<AuthEvents> implements AuthClient {
    public getUserId = jest.fn().mockReturnValue(userId)
    public hasUserId = jest.fn().mockReturnValue(true)
    public hasAuthenticatedUserId = jest.fn().mockReturnValue(true)
}

class MockSessionClient extends SyncOtEmitter<SessionEvents>
    implements SessionManager {
    public getSessionId = jest.fn().mockReturnValue(sessionId)
    public hasSession = jest.fn().mockReturnValue(true)
    public hasActiveSession = jest.fn().mockReturnValue(true)
}

class MockPresenceService extends SyncOtEmitter<PresenceServiceEvents>
    implements PresenceService {
    public submitPresence = jest
        .fn<Promise<void>, [Presence]>()
        .mockResolvedValue(undefined)
    public removePresence = jest
        .fn<Promise<void>, []>()
        .mockResolvedValue(undefined)
    public getPresenceBySessionId = jest
        .fn<Promise<Presence | null>, [Id]>()
        .mockResolvedValue(null)
    public getPresenceByLocationId = jest
        .fn<Promise<Presence[]>, [Id]>()
        .mockResolvedValue([])
    public getPresenceByUserId = jest
        .fn<Promise<Presence[]>, [Id]>()
        .mockResolvedValue([])
}

const whenLocalPresence = () =>
    new Promise(resolve => presenceClient.once('localPresence', resolve))

const whenOnline = () =>
    new Promise(resolve => presenceClient.once('online', resolve))

const whenOffline = () =>
    new Promise(resolve => presenceClient.once('offline', resolve))

beforeEach(() => {
    clock = installClock({ now })
    connection1 = createConnection()
    connection2 = createConnection()
    ;[stream1, stream2] = invertedStreams({ objectMode: true })
    connection1.connect(stream1)
    connection2.connect(stream2)
    authClient = new MockAuthClient()
    sessionClient = new MockSessionClient()
    presenceService = new MockPresenceService()
    presenceClient = createPresenceClient({
        authClient,
        connection: connection1,
        sessionClient,
    })
    connection2.registerService({
        actions: new Set([
            'submitPresence',
            'removePresence',
            'getPresenceBySessionId',
            'getPresenceByLocationId',
            'getPresenceByUserId',
        ]),
        instance: presenceService,
        name: 'presence',
    })
})

afterEach(() => {
    clock.uninstall()
    presenceClient.destroy()
})

test('register twice on the same connection', () => {
    expect(() =>
        createPresenceClient({
            authClient,
            connection: connection1,
            sessionClient,
        }),
    ).toThrow(
        expect.objectContaining({
            message: 'Proxy "presence" has been already registered.',
            name: 'AssertionError [ERR_ASSERTION]',
        }),
    )
})

test('destroy', async () => {
    const onDestroy = jest.fn()
    presenceClient.on('destroy', onDestroy)
    presenceClient.destroy()
    await Promise.resolve()
    expect(onDestroy).toHaveBeenCalledTimes(1)
    presenceClient.destroy()
    await Promise.resolve()
    expect(onDestroy).toHaveBeenCalledTimes(1)
})

test('sessionId', () => {
    expect(presenceClient.sessionId).toBe(sessionId)
    sessionClient.getSessionId.mockReturnValue(123)
    expect(presenceClient.sessionId).toBe(123)
})

test('userId', () => {
    expect(presenceClient.userId).toBe(userId)
    authClient.getUserId.mockReturnValue(123)
    expect(presenceClient.userId).toBe(123)
})

test('localPresence', async () => {
    let onLocalPresence: jest.Mock

    expect(presenceClient.data).toBeNull()
    expect(presenceClient.locationId).toBeUndefined()
    expect(presenceClient.localPresence).toBeUndefined()

    clock.tick(1)
    presenceClient.locationId = locationId
    expect(presenceClient.data).toBeNull()
    expect(presenceClient.locationId).toBe(locationId)
    expect(presenceClient.localPresence).toEqual({
        ...presence,
        data: null,
        lastModified: Date.now(),
    })
    await whenLocalPresence()

    clock.tick(1)
    presenceClient.data = data
    expect(presenceClient.data).toBe(data)
    expect(presenceClient.locationId).toBe(locationId)
    expect(presenceClient.localPresence).toEqual({
        ...presence,
        lastModified: Date.now(),
    })
    await whenLocalPresence()

    clock.tick(1)
    presenceClient.locationId = undefined
    expect(presenceClient.data).toBe(data)
    expect(presenceClient.locationId).toBeUndefined()
    expect(presenceClient.localPresence).toBeUndefined()
    await whenLocalPresence()

    // Changing properties so that localPresence is undefined before and after
    // is not recognized as a modification.
    clock.tick(1)
    presenceClient.locationId = undefined
    expect(presenceClient.data).toBe(data)
    expect(presenceClient.locationId).toBeUndefined()
    expect(presenceClient.localPresence).toBeUndefined()
    onLocalPresence = jest.fn()
    presenceClient.on('localPresence', onLocalPresence)
    await Promise.resolve()
    await Promise.resolve()
    expect(onLocalPresence).not.toHaveBeenCalled()
    presenceClient.off('localPresence', onLocalPresence)

    clock.tick(1)
    presenceClient.locationId = locationId
    expect(presenceClient.data).toBe(data)
    expect(presenceClient.locationId).toBe(locationId)
    expect(presenceClient.localPresence).toEqual({
        ...presence,
        lastModified: Date.now(),
    })
    await whenLocalPresence()

    // Changing properties so that localPresence is non-undefined before and after
    // is recognized as a modification.
    clock.tick(1)
    presenceClient.locationId = locationId
    expect(presenceClient.data).toBe(data)
    expect(presenceClient.locationId).toBe(locationId)
    expect(presenceClient.localPresence).toEqual({
        ...presence,
        lastModified: Date.now(),
    })
    await whenLocalPresence()

    clock.tick(1)
    sessionClient.getSessionId.mockReturnValue(undefined)
    sessionClient.emit('sessionClose')
    expect(presenceClient.data).toBe(data)
    expect(presenceClient.locationId).toBe(locationId)
    expect(presenceClient.localPresence).toBeUndefined()
    await whenLocalPresence()

    clock.tick(1)
    sessionClient.getSessionId.mockReturnValue(sessionId)
    sessionClient.emit('sessionOpen')
    expect(presenceClient.data).toBe(data)
    expect(presenceClient.locationId).toBe(locationId)
    expect(presenceClient.localPresence).toEqual({
        ...presence,
        lastModified: Date.now(),
    })
    await whenLocalPresence()

    clock.tick(1)
    authClient.getUserId.mockReturnValue(undefined)
    authClient.emit('userEnd')
    expect(presenceClient.data).toBe(data)
    expect(presenceClient.locationId).toBe(locationId)
    expect(presenceClient.localPresence).toBeUndefined()
    await whenLocalPresence()

    clock.tick(1)
    authClient.getUserId.mockReturnValue(userId)
    authClient.emit('user')
    expect(presenceClient.data).toBe(data)
    expect(presenceClient.locationId).toBe(locationId)
    expect(presenceClient.localPresence).toEqual({
        ...presence,
        lastModified: Date.now(),
    })
    await whenLocalPresence()
})

describe('online', () => {
    test('initially true', async () => {
        expect(presenceClient.online).toBeTrue()
    })

    test('initially false (no auth user)', () => {
        presenceClient.destroy()
        connection1.disconnect()
        connection2.disconnect()
        connection1 = createConnection()
        connection2 = createConnection()
        ;[stream1, stream2] = invertedStreams({ objectMode: true })
        connection1.connect(stream1)
        connection2.connect(stream2)

        authClient.hasAuthenticatedUserId.mockReturnValue(false)
        presenceClient = createPresenceClient({
            authClient,
            connection: connection1,
            sessionClient,
        })

        expect(presenceClient.online).toBeFalse()
    })

    test('initially false (no active session)', () => {
        presenceClient.destroy()
        connection1.disconnect()
        connection2.disconnect()
        connection1 = createConnection()
        connection2 = createConnection()
        ;[stream1, stream2] = invertedStreams({ objectMode: true })
        connection1.connect(stream1)
        connection2.connect(stream2)

        sessionClient.hasActiveSession.mockReturnValue(false)
        presenceClient = createPresenceClient({
            authClient,
            connection: connection1,
            sessionClient,
        })

        expect(presenceClient.online).toBeFalse()
    })

    test('updates', async () => {
        expect(presenceClient.online).toBeTrue()

        authClient.hasAuthenticatedUserId.mockReturnValue(false)
        authClient.emit('authEnd')
        expect(presenceClient.online).toBeFalse()
        await whenOffline()

        authClient.hasAuthenticatedUserId.mockReturnValue(true)
        authClient.emit('auth')
        expect(presenceClient.online).toBeTrue()
        await whenOnline()

        sessionClient.hasActiveSession.mockReturnValue(false)
        sessionClient.emit('sessionInactive')
        expect(presenceClient.online).toBeFalse()
        await whenOffline()

        sessionClient.hasActiveSession.mockReturnValue(true)
        sessionClient.emit('sessionActive')
        expect(presenceClient.online).toBeTrue()
        await whenOnline()
    })
})

describe('submitPresence', () => {
    test('submit presence', async () => {
        presenceClient.locationId = locationId
        await delay()
        expect(presenceService.removePresence).toHaveBeenCalledTimes(0)
        expect(presenceService.submitPresence).toHaveBeenCalledTimes(1)
        expect(presenceService.submitPresence).toHaveBeenCalledWith({
            ...presence,
            data: null,
        })
    })

    test('submit presence - avoiding unnecessary requests', async () => {
        presenceClient.locationId = locationId
        presenceClient.data = data
        await delay()
        expect(presenceService.removePresence).toHaveBeenCalledTimes(0)
        expect(presenceService.submitPresence).toHaveBeenCalledTimes(1)
        expect(presenceService.submitPresence).toHaveBeenCalledWith(presence)
    })

    test('do not submit presence after destroy', async () => {
        presenceClient.locationId = locationId
        presenceClient.data = data
        presenceClient.destroy()
        await delay()
        expect(presenceService.removePresence).toHaveBeenCalledTimes(0)
        expect(presenceService.submitPresence).toHaveBeenCalledTimes(0)
    })

    test('do not submit presence when offline', async () => {
        presenceClient.locationId = locationId
        presenceClient.data = data
        sessionClient.hasActiveSession.mockReturnValue(false)
        sessionClient.emit('sessionInactive')
        await delay()
        expect(presenceService.removePresence).toHaveBeenCalledTimes(0)
        expect(presenceService.submitPresence).toHaveBeenCalledTimes(0)
    })

    test('submit presence on getting online', async () => {
        presenceClient.locationId = locationId
        presenceClient.data = data
        sessionClient.hasActiveSession.mockReturnValue(false)
        sessionClient.emit('sessionInactive')
        await delay()
        expect(presenceService.removePresence).toHaveBeenCalledTimes(0)
        expect(presenceService.submitPresence).toHaveBeenCalledTimes(0)

        sessionClient.hasActiveSession.mockReturnValue(true)
        sessionClient.emit('sessionActive')
        await delay()
        expect(presenceService.removePresence).toHaveBeenCalledTimes(0)
        expect(presenceService.submitPresence).toHaveBeenCalledTimes(1)
        expect(presenceService.submitPresence).toHaveBeenCalledWith(presence)
    })

    test('error', async () => {
        const onError = jest.fn()
        presenceClient.on('error', onError)
        presenceService.submitPresence.mockRejectedValue(testError)
        presenceClient.locationId = locationId
        await delay()
        expect(onError).toHaveBeenCalledTimes(1)
        expect(onError).toHaveBeenCalledWith(syncErrorMatcher)
    })
})

describe('removePresence', () => {
    test('remove presence', async () => {
        presenceClient.locationId = locationId
        await delay()
        presenceClient.locationId = undefined
        await delay()
        expect(presenceService.removePresence).toHaveBeenCalledTimes(1)
        expect(presenceService.submitPresence).toHaveBeenCalledTimes(1)
    })

    test('remove presence - avoiding unnecessary requests', async () => {
        presenceClient.locationId = locationId
        presenceClient.locationId = undefined
        await delay()
        expect(presenceService.removePresence).toHaveBeenCalledTimes(1)
        expect(presenceService.submitPresence).toHaveBeenCalledTimes(0)
    })

    test('do not remove presence after destroy', async () => {
        presenceClient.locationId = locationId
        presenceClient.locationId = undefined
        presenceClient.destroy()
        await delay()
        expect(presenceService.removePresence).toHaveBeenCalledTimes(0)
        expect(presenceService.submitPresence).toHaveBeenCalledTimes(0)
    })

    test('do not remove presence when offline', async () => {
        presenceClient.locationId = locationId
        presenceClient.locationId = undefined
        sessionClient.hasActiveSession.mockReturnValue(false)
        sessionClient.emit('sessionInactive')
        await delay()
        expect(presenceService.removePresence).toHaveBeenCalledTimes(0)
        expect(presenceService.submitPresence).toHaveBeenCalledTimes(0)
    })

    test('do not remove presence on getting online or offline', async () => {
        presenceClient.locationId = locationId
        presenceClient.data = data
        await delay()
        expect(presenceService.removePresence).toHaveBeenCalledTimes(0)
        expect(presenceService.submitPresence).toHaveBeenCalledTimes(1)

        // Do not remove presence when getting offline because the server does it automatically.
        sessionClient.hasActiveSession.mockReturnValue(false)
        sessionClient.emit('sessionInactive')
        await delay()
        expect(presenceService.removePresence).toHaveBeenCalledTimes(0)
        expect(presenceService.submitPresence).toHaveBeenCalledTimes(1)

        // Clear the local presence.
        presenceClient.locationId = undefined
        await delay()

        // Do not remove presence when getting online because it is not on the server anyway.
        sessionClient.hasActiveSession.mockReturnValue(true)
        sessionClient.emit('sessionActive')
        await delay()
        expect(presenceService.removePresence).toHaveBeenCalledTimes(0)
        expect(presenceService.submitPresence).toHaveBeenCalledTimes(1)
    })

    test('error', async () => {
        const onError = jest.fn()
        presenceClient.on('error', onError)
        presenceService.removePresence.mockRejectedValue(testError)
        presenceClient.locationId = locationId
        await delay()
        presenceClient.locationId = undefined
        await delay()
        expect(onError).toHaveBeenCalledTimes(1)
        expect(onError).toHaveBeenCalledWith(syncErrorMatcher)
    })
})
