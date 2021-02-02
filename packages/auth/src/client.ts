import { Connection } from '@syncot/connection'
import {
    assert,
    BackOffStrategy,
    exponentialBackOffStrategy,
    TypedEventEmitter,
    workLoop,
} from '@syncot/util'
import { Auth, AuthEvents, eventNames, requestNames } from './auth'
import { createAuthError } from './error'

/**
 * The type of functions which return login credentials.
 */
export type GetCredentials<Credentials> = () =>
    | Credentials
    | Promise<Credentials>

/**
 * Options expected by `createAuthClient`.
 */
export interface CreateAuthClientOptions<Credentials> {
    /**
     * A `Connection` instance for communication with an Auth service.
     */
    connection: Connection
    /**
     * The name of the `Auth` service on the `connection`.
     * Default is "auth".
     */
    serviceName?: string
    /**
     * Determines if the Auth client should attempt to be always in the `active` state.
     * If set to `true`, a `getCredentials` function must be provided too,
     * so that `logIn` would have a chance to succeed.
     * Defaults to `false`.
     */
    autoLogIn?: boolean
    /**
     * A function which returns the default login credentials for `logIn`.
     * If omitted, credentials must be provided explicitly in the calls to `logIn`.
     * If `autoLogIn` is `true`, `getCredentials` must also be provided.
     */
    getCredentials?: GetCredentials<Credentials>
    /**
     * If `autoLogIn` is `true` and `logIn` fails,
     * the back-off strategy determines the retry delay.
     * Defaults to an exponential back-off strategy with:
     * - minDelay: 10000
     * - maxDelay: 60000
     * - delayFactor: 1.5
     */
    backOffStrategy?: BackOffStrategy
}

/**
 * Creates a new generic auth client.
 */
export function createAuthClient<Credentials, Presence>({
    connection,
    serviceName = 'auth',
    autoLogIn = false,
    getCredentials,
    backOffStrategy,
}: CreateAuthClientOptions<Credentials>): Auth<Credentials, Presence> {
    return new Client(
        connection,
        serviceName,
        autoLogIn,
        getCredentials,
        backOffStrategy,
    )
}

class Client<Credentials, Presence>
    extends TypedEventEmitter<AuthEvents>
    implements Auth<Credentials, Presence> {
    public active: boolean = false
    public sessionId: string | undefined = undefined
    public userId: string | undefined = undefined
    private readonly authService: Auth<Credentials, Presence>

    public constructor(
        private readonly connection: Connection,
        serviceName: string,
        autoLogIn: boolean,
        private readonly getCredentials:
            | GetCredentials<Credentials>
            | undefined,
        backOffStrategy: BackOffStrategy | undefined,
    ) {
        super()

        assert(
            this.connection && !this.connection.destroyed,
            'Argument "connection" must be a non-destroyed Connection.',
        )

        assert(
            !autoLogIn || typeof this.getCredentials === 'function',
            'Argument "getCredentials" must be a function, as "autoLogIn" is true.',
        )

        this.authService = this.connection.registerProxy({
            name: serviceName,
            requestNames,
            eventNames,
        }) as Auth<Credentials, Presence>

        this.authService.on('active', this.activate)
        this.authService.on('inactive', this.deactivate)
        this.connection.on('disconnect', this.deactivate)
        this.connection.on('destroy', this.deactivate)

        if (autoLogIn)
            workLoop((notify) => {
                this.on('inactive', notify)
                this.connection.on('connect', notify)
                return {
                    onError: this.emitError,
                    retryDelay:
                        backOffStrategy ||
                        exponentialBackOffStrategy({
                            minDelay: 10000,
                            maxDelay: 60000,
                            delayFactor: 1.5,
                        }),
                    work: async () => {
                        if (this.active) return
                        if (!this.connection.isConnected()) return
                        await this.logIn()
                    },
                }
            })
    }

    public async logIn(credentials?: Credentials): Promise<void> {
        if (credentials == null) {
            if (this.getCredentials == null)
                throw createAuthError('Credentials missing.')
            // tslint:disable-next-line:no-parameter-reassignment
            credentials = await this.getCredentials.call(null)
        }
        return this.authService.logIn(credentials)
    }

    public async logOut(): Promise<void> {
        return this.authService.logOut()
    }

    mayReadContent(type: string, id: string): boolean | Promise<boolean> {
        return this.authService.mayReadContent(type, id)
    }

    mayWriteContent(type: string, id: string): boolean | Promise<boolean> {
        return this.authService.mayWriteContent(type, id)
    }

    mayReadPresence(presence: Presence): boolean | Promise<boolean> {
        return this.authService.mayReadPresence(presence)
    }

    mayWritePresence(presence: Presence): boolean | Promise<boolean> {
        return this.authService.mayWritePresence(presence)
    }

    private activate = ({ userId, sessionId }: AuthEvents['active']): void => {
        if (this.active) this.emitInactive()
        this.active = true
        this.userId = userId
        this.sessionId = sessionId
        this.emitActive({ userId, sessionId })
    }

    private deactivate = (): void => {
        if (!this.active) return
        this.active = false
        this.sessionId = undefined
        this.userId = undefined
        this.emitInactive()
    }

    private emitActive = (details: AuthEvents['active']): void => {
        queueMicrotask(() => this.emit('active', details))
    }

    private emitInactive = (): void => {
        queueMicrotask(() => this.emit('inactive'))
    }

    private emitError = (error: Error): void => {
        this.emit('error', error)
    }
}
