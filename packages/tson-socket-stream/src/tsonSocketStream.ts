import { decode, encode } from '@syncot/tson'
import { Binary } from '@syncot/util'
import { Duplex } from 'readable-stream'

export const enum ReadyState {
    CONNECTING,
    OPEN,
    CLOSING,
    CLOSED,
}

/**
 * A subset of the WebSocket interface that is sufficient to implement TsonSocketStream.
 */
export interface TsonSocket {
    binaryType: string
    readyState: number

    send(data: Binary): void
    close(): void

    addEventListener(name: 'open' | 'close', callback: () => void): void
    addEventListener(
        name: 'message',
        callback: (event: { data: any }) => void,
    ): void

    removeEventListener(name: 'open' | 'close', callback: () => void): void
    removeEventListener(
        name: 'message',
        callback: (event: { data: any }) => void,
    ): void
}

/**
 * A Duplex object stream backed by a `TsonSocket` exchanging TSON encoded messages.
 *
 * When the stream is finished, the socket is closed automatically.
 * When the socket is closed, the stream is destroyed automatically.
 *
 * Socket errors are completely ignored because the socket is closed on errors anyway and
 * the errors are not consistent between the supported socket implementations
 * (browser WebSocket, jsdom WebSocket, ws module, SockJS).
 *
 * The client code should still handle socket errors to
 * avoid unnecessary crashes on trivial issues (in nodejs) and to report problems.
 *
 * The stream emits the following errors:
 *
 * - `TypeError`: If receiving anything other than an `ArrayBuffer`, or if the decoded received data is `null`.
 * - `SyncOtError TSON`: If serializing or parsing TSON fails.
 */
export class TsonSocketStream extends Duplex {
    /**
     * Creates a new instance of `TsonSocketStream` backed by the specified socket.
     * @param socket A TsonSocket instance.
     */
    constructor(private socket: TsonSocket) {
        super({ objectMode: true })

        this.socket.binaryType = 'arraybuffer'
        this.socket.addEventListener('close', () => {
            this.destroy()
        })
        this.socket.addEventListener('message', ({ data }) => {
            try {
                if (!(data instanceof ArrayBuffer)) {
                    throw new TypeError('Received data must be an ArrayBuffer.')
                }

                const decodedData = decode(data)

                if (decodedData === null) {
                    throw new TypeError(
                        'Received data must not decode to `null`.',
                    )
                }

                this.push(decodedData)
            } catch (error) {
                this.destroy(error)
            }
        })
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
            try {
                this.socket.send(encode(data))
            } catch (error) {
                this.destroy(error)
                return
            }
            callback(null)
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
}
