import { EmitterInterface, SyncOTEmitter } from '@syncot/events'
import { assert, randomInteger } from '@syncot/util'
import { Duplex } from 'readable-stream'
import { Connection } from './connection'
import { StreamFactory } from './factory'

/**
 * Events emitted by the `StreamManager`.
 */
export interface StreamManagerEvents {
    error: Error
}

/**
 * Connects a `Connection` instance to a stream and reconnects as needed.
 *
 * @event error When a managed stream emits an error.
 * @event destroy When the `StreamManager` is destroyed.
 */
export interface StreamManager
    extends EmitterInterface<SyncOTEmitter<StreamManagerEvents>> {}

/**
 * The parameter type for `createStreamManager`.
 */
export interface StreamManagerOptions {
    /**
     * The Connection to keep connected to a stream.
     */
    connection: Connection
    /**
     * A function used for creating new streams for the connection.
     */
    createStream: StreamFactory
    /**
     * The minimum number of milliseconds to wait before reconnecting.
     * Default is 1000.
     */
    minDelay?: number
    /**
     * The maximum number of milliseconds to wait before reconnecting.
     * Default is 10000.
     */
    maxDelay?: number
    /**
     * How many times longer to wait on each subsequent reconnect attempt.
     * If set to 0, a random delay is used every time.
     * Default is 1.5.
     */
    delayFactor?: number
    /**
     * The number of milliseconds to wait after establishing a connection
     * before resetting the counter of failed connections.
     * Default is 0.
     */
    counterResetDelay?: number
}

/**
 * Creates a new `StreamManager`.
 */
export function createStreamManager({
    connection,
    createStream,
    minDelay,
    maxDelay,
    delayFactor,
    counterResetDelay,
}: StreamManagerOptions): StreamManager {
    return new Manager(
        connection,
        createStream,
        minDelay,
        maxDelay,
        delayFactor,
        counterResetDelay,
    )
}

class Manager
    extends SyncOTEmitter<StreamManagerEvents>
    implements StreamManager {
    private attempt: number = -1
    private scheduledConnect: NodeJS.Timeout | undefined = undefined
    private stream: Duplex | undefined
    private connectionTime: number = 0

    public constructor(
        private readonly connection: Connection,
        private readonly createStream: StreamFactory,
        private readonly minDelay: number = 1000,
        private readonly maxDelay: number = 10000,
        private readonly delayFactor: number = 1.5,
        private readonly counterResetDelay: number = 0,
    ) {
        super()
        assert(
            this.connection && !this.connection.destroyed,
            'Argument "connection" must be a non-destroyed connection.',
        )
        assert(
            typeof this.createStream === 'function',
            'Argument "createStream" must be a function.',
        )
        assert(
            Number.isSafeInteger(this.minDelay) && this.minDelay >= 1,
            'Argument "minDelay" must be a safe integer >= 1.',
        )
        assert(
            Number.isSafeInteger(this.maxDelay) &&
                this.maxDelay >= this.minDelay,
            'Argument "maxDelay" must be a safe integer >= minDelay.',
        )
        assert(
            Number.isFinite(this.delayFactor) &&
                (this.delayFactor >= 1 || this.delayFactor === 0),
            'Argument "delayFactor" must be a finite number >= 1 or == 0.',
        )
        assert(
            typeof this.counterResetDelay === 'number' &&
                !Number.isNaN(this.counterResetDelay),
            'Argument "counterResetDelay" must be a valid number.',
        )

        this.connection.on('connect', this.onConnect)
        this.connection.on('disconnect', this.onDisconnect)
        this.connection.on('destroy', this.onDestroy)
        this.scheduleConnect()
    }

    public destroy(): void {
        if (this.destroyed) {
            return
        }
        this.connection.off('connect', this.onConnect)
        this.connection.off('disconnect', this.onDisconnect)
        this.connection.off('destroy', this.onDestroy)
        this.cancelScheduledConnect()
        if (this.stream) {
            this.stream.destroy()
        }
        super.destroy()
    }

    private async connect(): Promise<void> {
        if (!this.shouldConnect()) {
            return
        }

        const stream = await this.createStream()
        stream.on('error', (error) => this.emitAsync('error', error))

        if (!this.shouldConnect()) {
            stream.destroy()
            return
        }

        this.stream = stream
        this.connectionTime = Date.now()
        this.connection.connect(stream)
    }

    private onConnect = () => {
        this.cancelScheduledConnect()
    }

    private onDisconnect = () => {
        if (this.connectionTime + this.counterResetDelay <= Date.now()) {
            this.attempt = 0
        }
        this.scheduleConnect()
    }

    private onDestroy = (): void => {
        this.destroy()
    }

    private scheduleConnect(): void {
        this.cancelScheduledConnect()

        if (!this.shouldConnect()) {
            return
        }

        const delay =
            this.attempt === -1
                ? 0
                : this.delayFactor === 0
                ? randomInteger(this.minDelay, this.maxDelay)
                : Math.min(
                      this.maxDelay,
                      this.minDelay * Math.pow(this.delayFactor, this.attempt),
                  )

        this.attempt++
        this.scheduledConnect = setTimeout(() => {
            this.scheduledConnect = undefined
            this.connect().catch((error) => {
                this.emitAsync('error', error)
                this.scheduleConnect()
            })
        }, delay)
    }

    private cancelScheduledConnect(): void {
        if (this.scheduledConnect !== undefined) {
            clearTimeout(this.scheduledConnect)
            this.scheduledConnect = undefined
        }
    }

    private shouldConnect(): boolean {
        return (
            !this.destroyed &&
            !this.connection.destroyed &&
            !this.connection.isConnected()
        )
    }
}
