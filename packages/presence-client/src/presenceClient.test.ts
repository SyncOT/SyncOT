import { AuthClient, AuthEvents } from '@syncot/auth'
import { Connection, createConnection } from '@syncot/core'
import { PresenceClient } from '@syncot/presence'
import { SessionEvents, SessionManager } from '@syncot/session'
import { invertedStreams, SyncOtEmitter } from '@syncot/util'
import { Duplex } from 'stream'
import { createPresenceClient } from './presenceClient'

const userId = 'test-user-id'
const sessionId = 'test-session-id'

let stream1: Duplex
let stream2: Duplex
let connection1: Connection
let connection2: Connection
let authClient: MockAuthClient
let sessionClient: MockSessionClient
let presenceClient: PresenceClient

class MockAuthClient extends SyncOtEmitter<AuthEvents> implements AuthClient {
    public getUserId = jest.fn().mockReturnValue(userId)
    public hasUserId = jest.fn().mockReturnValue(true)
    public hasAuthenticatedUserId = jest.fn().mockReturnValue(true)
    public mayReadDocument = jest.fn().mockResolvedValue(true)
    public mayWriteDocument = jest.fn().mockResolvedValue(true)
    public mayReadPresence = jest.fn().mockResolvedValue(true)
    public mayWritePresence = jest.fn().mockResolvedValue(true)
}

class MockSessionClient extends SyncOtEmitter<SessionEvents>
    implements SessionManager {
    public getSessionId = jest.fn().mockReturnValue(sessionId)
    public hasSession = jest.fn().mockReturnValue(true)
    public hasActiveSession = jest.fn().mockReturnValue(true)
}

beforeEach(() => {
    connection1 = createConnection()
    connection2 = createConnection()
    ;[stream1, stream2] = invertedStreams({ objectMode: true })
    connection1.connect(stream1)
    connection2.connect(stream2)
    authClient = new MockAuthClient()
    sessionClient = new MockSessionClient()
    presenceClient = createPresenceClient({
        authClient,
        connection: connection1,
        sessionClient,
    })
})

test('', () => {
    presenceClient = presenceClient
})
