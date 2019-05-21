import { createSocketError } from '@syncot/error'
import {
    sockJsClientConnectionToTsonSocket as toTsonSocket,
    TsonSocketStream,
} from '@syncot/tson-socket-stream'
import { strict as assert } from 'assert'
import { Duplex } from 'readable-stream'
import SockJS from 'sockjs-client'

type Factory = () => Promise<Duplex>

/**
 * Creates a factory producing TSON-encoded client SockJS streams.
 * @param sockJsUrl The SockJS URL to connect to.
 * @param timeout The timeout in milliseconds for establishing a connection.
 *   Defaults to no timeout.
 */
export const createSockJsStream = (
    sockJsUrl: string,
    timeout?: number,
): Factory => {
    assert.ok(
        typeof sockJsUrl === 'string',
        'Argument "sockJsUrl" must be a string.',
    )
    assert.ok(
        timeout === undefined ||
            (Number.isSafeInteger(timeout) && timeout >= 0),
        'Argument "timeout" must be undefined or a safe integer >= 0.',
    )

    return () =>
        new Promise((resolve, reject) => {
            const socket = new SockJS(sockJsUrl)

            const onOpen = () => {
                cleanUp()
                resolve(new TsonSocketStream(toTsonSocket(socket)))
            }
            const onClose = () => {
                cleanUp()
                reject(
                    createSocketError(
                        'Failed to establish a SockJS connection.',
                    ),
                )
            }
            const onTimeout = () => {
                cleanUp()
                socket.close()
                reject(
                    createSocketError(
                        'Timed out while establishing a SockJS connection.',
                    ),
                )
            }

            socket.addEventListener('open', onOpen)
            socket.addEventListener('close', onClose)
            const timeoutHandle =
                timeout === undefined
                    ? undefined
                    : setTimeout(onTimeout, timeout)

            const cleanUp = () => {
                socket.removeEventListener('open', onOpen)
                socket.removeEventListener('close', onClose)
                if (timeoutHandle !== undefined) {
                    clearTimeout(timeoutHandle)
                }
            }
        })
}
