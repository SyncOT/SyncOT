import { decode } from '@syncot/tson'
import { strict as assert } from 'assert'
import { Duplex } from 'stream'

/**
 * A Duplex object stream backed by a browser WebSocket exchanging TSON encoded messages.
 *
 * If any stream or WebSocket error is encountered,
 * the stream is automatically destroyed and the WebSocket closed.
 * If the stream ends, the WebSocket is closed automaticall.
 * If the WebSocket is closed, the stream is ended automatically.
 *
 * The stream emits the following errors:
 *
 * - Any errors forwarded from the WebSocket.
 * - `TypeError`: If receiving anything other than an `ArrayBuffer`,
 *   or if the decoded received data is `null`.
 * - `SyncOtError TSON`: If serializing or parsing TSON fails.
 */
export class TsonWebSocketStream extends Duplex {
    /**
     * Creates a new instance of TsonWebSocketStream backed by the specified WebSocket.
     * @param webSocket A browser WebSocket.
     */
    constructor(private webSocket: WebSocket) {
        super({
            objectMode: true,
        })
        assert.ok(
            this.webSocket instanceof WebSocket,
            'Argument "webSocket" must be an instance of "WebSocket".',
        )

        this.webSocket.binaryType = 'arraybuffer'
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
    }

    public _read(): void {
        // Nothing to do.
    }

    public _destroy(error: Error, callback: (error: Error) => void): void {
        this.webSocket.close()
        callback(error)
    }
}
