/**
 * @jest-environment jsdom
 */
import { Connection, createConnection } from '@syncot/core'
import { SessionManager } from '@syncot/session'
import {
    Id,
    idEqual,
    invertedStreams,
    toArrayBuffer,
    toBuffer,
} from '@syncot/util'
import { createHash, createPublicKey, createVerify } from 'crypto'
import { Duplex } from 'stream'
import { createSessionManager } from '.'

const testError = new Error('test error')
const delay = (time: number = 0) =>
    new Promise(resolve => setTimeout(resolve, time))

let challenge: ArrayBuffer
let serverStream: Duplex
let clientStream: Duplex
let serverConnection: Connection
let clientConnection: Connection
let sessionManager: SessionManager
let sessionService: {
    getChallenge: jest.Mock<Promise<ArrayBuffer>>
    activateSession: jest.Mock<Promise<void>, [ArrayBuffer, Id, ArrayBuffer]>
}

const disconnect = async () => {
    process.nextTick(() => {
        clientConnection.disconnect()
        serverConnection.disconnect()
    })
    await new Promise(resolve => sessionManager.on('sessionInactive', resolve))
}

const connect = async () => {
    process.nextTick(() => {
        ;[serverStream, clientStream] = invertedStreams({
            objectMode: true,
        })
        serverConnection.connect(serverStream)
        clientConnection.connect(clientStream)
    })
    await new Promise(resolve => sessionManager.on('sessionActive', resolve))
}

beforeEach(() => {
    const buffer = Buffer.allocUnsafe(8)
    buffer.writeDoubleLE(Math.random(), 0)
    challenge = toArrayBuffer(buffer)

    sessionService = {
        activateSession: jest.fn(
            async (
                publicKeyDer: ArrayBuffer,
                sessionId: Id,
                challangeReply: ArrayBuffer,
            ) => {
                const publicKey = createPublicKey({
                    format: 'der',
                    key: toBuffer(publicKeyDer),
                    type: 'spki',
                })

                const verify = createVerify('SHA256')
                verify.update(toBuffer(challenge))
                if (!verify.verify(publicKey, toBuffer(challangeReply))) {
                    throw new Error('Invalid signature.')
                }

                const hash = createHash('SHA256')
                hash.update(toBuffer(publicKeyDer))
                if (
                    !idEqual(
                        toArrayBuffer(hash.digest().slice(0, 16)),
                        sessionId,
                    )
                ) {
                    throw new Error('Invalid session ID.')
                }
            },
        ),
        getChallenge: jest.fn(async () => challenge),
    }
    ;[serverStream, clientStream] = invertedStreams({ objectMode: true })
    serverConnection = createConnection()
    serverConnection.connect(serverStream)
    clientConnection = createConnection()
    clientConnection.connect(clientStream)

    serverConnection.registerService({
        actions: new Set(['getChallenge', 'activateSession']),
        instance: sessionService,
        name: 'session',
    })
    sessionManager = createSessionManager(clientConnection)
})

afterEach(() => {
    sessionManager.destroy()
    clientConnection.disconnect()
    serverConnection.disconnect()
})

test('state', () => {
    expect(sessionManager.hasSession()).toBeFalse()
    expect(sessionManager.hasActiveSession()).toBeFalse()
    expect(sessionManager.getSessionId()).toBeUndefined()
})
test('destroy', async () => {
    const onDestroy = jest.fn()
    sessionManager.on('destroy', onDestroy)
    sessionManager.destroy()
    expect(sessionManager.hasSession()).toBeFalse()
    expect(sessionManager.hasActiveSession()).toBeFalse()
    expect(sessionManager.getSessionId()).toBeUndefined()
    await Promise.resolve()
    expect(onDestroy).toHaveBeenCalledTimes(1)
    sessionManager.destroy()
    await Promise.resolve()
    expect(onDestroy).toHaveBeenCalledTimes(1)
})
test('error', async () => {
    // The only way I can imagine SessionManager failing before
    // sessionOpen is if the WebCrypto API is not properly supported
    // in the target environment, so we emulate it here in a crude way.
    const crypto = window.crypto
    ;(window as any).crypto = undefined
    try {
        let resolve: () => void
        const promise = new Promise(r => (resolve = r))
        const onError = jest.fn()
        const onDestroy = jest.fn(resolve!)
        const onSessionOpen = jest.fn()
        sessionManager.on('error', onError)
        sessionManager.on('destroy', onDestroy)
        sessionManager.on('sessionOpen', onSessionOpen)
        await promise
        expect(onError).toHaveBeenCalledTimes(1)
        expect(onError.mock.calls[0][0]).toBeInstanceOf(Error)
        expect(onError.mock.calls[0][0].name).toBe('SyncOtError Session')
        expect(onError.mock.calls[0][0].message).toBe(
            "Failed to open a session. => TypeError: Cannot read property 'subtle' of undefined",
        )
        expect(onError.mock.calls[0][0].cause).toBeInstanceOf(TypeError)
        expect(onDestroy).toHaveBeenCalledTimes(1)
        expect(onDestroy).toHaveBeenCalledAfter(onError)
        expect(onSessionOpen).not.toHaveBeenCalled()
    } finally {
        ;(window as any).crypto = crypto
    }
})
test('destroy then error', async () => {
    // The only way I can imagine SessionManager failing before
    // sessionOpen is if the WebCrypto API is not properly supported
    // in the target environment, so we emulate it here in a crude way.
    const crypto = window.crypto
    ;(window as any).crypto = undefined
    try {
        const onError = jest.fn()
        const onDestroy = jest.fn()
        const onSessionOpen = jest.fn()
        sessionManager.on('error', onError)
        sessionManager.on('destroy', onDestroy)
        sessionManager.on('sessionOpen', onSessionOpen)
        sessionManager.destroy()
        await delay()
        expect(onError).not.toHaveBeenCalled()
        expect(onDestroy).toHaveBeenCalledTimes(1)
        expect(onSessionOpen).not.toHaveBeenCalled()
    } finally {
        ;(window as any).crypto = crypto
    }
})
test('create twice on the same connection', () => {
    expect(() => createSessionManager(clientConnection)).toThrow(
        expect.objectContaining({
            message: 'Proxy "session" has been already registered.',
            name: 'AssertionError [ERR_ASSERTION]',
        }),
    )
})
test('disconnect', async () => {
    const onSessionInactive = jest.fn()
    sessionManager.on('sessionInactive', onSessionInactive)
    clientConnection.disconnect()
    await new Promise(resolve => sessionManager.on('sessionOpen', resolve))
    expect(sessionManager.hasSession()).toBeTrue()
    expect(sessionManager.hasActiveSession()).toBeFalse()
    expect(sessionManager.getSessionId()).toBeInstanceOf(ArrayBuffer)
    expect((sessionManager.getSessionId() as ArrayBuffer).byteLength).toBe(16)
    expect(onSessionInactive).not.toBeCalled()
})

describe('sessionOpen', () => {
    beforeEach(done => {
        sessionManager.on('sessionOpen', done)
    })

    test('state', () => {
        expect(sessionManager.hasSession()).toBeTrue()
        expect(sessionManager.hasActiveSession()).toBeFalse()
        expect(sessionManager.getSessionId()).toBeInstanceOf(ArrayBuffer)
        expect((sessionManager.getSessionId() as ArrayBuffer).byteLength).toBe(
            16,
        )
    })
    test('disconnect', async () => {
        const onSessionInactive = jest.fn()
        sessionManager.on('sessionInactive', onSessionInactive)
        clientConnection.disconnect()
        await delay()
        expect(onSessionInactive).not.toBeCalled()
    })
    test('disconnect, connect', async () => {
        const onSessionActive = jest.fn()
        const onSessionInactive = jest.fn()
        sessionManager.on('sessionActive', onSessionActive)
        sessionManager.on('sessionInactive', onSessionInactive)
        clientConnection.disconnect()
        serverConnection.disconnect()
        await delay()
        await connect()
        expect(onSessionActive).toBeCalledTimes(1)
        expect(onSessionInactive).not.toBeCalled()
        expect(sessionManager.hasActiveSession()).toBeTrue()
    })
    test('destroy', async () => {
        const onDestroy = jest.fn()
        sessionManager.on('destroy', onDestroy)
        sessionManager.destroy()
        expect(sessionManager.hasSession()).toBeFalse()
        expect(sessionManager.hasActiveSession()).toBeFalse()
        expect(sessionManager.getSessionId()).toBeUndefined()
        await Promise.resolve()
        expect(onDestroy).toHaveBeenCalledTimes(1)
    })
    test('destroy then error', async () => {
        await delay()
        sessionService.activateSession.mockRejectedValueOnce(testError)
        const onError = jest.fn()
        const onDestroy = jest.fn()
        const onSessionOpen = jest.fn()
        sessionManager.on('error', onError)
        sessionManager.on('destroy', onDestroy)
        sessionManager.on('sessionOpen', onSessionOpen)
        sessionManager.destroy()
        await delay()
        expect(onError).not.toHaveBeenCalled()
        expect(onDestroy).toHaveBeenCalledTimes(1)
        expect(onSessionOpen).not.toHaveBeenCalled()
    })

    describe('sessionActive', () => {
        beforeEach(done => {
            sessionManager.on('sessionActive', done)
        })

        test('state', async () => {
            expect(sessionManager.hasSession()).toBeTrue()
            expect(sessionManager.hasActiveSession()).toBeTrue()
            expect(sessionManager.getSessionId()).toBeInstanceOf(ArrayBuffer)
        })
        test('destroy', async () => {
            const onDestroy = jest.fn()
            sessionManager.on('destroy', onDestroy)
            sessionManager.destroy()
            expect(sessionManager.hasSession()).toBeFalse()
            expect(sessionManager.hasActiveSession()).toBeFalse()
            expect(sessionManager.getSessionId()).toBeUndefined()
            await Promise.resolve()
            expect(onDestroy).toHaveBeenCalledTimes(1)
        })
        test('disconnect, reconnect', async () => {
            await disconnect()
            expect(sessionManager.hasSession()).toBeTrue()
            expect(sessionManager.hasActiveSession()).toBeFalse()
            expect(sessionManager.getSessionId()).toBeInstanceOf(ArrayBuffer)

            await connect()
            expect(sessionManager.hasSession()).toBeTrue()
            expect(sessionManager.hasActiveSession()).toBeTrue()
            expect(sessionManager.getSessionId()).toBeInstanceOf(ArrayBuffer)
        })
        test('server returns an error', async () => {
            await disconnect()
            sessionService.activateSession.mockRejectedValueOnce(testError)
            connect()
            await new Promise<Error>(resolve =>
                sessionManager.once('error', resolve),
            ).then((error: any) => {
                expect(error.name).toBe('SyncOtError Session')
                expect(error.message).toBe(
                    'Failed to activate session. => Error: test error',
                )
                expect(error.cause).toBe(testError)
            })
        })
    })
})
