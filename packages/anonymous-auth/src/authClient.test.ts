import { AuthClient } from '@syncot/auth'
import { Connection, createConnection } from '@syncot/connection'
import { idEqual } from '@syncot/util'
import { Duplex } from 'stream'
import { createAuthClient } from '.'

const delay = (time: number = 0) =>
    new Promise(resolve => setTimeout(resolve, time))

const createDuplex = () =>
    new Duplex({
        read: () => undefined,
        write: () => undefined,
    })

const userId = 0
let stream: Duplex
let connection: Connection
let authClient: AuthClient

beforeEach(() => {
    stream = createDuplex()
    connection = createConnection()
})

describe('AuthClient', () => {
    describe('right after create', () => {
        test('initial state', async () => {
            authClient = createAuthClient(connection)
            expect(authClient.getUserId()).toBeUndefined()
            expect(authClient.hasUserId()).toBeFalse()
            expect(authClient.hasAuthenticatedUserId()).toBeFalse()
        })
        test('events when not connected', async () => {
            const onUser = jest.fn()
            const onAuth = jest.fn()
            authClient = createAuthClient(connection)
            authClient.on('user', onUser)
            authClient.on('auth', onAuth)
            await delay()
            expect(onUser).toHaveBeenCalledTimes(1)
            expect(onAuth).not.toHaveBeenCalled()
        })
        test('events when connected', async () => {
            const onUser = jest.fn()
            const onAuth = jest.fn()
            connection.connect(stream)
            authClient = createAuthClient(connection)
            authClient.on('user', onUser)
            authClient.on('auth', onAuth)
            await delay()
            expect(onUser).toHaveBeenCalledTimes(1)
            expect(onAuth).toHaveBeenCalledTimes(1)
            expect(onAuth).toHaveBeenCalledAfter(onUser)
        })
        test('destroy', async () => {
            const onUser = jest.fn()
            const onAuth = jest.fn()
            const onDestroy = jest.fn()
            authClient = createAuthClient(connection)
            authClient.on('user', onUser)
            authClient.on('auth', onAuth)
            authClient.on('destroy', onDestroy)
            authClient.destroy()
            await delay()
            expect(onDestroy).toHaveBeenCalledTimes(1)
            expect(onUser).not.toHaveBeenCalled()
            expect(onAuth).not.toHaveBeenCalled()
            expect(authClient.getUserId()).toBeUndefined()
            expect(authClient.hasUserId()).toBeFalse()
            expect(authClient.hasAuthenticatedUserId()).toBeFalse()
        })
        test('destroy twice', async () => {
            const onDestroy = jest.fn()
            authClient = createAuthClient(connection)
            authClient.on('destroy', onDestroy)
            authClient.destroy()
            authClient.destroy()
            await delay()
            expect(onDestroy).toHaveBeenCalledTimes(1)
        })
        test('destroy on user event', async () => {
            const onAuth = jest.fn()
            const onDestroy = jest.fn()
            authClient = createAuthClient(connection)
            authClient.on('user', () => {
                authClient.destroy()
            })
            authClient.on('auth', onAuth)
            authClient.on('destroy', onDestroy)
            connection.connect(stream)
            await delay()
            expect(onAuth).not.toHaveBeenCalled()
            expect(onDestroy).toHaveBeenCalledTimes(1)
        })
    })

    describe('initially disconnected', () => {
        beforeEach(() => {
            authClient = createAuthClient(connection)
        })

        test('initial state', async () => {
            expect(idEqual(authClient.getUserId(), userId)).toBeTrue()
            expect(authClient.hasUserId()).toBeTrue()
            expect(authClient.hasAuthenticatedUserId()).toBeFalse()
        })
        test('connect', async () => {
            const onAuth = jest.fn()
            authClient.on('auth', onAuth)
            connection.connect(stream)
            await delay()
            expect(onAuth).toHaveBeenCalledTimes(1)
            expect(authClient.hasAuthenticatedUserId()).toBeTrue()
        })
        test('destroy', async () => {
            const onDestroy = jest.fn()
            authClient.on('destroy', onDestroy)
            authClient.destroy()
            await delay()
            expect(onDestroy).toHaveBeenCalledTimes(1)
            expect(authClient.getUserId()).toBeUndefined()
            expect(authClient.hasUserId()).toBeFalse()
            expect(authClient.hasAuthenticatedUserId()).toBeFalse()
        })
    })

    describe('initially connected', () => {
        beforeEach(() => {
            connection.connect(stream)
            authClient = createAuthClient(connection)
        })

        test('initial state', async () => {
            expect(idEqual(authClient.getUserId(), userId)).toBeTrue()
            expect(authClient.hasUserId()).toBeTrue()
            expect(authClient.hasAuthenticatedUserId()).toBeTrue()
        })
        test('disconnect', async () => {
            const onAuthEnd = jest.fn()
            authClient.on('authEnd', onAuthEnd)
            connection.disconnect()
            await delay()
            expect(onAuthEnd).toHaveBeenCalledTimes(1)
            expect(authClient.hasAuthenticatedUserId()).toBeFalse()
        })
        test('destroy', async () => {
            const onDestroy = jest.fn()
            authClient.on('destroy', onDestroy)
            authClient.destroy()
            await delay()
            expect(onDestroy).toHaveBeenCalledTimes(1)
            expect(authClient.getUserId()).toBeUndefined()
            expect(authClient.hasUserId()).toBeFalse()
            expect(authClient.hasAuthenticatedUserId()).toBeFalse()
        })
    })
})
