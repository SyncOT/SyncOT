/**
 * @jest-environment jsdom
 */
import { decode, encode } from '@syncot/tson'
import ws from 'ws'
import { TsonWebSocket, TsonWebSocketStream } from '.'

const delay = (time = 0) => new Promise(resolve => setTimeout(resolve, time))

const whenOpen = (socket: TsonWebSocket) =>
    new Promise((resolve, reject) => {
        if (socket.readyState === WebSocket.CONNECTING) {
            const onOpen = () => {
                socket.removeEventListener('open', onOpen)
                socket.removeEventListener('close', onClose)
                resolve()
            }
            const onClose = () => {
                socket.removeEventListener('open', onOpen)
                socket.removeEventListener('close', onClose)
                reject(new Error('Socket closed.'))
            }
            socket.addEventListener('open', onOpen)
            socket.addEventListener('close', onClose)
        } else if (socket.readyState === WebSocket.OPEN) {
            resolve()
        } else {
            reject(
                new Error(
                    socket.readyState === WebSocket.CLOSING
                        ? 'Socket closing.'
                        : 'Socket closed.',
                ),
            )
        }
    })

const whenClosed = (socket: TsonWebSocket) =>
    new Promise(resolve => {
        if (socket.readyState === WebSocket.CLOSED) {
            resolve()
        } else {
            const onClose = () => {
                socket.removeEventListener('close', onClose)
                resolve()
            }
            socket.addEventListener('close', onClose)
        }
    })

const streamDestroyedMatcher = expect.objectContaining({
    message: 'Cannot call write after a stream was destroyed',
    name: 'Error [ERR_STREAM_DESTROYED]',
})

const tsonErrorMatcher = expect.objectContaining({
    message: 'Error name is not a string.',
    name: 'SyncOtError TSON',
})

const socketClosedMatcher = expect.objectContaining({
    message: 'Socket closed.',
    name: 'SyncOtError SocketClosed',
})

let server: ws.Server
let clientSocket: WebSocket
let serverSocket: ws
let clientStream: TsonWebSocketStream
let serverStream: TsonWebSocketStream

describe.each([['browser', WebSocket], ['ws', ws]])(
    '%s',
    (_, webSocketConstructor) => {
        beforeEach(done => {
            server = new ws.Server({ port: 0 })
            server.once('listening', () => {
                const {
                    address,
                    family,
                    port,
                } = server.address() as ws.AddressInfo
                clientSocket = new webSocketConstructor(
                    family === 'IPv6'
                        ? `ws://[${address}]:${port}`
                        : `ws://${address}:${port}`,
                )
                clientSocket.addEventListener('error', () => {
                    // Ignore errors - the socket will be closed anyway.
                })
                clientStream = new TsonWebSocketStream(clientSocket)
            })
            server.once('connection', newServerSocket => {
                serverSocket = newServerSocket
                serverStream = new TsonWebSocketStream(serverSocket)
                done()
            })
        })

        afterEach(done => {
            server.close(done)
        })

        test('receive non-ArrayBuffer', async () => {
            const onData = jest.fn()
            const onError = jest.fn()
            const onStreamClose = jest.fn()
            const onWebSocketClose = jest.fn()
            clientStream.on('data', onData)
            clientStream.on('error', onError)
            clientStream.on('close', onStreamClose)
            clientSocket.addEventListener('close', onWebSocketClose)
            serverSocket.send('abc')
            await whenClosed(clientSocket)
            expect(onData).not.toHaveBeenCalled()
            expect(onError).toHaveBeenCalledTimes(1)
            expect(onError).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Received data must be an ArrayBuffer.',
                    name: 'TypeError',
                }),
            )
            expect(onStreamClose).toHaveBeenCalledTimes(1)
            expect(onWebSocketClose).toHaveBeenCalledTimes(1)
        })

        test('receive TSON-encoded `null` value', async () => {
            const onData = jest.fn()
            const onError = jest.fn()
            const onStreamClose = jest.fn()
            const onWebSocketClose = jest.fn()
            clientStream.on('data', onData)
            clientStream.on('error', onError)
            clientStream.on('close', onStreamClose)
            clientSocket.addEventListener('close', onWebSocketClose)
            serverSocket.send(encode(null))
            await whenClosed(clientSocket)
            expect(onData).not.toHaveBeenCalled()
            expect(onError).toHaveBeenCalledTimes(1)
            expect(onError).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Received data must not decode to `null`.',
                    name: 'TypeError',
                }),
            )
            expect(onStreamClose).toHaveBeenCalledTimes(1)
            expect(onWebSocketClose).toHaveBeenCalledTimes(1)
        })

        test('receive invalid TSON data', async () => {
            const onData = jest.fn()
            const onError = jest.fn()
            const onStreamClose = jest.fn()
            const onWebSocketClose = jest.fn()
            clientStream.on('data', onData)
            clientStream.on('error', onError)
            clientStream.on('close', onStreamClose)
            clientSocket.addEventListener('close', onWebSocketClose)
            serverSocket.send(Buffer.allocUnsafe(0))
            await whenClosed(clientSocket)
            expect(onData).not.toHaveBeenCalled()
            expect(onError).toHaveBeenCalledTimes(1)
            expect(onError).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Type code expected.',
                    name: 'SyncOtError TSON',
                }),
            )
            expect(onStreamClose).toHaveBeenCalledTimes(1)
            expect(onWebSocketClose).toHaveBeenCalledTimes(1)
        })

        test('receive some data', async () => {
            const message1 = { key: 'value', a: [1, 2, 3], t: true }
            const message2 = 0
            const onData = jest.fn()
            clientStream.on('data', onData)
            serverSocket.send(encode(message1))
            serverSocket.send(encode(message2))
            serverSocket.close()
            await whenClosed(clientSocket)
            expect(onData).toHaveBeenCalledTimes(2)
            expect(onData).toHaveBeenNthCalledWith(1, message1)
            expect(onData).toHaveBeenNthCalledWith(2, message2)
        })

        test('send invalid data to a CONNECTING socket', async () => {
            const onWrite = jest.fn()
            const onError = jest.fn()
            const onMessage = jest.fn()
            const invalidData = new Error()
            invalidData.name = 5 as any // `error.name` must be a string.
            clientStream.on('error', onError)
            serverSocket.on('message', onMessage)
            expect(clientSocket.readyState).toBe(WebSocket.CONNECTING)
            clientStream.write(invalidData, onWrite)
            await whenClosed(clientSocket)
            expect(onError).toHaveBeenCalledTimes(1)
            expect(onError).toHaveBeenCalledWith(tsonErrorMatcher)
            expect(onWrite).toHaveBeenCalledTimes(1)
            expect(onWrite).toHaveBeenCalledWith(tsonErrorMatcher)
            expect(onMessage).not.toHaveBeenCalled()
        })

        test('send invalid data to an OPEN socket', async () => {
            const onWrite = jest.fn()
            const onError = jest.fn()
            const onMessage = jest.fn()
            const invalidData = new Error()
            invalidData.name = 5 as any // `error.name` must be a string.
            clientStream.on('error', onError)
            serverSocket.on('message', onMessage)
            await whenOpen(clientSocket)
            expect(clientSocket.readyState).toBe(WebSocket.OPEN)
            clientStream.write(invalidData, onWrite)
            await whenClosed(clientSocket)
            expect(onError).toHaveBeenCalledTimes(1)
            expect(onError).toHaveBeenCalledWith(tsonErrorMatcher)
            expect(onWrite).toHaveBeenCalledTimes(1)
            expect(onWrite).toHaveBeenCalledWith(tsonErrorMatcher)
            expect(onMessage).not.toHaveBeenCalled()
        })

        test('send invalid data to a CLOSING socket', async () => {
            const onWrite = jest.fn()
            const onError = jest.fn()
            const onMessage = jest.fn()
            const invalidData = new Error()
            invalidData.name = 5 as any // `error.name` must be a string.
            clientStream.on('error', onError)
            serverSocket.on('message', onMessage)
            await whenOpen(clientSocket)
            clientSocket.close()
            expect(clientSocket.readyState).toBe(WebSocket.CLOSING)
            clientStream.write(invalidData, onWrite)
            await whenClosed(clientSocket)
            expect(onError).toHaveBeenCalledTimes(1)
            expect(onError).toHaveBeenCalledWith(socketClosedMatcher)
            expect(onWrite).toHaveBeenCalledTimes(1)
            expect(onWrite).toHaveBeenCalledWith(socketClosedMatcher)
            expect(onMessage).not.toHaveBeenCalled()
        })

        test('send invalid data to a CLOSED socket', async () => {
            const onWrite = jest.fn()
            const onError = jest.fn()
            const onMessage = jest.fn()
            const invalidData = new Error()
            invalidData.name = 5 as any // `error.name` must be a string.
            clientStream.on('error', onError)
            serverSocket.on('message', onMessage)
            await whenOpen(clientSocket)
            clientSocket.close()
            await whenClosed(clientSocket)
            expect(clientSocket.readyState).toBe(WebSocket.CLOSED)
            clientStream.write(invalidData, onWrite)
            await delay()
            expect(onError).toHaveBeenCalledTimes(1)
            expect(onError).toHaveBeenCalledWith(streamDestroyedMatcher)
            expect(onWrite).toHaveBeenCalledTimes(1)
            expect(onWrite).toHaveBeenCalledWith(streamDestroyedMatcher)
            expect(onMessage).not.toHaveBeenCalled()
        })

        test('send valid data to a CONNECTING socket', async () => {
            const onWrite = jest.fn()
            const onMessage = jest.fn()
            const data = { key: 'value' }
            serverSocket.on('message', onMessage)
            expect(clientSocket.readyState).toBe(WebSocket.CONNECTING)
            clientStream.write(data, onWrite)
            clientStream.end()
            await whenClosed(clientSocket)
            expect(onWrite).toHaveBeenCalledTimes(1)
            expect(onWrite).toHaveBeenCalledWith()
            expect(onMessage).toBeCalledTimes(1)
            expect(decode(onMessage.mock.calls[0][0])).toEqual(data)
        })

        test('send valid data to an OPEN socket', async () => {
            const onWrite = jest.fn()
            const onMessage = jest.fn()
            const data = { key: 'value' }
            serverSocket.on('message', onMessage)
            await whenOpen(clientSocket)
            expect(clientSocket.readyState).toBe(WebSocket.OPEN)
            clientStream.write(data, onWrite)
            clientStream.end()
            await whenClosed(clientSocket)
            expect(onWrite).toHaveBeenCalledTimes(1)
            expect(onWrite).toHaveBeenCalledWith()
            expect(onMessage).toBeCalledTimes(1)
            expect(decode(onMessage.mock.calls[0][0])).toEqual(data)
        })

        test('send valid data to an CLOSING socket', async () => {
            const onWrite = jest.fn()
            const onError = jest.fn()
            const onMessage = jest.fn()
            const data = { key: 'value' }
            serverSocket.on('message', onMessage)
            clientStream.on('error', onError)
            await whenOpen(clientSocket)
            clientSocket.close()
            expect(clientSocket.readyState).toBe(WebSocket.CLOSING)
            clientStream.write(data, onWrite)
            await whenClosed(clientSocket)
            expect(onWrite).toHaveBeenCalledTimes(1)
            expect(onWrite).toHaveBeenCalledWith(socketClosedMatcher)
            expect(onMessage).not.toBeCalled()
            expect(onError).toHaveBeenCalledTimes(1)
            expect(onError).toHaveBeenCalledWith(socketClosedMatcher)
        })

        test('send valid data to an CLOSED socket', async () => {
            const onWrite = jest.fn()
            const onError = jest.fn()
            const onMessage = jest.fn()
            const data = { key: 'value' }
            serverSocket.on('message', onMessage)
            clientStream.on('error', onError)
            await whenOpen(clientSocket)
            clientSocket.close()
            await whenClosed(clientSocket)
            expect(clientSocket.readyState).toBe(WebSocket.CLOSED)
            clientStream.write(data, onWrite)
            await delay()
            expect(onWrite).toHaveBeenCalledTimes(1)
            expect(onWrite).toHaveBeenCalledWith(streamDestroyedMatcher)
            expect(onMessage).not.toBeCalled()
            expect(onError).toHaveBeenCalledTimes(1)
            expect(onError).toHaveBeenCalledWith(streamDestroyedMatcher)
        })

        test('send some data', async () => {
            const m1 = { m: 1 }
            const m2 = { m: 2 }
            const m3 = { m: 3 }
            const onMessage = jest.fn()
            serverSocket.on('message', onMessage)
            clientStream.write(m1)
            clientStream.write(m2)
            clientStream.write(m3)
            clientStream.end()
            await whenClosed(clientSocket)
            expect(onMessage).toHaveBeenCalledTimes(3)
            expect(decode(onMessage.mock.calls[0][0])).toEqual(m1)
            expect(decode(onMessage.mock.calls[1][0])).toEqual(m2)
            expect(decode(onMessage.mock.calls[2][0])).toEqual(m3)
        })

        test('end stream with a CONNECTING socket with pending writes', async () => {
            const onWrite = jest.fn()
            expect(clientSocket.readyState).toBe(WebSocket.CONNECTING)
            clientStream.write('message 1', onWrite)
            clientStream.write('message 2', onWrite)
            clientStream.write('message 3', onWrite)
            clientStream.end()
            await whenClosed(clientSocket)
            // The first write failed, so nodejs cancelled the other 2 writes.
            expect(onWrite).toHaveBeenCalledTimes(3)
            expect(onWrite).toHaveBeenCalledWith()
        })

        test('destroy a stream with a CONNECTING socket with pending writes', async () => {
            const onWrite = jest.fn()
            const onError = jest.fn()
            clientStream.on('error', onError)
            expect(clientSocket.readyState).toBe(WebSocket.CONNECTING)
            clientStream.write('message 1', onWrite)
            clientStream.write('message 2', onWrite)
            clientStream.write('message 3', onWrite)
            clientStream.destroy()
            await whenClosed(clientSocket)
            // The first write failed, so nodejs cancelled the other 2 writes.
            expect(onWrite).toHaveBeenCalledTimes(1)
            expect(onWrite).toHaveBeenCalledWith(socketClosedMatcher)
            expect(onError).toHaveBeenCalledTimes(1)
            expect(onError).toHaveBeenCalledWith(socketClosedMatcher)
        })

        test('destroy a stream with an error with a CONNECTING socket with pending writes', async () => {
            const error = new Error('test error')
            const onWrite = jest.fn()
            const onError = jest.fn()
            clientStream.on('error', onError)
            expect(clientSocket.readyState).toBe(WebSocket.CONNECTING)
            clientStream.write('message 1', onWrite)
            clientStream.write('message 2', onWrite)
            clientStream.write('message 3', onWrite)
            clientStream.destroy(error)
            await whenClosed(clientSocket)
            // The first write failed, so nodejs cancelled the other 2 writes.
            expect(onWrite).toHaveBeenCalledTimes(1)
            expect(onWrite).toHaveBeenCalledWith(socketClosedMatcher)
            expect(onError).toHaveBeenCalledTimes(2)
            expect(onError).toHaveBeenCalledWith(socketClosedMatcher)
            expect(onError).toHaveBeenCalledWith(error)
        })

        test('close a CONNECTING socket with pending writes', async () => {
            const onWrite = jest.fn()
            const onError = jest.fn()
            clientStream.on('error', onError)
            expect(clientSocket.readyState).toBe(WebSocket.CONNECTING)
            clientStream.write('message 1', onWrite)
            clientStream.write('message 2', onWrite)
            clientStream.write('message 3', onWrite)
            clientSocket.close()
            await whenClosed(clientSocket)
            // The first write failed, so nodejs cancelled the other 2 writes.
            expect(onWrite).toHaveBeenCalledTimes(1)
            expect(onWrite).toHaveBeenCalledWith(socketClosedMatcher)
            expect(onError).toHaveBeenCalledTimes(1)
            expect(onError).toHaveBeenCalledWith(socketClosedMatcher)
        })

        test('close serverSocket', async () => {
            const onClientStreamClose = jest.fn()
            const onServerStreamClose = jest.fn()
            clientStream.on('close', onClientStreamClose)
            serverStream.on('close', onServerStreamClose)
            serverSocket.close()
            await whenClosed(clientSocket)
            await whenClosed(serverSocket)
            expect(onClientStreamClose).toHaveBeenCalledTimes(1)
            expect(onServerStreamClose).toHaveBeenCalledTimes(1)
        })

        test('close clientSocket', async () => {
            const onClientStreamClose = jest.fn()
            const onServerStreamClose = jest.fn()
            clientStream.on('close', onClientStreamClose)
            serverStream.on('close', onServerStreamClose)
            clientSocket.close()
            await whenClosed(clientSocket)
            await whenClosed(serverSocket)
            expect(onClientStreamClose).toHaveBeenCalledTimes(1)
            expect(onServerStreamClose).toHaveBeenCalledTimes(1)
        })

        test('end clientStream', async () => {
            const onClientStreamClose = jest.fn()
            const onServerStreamClose = jest.fn()
            clientStream.on('close', onClientStreamClose)
            serverStream.on('close', onServerStreamClose)
            clientStream.end()
            await whenClosed(clientSocket)
            await whenClosed(serverSocket)
            expect(onClientStreamClose).toHaveBeenCalledTimes(1)
            expect(onServerStreamClose).toHaveBeenCalledTimes(1)
        })

        test('end serverStream', async () => {
            const onClientStreamClose = jest.fn()
            const onServerStreamClose = jest.fn()
            clientStream.on('close', onClientStreamClose)
            serverStream.on('close', onServerStreamClose)
            serverStream.end()
            await whenClosed(clientSocket)
            await whenClosed(serverSocket)
            expect(onClientStreamClose).toHaveBeenCalledTimes(1)
            expect(onServerStreamClose).toHaveBeenCalledTimes(1)
        })

        test('destroy client stream without error', async () => {
            const onClientStreamClose = jest.fn()
            const onServerStreamClose = jest.fn()
            clientStream.on('close', onClientStreamClose)
            serverStream.on('close', onServerStreamClose)
            clientStream.destroy()
            await whenClosed(clientSocket)
            await whenClosed(serverSocket)
            expect(onClientStreamClose).toHaveBeenCalledTimes(1)
            expect(onServerStreamClose).toHaveBeenCalledTimes(1)
        })

        test('destroy server stream without error', async () => {
            const onClientStreamClose = jest.fn()
            const onServerStreamClose = jest.fn()
            clientStream.on('close', onClientStreamClose)
            serverStream.on('close', onServerStreamClose)
            serverStream.destroy()
            await whenClosed(clientSocket)
            await whenClosed(serverSocket)
            expect(onClientStreamClose).toHaveBeenCalledTimes(1)
            expect(onServerStreamClose).toHaveBeenCalledTimes(1)
        })

        test('destroy client stream with error', async () => {
            const error = new Error()
            const onError = jest.fn()
            const onClientStreamClose = jest.fn()
            const onServerStreamClose = jest.fn()
            clientStream.on('error', onError)
            clientStream.on('close', onClientStreamClose)
            serverStream.on('close', onServerStreamClose)
            clientStream.destroy(error)
            await whenClosed(clientSocket)
            await whenClosed(serverSocket)
            expect(onClientStreamClose).toHaveBeenCalledTimes(1)
            expect(onServerStreamClose).toHaveBeenCalledTimes(1)
            expect(onError).toHaveBeenCalledTimes(1)
            expect(onError).toHaveBeenCalledWith(error)
        })

        test('destroy server stream with error', async () => {
            const error = new Error()
            const onError = jest.fn()
            const onClientStreamClose = jest.fn()
            const onServerStreamClose = jest.fn()
            serverStream.on('error', onError)
            clientStream.on('close', onClientStreamClose)
            serverStream.on('close', onServerStreamClose)
            serverStream.destroy(error)
            await whenClosed(clientSocket)
            await whenClosed(serverSocket)
            expect(onClientStreamClose).toHaveBeenCalledTimes(1)
            expect(onServerStreamClose).toHaveBeenCalledTimes(1)
            expect(onError).toHaveBeenCalledTimes(1)
            expect(onError).toHaveBeenCalledWith(error)
        })

        test('destroy stream and close socket on client stream error', async () => {
            const error = new Error('test error')
            const onError = jest.fn()
            const onClientStreamClose = jest.fn()
            const onServerStreamClose = jest.fn()
            clientStream.on('error', onError)
            clientStream.on('close', onClientStreamClose)
            serverStream.on('close', onServerStreamClose)
            clientStream.emit('error', error)
            await whenClosed(clientSocket)
            await whenClosed(serverSocket)
            expect(onClientStreamClose).toHaveBeenCalledTimes(1)
            expect(onServerStreamClose).toHaveBeenCalledTimes(1)
            expect(onError).toHaveBeenCalledTimes(1)
            expect(onError).toHaveBeenCalledWith(error)
        })

        test('destroy stream and close socket on server stream error', async () => {
            const error = new Error('test error')
            const onError = jest.fn()
            const onClientStreamClose = jest.fn()
            const onServerStreamClose = jest.fn()
            serverStream.on('error', onError)
            clientStream.on('close', onClientStreamClose)
            serverStream.on('close', onServerStreamClose)
            serverStream.emit('error', error)
            await whenClosed(clientSocket)
            await whenClosed(serverSocket)
            expect(onClientStreamClose).toHaveBeenCalledTimes(1)
            expect(onServerStreamClose).toHaveBeenCalledTimes(1)
            expect(onError).toHaveBeenCalledTimes(1)
            expect(onError).toHaveBeenCalledWith(error)
        })

        test('end-to-end send and receive', async () => {
            const message1 = { key: 'message 1' }
            const message2 = { key: 'message 2' }
            const message3 = { key: 'message 3' }
            const message4 = { key: 'message 4' }

            let resolvePromise: undefined | (() => void)
            const promise = new Promise(resolve => (resolvePromise = resolve))

            let calls = 0
            const ready = () => {
                if (++calls === 4) {
                    resolvePromise!()
                }
            }
            const onClientData = jest.fn(ready)
            const onServerData = jest.fn(ready)

            clientStream.on('data', onClientData)
            serverStream.on('data', onServerData)

            clientStream.write(message1)
            serverStream.write(message2)
            clientStream.write(message3)
            serverStream.write(message4)

            await promise

            expect(onClientData).toBeCalledTimes(2)
            expect(onClientData).toBeCalledWith(message2)
            expect(onClientData).toBeCalledWith(message4)

            expect(onServerData).toBeCalledTimes(2)
            expect(onServerData).toBeCalledWith(message1)
            expect(onServerData).toBeCalledWith(message3)
        })
    },
)
