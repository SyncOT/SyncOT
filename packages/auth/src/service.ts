import { Connection } from '@syncot/connection'
import {
    assert,
    createId,
    randomInteger,
    TypedEventEmitter,
} from '@syncot/util'
import { Auth, AuthEvents, eventNames, requestNames } from './auth'
import { createAuthError } from './error'

/**
 * The type of functions which create sessions for given credentials.
 */
export type CreateSession<Credentials, Presence> = (
    credentials: Credentials,
) => Session<Presence> | Promise<Session<Presence>>

/**
 * The options expected by `createAuthService`.
 */
export interface CreateAuthServiceOptions<Credentials, Presence> {
    /**
     * The connection for communication with the Auth client.
     */
    connection: Connection
    /**
     * The name of the service to register with the connection.
     * Default is "auth".
     */
    serviceName?: string
    /**
     * Creates a new session for the given credentials.
     */
    createSession: CreateSession<Credentials, Presence>
}

/**
 * Creates a new Auth service.
 */
export function createAuthService<Credentials, Presence>({
    connection,
    serviceName = 'auth',
    createSession,
}: CreateAuthServiceOptions<Credentials, Presence>): Auth<
    Credentials,
    Presence
> {
    return new Service(connection, serviceName, createSession)
}

/**
 * Represents a login session.
 */
export interface Session<Presence = any> {
    /**
     * A session ID.
     */
    readonly sessionId: string
    /**
     * A user ID.
     */
    readonly userId: string
    /**
     * Destroys the session.
     */
    destroy(): void
    /**
     * Determines if the user may read the specified document's content.
     */
    mayReadContent(type: string, id: string): boolean | Promise<boolean>
    /**
     * Determines if the user may write the specified document's content.
     */
    mayWriteContent(type: string, id: string): boolean | Promise<boolean>
    /**
     * Determines if the user may read the specified presence object.
     */
    mayReadPresence(presence: Presence): boolean | Promise<boolean>
    /**
     * Determines if the user may write the specified presence object.
     */
    mayWritePresence(presence: Presence): boolean | Promise<boolean>
}

/**
 * A convenient base class implementing the Session interface.
 * A userId can be specified and defaults to a random value.
 * A sessionId can be specified and defaults to a value suitable for production use.
 * All permissions are denied by default.
 * The destroy function does nothing.
 */
export class BaseSession<Presence> implements Session<Presence> {
    public constructor(
        public readonly userId: string = String(randomInteger(0, 1000)),
        public readonly sessionId: string = createId(),
    ) {}
    // tslint:disable-next-line:no-empty
    public destroy(): void {}
    public mayReadContent(): boolean {
        return false
    }
    public mayWriteContent(): boolean {
        return false
    }
    public mayReadPresence(): boolean {
        return false
    }
    public mayWritePresence(): boolean {
        return false
    }
}

class Service<Credentials, Presence>
    extends TypedEventEmitter<AuthEvents>
    implements Auth<Credentials, Presence> {
    public get active(): boolean {
        return !!this.session
    }
    public get sessionId(): string | undefined {
        return this.session && this.session.sessionId
    }
    public get userId(): string | undefined {
        return this.session && this.session.userId
    }
    private session: Session<Presence> | undefined = undefined
    private sessionPromise: Promise<Session<Presence>> | undefined = undefined

    public constructor(
        private readonly connection: Connection,
        serviceName: string,
        private readonly createSession: CreateSession<Credentials, Presence>,
    ) {
        super()
        assert(
            this.connection && !this.connection.destroyed,
            'Argument "connection" must be a non-destroyed Connection.',
        )

        this.connection.registerService({
            instance: this,
            name: serviceName,
            eventNames,
            requestNames,
        })

        this.connection.on('disconnect', this.deactivate)
        this.connection.on('destroy', this.deactivate)
    }

    public async logIn(credentials: Credentials): Promise<void> {
        this.deactivate()
        const promise = (async () => this.createSession(credentials))()
        this.sessionPromise = promise
        let session: Session

        try {
            session = await promise
        } catch (error) {
            if (this.sessionPromise === promise) {
                this.sessionPromise = undefined
                throw createAuthError('Failed to create session.', error)
            } else {
                throw createAuthError('Request canceled.', error)
            }
        }

        if (this.sessionPromise === promise) {
            this.sessionPromise = undefined
            this.session = session
            this.emitActive({
                userId: session.userId,
                sessionId: session.sessionId,
            })
        } else {
            session.destroy()
            throw createAuthError('Request canceled.')
        }
    }

    public async logOut(): Promise<void> {
        this.deactivate()
    }

    public mayReadContent(
        type: string,
        id: string,
    ): boolean | Promise<boolean> {
        return this.session ? this.session.mayReadContent(type, id) : false
    }

    public mayWriteContent(
        type: string,
        id: string,
    ): boolean | Promise<boolean> {
        return this.session ? this.session.mayWriteContent(type, id) : false
    }

    public mayReadPresence(presence: Presence): boolean | Promise<boolean> {
        return this.session ? this.session.mayReadPresence(presence) : false
    }

    public mayWritePresence(presence: Presence): boolean | Promise<boolean> {
        return this.session ? this.session.mayWritePresence(presence) : false
    }

    private deactivate = (): void => {
        this.sessionPromise = undefined
        if (!this.session) return
        this.session.destroy()
        this.session = undefined
        this.emitInactive()
    }

    private emitActive = (details: AuthEvents['active']): void => {
        queueMicrotask(() => this.emit('active', details))
    }

    private emitInactive = (): void => {
        queueMicrotask(() => this.emit('inactive'))
    }
}
