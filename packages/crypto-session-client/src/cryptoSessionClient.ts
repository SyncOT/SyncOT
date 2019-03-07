import { Connection } from '@syncot/core'
import { createSessionError } from '@syncot/error'
import { SessionEvents, SessionId, SessionManager } from '@syncot/session'
import { NodeEventEmitter } from '@syncot/util'
import { EventEmitter } from 'events'

/**
 * Creates a client-side cryptographic session manager on the specified connection.
 */
export function createSessionManager(connection: Connection): SessionManager {
    return new CryptoSessionManager(connection)
}

type Challenge = ArrayBuffer
type ChallengeReply = ArrayBuffer

/**
 * The interface of the server-side session manager used for establishing a session.
 */
interface SessionService extends NodeEventEmitter<{}> {
    getChallenge(): Promise<Challenge>
    activateSession(
        publicKeyPem: string,
        sessionId: SessionId,
        challangeReply: ChallengeReply,
    ): Promise<void>
}

/**
 * Converts the specified public key in the SPKI format to the PEM format.
 * @param publicKey A public key in the SPKI format.
 * @returns A public key in the PEM format.
 */
function spkiToPem(publicKey: ArrayBuffer): string {
    let pem = '-----BEGIN PUBLIC KEY-----\n'
    const key = Buffer.from(publicKey).toString('base64')

    for (let i = 0, l = key.length; i < l; i += 64) {
        pem += key.substring(i, i + 64) + '\n'
    }

    pem += '-----END PUBLIC KEY-----'
    return pem
}

/**
 * A cryptographic client-side session manager.
 */
class CryptoSessionManager
    extends (EventEmitter as new () => NodeEventEmitter<SessionEvents>)
    implements SessionManager {
    private connectionNumber: number = 0
    private destroyed: boolean = false
    private keyPair: CryptoKeyPair | undefined = undefined
    private publicKeyPem: string | undefined = undefined
    private sessionId: SessionId | undefined = undefined
    private active: boolean = false
    private readonly sessionService: SessionService

    public constructor(private readonly connection: Connection) {
        super()

        this.connection.registerProxy({
            actions: new Set(['getChallenge', 'activateSession']),
            name: 'session',
        })
        this.sessionService = this.connection.getProxy(
            'session',
        ) as SessionService

        this.init()
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
        if (this.destroyed) {
            return
        }
        this.connection.off('connect', this.onConnect)
        this.connection.off('disconnect', this.onDisconnect)
        this.keyPair = undefined
        this.publicKeyPem = undefined
        this.sessionId = undefined
        this.active = false
        this.destroyed = true
        this.emit('destroy')
    }

    private onConnect = () => {
        this.connectionNumber++
        this.activateSession()
    }

    private onDisconnect = () => {
        if (!this.destroyed && this.active) {
            this.active = false
            this.emit('sessionInactive')
        }
    }

    private async init(): Promise<void> {
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
            const spki = await crypto.subtle.exportKey(
                'spki',
                keyPair.publicKey,
            )
            const publicKeyPem = spkiToPem(spki)
            const publicKeyHash = await crypto.subtle.digest(
                'SHA-256',
                Buffer.from(publicKeyPem),
            )
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
            const shortHash = Buffer.from(publicKeyHash).slice(0, 16)
            const sessionId = shortHash.buffer.slice(
                shortHash.byteOffset,
                shortHash.byteOffset + shortHash.byteLength,
            )

            if (this.destroyed) {
                return
            }

            this.keyPair = keyPair
            this.publicKeyPem = publicKeyPem
            this.sessionId = sessionId
        } catch (error) {
            if (!this.destroyed) {
                this.emit(
                    'error',
                    createSessionError('Failed to open a session.', error),
                )
                this.destroy()
            }
            return
        }

        this.connection.on('connect', this.onConnect)
        this.connection.on('disconnect', this.onDisconnect)
        if (this.connection.isConnected()) {
            this.activateSession()
        }

        this.emit('sessionOpen')
    }

    private async activateSession(): Promise<void> {
        if (this.destroyed || !this.connection.isConnected()) {
            return
        }

        const connectionNumber = this.connectionNumber

        try {
            const challenge = await this.sessionService.getChallenge()
            const challengeReply = await crypto.subtle.sign(
                'RSASSA-PKCS1-v1_5',
                this.keyPair!.privateKey,
                challenge,
            )
            await this.sessionService.activateSession(
                this.publicKeyPem!,
                this.sessionId!,
                challengeReply,
            )
        } catch (error) {
            if (
                !this.destroyed &&
                this.connection.isConnected() &&
                this.connectionNumber === connectionNumber
            ) {
                this.emit(
                    'error',
                    createSessionError('Failed to activate session.', error),
                )
            }
            return
        }

        if (
            !this.destroyed &&
            this.connection.isConnected() &&
            this.connectionNumber === connectionNumber &&
            !this.active
        ) {
            this.active = true
            this.emit('sessionActive')
        }
    }
}
