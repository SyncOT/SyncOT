import { AuthService } from '@syncot/auth'
import { Connection, createConnection } from '@syncot/connection'
import { Presence } from '@syncot/presence'
import { Duplex } from 'stream'
import { createAuthService } from '.'

const delay = (time: number = 0) =>
    new Promise(resolve => setTimeout(resolve, time))

const createDuplex = () =>
    new Duplex({
        read: () => undefined,
        write: () => undefined,
    })

const userId = ''
let stream: Duplex
let connection: Connection
let authService: AuthService

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

    await expect(mayReadDocument).resolves.toBe(granted)
    await expect(mayWriteDocument).resolves.toBe(granted)
    await expect(mayReadPresence).resolves.toBe(granted)
    await expect(mayWritePresence).resolves.toBe(granted)
}

beforeEach(() => {
    stream = createDuplex()
    connection = createConnection()
})

describe('AuthService', () => {
    describe('right after create', () => {
        test('initial state', async () => {
            authService = createAuthService(connection)
            expect(authService.getUserId()).toBeUndefined()
            expect(authService.hasUserId()).toBeFalse()
            expect(authService.hasAuthenticatedUserId()).toBeFalse()
            await checkAccess(false)
        })
        test('events when not connected', async () => {
            const onUser = jest.fn()
            const onAuth = jest.fn()
            authService = createAuthService(connection)
            authService.on('user', onUser)
            authService.on('auth', onAuth)
            await delay()
            expect(onUser).toHaveBeenCalledTimes(1)
            expect(onAuth).not.toHaveBeenCalled()
        })
        test('events when connected', async () => {
            const onUser = jest.fn()
            const onAuth = jest.fn()
            connection.connect(stream)
            authService = createAuthService(connection)
            authService.on('user', onUser)
            authService.on('auth', onAuth)
            await delay()
            expect(onUser).toHaveBeenCalledTimes(1)
            expect(onAuth).toHaveBeenCalledTimes(1)
            expect(onAuth).toHaveBeenCalledAfter(onUser)
        })
        test('destroy', async () => {
            const onUser = jest.fn()
            const onAuth = jest.fn()
            const onDestroy = jest.fn()
            authService = createAuthService(connection)
            authService.on('user', onUser)
            authService.on('auth', onAuth)
            authService.on('destroy', onDestroy)
            authService.destroy()
            await delay()
            expect(onDestroy).toHaveBeenCalledTimes(1)
            expect(onUser).not.toHaveBeenCalled()
            expect(onAuth).not.toHaveBeenCalled()
            expect(authService.getUserId()).toBeUndefined()
            expect(authService.hasUserId()).toBeFalse()
            expect(authService.hasAuthenticatedUserId()).toBeFalse()
            await checkAccess(false)
        })
        test('destroy twice', async () => {
            const onDestroy = jest.fn()
            authService = createAuthService(connection)
            authService.on('destroy', onDestroy)
            authService.destroy()
            authService.destroy()
            await delay()
            expect(onDestroy).toHaveBeenCalledTimes(1)
        })
        test('destroy on user event', async () => {
            const onAuth = jest.fn()
            const onDestroy = jest.fn()
            authService = createAuthService(connection)
            authService.on('user', () => {
                authService.destroy()
            })
            authService.on('auth', onAuth)
            authService.on('destroy', onDestroy)
            connection.connect(stream)
            await delay()
            expect(onAuth).not.toHaveBeenCalled()
            expect(onDestroy).toHaveBeenCalledTimes(1)
        })
    })

    describe('initially disconnected', () => {
        beforeEach(() => {
            authService = createAuthService(connection)
        })

        test('initial state', async () => {
            expect(authService.getUserId()).toBe(userId)
            expect(authService.hasUserId()).toBeTrue()
            expect(authService.hasAuthenticatedUserId()).toBeFalse()
            await checkAccess(true)
        })
        test('connect', async () => {
            const onAuth = jest.fn()
            authService.on('auth', onAuth)
            connection.connect(stream)
            await delay()
            expect(onAuth).toHaveBeenCalledTimes(1)
            expect(authService.hasAuthenticatedUserId()).toBeTrue()
        })
        test('destroy', async () => {
            const onDestroy = jest.fn()
            authService.on('destroy', onDestroy)
            authService.destroy()
            await delay()
            expect(onDestroy).toHaveBeenCalledTimes(1)
            expect(authService.getUserId()).toBeUndefined()
            expect(authService.hasUserId()).toBeFalse()
            expect(authService.hasAuthenticatedUserId()).toBeFalse()
            await checkAccess(false)
        })
    })

    describe('initially connected', () => {
        beforeEach(() => {
            connection.connect(stream)
            authService = createAuthService(connection)
        })

        test('initial state', async () => {
            expect(authService.getUserId()).toBe(userId)
            expect(authService.hasUserId()).toBeTrue()
            expect(authService.hasAuthenticatedUserId()).toBeTrue()
            await checkAccess(true)
        })
        test('disconnect', async () => {
            const onAuthEnd = jest.fn()
            authService.on('authEnd', onAuthEnd)
            connection.disconnect()
            await delay()
            expect(onAuthEnd).toHaveBeenCalledTimes(1)
            expect(authService.hasAuthenticatedUserId()).toBeFalse()
        })
        test('destroy', async () => {
            const onDestroy = jest.fn()
            authService.on('destroy', onDestroy)
            authService.destroy()
            await delay()
            expect(onDestroy).toHaveBeenCalledTimes(1)
            expect(authService.getUserId()).toBeUndefined()
            expect(authService.hasUserId()).toBeFalse()
            expect(authService.hasAuthenticatedUserId()).toBeFalse()
            await checkAccess(false)
        })
    })
})
