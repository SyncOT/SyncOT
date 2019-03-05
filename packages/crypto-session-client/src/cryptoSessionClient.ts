import { Connection } from '@syncot/core'
import { SessionEvents, SessionId, SessionManager } from '@syncot/session'
import { NodeEventEmitter } from '@syncot/util'
import { EventEmitter } from 'events'

type Challenge = ArrayBuffer
type ChallengeReply = ArrayBuffer

/**
 * The interface of the server-side session manager used for establishing a session.
 */
interface SessionService extends NodeEventEmitter<{}> {
    submitPublicKey(publicKey: any, sessionId: SessionId): Promise<Challenge>
    initSession(challangeReply: ChallengeReply): Promise<void>
}

/**
 * A cryptographic client-side session manager.
 */
class CryptoSessionManager
    extends (EventEmitter as new () => NodeEventEmitter<SessionEvents>)
    implements SessionManager {
    private sessionId: SessionId | undefined = undefined
    private active: boolean = false
    private readonly sessionService: SessionService

    public constructor(private readonly connection: Connection) {
        super()
        connection.registerProxy({
            actions: new Set(['submitPublicKey', 'initSession']),
            name: 'session',
        })
        this.sessionService = connection.getProxy('session') as SessionService
    }

    public getSessionId(): SessionId | undefined {
        return this.sessionId
    }

    public hasSession(): boolean {
        return this.sessionId != null
    }

    public hasActiveSession(): boolean {
        return this.active
    }

    public destroy(): void {
        return
    }
}

/**
 * Creates a client-side cryptographic session manager on the specified connection.
 */
export function createSessionManager(connection: Connection): SessionManager {
    return new CryptoSessionManager(connection)
}
