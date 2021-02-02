import { Connection, createConnection } from '@syncot/connection'
import { invertedStreams, SyncOTEmitter, whenNextTick } from '@syncot/util'
import { install as installClock, InstalledClock } from '@sinonjs/fake-timers'
import { Duplex } from 'readable-stream'
import { Auth, AuthEvents, createAuthClient, eventNames, requestNames } from '.'

interface Credentials {
    userName: string
    password: string
}
let clock: InstalledClock
let clientStream: Duplex
let serverStream: Duplex
let clientConnection: Connection
let serverConnection: Connection
let authClient: Auth<Credentials>
let authService: MockAuthService
const sessionId = 'test-session-id'
const userId = 'test-user-id'
const userName = 'test-user-name'
const password = 'test-password'
const credentials = { userName, password }
let getCredentials: jest.Mock<Credentials>
const invalidConnectionMatcher = expect.objectContaining({
    message: 'Argument "connection" must be a non-destroyed Connection.',
    name: 'SyncOTError Assert',
})
const testError = new Error('test-error')

class MockAuthService
    extends SyncOTEmitter<AuthEvents>
    implements Auth<Credentials> {
    public active: boolean = false
    public sessionId: string | undefined = undefined
    public userId: string | undefined = undefined
    public logIn: jest.Mock<Promise<void>> = jest.fn()
    public logOut: jest.Mock<Promise<void>> = jest.fn()
    public mayReadContent = jest.fn(() => true)
    public mayWriteContent = jest.fn(() => true)
    public mayReadPresence = jest.fn(() => true)
    public mayWritePresence = jest.fn(() => true)
}

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
        eventNames,
        instance: authService,
        name: 'auth',
        requestNames,
    })
    getCredentials = jest.fn(() => credentials)
})

afterEach(() => {
    clientConnection.destroy()
    serverConnection.destroy()
    // Ensure instances are not reused between tests.
    authClient = undefined as any
    authService = undefined as any
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
test('invalid getCredentials when autoLogIn is true', () => {
    expect(() =>
        createAuthClient({ connection: clientConnection, autoLogIn: true }),
    ).toThrow(
        expect.objectContaining({
            message:
                'Argument "getCredentials" must be a function, as "autoLogIn" is true.',
            name: 'SyncOTError Assert',
        }),
    )
})

test('on active', async () => {
    const sessionId2 = sessionId + '-2'
    const userId2 = userId + '-2'
    const onActive = jest.fn()
    const onInactive = jest.fn()
    authClient = createAuthClient({ connection: clientConnection })
    authClient.on('active', onActive)
    authClient.on('inactive', onInactive)

    expect(authClient.active).toBeFalse()
    expect(authClient.sessionId).toBeUndefined()
    expect(authClient.userId).toBeUndefined()
    authService.emit('active', { sessionId, userId })
    await whenNextTick()
    expect(authClient.active).toBeTrue()
    expect(authClient.sessionId).toBe(sessionId)
    expect(authClient.userId).toBe(userId)
    await whenNextTick()
    expect(onActive).toHaveBeenCalledTimes(1)
    expect(onActive).toHaveBeenCalledWith({ sessionId, userId })
    expect(onInactive).toHaveBeenCalledTimes(0)
    onActive.mockClear()
    authService.emit('active', { sessionId: sessionId2, userId: userId2 })
    await whenNextTick()
    expect(authClient.active).toBeTrue()
    expect(authClient.sessionId).toBe(sessionId2)
    expect(authClient.userId).toBe(userId2)
    await whenNextTick()
    expect(onActive).toHaveBeenCalledTimes(1)
    expect(onActive).toHaveBeenCalledWith({
        sessionId: sessionId2,
        userId: userId2,
    })
    expect(onInactive).toHaveBeenCalledTimes(1)
    expect(onInactive).toHaveBeenCalledBefore(onActive)
})

test('on inactive', async () => {
    const onActive = jest.fn()
    const onInactive = jest.fn()
    authClient = createAuthClient({ connection: clientConnection })
    authClient.on('active', onActive)
    authClient.on('inactive', onInactive)

    expect(authClient.active).toBeFalse()
    expect(authClient.sessionId).toBeUndefined()
    expect(authClient.userId).toBeUndefined()
    authService.emit('active', { sessionId, userId })
    await whenNextTick()
    expect(authClient.active).toBeTrue()
    expect(authClient.sessionId).toBe(sessionId)
    expect(authClient.userId).toBe(userId)
    await whenNextTick()
    expect(onActive).toHaveBeenCalledTimes(1)
    expect(onActive).toHaveBeenCalledWith({ sessionId, userId })
    expect(onInactive).toHaveBeenCalledTimes(0)
    onActive.mockClear()
    authService.emit('inactive')
    await whenNextTick()
    expect(authClient.active).toBeFalse()
    expect(authClient.sessionId).toBe(undefined)
    expect(authClient.userId).toBe(undefined)
    await whenNextTick()
    expect(onActive).toHaveBeenCalledTimes(0)
    expect(onInactive).toHaveBeenCalledTimes(1)
    onInactive.mockClear()
    authService.emit('inactive')
    await whenNextTick()
    expect(authClient.active).toBeFalse()
    expect(authClient.sessionId).toBe(undefined)
    expect(authClient.userId).toBe(undefined)
    await whenNextTick()
    expect(onActive).toHaveBeenCalledTimes(0)
    expect(onInactive).toHaveBeenCalledTimes(0)
})

test('on disconnect', async () => {
    const onActive = jest.fn()
    const onInactive = jest.fn()
    authClient = createAuthClient({ connection: clientConnection })
    authClient.on('active', onActive)
    authClient.on('inactive', onInactive)

    expect(authClient.active).toBeFalse()
    expect(authClient.sessionId).toBeUndefined()
    expect(authClient.userId).toBeUndefined()
    authService.emit('active', { sessionId, userId })
    await whenNextTick()
    expect(authClient.active).toBeTrue()
    expect(authClient.sessionId).toBe(sessionId)
    expect(authClient.userId).toBe(userId)
    await whenNextTick()
    expect(onActive).toHaveBeenCalledTimes(1)
    expect(onActive).toHaveBeenCalledWith({ sessionId, userId })
    expect(onInactive).toHaveBeenCalledTimes(0)
    onActive.mockClear()
    clientConnection.disconnect()
    await whenNextTick()
    expect(authClient.active).toBeFalse()
    expect(authClient.sessionId).toBe(undefined)
    expect(authClient.userId).toBe(undefined)
    await whenNextTick()
    expect(onActive).toHaveBeenCalledTimes(0)
    expect(onInactive).toHaveBeenCalledTimes(1)
})

test('on connection destroy', async () => {
    const onActive = jest.fn()
    const onInactive = jest.fn()
    authClient = createAuthClient({ connection: clientConnection })
    authClient.on('active', onActive)
    authClient.on('inactive', onInactive)

    expect(authClient.active).toBeFalse()
    expect(authClient.sessionId).toBeUndefined()
    expect(authClient.userId).toBeUndefined()
    authService.emit('active', { sessionId, userId })
    await whenNextTick()
    expect(authClient.active).toBeTrue()
    expect(authClient.sessionId).toBe(sessionId)
    expect(authClient.userId).toBe(userId)
    await whenNextTick()
    expect(onActive).toHaveBeenCalledTimes(1)
    expect(onActive).toHaveBeenCalledWith({ sessionId, userId })
    expect(onInactive).toHaveBeenCalledTimes(0)
    onActive.mockClear()
    clientConnection.destroy()
    await whenNextTick()
    expect(authClient.active).toBeFalse()
    expect(authClient.sessionId).toBe(undefined)
    expect(authClient.userId).toBe(undefined)
    await whenNextTick()
    expect(onActive).toHaveBeenCalledTimes(0)
    expect(onInactive).toHaveBeenCalledTimes(1)
})

describe('logIn', () => {
    test('with credentials and with getCredentials', async () => {
        const otherCredentials = {
            userName: 'other-user',
            password: 'other-password',
        }
        authClient = createAuthClient({
            connection: clientConnection,
            getCredentials,
        })
        await authClient.logIn(otherCredentials)
        expect(getCredentials).toHaveBeenCalledTimes(0)
        expect(authService.logIn).toHaveBeenCalledTimes(1)
        expect(authService.logIn).toHaveBeenCalledWith(otherCredentials)
    })
    test('with credentials and without getCredentials', async () => {
        const otherCredentials = {
            userName: 'other-user',
            password: 'other-password',
        }
        authClient = createAuthClient({
            connection: clientConnection,
        })
        await authClient.logIn(otherCredentials)
        expect(getCredentials).toHaveBeenCalledTimes(0)
        expect(authService.logIn).toHaveBeenCalledTimes(1)
        expect(authService.logIn).toHaveBeenCalledWith(otherCredentials)
    })
    test('without credentials and with getCredentials', async () => {
        authClient = createAuthClient({
            connection: clientConnection,
            getCredentials,
        })
        await authClient.logIn()
        expect(getCredentials).toHaveBeenCalledTimes(1)
        expect(authService.logIn).toHaveBeenCalledTimes(1)
        expect(authService.logIn).toHaveBeenCalledWith(credentials)
    })
    test('without credentials and without getCredentials', async () => {
        authClient = createAuthClient({
            connection: clientConnection,
        })
        await expect(authClient.logIn()).rejects.toStrictEqual(
            expect.objectContaining({
                name: 'SyncOTError Auth',
                message: 'Credentials missing.',
            }),
        )
        expect(getCredentials).toHaveBeenCalledTimes(0)
        expect(authService.logIn).toHaveBeenCalledTimes(0)
    })
})

test('logOut', async () => {
    authClient = createAuthClient({
        connection: clientConnection,
    })
    await authClient.logOut()
    expect(authService.logOut).toHaveBeenCalledTimes(1)
})

test('mayReadContent', async () => {
    authClient = createAuthClient({
        connection: clientConnection,
    })
    await expect(authClient.mayReadContent('type-1', 'id-1')).resolves.toBe(
        true,
    )
    expect(authService.mayReadContent).toHaveBeenCalledTimes(1)
    expect(authService.mayReadContent).toHaveBeenCalledWith('type-1', 'id-1')
})

test('mayWriteContent', async () => {
    authClient = createAuthClient({
        connection: clientConnection,
    })
    await expect(authClient.mayWriteContent('type-1', 'id-1')).resolves.toBe(
        true,
    )
    expect(authService.mayWriteContent).toHaveBeenCalledTimes(1)
    expect(authService.mayWriteContent).toHaveBeenCalledWith('type-1', 'id-1')
})

test('mayReadPresence', async () => {
    authClient = createAuthClient({
        connection: clientConnection,
    })
    await expect(authClient.mayReadPresence('presence-1')).resolves.toBe(true)
    expect(authService.mayReadPresence).toHaveBeenCalledTimes(1)
    expect(authService.mayReadPresence).toHaveBeenCalledWith('presence-1')
})

test('mayWritePresence', async () => {
    authClient = createAuthClient({
        connection: clientConnection,
    })
    await expect(authClient.mayWritePresence('presence-1')).resolves.toBe(true)
    expect(authService.mayWritePresence).toHaveBeenCalledTimes(1)
    expect(authService.mayWritePresence).toHaveBeenCalledWith('presence-1')
})

describe.each([
    ['default', undefined, 10000],
    ['custom', () => 123, 123],
])('autoLogIn (BackOffStrategy=%s)', (_, backOffStrategy, firstDelay) => {
    beforeEach(async () => {
        ;[clientStream, serverStream] = invertedStreams({
            allowHalfOpen: false,
            objectMode: true,
        })
        clientConnection.disconnect()
        serverConnection.disconnect()
        serverConnection.connect(serverStream)
        // clientConnection.connect(clientStream) // Start each tests when disconnected.
        // await whenNextTick()
        authClient = createAuthClient({
            connection: clientConnection,
            getCredentials,
            autoLogIn: true,
            backOffStrategy,
        })
    })
    test('logIn on connect', async () => {
        clientConnection.connect(clientStream)
        await whenNextTick() // Wait for connection.
        await whenNextTick() // Wait for request.
        expect(authService.logIn).toHaveBeenCalledTimes(1)
        expect(authService.logIn).toHaveBeenCalledWith(credentials)
    })
    test('logIn error', async () => {
        const onError = jest.fn()
        authClient.on('error', onError)
        authService.logIn.mockRejectedValueOnce(testError)
        clientConnection.connect(clientStream)
        await whenNextTick() // Wait for connection.
        await whenNextTick() // Wait for request.
        expect(authService.logIn).toHaveBeenCalledTimes(1)
        expect(authService.logIn).toHaveBeenCalledWith(credentials)
        await whenNextTick() // Wait for error.
        expect(onError).toHaveBeenCalledTimes(1)
        expect(onError).toHaveBeenCalledWith(testError)
        expect(clock.countTimers()).toBe(1)
        clock.reset()
    })
    test('skip logIn if already active', async () => {
        const onError = jest.fn()
        authClient.on('error', onError)
        authService.logIn.mockRejectedValueOnce(testError)
        clientConnection.connect(clientStream)
        await whenNextTick() // Wait for connection.
        await whenNextTick() // Wait for request.
        expect(authService.logIn).toHaveBeenCalledTimes(1)
        authService.logIn.mockClear()
        await whenNextTick() // Wait for error.
        expect(onError).toHaveBeenCalledTimes(1)
        expect(onError).toHaveBeenCalledWith(testError)
        onError.mockClear()
        authService.emit('active', { sessionId, userId })
        await whenNextTick() // Wait until active.
        expect(authClient.active).toBeTrue()
        expect(clock.countTimers()).toBe(1)
        clock.next()
        expect(clock.now).toBe(firstDelay)
        await whenNextTick() // Wait for request.
        expect(authService.logIn).toHaveBeenCalledTimes(0)
        expect(onError).toHaveBeenCalledTimes(0)
    })
    test('skip logIn if not connected', async () => {
        const onError = jest.fn()
        authClient.on('error', onError)
        authService.logIn.mockRejectedValueOnce(testError)
        clientConnection.connect(clientStream)
        await whenNextTick() // Wait for connection.
        await whenNextTick() // Wait for request.
        expect(authService.logIn).toHaveBeenCalledTimes(1)
        authService.logIn.mockClear()
        await whenNextTick() // Wait for error.
        expect(onError).toHaveBeenCalledTimes(1)
        expect(onError).toHaveBeenCalledWith(testError)
        onError.mockClear()
        clientConnection.disconnect()
        await whenNextTick() // Wait for disconnection.
        expect(clock.countTimers()).toBe(1)
        clock.next()
        expect(clock.now).toBe(firstDelay)
        await whenNextTick() // Wait for request.
        expect(authService.logIn).toHaveBeenCalledTimes(0)
        expect(onError).toHaveBeenCalledTimes(0)
    })
})
