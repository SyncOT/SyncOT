/**
 * @jest-environment jsdom
 */
import { Connection, createConnection } from '@syncot/core'
import { SessionId, SessionManager } from '@syncot/session'
import { invertedStreams } from '@syncot/util'
import { createHash, createVerify } from 'crypto'
import { EventEmitter } from 'events'
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
let sessionService: EventEmitter & {
    getChallenge: jest.Mock<Promise<ArrayBuffer>>
    activateSession: jest.Mock<
        Promise<void>,
        [string, ArrayBuffer, ArrayBuffer]
    >
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
    challenge = buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
    )

    sessionService = Object.assign(new EventEmitter(), {
        activateSession: jest.fn(
            async (
                publicKeyPem: string,
                sessionId: SessionId,
                challangeReply: ArrayBuffer,
            ) => {
                const verify = createVerify('SHA256')
                verify.update(Buffer.from(challenge))
                if (!verify.verify(publicKeyPem, Buffer.from(challangeReply))) {
                    throw new Error('Invalid signature.')
                }

                const hash = createHash('SHA256')
                hash.update(Buffer.from(publicKeyPem))
                if (
                    hash
                        .digest()
                        .slice(0, 16)
                        .compare(Buffer.from(sessionId)) !== 0
                ) {
                    throw new Error('Invalid session ID.')
                }
            },
        ),
        getChallenge: jest.fn(async () => challenge),
    })
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
test('destroy', () => {
    const onDestroy = jest.fn()
    sessionManager.on('destroy', onDestroy)
    sessionManager.destroy()
    expect(onDestroy).toHaveBeenCalledTimes(1)
    sessionManager.destroy()
    sessionManager.destroy()
    expect(onDestroy).toHaveBeenCalledTimes(1)
    expect(sessionManager.hasSession()).toBeFalse()
    expect(sessionManager.hasActiveSession()).toBeFalse()
    expect(sessionManager.getSessionId()).toBeUndefined()
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
        // TODO check onError
        expect(onDestroy).toHaveBeenCalledTimes(1)
        expect(onDestroy).toHaveBeenCalledAfter(onError)
        expect(onSessionOpen).not.toHaveBeenCalled()
    } finally {
        ;(window as any).crypto = crypto
    }
})
test('destroy then error', async () => {
    sessionManager.destroy()
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
        delay()
        expect(onError).not.toHaveBeenCalled()
        expect(onDestroy).not.toHaveBeenCalled()
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
    clientConnection.disconnect()
    await new Promise(resolve => sessionManager.on('sessionOpen', resolve))
    expect(sessionManager.hasSession()).toBeTrue()
    expect(sessionManager.hasActiveSession()).toBeFalse()
    expect(sessionManager.getSessionId()).toBeInstanceOf(ArrayBuffer)
    expect(Buffer.from(sessionManager.getSessionId()!).length).toBe(16)
})

describe('sessionOpen', () => {
    beforeEach(done => {
        sessionManager.on('sessionOpen', done)
    })

    test('state', () => {
        expect(sessionManager.hasSession()).toBeTrue()
        expect(sessionManager.hasActiveSession()).toBeFalse()
        expect(sessionManager.getSessionId()).toBeInstanceOf(ArrayBuffer)
        expect(Buffer.from(sessionManager.getSessionId()!).length).toBe(16)
    })
    test('destroy', () => {
        const onDestroy = jest.fn()
        sessionManager.on('destroy', onDestroy)
        sessionManager.destroy()
        expect(onDestroy).toHaveBeenCalledTimes(1)
        sessionManager.destroy()
        sessionManager.destroy()
        expect(onDestroy).toHaveBeenCalledTimes(1)
        expect(sessionManager.hasSession()).toBeFalse()
        expect(sessionManager.hasActiveSession()).toBeFalse()
        expect(sessionManager.getSessionId()).toBeUndefined()
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
        test('destroy', () => {
            const onDestroy = jest.fn()
            sessionManager.on('destroy', onDestroy)
            sessionManager.destroy()
            expect(onDestroy).toHaveBeenCalledTimes(1)
            sessionManager.destroy()
            sessionManager.destroy()
            expect(onDestroy).toHaveBeenCalledTimes(1)
            expect(sessionManager.hasSession()).toBeFalse()
            expect(sessionManager.hasActiveSession()).toBeFalse()
            expect(sessionManager.getSessionId()).toBeUndefined()
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
