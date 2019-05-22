import { AuthClient } from '@syncot/auth'
import { Connection, createConnection } from '@syncot/connection'
import { Duplex } from 'readable-stream'
import { createAuthClient } from '.'

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
let authClient: AuthClient

beforeEach(() => {
    stream = createDuplex()
    connection = createConnection()
})

describe('AuthClient', () => {
    describe('right after create', () => {
        test('invalid connection (missing)', () => {
            expect(() => createAuthClient(undefined as any)).toThrow(
                expect.objectContaining({
                    message:
                        'Argument "connection" must be a non-destroyed Connection.',
                    name: 'AssertionError',
                }),
            )
        })
        test('invalid connection (destroyed)', () => {
            const newConnection = createConnection()
            newConnection.destroy()
            expect(() => createAuthClient(newConnection)).toThrow(
                expect.objectContaining({
                    message:
                        'Argument "connection" must be a non-destroyed Connection.',
                    name: 'AssertionError',
                }),
            )
        })
        test('destroy on connection destroy', async () => {
            authClient = createAuthClient(connection)
            connection.destroy()
            await new Promise(resolve => authClient.once('destroy', resolve))
        })
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
            expect(authClient.getUserId()).toBe(userId)
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
            expect(authClient.getUserId()).toBe(userId)
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
