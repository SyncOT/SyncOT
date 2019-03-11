/**
 * @jest-environment jsdom
 */
import { Connection, createConnection } from '@syncot/core'
import { SessionManager } from '@syncot/session'
import { invertedStreams } from '@syncot/util'
import { Duplex } from 'stream'
import { createSessionManager } from './cryptoSessionClient'

let serverStream: Duplex
let clientStream: Duplex
let serverConnection: Connection
let clientConnection: Connection
let sessionManager: SessionManager

beforeEach(() => {
    ;[serverStream, clientStream] = invertedStreams({ objectMode: true })
    serverConnection = createConnection()
    serverConnection.connect(serverStream)
    clientConnection = createConnection()
    clientConnection.connect(clientStream)
    sessionManager = createSessionManager(clientConnection)
})

afterEach(() => {
    sessionManager.destroy()
    clientConnection.disconnect()
    serverConnection.disconnect()
})

describe('before sessionOpen', () => {
    test('initial state', () => {
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
    })
    test('error', async () => {
        // The only way I can imagine SessionManager failing before
        // sessionOpen is if the WebCrypto API is not properly supported
        // in the target environment, so we emulate it here in a crude way.
        const crypto = window.crypto
        ;(window as any).crypto = undefined
        try {
            throw new Error()
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
            expect(onDestroy).toHaveBeenCalledTimes(1)
            expect(onDestroy).toHaveBeenCalledAfter(onError)
            expect(onSessionOpen).not.toHaveBeenCalled()
        } finally {
            ;(window as any).crypto = crypto
        }
    })
})
