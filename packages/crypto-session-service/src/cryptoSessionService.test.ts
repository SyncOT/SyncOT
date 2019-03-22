import { Connection, createConnection } from '@syncot/core'
import { SessionManager } from '@syncot/session'
import { invertedStreams, toArrayBuffer, toBuffer } from '@syncot/util'
import { createHash, createSign, generateKeyPairSync } from 'crypto'
import { Duplex } from 'stream'
import { createSessionManager } from '.'

const delay = (time: number = 0) =>
    new Promise(resolve => setTimeout(resolve, time))

interface SessionManagerProxy {
    getChallenge(): Promise<ArrayBuffer>
    activateSession(
        publicKey: ArrayBuffer,
        sessionId: ArrayBuffer,
        challengeReply: ArrayBuffer,
    ): Promise<void>
}

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 4096,
    publicExponent: 0x10001,
})
const publicKeyDer = publicKey.export({
    format: 'der',
    type: 'spki',
})

const hash = createHash('SHA256')
hash.update(publicKeyDer)
const sessionId = hash.digest().slice(0, 16)

let clientStream: Duplex
let serverStream: Duplex
let clientConnection: Connection
let serverConnection: Connection
let sessionManager: SessionManager
let proxy: SessionManagerProxy

const activateSession = async () => {
    const challenge = await proxy.getChallenge()
    const sign = createSign('SHA256')
    sign.update(toBuffer(challenge))
    const signature = sign.sign(privateKey as any)
    await proxy.activateSession(
        toArrayBuffer(publicKeyDer),
        sessionId,
        signature,
    )
}

beforeEach(() => {
    ;[clientStream, serverStream] = invertedStreams({ objectMode: true })
    clientConnection = createConnection()
    serverConnection = createConnection()
    clientConnection.connect(clientStream)
    serverConnection.connect(serverStream)
    sessionManager = createSessionManager(serverConnection)
    clientConnection.registerProxy({
        actions: new Set(['getChallenge', 'activateSession']),
        name: 'session',
    })
    proxy = clientConnection.getProxy('session') as SessionManagerProxy
})

test('initial state', () => {
    expect(sessionManager.getSessionId()).toBeUndefined()
    expect(sessionManager.hasSession()).toBeFalse()
    expect(sessionManager.hasActiveSession()).toBeFalse()
})

test('create twice on the same connection', () => {
    expect(() => createSessionManager(serverConnection)).toThrow(
        expect.objectContaining({
            message: 'Service "session" has been already registered.',
            name: 'AssertionError [ERR_ASSERTION]',
        }),
    )
})

test('destroy', async () => {
    const onDestroy = jest.fn()
    sessionManager.on('destroy', onDestroy)
    sessionManager.destroy()
    await Promise.resolve()
    expect(onDestroy).toHaveBeenCalledTimes(1)
    sessionManager.destroy()
    await Promise.resolve()
    expect(onDestroy).toHaveBeenCalledTimes(1)
})

test('disconnect', async () => {
    const onSessionInactive = jest.fn()
    const onSessionClose = jest.fn()
    sessionManager.on('sessionInactive', onSessionInactive)
    sessionManager.on('sessionClose', onSessionClose)
    serverConnection.disconnect()
    await Promise.resolve()
    expect(sessionManager.getSessionId()).toBeUndefined()
    expect(sessionManager.hasSession()).toBeFalse()
    expect(sessionManager.hasActiveSession()).toBeFalse()
    expect(onSessionInactive).not.toHaveBeenCalled()
    expect(onSessionClose).not.toHaveBeenCalled()
})

test('getChllenge', async () => {
    const challenge = await proxy.getChallenge()
    expect(challenge).toBeInstanceOf(ArrayBuffer)
    expect(challenge.byteLength).toBe(16)
})

test('activateSession', async () => {
    const onSessionOpen = jest.fn()
    const onSessionActive = jest.fn()
    const onSessionInactive = jest.fn()
    const onSessionClose = jest.fn()
    sessionManager.on('sessionOpen', onSessionOpen)
    sessionManager.on('sessionActive', onSessionActive)
    sessionManager.on('sessionInactive', onSessionInactive)
    sessionManager.on('sessionClose', onSessionClose)
    await activateSession()
    expect(sessionManager.getSessionId()).toBe(sessionId)
    expect(sessionManager.hasSession()).toBeTrue()
    expect(sessionManager.hasActiveSession()).toBeTrue()
    expect(onSessionOpen).toHaveBeenCalledTimes(1)
    expect(onSessionActive).toHaveBeenCalledTimes(1)
    expect(onSessionOpen).toHaveBeenCalledBefore(onSessionActive)
    expect(onSessionInactive).not.toHaveBeenCalled()
    expect(onSessionClose).not.toHaveBeenCalled()
})

test('invalid challenge reply', async () => {
    await expect(
        proxy.activateSession(
            toArrayBuffer(publicKeyDer),
            sessionId,
            new ArrayBuffer(8),
        ),
    ).rejects.toEqual(
        expect.objectContaining({
            message: 'Invalid challenge reply.',
            name: 'SyncOtError Session',
        }),
    )
    expect(sessionManager.getSessionId()).toBeUndefined()
})

test('invalid session id', async () => {
    const challenge = await proxy.getChallenge()
    const sign = createSign('SHA256')
    sign.update(toBuffer(challenge))
    const signature = sign.sign(privateKey as any) // as any - node typings are out of date
    await expect(
        proxy.activateSession(
            toArrayBuffer(publicKeyDer),
            new ArrayBuffer(16),
            signature,
        ),
    ).rejects.toEqual(
        expect.objectContaining({
            message: 'Invalid session ID.',
            name: 'SyncOtError Session',
        }),
    )
    expect(sessionManager.getSessionId()).toBeUndefined()
})

describe('active session', () => {
    beforeEach(async () => {
        await activateSession()
    })

    test('destroy', async () => {
        const onDestroy = jest.fn()
        const onSessionInactive = jest.fn()
        const onSessionClose = jest.fn()
        sessionManager.on('sessionInactive', onSessionInactive)
        sessionManager.on('sessionClose', onSessionClose)
        sessionManager.on('destroy', onDestroy)
        sessionManager.destroy()
        expect(sessionManager.getSessionId()).toBeUndefined()
        expect(sessionManager.hasSession()).toBeFalse()
        expect(sessionManager.hasActiveSession()).toBeFalse()
        expect(onSessionInactive).not.toHaveBeenCalled()
        expect(onSessionClose).not.toHaveBeenCalled()
        await Promise.resolve()
        expect(onDestroy).toHaveBeenCalledTimes(1)
    })

    test('disconnect', async () => {
        const onSessionInactive = jest.fn()
        const onSessionClose = jest.fn()
        sessionManager.on('sessionInactive', onSessionInactive)
        sessionManager.on('sessionClose', onSessionClose)
        serverConnection.disconnect()
        await delay()
        expect(sessionManager.getSessionId()).toBeUndefined()
        expect(sessionManager.hasSession()).toBeFalse()
        expect(sessionManager.hasActiveSession()).toBeFalse()
        expect(onSessionInactive).toHaveBeenCalledTimes(1)
        expect(onSessionClose).toHaveBeenCalledTimes(1)
        expect(onSessionInactive).toHaveBeenCalledBefore(onSessionClose)
    })

    test('activate session again - the same input', async () => {
        const onSessionOpen = jest.fn()
        const onSessionActive = jest.fn()
        sessionManager.on('sessionOpen', onSessionOpen)
        sessionManager.on('sessionActive', onSessionActive)
        await expect(activateSession()).resolves.toBeUndefined()
        expect(sessionManager.getSessionId()).toBe(sessionId)
        expect(onSessionActive).not.toHaveBeenCalled()
        expect(onSessionOpen).not.toHaveBeenCalled()
    })

    test('activate session again - different input', async () => {
        const {
            privateKey: privateKey2,
            publicKey: publicKey2,
        } = generateKeyPairSync('rsa', {
            modulusLength: 4096,
            publicExponent: 0x10001,
        })
        const publicKeyDer2 = publicKey2.export({
            format: 'der',
            type: 'spki',
        })

        const hash2 = createHash('SHA256')
        hash2.update(publicKeyDer2)
        const sessionId2 = hash2.digest().slice(0, 16)

        const challenge = await proxy.getChallenge()
        const sign = createSign('SHA256')
        sign.update(toBuffer(challenge))
        const signature = sign.sign(privateKey2 as any)
        await expect(
            proxy.activateSession(
                toArrayBuffer(publicKeyDer2),
                sessionId2,
                signature,
            ),
        ).rejects.toEqual(
            expect.objectContaining({
                message: 'Session already exists.',
                name: 'SyncOtError Session',
            }),
        )
        expect(sessionManager.getSessionId()).toBe(sessionId)
    })

    test('activate session again - invalid sessionId', async () => {
        const {
            privateKey: privateKey2,
            publicKey: publicKey2,
        } = generateKeyPairSync('rsa', {
            modulusLength: 4096,
            publicExponent: 0x10001,
        })
        const publicKeyDer2 = publicKey2.export({
            format: 'der',
            type: 'spki',
        })

        const challenge = await proxy.getChallenge()
        const sign = createSign('SHA256')
        sign.update(toBuffer(challenge))
        const signature = sign.sign(privateKey2 as any)
        await expect(
            proxy.activateSession(
                toArrayBuffer(publicKeyDer2), // new public key
                sessionId, // old sessionId
                signature, // new signature
            ),
        ).rejects.toEqual(
            expect.objectContaining({
                message: 'Invalid session ID.',
                name: 'SyncOtError Session',
            }),
        )
        expect(sessionManager.getSessionId()).toBe(sessionId)
    })

    test('activate session again - invalid challenge reply', async () => {
        await expect(
            proxy.activateSession(
                toArrayBuffer(publicKeyDer),
                sessionId,
                new ArrayBuffer(8), // invalid signature
            ),
        ).rejects.toEqual(
            expect.objectContaining({
                message: 'Invalid challenge reply.',
                name: 'SyncOtError Session',
            }),
        )
        expect(sessionManager.getSessionId()).toBe(sessionId)
    })
})