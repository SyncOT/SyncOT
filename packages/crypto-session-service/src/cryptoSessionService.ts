import { Connection } from '@syncot/core'
import { createSessionError } from '@syncot/error'
import { SessionEvents, SessionId, SessionManager } from '@syncot/session'
import { NodeEventEmitter, toBuffer } from '@syncot/util'
import { strict as assert } from 'assert'
import { createHash, createVerify } from 'crypto'
import { EventEmitter } from 'events'

type Challenge = ArrayBuffer
type ChallengeReply = ArrayBuffer

const randomUInt32 = () => Math.floor(Math.random() * 0x100000000)

/**
 * Server-side cryptographic session manager.
 */
class CryptoSessionManager
    extends (EventEmitter as new () => NodeEventEmitter<SessionEvents>)
    implements SessionManager {
    private sessionId: SessionId | undefined = undefined
    private readonly challenge: Challenge
    /**
     * Used to ensure that the client code does not mess up the component's state.
     */
    private busy: boolean = false
    private destroyed: boolean = false

    public constructor(private readonly connection: Connection) {
        super()

        this.connection.registerService({
            actions: new Set(['getChallenge', 'activateSession']),
            instance: this,
            name: 'session',
        })
        this.connection.on('disconnect', this.onDisconnect)

        this.challenge = new ArrayBuffer(16)
        const challengeBuffer = toBuffer(this.challenge)
        challengeBuffer.writeUInt32LE(randomUInt32(), 0)
        challengeBuffer.writeUInt32LE(randomUInt32(), 4)
        challengeBuffer.writeUInt32LE(randomUInt32(), 8)
        challengeBuffer.writeUInt32LE(randomUInt32(), 12)
    }

    public getChallenge(): Challenge {
        return this.challenge
    }

    public activateSession(
        publicKeyPem: string,
        sessionId: SessionId,
        challangeReply: ChallengeReply,
    ): void {
        this.assertReady()
        assert.ok(this.connection.isConnected(), 'Connection must be active.')

        if (this.sessionId != null) {
            throw createSessionError('Session already exists.')
        }

        const verify = createVerify('SHA256')
        verify.update(toBuffer(this.challenge))
        if (!verify.verify(publicKeyPem, Buffer.from(challangeReply))) {
            throw createSessionError('Invalid challenge reply.')
        }

        const hash = createHash('SHA256')
        hash.update(Buffer.from(publicKeyPem))
        if (
            hash
                .digest()
                .slice(0, 16)
                .compare(toBuffer(sessionId)) !== 0
        ) {
            throw createSessionError('Invalid session ID.')
        }

        this.sessionId = sessionId

        try {
            this.busy = true
            this.emitIfNotDestroyed('sessionOpen')
            this.emitIfNotDestroyed('sessionActive')
        } finally {
            this.busy = false
        }
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
        if (this.destroyed) {
            return
        }
        this.destroyed = true
        this.sessionId = undefined
        this.connection.off('disconnect', this.onDisconnect)
        this.emit('destroy')
    }

    private onDisconnect = () => {
        this.assertReady()

        if (this.sessionId != null) {
            this.sessionId = undefined

            try {
                this.busy = true
                this.emitIfNotDestroyed('sessionInactive')
                this.emitIfNotDestroyed('sessionClose')
            } finally {
                this.busy = false
            }
        }
    }

    private assertReady(): void {
        assert.ok(!this.destroyed, 'SessionManager already destroyed.')
        assert.ok(!this.busy, 'SessionManager is busy.')
    }

    private emitIfNotDestroyed(
        eventName:
            | 'sessionOpen'
            | 'sessionClose'
            | 'sessionActive'
            | 'sessionInactive',
    ): void {
        if (!this.destroyed) {
            this.emit(eventName)
        }
    }
}

/**
 * Creates a server-side cryptographic session manager on the specified connection.
 */
export function createSessionManager(connection: Connection): SessionManager {
    return new CryptoSessionManager(connection)
}
