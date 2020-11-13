import { AuthClient, AuthService } from '@syncot/auth'
import { createAuthClient } from '@syncot/auth-client'
import { Connection, createConnection } from '@syncot/connection'
import { Presence } from '@syncot/presence'
import { invertedStreams } from '@syncot/stream'
import { delay, whenEvent } from '@syncot/util'
import { Duplex } from 'readable-stream'
import { createAuthService } from '.'

let clientStream: Duplex
let serverStream: Duplex
let clientConnection: Connection
let serverConnection: Connection
let authClient: AuthClient
let authService: AuthService
const invalidConnectionMatcher = expect.objectContaining({
    message: 'Argument "connection" must be a non-destroyed Connection.',
    name: 'SyncOTError Assert',
})

const whenActive = whenEvent('active')
const whenInactive = whenEvent('inactive')
const whenDestroy = whenEvent('destroy')

const presence: Presence = {
    data: null,
    lastModified: 0,
    locationId: 'here',
    sessionId: '123',
    userId: 'me',
}

async function checkAccess(granted: boolean) {
    const mayReadDocument = authService.mayReadDocument('', '')
    const mayWriteDocument = authService.mayWriteDocument('', '')
    const mayReadPresence = authService.mayReadPresence(presence)
    const mayWritePresence = authService.mayWritePresence(presence)

    expect(mayReadDocument).toBe(granted)
    expect(mayWriteDocument).toBe(granted)
    expect(mayReadPresence).toBe(granted)
    expect(mayWritePresence).toBe(granted)
}

beforeEach(() => {
    ;[clientStream, serverStream] = invertedStreams({
        allowHalfOpen: false,
        objectMode: true,
    })
    clientConnection = createConnection()
    serverConnection = createConnection()
    clientConnection.connect(clientStream)
    serverConnection.connect(serverStream)
})

afterEach(() => {
    clientConnection.destroy()
    serverConnection.destroy()
    // Ensure instances are not reused between tests.
    authService = undefined as any
    authClient = undefined as any
})

test('invalid connection (missing)', () => {
    expect(() => createAuthService({ connection: undefined as any })).toThrow(
        invalidConnectionMatcher,
    )
})
test('invalid connection (destroyed)', () => {
    serverConnection.destroy()
    expect(() => createAuthService({ connection: serverConnection })).toThrow(
        invalidConnectionMatcher,
    )
})
test('destroy on connection destroy', async () => {
    authService = createAuthService({ connection: serverConnection })
    serverConnection.destroy()
    await whenDestroy(authService)
})

test('logIn with the default serviceName', async () => {
    authService = createAuthService({ connection: serverConnection })
    authClient = createAuthClient({ connection: clientConnection })
    expect(authService.active).toBeFalse()
    expect(authService.sessionId).toBeUndefined()
    expect(authService.userId).toBeUndefined()
    checkAccess(false)
    await whenActive(authService)
    expect(authService.active).toBeTrue()
    expect(authService.sessionId).toBeString()
    expect(authService.userId).toBe('')
    checkAccess(true)
    await whenActive(authClient)
    expect(authClient.active).toBeTrue()
    expect(authClient.sessionId).toBeString()
    expect(authClient.userId).toBe('')
})

test('logIn with a custom serviceName', async () => {
    authService = createAuthService({
        connection: serverConnection,
        serviceName: 'test-auth',
    })
    authClient = createAuthClient({
        connection: clientConnection,
        serviceName: 'test-auth',
    })
    expect(authService.active).toBeFalse()
    expect(authService.sessionId).toBeUndefined()
    expect(authService.userId).toBeUndefined()
    checkAccess(false)
    await whenActive(authService)
    expect(authService.active).toBeTrue()
    expect(authService.sessionId).toBeString()
    expect(authService.userId).toBe('')
    checkAccess(true)
    await whenActive(authClient)
    expect(authClient.active).toBeTrue()
    expect(authClient.sessionId).toBeString()
    expect(authClient.userId).toBe('')
})

test('handle disconnect when inactive', async () => {
    const onActive = jest.fn()
    const onInactive = jest.fn()
    authService = createAuthService({ connection: serverConnection })
    authService.on('active', onActive)
    authService.on('inactive', onInactive)
    authClient = createAuthClient({ connection: clientConnection })
    serverConnection.disconnect()
    await delay()
    expect(onActive).not.toHaveBeenCalled()
    expect(authService.active).toBeFalse()
    expect(authService.sessionId).toBeUndefined()
    expect(authService.userId).toBeUndefined()
    checkAccess(false)
})

test('handle disconnect when active', async () => {
    authService = createAuthService({ connection: serverConnection })
    authClient = createAuthClient({ connection: clientConnection })
    await whenActive(authService)
    serverConnection.disconnect()
    await whenInactive(authService)
    expect(authService.active).toBeFalse()
    expect(authService.sessionId).toBeUndefined()
    expect(authService.userId).toBeUndefined()
    checkAccess(false)
})

test('destroy when active', async () => {
    authService = createAuthService({ connection: serverConnection })
    authClient = createAuthClient({ connection: clientConnection })
    await whenActive(authService)
    authService.destroy()
    expect(authService.active).toBeFalse()
    expect(authService.sessionId).toBeUndefined()
    expect(authService.userId).toBeUndefined()
    checkAccess(false)
    await whenDestroy(authService)
    // Safe to call repeatedly.
    authService.destroy()
    authService.destroy()
})

test('logIn multiple times', async () => {
    const onActive = jest.fn()
    authService = createAuthService({ connection: serverConnection })
    authService.on('active', onActive)
    authClient = createAuthClient({ connection: clientConnection })
    await whenActive(authService)
    await whenActive(authClient)
    // Just call the internal API directly.
    expect((authService as any).logIn(null)).toEqual({
        sessionId: authClient.sessionId,
        userId: '',
    })
    expect((authService as any).logIn(null)).toEqual({
        sessionId: authClient.sessionId,
        userId: '',
    })
    expect(authService.active).toBeTrue()
    expect(authService.sessionId).toBeString()
    expect(authService.userId).toBe('')
    checkAccess(true)
    expect(onActive).toHaveBeenCalledTimes(1)
})
