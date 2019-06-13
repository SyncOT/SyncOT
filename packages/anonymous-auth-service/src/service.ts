import { AuthEvents, AuthService } from '@syncot/auth'
import { Connection } from '@syncot/connection'
import { assert, generateId, SyncOtEmitter } from '@syncot/util'

/**
 * The options expected by `createAuthService`.
 */
export interface CreateAuthServiceOptions {
    /**
     * The connection for communication with the AuthClient.
     */
    connection: Connection
    /**
     * The name of the service to register with the connection.
     * Default is `auth`.
     */
    serviceName?: string
}

/**
 * Creates a new AuthService which allows full anonymous access.
 */
export function createAuthService({
    connection,
    serviceName = 'auth',
}: CreateAuthServiceOptions): AuthService {
    return new AnonymousAuthService(connection, serviceName)
}

export const requestNames = new Set(['logIn'])

export interface LoginResponse {
    sessionId: string
    userId: string
}

class AnonymousAuthService extends SyncOtEmitter<AuthEvents>
    implements AuthService {
    public active: boolean = false
    public sessionId: string | undefined = undefined
    public userId: string | undefined = undefined

    public constructor(
        private readonly connection: Connection,
        serviceName: string,
    ) {
        super()

        assert(
            this.connection && !this.connection.destroyed,
            'Argument "connection" must be a non-destroyed Connection.',
        )

        this.connection.registerService({
            instance: this,
            name: serviceName,
            requestNames,
        })

        this.connection.on('destroy', this.onDestroy)
        this.connection.on('disconnect', this.onDisconnect)
    }

    public destroy(): void {
        if (this.destroyed) {
            return
        }
        this.active = false
        this.sessionId = undefined
        this.userId = undefined
        this.connection.off('destroy', this.onDestroy)
        this.connection.off('disconnect', this.onDisconnect)
        super.destroy()
    }

    public mayReadDocument(): boolean {
        return this.active
    }

    public mayWriteDocument(): boolean {
        return this.active
    }

    public mayReadPresence(): boolean {
        return this.active
    }

    public mayWritePresence(): boolean {
        return this.active
    }

    public logIn(): LoginResponse {
        if (!this.active) {
            this.active = true
            this.sessionId = generateId()
            this.userId = ''
            this.emitAsync('active')
        }
        return {
            sessionId: this.sessionId!,
            userId: this.userId!,
        }
    }

    private onDestroy = (): void => {
        this.destroy()
    }

    private onDisconnect = (): void => {
        if (this.active) {
            this.active = false
            this.sessionId = undefined
            this.userId = undefined
            this.emitAsync('inactive')
        }
    }
}
