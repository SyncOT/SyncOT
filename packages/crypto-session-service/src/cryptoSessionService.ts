import { Connection } from '@syncot/connection'
import { createSessionError } from '@syncot/error'
import { SessionEvents, SessionManager } from '@syncot/session'
import { Id, idEqual, isId, SyncOtEmitter } from '@syncot/util'
import { strict as assert } from 'assert'
import { createHash, createPublicKey, createVerify } from 'crypto'

const randomUInt32 = () => Math.floor(Math.random() * 0x100000000)

/**
 * Server-side cryptographic session manager.
 */
class CryptoSessionManager extends SyncOtEmitter<SessionEvents>
    implements SessionManager {
    private sessionId: Id | undefined = undefined
    private challenge: Buffer | undefined = undefined

    public constructor(private readonly connection: Connection) {
        super()

        this.connection.registerService({
            instance: this,
            name: 'session',
            requestNames: new Set(['getChallenge', 'activateSession']),
        })
        this.connection.on('disconnect', this.onDisconnect)
    }

    public getChallenge(): Buffer {
        if (!this.challenge) {
            this.challenge = Buffer.allocUnsafe(16)
            this.challenge.writeUInt32LE(randomUInt32(), 0)
            this.challenge.writeUInt32LE(randomUInt32(), 4)
            this.challenge.writeUInt32LE(randomUInt32(), 8)
            this.challenge.writeUInt32LE(randomUInt32(), 12)
        }
        return this.challenge
    }

    public activateSession(
        publicKeyDer: Buffer,
        sessionId: Id,
        challangeReply: Buffer,
    ): void {
        this.assertNotDestroyed()
        assert.ok(this.connection.isConnected(), 'Connection must be active.')
        assert.ok(isId(sessionId), 'Argument "sessionId" must be an "Id".')

        const sameSessionId = idEqual(this.sessionId, sessionId)

        if (!sameSessionId && this.hasSession()) {
            throw createSessionError('Session already exists.')
        }

        const publicKey = createPublicKey({
            format: 'der',
            key: publicKeyDer,
            type: 'spki',
        })

        const verify = createVerify('SHA256')
        verify.update(this.getChallenge())
        if (!verify.verify(publicKey, challangeReply)) {
            throw createSessionError('Invalid challenge reply.')
        }

        const hash = createHash('SHA256')
        hash.update(publicKeyDer)
        if (
            !Buffer.isBuffer(sessionId) ||
            !hash
                .digest()
                .slice(0, 16)
                .equals(sessionId)
        ) {
            throw createSessionError('Invalid session ID.')
        }

        if (!sameSessionId) {
            this.sessionId = sessionId
            this.emitAsync('sessionOpen')
            this.emitAsync('sessionActive')
        }
    }

    public getSessionId(): Id | undefined {
        return this.sessionId
    }

    public hasSession(): boolean {
        return isId(this.sessionId)
    }

    public hasActiveSession(): boolean {
        return this.hasSession()
    }

    public destroy(): void {
        if (this.destroyed) {
            return
        }
        this.sessionId = undefined
        this.challenge = undefined
        this.connection.off('disconnect', this.onDisconnect)
        super.destroy()
    }

    private onDisconnect = () => {
        this.challenge = undefined
        if (!this.destroyed && this.hasSession()) {
            this.sessionId = undefined
            this.emitAsync('sessionInactive')
            this.emitAsync('sessionClose')
        }
    }
}

/**
 * Creates a server-side cryptographic session manager on the specified connection.
 */
export function createSessionManager(connection: Connection): SessionManager {
    return new CryptoSessionManager(connection)
}
