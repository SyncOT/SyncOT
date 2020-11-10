import { createSocketError } from '@syncot/error'
import {
    sockJsClientConnectionToSocket,
    SocketStream,
} from '@syncot/stream-socket'
import { assert } from '@syncot/util'
import { Duplex } from 'readable-stream'
import SockJS from 'sockjs-client'

type Factory = () => Promise<Duplex>

export interface CreateSockJsStreamOptions {
    /**
     * The SockJS URL to connect to.
     */
    url: string
    /**
     * The timeout in milliseconds for establishing a connection.
     * Defaults to no timeout.
     */
    timeout?: number
    /**
     * Additional SockJS options passed directly to the SockJS constructor.
     */
    sockJsOptions?: SockJS.Options
}

/**
 * Creates a factory producing JSON-encoded client SockJS streams.
 */
export const createSockJsStream = ({
    url,
    timeout,
    sockJsOptions,
}: CreateSockJsStreamOptions): Factory => {
    assert(typeof url === 'string', 'Argument "url" must be a string.')
    assert(
        timeout === undefined ||
            (Number.isSafeInteger(timeout) && timeout >= 0),
        'Argument "timeout" must be undefined or a safe integer >= 0.',
    )

    return () =>
        new Promise((resolve, reject) => {
            const socket = new SockJS(url, undefined, sockJsOptions)

            const onOpen = () => {
                cleanUp()
                resolve(
                    new SocketStream(sockJsClientConnectionToSocket(socket)),
                )
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
