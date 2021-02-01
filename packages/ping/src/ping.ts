import { Connection } from '@syncot/connection'
import { assert, EmitterInterface, TypedEventEmitter } from '@syncot/util'

/**
 * The names of the requests supported by Ping over Connection.
 */
export const requestNames = new Set(['ping'])

/**
 * The Ping interface.
 */
export interface Ping extends EmitterInterface<TypedEventEmitter<PingEvents>> {
    /**
     * Records that the peer is alive at the moment and returns immediately.
     */
    ping(): Promise<void>
}

/**
 * Events emitted by Ping.
 */
export interface PingEvents {
    /**
     * Emitted when no ping messages are received within the time limit.
     * The Ping service closes the connection in that situation.
     */
    timeout: void
}

/**
 * The options expected by the `createPing` function.
 */
export interface CreatePingOptions {
    /**
     * A connection for communication with the peer Ping.
     */
    connection: Connection
    /**
     * The time in milliseconds after which the connection will be deemed broken,
     * if no messages are received from the peer.
     * Defaults to `60000`.
     */
    timeout?: number
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
export function createPing({
    connection,
    timeout = 60000,
}: CreatePingOptions): Ping {
    return new Service(connection, timeout)
}

class Service extends TypedEventEmitter<PingEvents> implements Ping {
    private readonly peer: Ping
    private handle: NodeJS.Timeout | undefined = undefined
    private lastSeenTime: number = 0
    private get interval(): number {
        // We send pings at the interval equal to the half of the required timeout.
        // This way we give enough time for the peer to respond and we'll detect
        // a connection problem `this.timeout` milliseconds from the last successful ping.
        // tslint:disable-next-line:no-bitwise
        return this.timeout >> 1
    }

    public constructor(
        private connection: Connection,
        private timeout: number,
    ) {
        super()

        assert(
            this.connection && typeof this.connection === 'object',
            'Argument "connection" must be an object.',
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
        this.peer = this.connection.registerProxy({
            name: 'ping',
            requestNames,
        }) as Ping

        this.connection.on('destroy', this.stop)
        this.connection.on('disconnect', this.stop)
        this.connection.on('connect', this.start)
        if (this.connection.isConnected()) this.start()
    }

    public async ping(): Promise<void> {
        this.lastSeenTime = Date.now()
        this.schedule()
    }

    private start = (): void => {
        this.lastSeenTime = Date.now()
        this.schedule()
    }

    private stop = (): void => {
        if (!this.handle) return
        clearTimeout(this.handle)
        this.handle = undefined
    }

    private schedule = (): void => {
        if (this.handle) clearTimeout(this.handle)
        if (!this.connection.isConnected()) return
        this.handle = setTimeout(this.callback, this.interval)
    }

    private callback = (): void => {
        if (this.lastSeenTime <= Date.now() - this.timeout) {
            this.connection.disconnect()
            this.emit('timeout')
        } else {
            this.schedule()
            this.send()
        }
    }

    private async send(): Promise<void> {
        try {
            await this.peer.ping()
            this.lastSeenTime = Date.now()
        } catch (error) {
            // Do nothing.
        }
    }
}
