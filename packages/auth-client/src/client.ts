import { AuthClient, AuthEvents } from '@syncot/auth'
import { Connection } from '@syncot/connection'
import { SyncOtEmitter } from '@syncot/events'
import { createTaskRunner, TaskRunner } from '@syncot/task-runner'
import { assert } from '@syncot/util'

/**
 * Options expected by `createAuthClient`.
 */
export interface CreateAuthClientOptions {
    /**
     * A `Connection` instance for communication with an `AuthService`.
     */
    connection: Connection
    /**
     * The name of the `AuthService` on the `connection`.
     * Default is `'auth'`.
     */
    serviceName?: string
    /**
     * A function which returns login details,
     * or a `Promise` which resolves to login details,
     * to submit to the `AuthService`.
     * Default is `() => null`.
     */
    getLoginDetails?: () => any
    /**
     * Min retry delay for login attempts in milliseconds.
     * Default is 10000.
     */
    minDelay?: number
    /**
     * Max retry delay for login attempts in milliseconds.
     * Default is 60000.
     */
    maxDelay?: number
    /**
     * If >= 1, then how many times longer to wait before retrying after each failed login attempt.
     * If === 0, then retry after a random delay.
     * Default is 1.5.
     */
    delayFactor?: number
}

/**
 * Creates a new generic auth client.
 */
export function createAuthClient({
    connection,
    getLoginDetails = returnNull,
    serviceName = 'auth',
    minDelay = 10000,
    maxDelay = 60000,
    delayFactor = 1.5,
}: CreateAuthClientOptions): AuthClient {
    return new Client(
        connection,
        getLoginDetails,
        serviceName,
        minDelay,
        maxDelay,
        delayFactor,
    )
}

const returnNull = () => null
export const requestNames = new Set(['logIn'])
export interface LoginResponse {
    sessionId: string
    userId: string
}
export interface InternalAuthService {
    logIn(loginDetails: any): Promise<LoginResponse>
}

class Client extends SyncOtEmitter<AuthEvents> implements AuthClient {
    public active: boolean = false
    public sessionId: string | undefined = undefined
    public userId: string | undefined = undefined
    private readonly authService: InternalAuthService
    private readonly taskRunner: TaskRunner<LoginResponse>

    public constructor(
        private readonly connection: Connection,
        getLoginDetails: () => any,
        serviceName: string,
        minDelay: number,
        maxDelay: number,
        delayFactor: number,
    ) {
        super()

        assert(
            this.connection && !this.connection.destroyed,
            'Argument "connection" must be a non-destroyed Connection.',
        )

        this.taskRunner = createTaskRunner(
            async () => this.authService.logIn(await getLoginDetails()),
            {
                delayFactor,
                maxDelay,
                minDelay,
            },
        )

        this.connection.registerProxy({
            name: serviceName,
            requestNames,
        })
        this.authService = this.connection.getProxy(
            serviceName,
        ) as InternalAuthService

        this.connection.on('destroy', this.onDestroy)
        this.connection.on('connect', this.onConnect)
        this.connection.on('disconnect', this.onDisconnect)
        this.taskRunner.on('error', this.onError)
        this.taskRunner.on('done', this.onLogin)

        if (this.connection.isConnected()) {
            this.taskRunner.run()
        }
    }

    public destroy(): void {
        if (this.destroyed) {
            return
        }

        this.connection.off('destroy', this.onDestroy)
        this.connection.off('connect', this.onConnect)
        this.connection.off('disconnect', this.onDisconnect)
        this.taskRunner.off('error', this.onError)
        this.taskRunner.off('done', this.onLogin)

        this.active = false
        this.sessionId = undefined
        this.userId = undefined
        this.taskRunner.destroy()
        super.destroy()
    }

    private onDestroy = (): void => {
        this.destroy()
    }

    private onConnect = (): void => {
        this.taskRunner.run()
    }

    private onDisconnect = (): void => {
        this.taskRunner.cancel()
        if (this.active) {
            this.active = false
            this.sessionId = undefined
            this.userId = undefined
            this.emitAsync('inactive')
        }
    }

    private onError = (error: Error): void => {
        this.emitAsync('error', error)
    }

    private onLogin = ({ sessionId, userId }: LoginResponse): void => {
        this.active = true
        this.sessionId = sessionId
        this.userId = userId
        this.emitAsync('active')
    }
}
