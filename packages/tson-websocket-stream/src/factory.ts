import { createSocketError } from '@syncot/error'
import { TsonSocketStream } from '@syncot/tson-socket-stream'
import { strict as assert } from 'assert'
import { Duplex } from 'readable-stream'

type Factory = () => Promise<Duplex>

/**
 * Creates a factory producing TSON-encoded client WebSocket streams.
 * @param webSocketUrl The WebSocket URL to connect to.
 * @param timeout The timeout in milliseconds for establishing a connection.
 *   Defaults to no timeout.
 */
export const createWebSocketStream = (
    webSocketUrl: string,
    timeout?: number,
): Factory => {
    assert.ok(
        typeof webSocketUrl === 'string',
        'Argument "timeout" must be a string.',
    )
    assert.ok(
        timeout === undefined ||
            (Number.isSafeInteger(timeout) && timeout >= 0),
        'Argument "timeout" must be undefined or a safe integer >= 0.',
    )

    return () =>
        new Promise((resolve, reject) => {
            const webSocket = new WebSocket(webSocketUrl)

            const onOpen = () => {
                cleanUp()
                resolve(new TsonSocketStream(webSocket))
            }
            const onClose = () => {
                cleanUp()
                reject(
                    createSocketError(
                        'Failed to establish a WebSocket connection.',
                    ),
                )
            }
            const onTimeout = () => {
                cleanUp()
                webSocket.close()
                reject(
                    createSocketError(
                        'Timed out while establishing a WebSocket connection.',
                    ),
                )
            }

            webSocket.addEventListener('open', onOpen)
            webSocket.addEventListener('close', onClose)
            const timeoutHandle =
                timeout === undefined
                    ? undefined
                    : setTimeout(onTimeout, timeout)

            const cleanUp = () => {
                webSocket.removeEventListener('open', onOpen)
                webSocket.removeEventListener('close', onClose)
                if (timeoutHandle !== undefined) {
                    clearTimeout(timeoutHandle)
                }
            }
        })
}
