import { Connection } from '@syncot/core'
import { SessionEvents, SessionId, SessionManager } from '@syncot/session'
import { NodeEventEmitter } from '@syncot/util'
import { EventEmitter } from 'events'

type Challenge = ArrayBuffer
type ChallengeReply = ArrayBuffer

/**
 * Server-side cryptographic session manager.
 */
class CryptoSessionManager
    extends (EventEmitter as new () => NodeEventEmitter<SessionEvents>)
    implements SessionManager {
    private sessionId: SessionId | undefined = undefined

    public constructor(private readonly connection: Connection) {
        super()
    }

    public async submitPublicKey(
        publicKey: any,
        sessionId: SessionId,
    ): Promise<Challenge> {
        return new ArrayBuffer(0)
    }

    public async initSession(challangeReply: ChallengeReply): Promise<void> {
        return
    }

    public getSessionId(): SessionId | undefined {
        return this.sessionId
    }

    public hasSession(): boolean {
        return this.sessionId != null
    }

    public hasActiveSession(): boolean {
        return this.hasSession()
    }

    public destroy(): void {
        return
    }
}

/**
 * Creates a server-side cryptographic session manager on the specified connection.
 */
export function createSessionManager(connection: Connection): SessionManager {
    return new CryptoSessionManager(connection)
}
