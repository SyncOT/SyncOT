import { Connection } from '@syncot/connection'
import { createSessionError } from '@syncot/error'
import { SessionEvents, SessionManager } from '@syncot/session'
import { Id, isId, SyncOtEmitter } from '@syncot/util'

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
interface SessionService {
    getChallenge(): Promise<Challenge>
    activateSession(
        publicKey: ArrayBuffer,
        sessionId: Id,
        challangeReply: ChallengeReply,
    ): Promise<void>
}

/**
 * A cryptographic client-side session manager.
 */
class CryptoSessionManager extends SyncOtEmitter<SessionEvents>
    implements SessionManager {
    private keyPair: CryptoKeyPair | undefined = undefined
    private publicKey: ArrayBuffer | undefined = undefined
    private sessionId: Id | undefined = undefined
    private active: boolean = false
    private readonly sessionService: SessionService

    public constructor(private readonly connection: Connection) {
        super()

        this.connection.registerProxy({
            name: 'session',
            requestNames: new Set(['getChallenge', 'activateSession']),
        })
        this.sessionService = this.connection.getProxy(
            'session',
        ) as SessionService

        Promise.resolve().then(() => this.init())
    }

    public getSessionId(): Id | undefined {
        return this.sessionId
    }

    public hasSession(): boolean {
        return isId(this.sessionId)
    }

    public hasActiveSession(): boolean {
        return this.active
    }

    public destroy(error?: Error): void {
        if (this.destroyed) {
            return
        }
        this.connection.off('connect', this.onConnect)
        this.connection.off('disconnect', this.onDisconnect)
        this.keyPair = undefined
        this.publicKey = undefined
        this.sessionId = undefined
        this.active = false
        super.destroy(error)
    }

    private onConnect = () => {
        if (!this.destroyed) {
            this.activateSession()
        }
    }

    private onDisconnect = () => {
        if (!this.destroyed) {
            if (this.active) {
                this.active = false
                this.emitAsync('sessionInactive')
            }
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
            const sessionId = (await crypto.subtle.digest(
                'SHA-256',
                spki,
            )).slice(0, 16)

            if (this.destroyed) {
                return
            }

            this.keyPair = keyPair
            this.publicKey = spki
            this.sessionId = sessionId
            this.emitAsync('sessionOpen')

            this.connection.on('connect', this.onConnect)
            this.connection.on('disconnect', this.onDisconnect)
            this.activateSession()
        } catch (error) {
            this.destroy(createSessionError('Failed to open a session.', error))
        }
    }

    private async activateSession(): Promise<void> {
        if (!this.connection.isConnected()) {
            return
        }

        const connectionId = this.connection.connectionId

        try {
            const challenge = await this.sessionService.getChallenge()
            const challengeReply = await crypto.subtle.sign(
                'RSASSA-PKCS1-v1_5',
                this.keyPair!.privateKey,
                challenge,
            )
            await this.sessionService.activateSession(
                this.publicKey!,
                this.sessionId!,
                challengeReply,
            )

            if (
                !this.destroyed &&
                this.connection.connectionId === connectionId &&
                !this.active
            ) {
                this.active = true
                this.emitAsync('sessionActive')
            }
        } catch (error) {
            if (
                !this.destroyed &&
                this.connection.connectionId === connectionId
            ) {
                this.emitAsync(
                    'error',
                    createSessionError('Failed to activate session.', error),
                )
            }
        }
    }
}
