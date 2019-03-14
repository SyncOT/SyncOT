import { Connection, createConnection } from '@syncot/core'
import { SessionEvents, SessionManager } from '@syncot/session'
import { invertedStreams, NodeEventEmitter, toBuffer } from '@syncot/util'
import { createHash, createSign, generateKeyPairSync } from 'crypto'
import { Duplex } from 'stream'
import { createSessionManager } from '.'

interface SessionManagerProxy extends NodeEventEmitter<SessionEvents> {
    getChallenge(): Promise<ArrayBuffer>
    activateSession(
        publicKeyPem: string,
        sessionId: ArrayBuffer,
        challengeReply: ArrayBuffer,
    ): Promise<void>
}

const { privateKey, publicKey } = (generateKeyPairSync as any)('rsa', {
    modulusLength: 4096,
    privateKeyEncoding: {
        format: 'pem',
        type: 'pkcs8',
    },
    publicExponent: 0x10001,
    publicKeyEncoding: {
        format: 'pem',
        type: 'spki',
    },
})
const hash = createHash('SHA256')
hash.update(Buffer.from(publicKey))
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
    const signature = sign.sign(privateKey)
    await proxy.activateSession(publicKey, sessionId, signature)
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

test('destroy', () => {
    const onDestroy = jest.fn()
    sessionManager.on('destroy', onDestroy)
    sessionManager.destroy()
    expect(onDestroy).toHaveBeenCalledTimes(1)
    sessionManager.destroy()
    expect(onDestroy).toHaveBeenCalledTimes(1)
})

test('disconnect', () => {
    const onSessionInactive = jest.fn()
    const onSessionClose = jest.fn()
    sessionManager.on('sessionInactive', onSessionInactive)
    sessionManager.on('sessionClose', onSessionClose)
    serverConnection.disconnect()
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

test('activeSession', async () => {
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
        proxy.activateSession(publicKey, sessionId, new ArrayBuffer(8)),
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
    const signature = sign.sign(privateKey)
    await expect(
        proxy.activateSession(publicKey, new ArrayBuffer(16), signature),
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

    test('destroy', () => {
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
        expect(onDestroy).toHaveBeenCalledTimes(1)
    })

    test('disconnect', () => {
        const onSessionInactive = jest.fn()
        const onSessionClose = jest.fn()
        sessionManager.on('sessionInactive', onSessionInactive)
        sessionManager.on('sessionClose', onSessionClose)
        serverConnection.disconnect()
        expect(sessionManager.getSessionId()).toBeUndefined()
        expect(sessionManager.hasSession()).toBeFalse()
        expect(sessionManager.hasActiveSession()).toBeFalse()
        expect(onSessionInactive).toHaveBeenCalledTimes(1)
        expect(onSessionClose).toHaveBeenCalledTimes(1)
        expect(onSessionInactive).toHaveBeenCalledBefore(onSessionClose)
    })

    test('session already exists', async () => {
        await expect(activateSession()).rejects.toEqual(
            expect.objectContaining({
                message: 'Session already exists.',
                name: 'SyncOtError Session',
            }),
        )
        expect(sessionManager.getSessionId()).toBe(sessionId)
    })
})
