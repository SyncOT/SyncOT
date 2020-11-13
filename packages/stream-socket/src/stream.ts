import { createSocketError } from '@syncot/error'
import { globalEventLoop } from '@syncot/event-loop'
import { Duplex } from 'readable-stream'

const eventLoop = globalEventLoop()

export enum ReadyState {
    CONNECTING,
    OPEN,
    CLOSING,
    CLOSED,
}

/**
 * A subset of the WebSocket interface that is sufficient to implement SocketStream.
 */
export interface Socket {
    readyState: number

    send(data: string): void
    close(): void

    addEventListener(name: 'open' | 'close', callback: () => void): void
    addEventListener(
        name: 'message',
        callback: (event: { data: any }) => void,
    ): void
    addEventListener(
        name: 'error',
        callback: (event: { error?: Error }) => void,
    ): void

    removeEventListener(name: 'open' | 'close', callback: () => void): void
    removeEventListener(
        name: 'message',
        callback: (event: { data: any }) => void,
    ): void
    removeEventListener(
        name: 'error',
        callback: (event: { error?: Error }) => void,
    ): void
}

/**
 * A Duplex object stream backed by a `Socket` exchanging JSON encoded messages.
 *
 * When the stream is finished, the socket is closed automatically.
 * When the socket is closed, the stream is destroyed automatically.
 *
 * Socket errors are listened for and re-emitted on the stream, however, they do
 * not automatically close the stream. The socket implementations usually close the
 * socket after emitting an error.
 *
 * The stream emits the following errors:
 *
 * - `TypeError`: If
 *   - receiving anything other than a string, or
 *   - serializing JSON fails, or
 *   - the parsed received data is `null`.
 * - `SyntaxError`: If parsing JSON fails.
 * - `SyncOTError Socket`: If an error is emitted by the `socket`.
 */
export class SocketStream extends Duplex {
    /**
     * Creates a new instance of SocketStream backed by the specified socket.
     * @param socket A Socket instance.
     */
    constructor(private socket: Socket) {
        super({ objectMode: true })

        this.socket.addEventListener('close', this.onClose)
        this.socket.addEventListener('message', this.onMessage)
        this.socket.addEventListener('error', this.onError)
    }

    public _read(): void {
        // Nothing to do.
    }

    public _write(
        data: any,
        encoding: any,
        callback: (error: Error | null) => void,
    ): void {
        // When a stream is closed, nodejs (v12.1.0) does not process any pending writes
        // and does not execute their callbacks, so we do the same and skip callback
        // execution when we know that a stream has been closed or is about to be closed.

        if (this.socket.readyState === ReadyState.OPEN) {
            // Avoid blocking the event loop in case lots of messages are sent at the same time.
            eventLoop.execute(() => {
                /* istanbul ignore else */
                if (this.socket.readyState === ReadyState.OPEN) {
                    try {
                        this.socket.send(JSON.stringify(data))
                    } catch (error) {
                        /* istanbul ignore else */
                        if (!this.destroyed) {
                            this.destroy(error)
                        }
                        return
                    }
                    callback(null)
                }
            })
        } else if (this.socket.readyState === ReadyState.CONNECTING) {
            const send = () => {
                this.socket.removeEventListener('open', send)
                this.socket.removeEventListener('close', send)
                this._write(data, encoding, callback)
            }
            this.socket.addEventListener('open', send)
            this.socket.addEventListener('close', send)
        }
    }

    public _final(callback: (error: Error | null) => void) {
        /* istanbul ignore if */
        // When the socket is closed, the stream is destroyed, so `_final` is not called.
        if (this.socket.readyState === ReadyState.CLOSED) {
            callback(null)
        } else {
            const close = () => {
                this.socket.removeEventListener('close', close)
                callback(null)
            }
            this.socket.addEventListener('close', close)
            this.socket.close()
        }
    }

    public _destroy(
        error: Error,
        callback: (error: Error | null) => void,
    ): void {
        this.socket.close()
        callback(error)
    }

    private onClose = (): void => {
        /* istanbul ignore else */
        if (!this.destroyed) {
            this.destroy()
        }
    }

    private onMessage = ({ data }: { data: string }): void => {
        // Avoid blocking the event loop in case lots of messages are received at the same time.
        eventLoop.execute(() => {
            /* istanbul ignore else */
            if (!this.destroyed) {
                try {
                    if (typeof data !== 'string') {
                        throw new TypeError('Received data must be a string.')
                    }

                    const parsedData = JSON.parse(data)

                    if (parsedData === null) {
                        throw new TypeError(
                            'Parsed received data must not be `null`.',
                        )
                    }

                    this.push(parsedData)
                } catch (error) {
                    this.destroy(error)
                }
            }
        })
    }

    private onError = (event: { error?: Error }): void => {
        if (this.destroyed) {
            return
        }
        // Just in case, be flexible with handling of the "error" event.
        /* istanbul ignore next */
        const cause =
            event instanceof Error
                ? event
                : event.error instanceof Error
                ? event.error
                : undefined
        this.emit('error', createSocketError('Socket error.', cause))
    }
}
