import { AuthManager } from '@syncot/auth'
import { Connection, createConnection } from '@syncot/core'
import { binaryEqual } from '@syncot/util'
import { Duplex } from 'stream'
import { createAuthManager } from '.'

const createDuplex = () =>
    new Duplex({
        read: () => undefined,
        write: () => undefined,
    })

const userId = new ArrayBuffer(0)
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
    test('mayRead', async () => {
        authManager = createAuthManager(connection)
        await expect(authManager.mayRead('', '')).resolves.toBeFalse()
    })
    test('mayWrite', async () => {
        authManager = createAuthManager(connection)
        await expect(authManager.mayWrite('', '')).resolves.toBeFalse()
    })
    test('events when not connected', async () => {
        const onUser = jest.fn()
        const onAuth = jest.fn()
        authManager = createAuthManager(connection)
        authManager.on('user', onUser)
        authManager.on('auth', onAuth)
        await Promise.resolve()
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
        await Promise.resolve()
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
        await Promise.resolve()
        expect(onDestroy).toHaveBeenCalledTimes(1)
        expect(onUser).not.toHaveBeenCalled()
        expect(onAuth).not.toHaveBeenCalled()
        expect(authManager.getUserId()).toBeUndefined()
        expect(authManager.hasUserId()).toBeFalse()
        expect(authManager.hasAuthenticatedUserId()).toBeFalse()
        await expect(authManager.mayRead('', '')).resolves.toBeFalse()
        await expect(authManager.mayWrite('', '')).resolves.toBeFalse()
    })
    test('destroy twice', async () => {
        const onDestroy = jest.fn()
        authManager = createAuthManager(connection)
        authManager.on('destroy', onDestroy)
        authManager.destroy()
        authManager.destroy()
        await Promise.resolve()
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
        await Promise.resolve()
        await Promise.resolve()
        expect(onAuth).not.toHaveBeenCalled()
        expect(onDestroy).toHaveBeenCalledTimes(1)
    })
})

describe('initially disconnected', () => {
    beforeEach(() => {
        authManager = createAuthManager(connection)
    })

    test('initial state', async () => {
        expect(binaryEqual(authManager.getUserId()!, userId)).toBeTrue()
        expect(authManager.hasUserId()).toBeTrue()
        expect(authManager.hasAuthenticatedUserId()).toBeFalse()
    })
    test('mayRead', async () => {
        await expect(authManager.mayRead('', '')).resolves.toBeTrue()
    })
    test('mayWrite', async () => {
        await expect(authManager.mayWrite('', '')).resolves.toBeTrue()
    })
    test('connect', async () => {
        const onAuth = jest.fn()
        authManager.on('auth', onAuth)
        connection.connect(stream)
        expect(onAuth).toHaveBeenCalledTimes(1)
        expect(authManager.hasAuthenticatedUserId()).toBeTrue()
    })
    test('destroy', async () => {
        const onDestroy = jest.fn()
        authManager.on('destroy', onDestroy)
        authManager.destroy()
        await Promise.resolve()
        expect(onDestroy).toHaveBeenCalledTimes(1)
        expect(authManager.getUserId()).toBeUndefined()
        expect(authManager.hasUserId()).toBeFalse()
        expect(authManager.hasAuthenticatedUserId()).toBeFalse()
        await expect(authManager.mayRead('', '')).resolves.toBeFalse()
        await expect(authManager.mayWrite('', '')).resolves.toBeFalse()
    })
})

describe('initially connected', () => {
    beforeEach(() => {
        connection.connect(stream)
        authManager = createAuthManager(connection)
    })

    test('initial state', async () => {
        expect(binaryEqual(authManager.getUserId()!, userId)).toBeTrue()
        expect(authManager.hasUserId()).toBeTrue()
        expect(authManager.hasAuthenticatedUserId()).toBeTrue()
    })
    test('mayRead', async () => {
        await expect(authManager.mayRead('', '')).resolves.toBeTrue()
    })
    test('mayWrite', async () => {
        await expect(authManager.mayWrite('', '')).resolves.toBeTrue()
    })
    test('disconnect', () => {
        const onAuthEnd = jest.fn()
        authManager.on('authEnd', onAuthEnd)
        connection.disconnect()
        expect(onAuthEnd).toHaveBeenCalledTimes(1)
        expect(authManager.hasAuthenticatedUserId()).toBeFalse()
    })
    test('destroy', async () => {
        const onDestroy = jest.fn()
        authManager.on('destroy', onDestroy)
        authManager.destroy()
        await Promise.resolve()
        expect(onDestroy).toHaveBeenCalledTimes(1)
        expect(authManager.getUserId()).toBeUndefined()
        expect(authManager.hasUserId()).toBeFalse()
        expect(authManager.hasAuthenticatedUserId()).toBeFalse()
        await expect(authManager.mayRead('', '')).resolves.toBeFalse()
        await expect(authManager.mayWrite('', '')).resolves.toBeFalse()
    })
})
