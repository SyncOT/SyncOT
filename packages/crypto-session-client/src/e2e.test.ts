/**
 * @jest-environment jsdom
 */
import { Connection, createConnection } from '@syncot/core'
import { createSessionManager as createSessionServer } from '@syncot/crypto-session-service'
import { SessionManager } from '@syncot/session'
import { binaryEqual, invertedStreams } from '@syncot/util'
import { Duplex } from 'stream'
import { createSessionManager as createSessionClient } from '.'

let clientStream: Duplex
let serverStream: Duplex
let clientConnection: Connection
let serverConnection: Connection
let sessionClient: SessionManager
let sessionServer: SessionManager

const whenSessionActive = (sessionManager: SessionManager) =>
    new Promise(resolve =>
        sessionManager.hasActiveSession()
            ? resolve()
            : sessionManager.once('sessionActive', resolve),
    )

const whenSessionInactive = (sessionManager: SessionManager) =>
    new Promise(resolve =>
        !sessionManager.hasActiveSession()
            ? resolve()
            : sessionManager.once('sessionInactive', resolve),
    )

beforeEach(() => {
    clientConnection = createConnection()
    serverConnection = createConnection()
    ;[clientStream, serverStream] = invertedStreams({ objectMode: true })
    clientConnection.connect(clientStream)
    serverConnection.connect(serverStream)
    sessionClient = createSessionClient(clientConnection)
    sessionServer = createSessionServer(serverConnection)
})

test('establish a session', async () => {
    expect(sessionClient.getSessionId()).toBeUndefined()
    expect(sessionServer.getSessionId()).toBeUndefined()
    await whenSessionActive(sessionServer)
    await whenSessionActive(sessionClient)
    expect(sessionClient.getSessionId()).toBeInstanceOf(ArrayBuffer)
    expect(sessionServer.getSessionId()).toBeInstanceOf(ArrayBuffer)
    expect(
        binaryEqual(
            sessionClient.getSessionId()!,
            sessionServer.getSessionId()!,
        ),
    ).toBeTrue()
})

test('disconnect, reconnect', async () => {
    await whenSessionActive(sessionServer)
    await whenSessionActive(sessionClient)
    const sessionId = sessionClient.getSessionId()!
    clientConnection.disconnect()
    await whenSessionInactive(sessionServer)
    await whenSessionInactive(sessionClient)
    expect(sessionClient.getSessionId()).toBeInstanceOf(ArrayBuffer)
    expect(binaryEqual(sessionClient.getSessionId()!, sessionId)).toBeTrue()
    expect(sessionServer.getSessionId()).toBeUndefined()
    ;[clientStream, serverStream] = invertedStreams({ objectMode: true })
    clientConnection.connect(clientStream)
    serverConnection.connect(serverStream)
    await whenSessionActive(sessionServer)
    await whenSessionActive(sessionClient)
    expect(sessionClient.getSessionId()).toBeInstanceOf(ArrayBuffer)
    expect(binaryEqual(sessionClient.getSessionId()!, sessionId)).toBeTrue()
    expect(sessionServer.getSessionId()).toBeInstanceOf(ArrayBuffer)
    expect(binaryEqual(sessionServer.getSessionId()!, sessionId)).toBeTrue()
})
