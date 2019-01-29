import { EventEmitter } from 'events'
import { Duplex, finished } from 'stream'
import { ErrorCodes, SyncOtError } from './error'
import { JsonValue } from './json'
import { Interface, NodeEventEmitter } from './util'

interface Events {
    connect: void
    disconnect: Error | null
}

class ConnectionImpl extends (EventEmitter as NodeEventEmitter<Events>) {
    private stream: Duplex | null = null

    /**
     * Connects to the specified stream and emits the `'connect'` event.
     *
     * When the `stream` is finished, the `Connection` emits the `'disconnect'` event.
     *
     * If the `stream` emits an `error` event, it is automatically destroyed and
     * the `Connection` emits the `'disconnect'` event with the `error`.
     *
     * Throws an error, if this connection is already associated with a different stream or
     * the specified `stream` is not a `Duplex` stream.
     *
     * @param stream The stream to connect to.
     */
    public connect(stream: Duplex): void {
        if (!(stream instanceof Duplex)) {
            throw new SyncOtError(ErrorCodes.InvalidArgument)
        }
        if (this.stream) {
            throw new SyncOtError(ErrorCodes.AlreadyConnected)
        }
        this.stream = stream
        stream.on('data', data => this.stream === stream && this.onData(data))
        finished(
            stream,
            error => this.stream === stream && this.disconnect(error),
        )
        this.emit('connect')
    }

    /**
     * Destroys the stream associated with this connection.
     * Emits the `'disconnect'` event with the optional `error`.
     */
    public disconnect(error?: Error): void {
        const stream = this.stream

        if (stream) {
            this.stream = null
            this.emit('disconnect', error || null)
            stream.destroy()
        }
    }

    /**
     * Returns `true`, if this `Connection` is associated with a stream, otherwise `false`.
     */
    public isConnected(): boolean {
        return !!this.stream
    }

    private onData(_message: JsonValue): void {
        //
    }
}

/**
 * Exposes a higher level protocol over a duplex object stream.
 * The other end of the stream should be connected to another `Connection`.
 *
 * @event connect Emitted when this `Connection` gets associated with a stream.
 * @event disconnect Emitted with a `null` payload when the associated stream finishes.
 *   Emitted with an `error`, if the stream is destroyed due to an error.
 */
export interface Connection extends Interface<ConnectionImpl> {}

/**
 * Creates a new `Connection`.
 */
export function createConnection(): Connection {
    return new ConnectionImpl()
}
