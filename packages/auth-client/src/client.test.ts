import { AuthClient, AuthEvents, AuthService } from '@syncot/auth'
import { Connection, createConnection } from '@syncot/connection'
import { SyncOtEmitter } from '@syncot/events'
import { invertedStreams } from '@syncot/stream'
import { whenNextTick } from '@syncot/util'
import { install as installClock, InstalledClock } from '@sinonjs/fake-timers'
import { Duplex } from 'readable-stream'
import { createAuthClient } from '.'
import { LoginResponse, requestNames } from './client'

let clock: InstalledClock
let clientStream: Duplex
let serverStream: Duplex
let clientConnection: Connection
let serverConnection: Connection
let authClient: AuthClient
let authService: MockAuthService
const sessionId = 'test-session-id'
const userId = 'test-user-id'
const loginResponse = {
    sessionId,
    userId,
}
const spanContextMatcher = expect.toBeObject()
const invalidConnectionMatcher = expect.objectContaining({
    message: 'Argument "connection" must be a non-destroyed Connection.',
    name: 'SyncOtError Assert',
})
const testError = new Error('test-error')

class MockAuthService extends SyncOtEmitter<AuthEvents> implements AuthService {
    public active: boolean = false
    public sessionId: string | undefined = undefined
    public userId: string | undefined = undefined
    public logIn: jest.Mock<
        Promise<LoginResponse>
    > = jest.fn().mockResolvedValue(loginResponse)
    public mayReadDocument = () => false
    public mayWriteDocument = () => false
    public mayReadPresence = () => false
    public mayWritePresence = () => false
}

const whenActive = () =>
    new Promise((resolve) => authClient.once('active', resolve))
const whenInactive = () =>
    new Promise((resolve) => authClient.once('inactive', resolve))
const whenDestroy = () =>
    new Promise((resolve) => authClient.once('destroy', resolve))
const whenError = () =>
    new Promise((resolve, reject) =>
        authClient.once('error', (error) => {
            try {
                expect(error).toBe(testError)
                resolve()
            } catch (error) {
                reject(error)
            }
        }),
    )

beforeEach(async () => {
    clock = installClock()
    ;[clientStream, serverStream] = invertedStreams({
        allowHalfOpen: false,
        objectMode: true,
    })
    clientConnection = createConnection()
    serverConnection = createConnection()
    clientConnection.connect(clientStream)
    serverConnection.connect(serverStream)
    authService = new MockAuthService()
    serverConnection.registerService({
        instance: authService,
        name: 'auth',
        requestNames,
    })
    await whenNextTick() // Wait for "connect" events.
})

afterEach(() => {
    clientConnection.destroy()
    serverConnection.destroy()
    // Ensure instances are not reused between tests.
    authClient = undefined as any
    expect(clock.countTimers()).toBe(0)
    clock.uninstall()
})

test('invalid connection (missing)', () => {
    expect(() => createAuthClient({ connection: undefined as any })).toThrow(
        invalidConnectionMatcher,
    )
})
test('invalid connection (destroyed)', () => {
    clientConnection.destroy()
    expect(() => createAuthClient({ connection: clientConnection })).toThrow(
        invalidConnectionMatcher,
    )
})
test('destroy on connection destroy', async () => {
    authClient = createAuthClient({ connection: clientConnection })
    clientConnection.destroy()
    await whenDestroy()
})

test('log in on startup with default params', async () => {
    authClient = createAuthClient({ connection: clientConnection })
    expect(authClient.active).toBeFalse()
    expect(authClient.sessionId).toBeUndefined()
    expect(authClient.userId).toBeUndefined()
    await whenActive()
    expect(authService.logIn).toHaveBeenCalledTimes(1)
    expect(authService.logIn).toHaveBeenCalledWith(null, spanContextMatcher)
    expect(authClient.active).toBeTrue()
    expect(authClient.sessionId).toBe(sessionId)
    expect(authClient.userId).toBe(userId)
})

test('log in on startup with custom params', async () => {
    const accessToken = 'test-access-token'
    const serviceName = 'test-auth'
    const customAuthService = new MockAuthService()
    serverConnection.registerService({
        instance: customAuthService,
        name: serviceName,
        requestNames,
    })
    authClient = createAuthClient({
        connection: clientConnection,
        getLoginDetails: async () => accessToken,
        serviceName,
    })
    expect(authClient.active).toBeFalse()
    expect(authClient.sessionId).toBeUndefined()
    expect(authClient.userId).toBeUndefined()
    await whenActive()
    expect(customAuthService.logIn).toHaveBeenCalledTimes(1)
    expect(customAuthService.logIn).toHaveBeenCalledWith(
        accessToken,
        spanContextMatcher,
    )
    expect(authService.logIn).toHaveBeenCalledTimes(0)
    expect(authClient.active).toBeTrue()
    expect(authClient.sessionId).toBe(sessionId)
    expect(authClient.userId).toBe(userId)
})

test('log in on "connect"', async () => {
    clientConnection.disconnect()
    await whenNextTick() // Wait for "disconnect" event.
    authClient = createAuthClient({ connection: clientConnection })
    await whenNextTick()
    await whenNextTick()
    expect(authService.logIn).toHaveBeenCalledTimes(0)
    ;[clientStream, serverStream] = invertedStreams({
        allowHalfOpen: false,
        objectMode: true,
    })
    clientConnection.connect(clientStream)
    serverConnection.connect(serverStream)
    expect(authClient.active).toBeFalse()
    expect(authClient.sessionId).toBeUndefined()
    expect(authClient.userId).toBeUndefined()
    await whenActive()
    expect(authService.logIn).toHaveBeenCalledTimes(1)
    expect(authService.logIn).toHaveBeenCalledWith(null, spanContextMatcher)
    expect(authClient.active).toBeTrue()
    expect(authClient.sessionId).toBe(sessionId)
    expect(authClient.userId).toBe(userId)
})

test('destroy before activating', async () => {
    const onActive = jest.fn()
    authClient = createAuthClient({ connection: clientConnection })
    authClient.on('active', onActive)
    authClient.destroy()
    await whenDestroy()
    await whenNextTick()
    await whenNextTick()
    expect(authClient.active).toBeFalse()
    expect(authClient.sessionId).toBeUndefined()
    expect(authClient.userId).toBeUndefined()
    expect(onActive).not.toHaveBeenCalled()
})

test('destroy when active', async () => {
    authClient = createAuthClient({ connection: clientConnection })
    await whenActive()
    authClient.destroy()
    expect(authClient.active).toBeFalse()
    expect(authClient.sessionId).toBeUndefined()
    expect(authClient.userId).toBeUndefined()
    await whenDestroy()
})

test('destroy twice', () => {
    authClient = createAuthClient({ connection: clientConnection })
    authClient.destroy()
    authClient.destroy()
})

test('handle disconnect when active', async () => {
    authClient = createAuthClient({ connection: clientConnection })
    await whenActive()
    clientConnection.disconnect()
    await whenInactive()
    expect(authClient.active).toBeFalse()
    expect(authClient.sessionId).toBeUndefined()
    expect(authClient.userId).toBeUndefined()
})

test('handle disconnect when login is scheduled', async () => {
    authService.logIn.mockRejectedValue(testError)
    authClient = createAuthClient({ connection: clientConnection })
    await whenError()
    expect(clock.countTimers()).toBe(1)
    clientConnection.disconnect()
    await whenNextTick()
    expect(clock.countTimers()).toBe(0)
    expect(authClient.active).toBeFalse()
    expect(authClient.sessionId).toBeUndefined()
    expect(authClient.userId).toBeUndefined()
})
