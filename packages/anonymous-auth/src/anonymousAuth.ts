import { AuthEvents, AuthManager } from '@syncot/auth'
import { Connection } from '@syncot/core'
import { Id, isId, SyncOtEmitter } from '@syncot/util'

/**
 * Creates a new AuthManager which allows anonymous read-write access to all documents.
 * It's suitable for use on both the client and server sides.
 */
export function createAuthManager(connection: Connection): AuthManager {
    return new AnonymousAuthManager(connection)
}

/**
 * An auth module providing anonymous read-write access to all documents.
 * It's suitable for use on both the client and server sides.
 */
class AnonymousAuthManager extends SyncOtEmitter<AuthEvents>
    implements AuthManager {
    private userId: Id | undefined = undefined
    private authenticated: boolean = false

    public constructor(private connection: Connection) {
        super()
        Promise.resolve().then(() => this.init())
    }

    public getUserId(): Id | undefined {
        return this.userId
    }

    public hasUserId(): boolean {
        return isId(this.userId)
    }

    public hasAuthenticatedUserId(): boolean {
        return this.authenticated
    }

    public async mayReadDocument(): Promise<boolean> {
        return this.hasUserId()
    }

    public async mayWriteDocument(): Promise<boolean> {
        return this.hasUserId()
    }

    public destroy(): void {
        if (this.destroyed) {
            return
        }
        this.userId = undefined
        this.authenticated = false
        this.connection.off('connect', this.onConnect)
        this.connection.off('disconnect', this.onDisconnect)
        super.destroy()
    }

    private init(): void {
        if (this.destroyed) {
            return
        }

        this.connection.on('connect', this.onConnect)
        this.connection.on('disconnect', this.onDisconnect)

        this.userId = 0
        this.emitAsync('user')

        this.authenticated = this.connection.isConnected()
        if (this.authenticated) {
            this.emitAsync('auth')
        }
    }

    private onConnect = () => {
        if (!this.destroyed && !this.authenticated) {
            this.authenticated = true
            this.emitAsync('auth')
        }
    }

    private onDisconnect = () => {
        if (!this.destroyed && this.authenticated) {
            this.authenticated = false
            this.emitAsync('authEnd')
        }
    }
}
