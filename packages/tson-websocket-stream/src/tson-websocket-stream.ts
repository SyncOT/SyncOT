import { createSocketClosedError } from '@syncot/error'
import { decode, encode } from '@syncot/tson'
import { strict as assert } from 'assert'
import { Duplex } from 'stream'

/**
 * A Duplex object stream backed by a browser WebSocket exchanging TSON encoded messages.
 *
 * If the stream ends, the WebSocket is closed automaticall.
 * If the WebSocket is closed, the stream is ended automatically.
 * In case of any errors, the stream is destroyed and the WebSocket closed.
 * WebSocket errors are ignored.
 *
 * The stream emits the following errors:
 *
 * - `TypeError`: If receiving anything other than an `ArrayBuffer`, or if the decoded received data is `null`.
 * - `SyncOtError TSON`: If serializing or parsing TSON fails.
 * - `SyncOtError SocketClosed`: If trying to send data to a closing or closed WebSocket.
 */
export class TsonWebSocketStream extends Duplex {
    /**
     * Creates a new instance of TsonWebSocketStream backed by the specified WebSocket.
     * @param webSocket A browser WebSocket.
     */
    constructor(private webSocket: WebSocket) {
        super({ objectMode: true })
        assert.ok(
            this.webSocket instanceof WebSocket,
            'Argument "webSocket" must be an instance of "WebSocket".',
        )

        this.webSocket.binaryType = 'arraybuffer'
        this.webSocket.addEventListener('close', () => {
            this.destroy()
        })
        this.webSocket.addEventListener('message', ({ data }) => {
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

        // Make sure the stream is destroyed on errors.
        this.on('error', () => {
            this.destroy()
        })
    }

    public _read(): void {
        // Nothing to do.
    }

    public _write(
        data: any,
        _encoding: any,
        callback: (error: Error | null) => void,
    ): void {
        if (this.webSocket.readyState === WebSocket.CONNECTING) {
            const send = () => {
                this.webSocket.removeEventListener('open', send)
                this.webSocket.removeEventListener('close', send)
                this._send(data, callback)
            }
            this.webSocket.addEventListener('open', send)
            this.webSocket.addEventListener('close', send)
        } else {
            this._send(data, callback)
        }
    }

    public _final(callback: (error: Error | null) => void) {
        /* istanbul ignore if */
        // When the socket is closed, the stream is destroyed, so `_final` is not called.
        if (this.webSocket.readyState === WebSocket.CLOSED) {
            callback(null)
        } else {
            const close = () => {
                this.webSocket.removeEventListener('close', close)
                callback(null)
            }
            this.webSocket.addEventListener('close', close)
            this.webSocket.close()
        }
    }

    public _destroy(
        error: Error,
        callback: (error: Error | null) => void,
    ): void {
        this.webSocket.close()
        callback(error)
    }

    private _send(data: any, callback: (error: Error | null) => void): void {
        try {
            assert.notEqual(
                this.webSocket.readyState,
                WebSocket.CONNECTING,
                'Socket is still connecting.',
            )

            if (this.webSocket.readyState !== WebSocket.OPEN) {
                throw createSocketClosedError()
            }

            this.webSocket.send(encode(data))
        } catch (error) {
            callback(error)
            return
        }
        callback(null)
    }
}
