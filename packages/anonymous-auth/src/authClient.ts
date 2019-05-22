import { AuthClient, AuthEvents } from '@syncot/auth'
import { Connection } from '@syncot/connection'
import { SyncOtEmitter } from '@syncot/util'
import { strict as assert } from 'assert'

/**
 * Creates a new AuthClient which allows full anonymous access.
 */
export function createAuthClient(connection: Connection): AuthClient {
    return new AnonymousAuthClient(connection)
}

/**
 * An auth client providing anonymous read-write access to all documents.
 */
export class AnonymousAuthClient extends SyncOtEmitter<AuthEvents>
    implements AuthClient {
    private userId: string | undefined = undefined
    private authenticated: boolean = false

    public constructor(private connection: Connection) {
        super()
        assert.ok(
            this.connection && !this.connection.destroyed,
            'Argument "connection" must be a non-destroyed Connection.',
        )
        this.connection.on('destroy', this.onDestroy)
        Promise.resolve().then(() => this.init())
    }

    public getUserId(): string | undefined {
        return this.userId
    }

    public hasUserId(): boolean {
        return this.userId !== undefined
    }

    public hasAuthenticatedUserId(): boolean {
        return this.authenticated
    }

    public destroy(): void {
        if (this.destroyed) {
            return
        }
        this.userId = undefined
        this.authenticated = false
        this.connection.off('destroy', this.onDestroy)
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

        this.userId = ''
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
        /* istanbul ignore else */
        if (!this.destroyed && this.authenticated) {
            this.authenticated = false
            this.emitAsync('authEnd')
        }
    }

    private onDestroy = (): void => {
        this.destroy()
    }
}
