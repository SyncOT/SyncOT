import { Connection } from '@syncot/connection'
import { createPingError } from '@syncot/error'
import { EmitterInterface, SyncOtEmitter } from '@syncot/events'
import { assert } from '@syncot/util'

export const requestNames = new Set(['ping'])

/**
 * A ping service interface.
 */
export interface PingService
    extends EmitterInterface<SyncOtEmitter<PingServiceEvents>> {}

/**
 * Events emitted by the ping service.
 */
export interface PingServiceEvents {
    /**
     * Emitted when an error occurs.
     */
    error: Error
    /**
     * Emitted when a ping message is sent.
     */
    ping: void
    /**
     * Emitted when a pong message is received.
     */
    pong: void
}

/**
 * The options expected by the `createPingService` function.
 */
export interface CreatePingServiceOptions {
    /**
     * A connection for communication with the peer ping service.
     */
    connection: Connection
    /**
     * The time in milliseconds after which the connection will be deemed broken,
     * if no ping replies are received.
     * Defaults to `60000`.
     */
    timeout?: number
    /**
     * If true, the service will only respond to ping messages but it will not ping the peer.
     * If false, the service will respond to ping messages and also ping the peer.
     * Defaults to false.
     */
    passive?: boolean
}

/**
 * Creates a new Ping service which sends and receives periodic PING and PONG messages. This service needs
 * to be installed on both the server and the client side of the connection to function correctly.
 * It plays very important roles for connection management, especially network connections.
 *
 * - It keeps connections alive. For example WebSocket connections are typically automatically closed
 *   after a period of inactivity. This service prevents it.
 * - It detects and closes broken connection. For example if a peer disconnects without following the
 *   proper hanshake, a WebSocket connection might remain open but will never deliver any messages. This service
 *   detects this situation and disconnects the broken socket, if the expected ping replies are not received.
 */
export function createPingService({
    connection,
    timeout = 60000,
    passive = false,
}: CreatePingServiceOptions): PingService {
    return new SimplePingService(connection, timeout, passive)
}

/**
 * The interface that the PingService exposes over Connection.
 */
export interface InternalPingService {
    ping(): Promise<void>
}

class SimplePingService extends SyncOtEmitter<PingServiceEvents>
    implements PingService {
    private readonly peerService: InternalPingService
    private timeoutHandle: NodeJS.Timeout | undefined = undefined
    private ok: boolean = true

    public constructor(
        private connection: Connection,
        private timeout: number,
        private passive: boolean,
    ) {
        super()

        assert(
            this.connection && !this.connection.destroyed,
            'Argument "connection" must be a non-destroyed Connection.',
        )
        assert(
            // tslint:disable-next-line:no-bitwise
            (this.timeout | 0) === this.timeout && this.timeout > 0,
            'Argument "timeout" must be a positive 32-bit integer.',
        )

        this.connection.registerService({
            instance: this,
            name: 'ping',
            requestNames,
        })
        this.connection.registerProxy({
            name: 'ping',
            requestNames,
        })
        this.peerService = this.connection.getProxy(
            'ping',
        ) as InternalPingService

        this.connection.on('destroy', this.onDestroy)
        this.connection.on('connect', this.onConnect)
        this.connection.on('disconnect', this.onDisconnect)

        if (this.connection.isConnected()) {
            this.startPinging()
        }
    }

    public destroy(): void {
        if (this.destroyed) {
            return
        }
        this.stopPinging()
        this.connection.off('destroy', this.onDestroy)
        this.connection.off('connect', this.onConnect)
        this.connection.off('disconnect', this.onDisconnect)
        super.destroy()
    }

    public ping(): void {
        // Do nothing.
    }

    private onDestroy = (): void => {
        this.destroy()
    }

    private onConnect = (): void => {
        this.startPinging()
    }

    private onDisconnect = (): void => {
        this.stopPinging()
    }

    private startPinging(): void {
        if (!this.timeoutHandle && !this.destroyed && !this.passive) {
            // We send pings at the interval equal to the half of the required timeout.
            // This way we give enough time for the peer to respond and we'll detect
            // a connection problem `this.timeout` milliseconds from the last successful ping.
            //
            // For some reason the type cast is needed for unit test type checker.
            this.timeoutHandle = (setInterval as typeof global.setInterval)(
                this.sendPing,
                // tslint:disable-next-line:no-bitwise
                this.timeout >> 1,
                false,
            ) // For some reason this casting is necessary to make tests work.
            this.sendPing(true)
        }
    }

    private stopPinging(): void {
        if (this.timeoutHandle) {
            clearInterval(this.timeoutHandle)
            this.timeoutHandle = undefined
        }
    }

    private sendPing = async (force: boolean): Promise<void> => {
        if (this.ok || force) {
            this.ok = false
            try {
                this.emitAsync('ping')
                await this.peerService.ping()
                this.ok = true
                this.emitAsync('pong')
            } catch (error) {
                this.reportPingError('Ping failed', error)
            }
        } else {
            this.reportPingError('Ping timed out')
        }
    }

    private reportPingError(message: string, cause?: Error): void {
        if (this.connection.isConnected()) {
            this.emitAsync('error', createPingError(message, cause))
            this.connection.disconnect()
        }
    }
}
