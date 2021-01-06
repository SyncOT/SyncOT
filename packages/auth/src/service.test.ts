import { BaseSession } from '@syncot/auth/src/service'
import { Connection, createConnection } from '@syncot/connection'
import { invertedStreams, noop, whenNextTick, whenEvent } from '@syncot/util'
import { Duplex } from 'readable-stream'
import { Auth, createAuthService, eventNames, requestNames, Session } from '.'

interface Credentials {
    userName: string
    password: string
}
let clientStream: Duplex
let serverStream: Duplex
let clientConnection: Connection
let serverConnection: Connection
let authClient: Auth<Credentials>
let authService: Auth<Credentials>
const userId = 'test-user-id'
const sessionId = 'test-session-id'
let createSession: jest.Mock<Session | Promise<Session>>
const userName = 'test-user-name'
const password = 'test-password'
const credentials = { userName, password }
const invalidConnectionMatcher = expect.objectContaining({
    message: 'Argument "connection" must be a non-destroyed Connection.',
    name: 'SyncOTError Assert',
})
const testError = new Error('test-error')
const whenDestroy = whenEvent('destroy')
const destroyedMatcher = expect.objectContaining({
    name: 'SyncOTError Assert',
    message: 'Already destroyed.',
})

function createSessionMock(userIdArg: string, sessionsIdArg: string) {
    return {
        userId: userIdArg,
        sessionId: sessionsIdArg,
        destroy: jest.fn(),
        mayReadContent: jest.fn().mockReturnValue(true),
        mayWriteContent: jest.fn().mockReturnValue(true),
        mayReadPresence: jest.fn().mockReturnValue(true),
        mayWritePresence: jest.fn().mockReturnValue(true),
    }
}
type MockSession = ReturnType<typeof createSessionMock>

beforeEach(async () => {
    createSession = jest
        .fn()
        .mockReturnValue(createSessionMock(userId, sessionId))
    ;[clientStream, serverStream] = invertedStreams({
        allowHalfOpen: false,
        objectMode: true,
    })
    clientConnection = createConnection()
    serverConnection = createConnection()
    clientConnection.connect(clientStream)
    serverConnection.connect(serverStream)
    authClient = clientConnection.registerProxy({
        eventNames,
        name: 'auth',
        requestNames,
    }) as Auth<Credentials>
})

afterEach(() => {
    clientConnection.destroy()
    serverConnection.destroy()
    // Ensure instances are not reused between tests.
    authClient = undefined as any
    authService = undefined as any
})

test('invalid connection (missing)', () => {
    expect(() =>
        createAuthService({ connection: undefined as any, createSession }),
    ).toThrow(invalidConnectionMatcher)
})
test('invalid connection (destroyed)', () => {
    clientConnection.destroy()
    expect(() =>
        createAuthService({ connection: clientConnection, createSession }),
    ).toThrow(invalidConnectionMatcher)
})
test('destroy on connection destroy', async () => {
    authService = createAuthService({
        connection: clientConnection,
        createSession,
    })
    clientConnection.destroy()
    await whenDestroy(authService)
})

describe('logIn', () => {
    beforeEach(() => {
        authService = createAuthService({
            connection: serverConnection,
            createSession,
        })
    })

    test('destroyed', async () => {
        authService.destroy()
        await expect(authClient.logIn()).rejects.toStrictEqual(destroyedMatcher)
    })

    test('success', async () => {
        const onActive = jest.fn()
        const onInactive = jest.fn()
        authClient.on('active', onActive)
        authClient.on('inactive', onInactive)
        await authClient.logIn(credentials)
        expect(authService.active).toBeTrue()
        expect(authService.userId).toBe(userId)
        expect(authService.sessionId).toBe(sessionId)
        await whenNextTick()
        expect(createSession).toHaveBeenCalledTimes(1)
        expect(createSession).toHaveBeenCalledWith(credentials)
        expect(onInactive).toHaveBeenCalledTimes(0)
        expect(onActive).toHaveBeenCalledTimes(1)
        expect(onActive).toHaveBeenCalledWith({ sessionId, userId })
    })

    test('when active', async () => {
        const sessionId2 = sessionId + '-2'
        const userId2 = userId + '-2'
        const userName2 = userName + '-2'
        const password2 = password + '-2'
        const otherCredentials = { userName: userName2, password: password2 }
        const onActive = jest.fn()
        const onInactive = jest.fn()
        authClient.on('active', onActive)
        authClient.on('inactive', onInactive)

        // Activate.
        await authClient.logIn(credentials)
        await whenNextTick()
        expect(createSession).toHaveBeenCalledTimes(1)
        expect(createSession).toHaveBeenCalledWith(credentials)
        expect(onInactive).toHaveBeenCalledTimes(0)
        expect(onActive).toHaveBeenCalledTimes(1)
        expect(onActive).toHaveBeenCalledWith({ sessionId, userId })
        createSession.mockClear()
        onActive.mockClear()

        // Activate again.
        createSession.mockReturnValueOnce(
            createSessionMock(userId2, sessionId2),
        )
        await authClient.logIn(otherCredentials)
        await whenNextTick()
        expect(createSession).toHaveBeenCalledTimes(1)
        expect(createSession).toHaveBeenCalledWith(otherCredentials)
        expect(onInactive).toHaveBeenCalledTimes(1)
        expect(onActive).toHaveBeenCalledTimes(1)
        expect(onActive).toHaveBeenCalledWith({
            sessionId: sessionId2,
            userId: userId2,
        })
    })

    test('concurrent success', async () => {
        const sessionId2 = sessionId + '-2'
        const userId2 = userId + '-2'
        const userName2 = userName + '-2'
        const password2 = password + '-2'
        const otherCredentials = { userName: userName2, password: password2 }
        const onActive = jest.fn()
        const onInactive = jest.fn()
        authClient.on('active', onActive)
        authClient.on('inactive', onInactive)

        let createSession1Resolve: (session: Session) => void = noop
        const createSession1Promise = new Promise<Session>(
            (resolve) => (createSession1Resolve = resolve),
        )
        createSession.mockReturnValueOnce(createSession1Promise)

        let createSession2Resolve: (session: Session) => void = noop
        const createSession2Promise = new Promise<Session>(
            (resolve) => (createSession2Resolve = resolve),
        )
        createSession.mockReturnValueOnce(createSession2Promise)

        // Try to log in twice.
        const promises = [
            authClient.logIn(otherCredentials),
            authClient.logIn(credentials),
        ]

        // Create 2 sessions - the order does not matter, as the last request always wins.
        createSession2Resolve(createSessionMock(userId, sessionId))
        createSession1Resolve(createSessionMock(userId2, sessionId2))

        // Wait for results.
        const results = await Promise.allSettled(promises)
        expect(results[0].status).toBe('rejected')
        expect((results[0] as PromiseRejectedResult).reason).toStrictEqual(
            expect.objectContaining({
                name: 'SyncOTError Auth',
                message: 'Request canceled.',
            }),
        )
        expect(results[1].status).toBe('fulfilled')

        // Verify sessions.
        const session1 = await createSession1Promise
        const session2 = await createSession2Promise
        expect(session1.destroy).toHaveBeenCalledTimes(1)
        expect(session2.destroy).toHaveBeenCalledTimes(0)
        await expect(
            authClient.mayReadContent('type', 'id'),
        ).resolves.toBeTrue()
        expect(session1.mayReadContent).toHaveBeenCalledTimes(0)
        expect(session2.mayReadContent).toHaveBeenCalledTimes(1)
        expect(session2.mayReadContent).toHaveBeenCalledWith('type', 'id')

        // Verify events.
        await whenNextTick()
        expect(onInactive).toHaveBeenCalledTimes(0)
        expect(onActive).toHaveBeenCalledTimes(1)
        expect(onActive).toHaveBeenCalledWith({ sessionId, userId })
    })

    test('concurrent error', async () => {
        const userName2 = userName + '-2'
        const password2 = password + '-2'
        const otherCredentials = { userName: userName2, password: password2 }
        const onActive = jest.fn()
        const onInactive = jest.fn()
        authClient.on('active', onActive)
        authClient.on('inactive', onInactive)

        let createSession1Reject: (error: Error) => void = noop
        const createSession1Promise = new Promise<Session>(
            (_, reject) => (createSession1Reject = reject),
        )
        createSession.mockReturnValueOnce(createSession1Promise)

        let createSession2Reject: (error: Error) => void = noop
        const createSession2Promise = new Promise<Session>(
            (_, reject) => (createSession2Reject = reject),
        )
        createSession.mockReturnValueOnce(createSession2Promise)

        // Try to log in twice.
        const promises = [
            authClient.logIn(otherCredentials),
            authClient.logIn(credentials),
        ]

        // Fail to create sessions - the order does not matter, as the last request always wins.
        createSession2Reject(testError)
        createSession1Reject(testError)

        // Wait for results.
        const results = await Promise.allSettled(promises)
        expect(results[0].status).toBe('rejected')
        expect((results[0] as PromiseRejectedResult).reason).toStrictEqual(
            expect.objectContaining({
                name: 'SyncOTError Auth',
                message: 'Request canceled. => Error: test-error',
                cause: testError,
            }),
        )
        expect(results[1].status).toBe('rejected')
        expect((results[1] as PromiseRejectedResult).reason).toStrictEqual(
            expect.objectContaining({
                name: 'SyncOTError Auth',
                message: 'Failed to create session. => Error: test-error',
                cause: testError,
            }),
        )

        // Verify events.
        await whenNextTick()
        expect(onInactive).toHaveBeenCalledTimes(0)
        expect(onActive).toHaveBeenCalledTimes(0)
    })
})

describe('logOut', () => {
    beforeEach(() => {
        authService = createAuthService({
            connection: serverConnection,
            createSession,
        })
    })

    test('destroyed', async () => {
        authService.destroy()
        await expect(authClient.logOut()).rejects.toStrictEqual(
            destroyedMatcher,
        )
    })

    test('when inactive', async () => {
        const onActive = jest.fn()
        const onInactive = jest.fn()
        authClient.on('active', onActive)
        authClient.on('inactive', onInactive)

        await authClient.logOut()
        await whenNextTick()
        expect(onInactive).toHaveBeenCalledTimes(0)
        expect(onActive).toHaveBeenCalledTimes(0)
    })

    test('when active', async () => {
        const onActive = jest.fn()
        const onInactive = jest.fn()
        authClient.on('active', onActive)
        authClient.on('inactive', onInactive)

        await authClient.logIn(credentials)
        expect(authService.active).toBeTrue()
        expect(authService.userId).toBe(userId)
        expect(authService.sessionId).toBe(sessionId)
        await whenNextTick()
        expect(onInactive).toHaveBeenCalledTimes(0)
        expect(onActive).toHaveBeenCalledTimes(1)
        onActive.mockClear()

        await authClient.logOut()
        expect(authService.active).toBeFalse()
        expect(authService.userId).toBe(undefined)
        expect(authService.sessionId).toBe(undefined)
        await whenNextTick()
        expect(onInactive).toHaveBeenCalledTimes(1)
        expect(onActive).toHaveBeenCalledTimes(0)
    })

    test('concurrent logIn and logOut', async () => {
        const onActive = jest.fn()
        const onInactive = jest.fn()
        authClient.on('active', onActive)
        authClient.on('inactive', onInactive)

        let createSessionResolve: (session: Session) => void = noop
        const createSessionPromise = new Promise<Session>(
            (resolve) => (createSessionResolve = resolve),
        )
        createSession.mockReturnValueOnce(createSessionPromise)

        // Log out before log in completes.
        const promises = [authClient.logIn(credentials), authClient.logOut()]

        // Create a session.
        createSessionResolve(createSessionMock(userId, sessionId))

        // Wait for results.
        const results = await Promise.allSettled(promises)
        expect(results[0].status).toBe('rejected')
        expect((results[0] as PromiseRejectedResult).reason).toStrictEqual(
            expect.objectContaining({
                name: 'SyncOTError Auth',
                message: 'Request canceled.',
            }),
        )
        expect(results[1].status).toBe('fulfilled')

        // Verify session.
        const session = await createSessionPromise
        expect(session.destroy).toHaveBeenCalledTimes(1)
        await expect(
            authClient.mayReadContent('type', 'id'),
        ).resolves.toBeFalse()
        expect(session.mayReadContent).toHaveBeenCalledTimes(0)

        // Verify events.
        await whenNextTick()
        expect(onInactive).toHaveBeenCalledTimes(0)
        expect(onActive).toHaveBeenCalledTimes(0)
    })

    test('on disconnect', async () => {
        const onActive = jest.fn()
        const onInactive = jest.fn()
        authService.on('active', onActive)
        authService.on('inactive', onInactive)

        await authClient.logIn(credentials)
        expect(authService.active).toBeTrue()
        expect(authService.userId).toBe(userId)
        expect(authService.sessionId).toBe(sessionId)
        await whenNextTick()
        expect(onInactive).toHaveBeenCalledTimes(0)
        expect(onActive).toHaveBeenCalledTimes(1)
        onActive.mockClear()

        serverConnection.disconnect()
        await whenNextTick()
        expect(authService.active).toBeFalse()
        expect(authService.userId).toBe(undefined)
        expect(authService.sessionId).toBe(undefined)
        expect(onInactive).toHaveBeenCalledTimes(1)
        expect(onActive).toHaveBeenCalledTimes(0)
    })

    test('on destroy', async () => {
        const onActive = jest.fn()
        const onInactive = jest.fn()
        authService.on('active', onActive)
        authService.on('inactive', onInactive)

        await authClient.logIn(credentials)
        expect(authService.active).toBeTrue()
        expect(authService.userId).toBe(userId)
        expect(authService.sessionId).toBe(sessionId)
        await whenNextTick()
        expect(onInactive).toHaveBeenCalledTimes(0)
        expect(onActive).toHaveBeenCalledTimes(1)
        onActive.mockClear()

        authService.destroy()
        expect(authService.active).toBeFalse()
        expect(authService.userId).toBe(undefined)
        expect(authService.sessionId).toBe(undefined)
        await whenDestroy(authService)

        // It's safe to call it multiple times.
        authService.destroy()
    })
})

describe('permissions', () => {
    let session: MockSession
    beforeEach(() => {
        session = createSessionMock(userId, sessionId)
        createSession.mockReturnValueOnce(session)
        authService = createAuthService({
            connection: serverConnection,
            createSession,
        })
    })

    describe('mayReadContent', () => {
        test('destroyed', async () => {
            authService.destroy()
            await expect(
                authClient.mayReadContent('type', 'id'),
            ).rejects.toStrictEqual(destroyedMatcher)
        })
        test('without session', async () => {
            await expect(authClient.mayReadContent('type', 'id')).resolves.toBe(
                false,
            )
        })
        test('with session', async () => {
            await authClient.logIn(credentials)
            session.mayReadContent.mockReturnValueOnce(false)
            await expect(authClient.mayReadContent('type', 'id')).resolves.toBe(
                false,
            )
            await expect(authClient.mayReadContent('type', 'id')).resolves.toBe(
                true,
            )
            expect(session.mayReadContent).toHaveBeenCalledTimes(2)
            expect(session.mayReadContent).toHaveBeenCalledWith('type', 'id')
        })
    })

    describe('mayWriteContent', () => {
        test('destroyed', async () => {
            authService.destroy()
            await expect(
                authClient.mayWriteContent('type', 'id'),
            ).rejects.toStrictEqual(destroyedMatcher)
        })
        test('without session', async () => {
            await expect(
                authClient.mayWriteContent('type', 'id'),
            ).resolves.toBe(false)
        })
        test('with session', async () => {
            await authClient.logIn(credentials)
            session.mayWriteContent.mockReturnValueOnce(false)
            await expect(
                authClient.mayWriteContent('type', 'id'),
            ).resolves.toBe(false)
            await expect(
                authClient.mayWriteContent('type', 'id'),
            ).resolves.toBe(true)
            expect(session.mayWriteContent).toHaveBeenCalledTimes(2)
            expect(session.mayWriteContent).toHaveBeenCalledWith('type', 'id')
        })
    })

    describe('mayReadPresence', () => {
        test('destroyed', async () => {
            authService.destroy()
            await expect(
                authClient.mayReadPresence('presence'),
            ).rejects.toStrictEqual(destroyedMatcher)
        })
        test('without session', async () => {
            await expect(authClient.mayReadPresence('presence')).resolves.toBe(
                false,
            )
        })
        test('with session', async () => {
            await authClient.logIn(credentials)
            session.mayReadPresence.mockReturnValueOnce(false)
            await expect(authClient.mayReadPresence('presence')).resolves.toBe(
                false,
            )
            await expect(authClient.mayReadPresence('presence')).resolves.toBe(
                true,
            )
            expect(session.mayReadPresence).toHaveBeenCalledTimes(2)
            expect(session.mayReadPresence).toHaveBeenCalledWith('presence')
        })
    })

    describe('mayWritePresence', () => {
        test('destroyed', async () => {
            authService.destroy()
            await expect(
                authClient.mayWritePresence('presence'),
            ).rejects.toStrictEqual(destroyedMatcher)
        })
        test('without session', async () => {
            await expect(authClient.mayWritePresence('presence')).resolves.toBe(
                false,
            )
        })
        test('with session', async () => {
            await authClient.logIn(credentials)
            session.mayWritePresence.mockReturnValueOnce(false)
            await expect(authClient.mayWritePresence('presence')).resolves.toBe(
                false,
            )
            await expect(authClient.mayWritePresence('presence')).resolves.toBe(
                true,
            )
            expect(session.mayWritePresence).toHaveBeenCalledTimes(2)
            expect(session.mayWritePresence).toHaveBeenCalledWith('presence')
        })
    })
})

describe('BaseSession', () => {
    test('default userId and sessionId', () => {
        const session1 = new BaseSession()
        const session2 = new BaseSession()
        expect(session1.sessionId).toBeString()
        expect(session1.userId).toBeString()
        expect(session2.sessionId).toBeString()
        expect(session2.userId).toBeString()
        expect(session1.sessionId).not.toBe(session2.sessionId)
        expect(session1.userId).not.toBe(session2.userId)
    })
    test('specific userId and sessionId', () => {
        const session = new BaseSession(userId, sessionId)
        expect(session.userId).toBe(userId)
        expect(session.sessionId).toBe(sessionId)
    })
    test('destroy', () => {
        const session = new BaseSession()
        session.destroy()
    })
    test('mayReadContent', () => {
        const session = new BaseSession()
        expect(session.mayReadContent()).toBe(false)
    })
    test('mayWriteContent', () => {
        const session = new BaseSession()
        expect(session.mayWriteContent()).toBe(false)
    })
    test('mayReadPresence', () => {
        const session = new BaseSession()
        expect(session.mayReadPresence()).toBe(false)
    })
    test('mayWritePresence', () => {
        const session = new BaseSession()
        expect(session.mayWritePresence()).toBe(false)
    })
})
