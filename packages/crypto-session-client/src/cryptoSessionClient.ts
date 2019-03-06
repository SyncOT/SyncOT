import { Connection } from '@syncot/core'
import { createSessionError } from '@syncot/error'
import { SessionEvents, SessionId, SessionManager } from '@syncot/session'
import { NodeEventEmitter } from '@syncot/util'
import { strict as assert } from 'assert'
import { EventEmitter } from 'events'

type Challenge = ArrayBuffer
type ChallengeReply = ArrayBuffer

/**
 * The interface of the server-side session manager used for establishing a session.
 */
interface SessionService extends NodeEventEmitter<{}> {
    submitPublicKey(
        publicKeyPem: string,
        sessionId: SessionId,
    ): Promise<Challenge>
    initSession(challangeReply: ChallengeReply): Promise<void>
}

/**
 * A cryptographic client-side session manager.
 */
class CryptoSessionManager
    extends (EventEmitter as new () => NodeEventEmitter<SessionEvents>)
    implements SessionManager {
    private destroyed: boolean = false
    private keyPair: CryptoKeyPair | undefined = undefined
    private publicKeyPem: string | undefined = undefined
    private sessionId: SessionId | undefined = undefined
    private active: boolean = false
    private readonly sessionService: SessionService

    public constructor(private readonly connection: Connection) {
        super()
        this.connection.registerProxy({
            actions: new Set(['submitPublicKey', 'initSession']),
            name: 'session',
        })
        this.sessionService = this.connection.getProxy(
            'session',
        ) as SessionService

        this.openSession()
            .then(() => this.init())
            .catch(error => this.emitError(error))
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
        this.connection.off('connect', this.onConnect)
        this.connection.off('disconnect', this.onDisconnect)
        this.destroyed = true
    }

    private init(): void {
        this.assertNotDestroyed()
        this.connection.on('connect', this.onConnect)
        this.connection.on('disconnect', this.onDisconnect)
        if (this.connection.isConnected()) {
            this.activateSession()
        }
    }

    private onConnect = () => {
        this.activateSession()
    }

    private onDisconnect = () => {
        if (this.active) {
            this.active = false
            this.emit('sessionInactive')
        }
    }

    private activateSession(): void {
        assert.equal(
            typeof this.publicKeyPem,
            'string',
            'Property "publicKeyPem" should be a string.',
        )
        assert.ok(
            this.sessionId instanceof ArrayBuffer,
            'Property "sessionId" should be an ArrayBuffer.',
        )

        this.sessionService
            .submitPublicKey(this.publicKeyPem!, this.sessionId!)
            // TODO implement
            .then()
    }

    private async openSession(): Promise<void> {
        try {
            const keyPair = await crypto.subtle.generateKey(
                {
                    hash: 'SHA-256',
                    modulusLength: 4096,
                    name: 'RSASSA-PKCS1-v1_5',
                    publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
                },
                false,
                ['sign', 'verify'],
            )
            const publicKeySpki = await crypto.subtle.exportKey(
                'spki',
                keyPair.publicKey,
            )
            const publicKeyPem = this.spkiToPem(publicKeySpki)
            const sessionId = await this.pemToSessionId(publicKeyPem)

            this.assertNotDestroyed()
            this.assertNoSession()
            this.keyPair = keyPair
            this.publicKeyPem = publicKeyPem
            this.sessionId = sessionId
        } catch (error) {
            throw createSessionError('Failed to open a session.', error)
        }

        this.emit('sessionOpen')
    }

    private spkiToPem(publicKey: ArrayBuffer): string {
        let pem = '-----BEGIN PUBLIC KEY-----\n'
        const key = Buffer.from(publicKey).toString('base64')

        for (let i = 0, l = key.length; i < l; i += 64) {
            pem += key.substring(i, i + 64) + '\n'
        }

        pem += '-----END PUBLIC KEY-----'
        return pem
    }

    private async pemToSessionId(pem: string): Promise<SessionId> {
        const hash = await crypto.subtle.digest('SHA-256', Buffer.from(pem))

        // Keeping only some of the SHA-256 bits is safe.
        // See https://crypto.stackexchange.com/questions/3153/sha-256-vs-any-256-bits-of-sha-512-which-is-more-secure/3156#3156
        //
        // 16 bytes (128 bits) are sufficient to avoid accidental session ID collisions.
        //
        // Collision attacks on the session ID are not feasible because session IDs are
        // derived from public keys and the server verifies that the clients know the
        // corresponding private keys. So, the session IDs are essentially as secure as
        // the corresponding private keys, which are generated in the browser and are
        // not exportable.
        const buffer = Buffer.from(hash).slice(0, 16)
        return buffer.buffer.slice(
            buffer.byteOffset,
            buffer.byteOffset + buffer.byteLength,
        )
    }

    /**
     * Throws an error, if a session already exists.
     */
    private assertNoSession(): void {
        assert.equal(
            this.keyPair,
            undefined,
            'Session already exists (keyPair).',
        )
        assert.equal(
            this.publicKeyPem,
            undefined,
            'Session already exists (publicKeyPem).',
        )
        assert.equal(
            this.sessionId,
            undefined,
            'Session already exists (sessionId).',
        )
    }

    /**
     * Throws an error, if this SessionManager has been already destroyed.
     */
    private assertNotDestroyed(): void {
        assert.equal(this.destroyed, false, 'SessionManager already destroyed.')
    }

    /**
     * Emits an error event with the specified error,
     * unless this SessionManager has been already destroyed.
     */
    private emitError(error: Error): void {
        if (!this.destroyed) {
            this.emit('error', error)
        }
    }
}

/**
 * Creates a client-side cryptographic session manager on the specified connection.
 */
export function createSessionManager(connection: Connection): SessionManager {
    return new CryptoSessionManager(connection)
}
