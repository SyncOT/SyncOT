import { AuthManager } from '@syncot/auth'
import { Connection, createConnection } from '@syncot/core'
import { idEqual } from '@syncot/util'
import { Duplex } from 'stream'
import { createAuthManager } from '.'

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
let authManager: AuthManager

beforeEach(() => {
    stream = createDuplex()
    connection = createConnection()
})

describe('right after create', () => {
    test('initial state', () => {
        authManager = createAuthManager(connection)
        expect(authManager.getUserId()).toBeUndefined()
        expect(authManager.hasUserId()).toBeFalse()
        expect(authManager.hasAuthenticatedUserId()).toBeFalse()
    })
    test('mayReadDocument', async () => {
        authManager = createAuthManager(connection)
        await expect(authManager.mayReadDocument('', '')).resolves.toBeFalse()
    })
    test('mayWriteDocument', async () => {
        authManager = createAuthManager(connection)
        await expect(authManager.mayWriteDocument('', '')).resolves.toBeFalse()
    })
    test('events when not connected', async () => {
        const onUser = jest.fn()
        const onAuth = jest.fn()
        authManager = createAuthManager(connection)
        authManager.on('user', onUser)
        authManager.on('auth', onAuth)
        await delay()
        expect(onUser).toHaveBeenCalledTimes(1)
        expect(onAuth).not.toHaveBeenCalled()
    })
    test('events when connected', async () => {
        const onUser = jest.fn()
        const onAuth = jest.fn()
        connection.connect(stream)
        authManager = createAuthManager(connection)
        authManager.on('user', onUser)
        authManager.on('auth', onAuth)
        await delay()
        expect(onUser).toHaveBeenCalledTimes(1)
        expect(onAuth).toHaveBeenCalledTimes(1)
        expect(onAuth).toHaveBeenCalledAfter(onUser)
    })
    test('destroy', async () => {
        const onUser = jest.fn()
        const onAuth = jest.fn()
        const onDestroy = jest.fn()
        authManager = createAuthManager(connection)
        authManager.on('user', onUser)
        authManager.on('auth', onAuth)
        authManager.on('destroy', onDestroy)
        authManager.destroy()
        await delay()
        expect(onDestroy).toHaveBeenCalledTimes(1)
        expect(onUser).not.toHaveBeenCalled()
        expect(onAuth).not.toHaveBeenCalled()
        expect(authManager.getUserId()).toBeUndefined()
        expect(authManager.hasUserId()).toBeFalse()
        expect(authManager.hasAuthenticatedUserId()).toBeFalse()
        await expect(authManager.mayReadDocument('', '')).resolves.toBeFalse()
        await expect(authManager.mayWriteDocument('', '')).resolves.toBeFalse()
    })
    test('destroy twice', async () => {
        const onDestroy = jest.fn()
        authManager = createAuthManager(connection)
        authManager.on('destroy', onDestroy)
        authManager.destroy()
        authManager.destroy()
        await delay()
        expect(onDestroy).toHaveBeenCalledTimes(1)
    })
    test('destroy on user event', async () => {
        const onAuth = jest.fn()
        const onDestroy = jest.fn()
        authManager = createAuthManager(connection)
        authManager.on('user', () => {
            authManager.destroy()
        })
        authManager.on('auth', onAuth)
        authManager.on('destroy', onDestroy)
        connection.connect(stream)
        await delay()
        expect(onAuth).not.toHaveBeenCalled()
        expect(onDestroy).toHaveBeenCalledTimes(1)
    })
})

describe('initially disconnected', () => {
    beforeEach(() => {
        authManager = createAuthManager(connection)
    })

    test('initial state', async () => {
        expect(idEqual(authManager.getUserId(), userId)).toBeTrue()
        expect(authManager.hasUserId()).toBeTrue()
        expect(authManager.hasAuthenticatedUserId()).toBeFalse()
    })
    test('mayReadDocument', async () => {
        await expect(authManager.mayReadDocument('', '')).resolves.toBeTrue()
    })
    test('mayWriteDocument', async () => {
        await expect(authManager.mayWriteDocument('', '')).resolves.toBeTrue()
    })
    test('connect', async () => {
        const onAuth = jest.fn()
        authManager.on('auth', onAuth)
        connection.connect(stream)
        await delay()
        expect(onAuth).toHaveBeenCalledTimes(1)
        expect(authManager.hasAuthenticatedUserId()).toBeTrue()
    })
    test('destroy', async () => {
        const onDestroy = jest.fn()
        authManager.on('destroy', onDestroy)
        authManager.destroy()
        await delay()
        expect(onDestroy).toHaveBeenCalledTimes(1)
        expect(authManager.getUserId()).toBeUndefined()
        expect(authManager.hasUserId()).toBeFalse()
        expect(authManager.hasAuthenticatedUserId()).toBeFalse()
        await expect(authManager.mayReadDocument('', '')).resolves.toBeFalse()
        await expect(authManager.mayWriteDocument('', '')).resolves.toBeFalse()
    })
})

describe('initially connected', () => {
    beforeEach(() => {
        connection.connect(stream)
        authManager = createAuthManager(connection)
    })

    test('initial state', async () => {
        expect(idEqual(authManager.getUserId(), userId)).toBeTrue()
        expect(authManager.hasUserId()).toBeTrue()
        expect(authManager.hasAuthenticatedUserId()).toBeTrue()
    })
    test('mayReadDocument', async () => {
        await expect(authManager.mayReadDocument('', '')).resolves.toBeTrue()
    })
    test('mayWriteDocument', async () => {
        await expect(authManager.mayWriteDocument('', '')).resolves.toBeTrue()
    })
    test('disconnect', async () => {
        const onAuthEnd = jest.fn()
        authManager.on('authEnd', onAuthEnd)
        connection.disconnect()
        await delay()
        expect(onAuthEnd).toHaveBeenCalledTimes(1)
        expect(authManager.hasAuthenticatedUserId()).toBeFalse()
    })
    test('destroy', async () => {
        const onDestroy = jest.fn()
        authManager.on('destroy', onDestroy)
        authManager.destroy()
        await delay()
        expect(onDestroy).toHaveBeenCalledTimes(1)
        expect(authManager.getUserId()).toBeUndefined()
        expect(authManager.hasUserId()).toBeFalse()
        expect(authManager.hasAuthenticatedUserId()).toBeFalse()
        await expect(authManager.mayReadDocument('', '')).resolves.toBeFalse()
        await expect(authManager.mayWriteDocument('', '')).resolves.toBeFalse()
    })
})
