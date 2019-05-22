import { SyncOtEmitter } from '@syncot/util'
import { strict as assert } from 'assert'
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
export interface StreamManager extends SyncOtEmitter<StreamManagerEvents> {}

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
     * Default is 1.5.
     */
    delayFactor?: number
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
}: StreamManagerOptions): StreamManager {
    return new Manager(
        connection,
        createStream,
        minDelay,
        maxDelay,
        delayFactor,
    )
}

class Manager extends SyncOtEmitter<StreamManagerEvents>
    implements StreamManager {
    private attempt: number = -1
    private scheduledConnect: NodeJS.Timeout | undefined = undefined
    private stream: Duplex | undefined

    public constructor(
        private readonly connection: Connection,
        private readonly createStream: StreamFactory,
        private readonly minDelay: number = 1000,
        private readonly maxDelay: number = 10000,
        private readonly delayFactor: number = 1.5,
    ) {
        super()
        assert.ok(
            this.connection && !this.connection.destroyed,
            'Argument "connection" must be a non-destroyed connection.',
        )
        assert.ok(
            typeof this.createStream === 'function',
            'Argument "createStream" must be a function.',
        )
        assert.ok(
            Number.isSafeInteger(this.minDelay) && this.minDelay >= 1,
            'Argument "minDelay" must be a safe integer >= 1.',
        )
        assert.ok(
            Number.isSafeInteger(this.maxDelay) &&
                this.maxDelay >= this.minDelay,
            'Argument "maxDelay" must be a safe integer >= minDelay.',
        )
        assert.ok(
            Number.isFinite(this.delayFactor) && this.delayFactor >= 1,
            'Argument "delayFactor" must be a finite number >= 1.',
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
        stream.on('error', error => this.emitAsync('error', error))

        if (!this.shouldConnect()) {
            stream.destroy()
            return
        }

        this.stream = stream
        this.connection.connect(stream)
    }

    private onConnect = () => {
        this.cancelScheduledConnect()
    }

    private onDisconnect = () => {
        this.attempt = 0
        this.scheduleConnect()
    }

    private onDestroy = () => {
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
                : Math.min(
                      this.maxDelay,
                      this.minDelay *
                          Math.pow(this.delayFactor, this.attempt++),
                  )

        this.scheduledConnect = setTimeout(() => {
            this.scheduledConnect = undefined
            this.connect().catch(error => {
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
