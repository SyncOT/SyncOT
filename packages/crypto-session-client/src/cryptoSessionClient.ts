import { Connection } from '@syncot/core'
import { createSessionError } from '@syncot/error'
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

        this.generateKey().then(
            () => {
                this.emit('sessionOpen')
            },
            error => {
                this.emit(
                    'error',
                    createSessionError('Failed to generate a key pair.', error),
                )
            },
        )

        // TODO Remove - these are here only temporarily to avoid TypeScript "unread variable" errors.
        this.sessionService = this.sessionService
        this.keyPair = this.keyPair
        this.publicKeyPem = this.publicKeyPem
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

    private async generateKey(): Promise<void> {
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

        this.keyPair = keyPair
        this.publicKeyPem = publicKeyPem
        this.sessionId = sessionId
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
}

/**
 * Creates a client-side cryptographic session manager on the specified connection.
 */
export function createSessionManager(connection: Connection): SessionManager {
    return new CryptoSessionManager(connection)
}
