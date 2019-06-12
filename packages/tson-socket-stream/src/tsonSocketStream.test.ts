/**
 * @jest-environment jsdom
 */
/// <reference lib="dom" />
import { decode, encode } from '@syncot/tson'
import { delay } from '@syncot/util'
import * as http from 'http'
import { AddressInfo } from 'net'
import * as sockJs from 'sockjs'
import SockJsClient from 'sockjs-client'
import ws from 'ws'
import { TsonSocket, TsonSocketStream } from '.'
import {
    sockJsClientConnectionToTsonSocket,
    sockJsServerConnectionToTsonSocket,
} from './sockJsAdapters'
import { ReadyState } from './tsonSocketStream'

const error = new Error('test error')

const streamDestroyedMatcher = expect.objectContaining({
    message: 'Cannot call write after a stream was destroyed',
    name: 'Error',
})

const tsonErrorMatcher = expect.objectContaining({
    message: 'Error name is not a string.',
    name: 'SyncOtError TSON',
})

let httpServer: http.Server
let sockJsServer: sockJs.Server
let wsServer: ws.Server
let clientSocket: TsonSocket
let serverSocket: TsonSocket
let clientStream: TsonSocketStream
let serverStream: TsonSocketStream
let allOpen: Promise<void>
let allClosed: Promise<any>

const setUpPromises = () => {
    allOpen = new Promise(resolve =>
        clientSocket.addEventListener('open', resolve),
    )
    allClosed = Promise.all([
        new Promise(resolve => clientSocket.addEventListener('close', resolve)),
        new Promise(resolve => clientStream.on('close', resolve)),
        new Promise(resolve => serverSocket.addEventListener('close', resolve)),
        new Promise(resolve => serverStream.on('close', resolve)),
    ])
}

const setUpWebSocket = (webSocketConstructor: any) => () => {
    beforeEach(done => {
        wsServer = new ws.Server({ port: 0 })
        wsServer.once('listening', () => {
            const { port } = wsServer.address() as AddressInfo
            clientSocket = new webSocketConstructor(`ws://127.0.0.1:${port}`)
            ;(clientSocket as any).addEventListener('error', () => {
                // Ignore errors - the socket will be closed anyway.
            })
            clientStream = new TsonSocketStream(clientSocket)
        })
        wsServer.once('connection', newServerSocket => {
            serverSocket = newServerSocket
            serverStream = new TsonSocketStream(serverSocket)
            setUpPromises()
            done()
        })
    })

    afterEach(done => {
        wsServer.close(done)
    })
}

const setUpSockJs = () => {
    beforeEach(done => {
        httpServer = http.createServer()
        sockJsServer = sockJs.createServer({ log: () => undefined })
        sockJsServer.installHandlers(httpServer)
        httpServer.once('listening', () => {
            const { port } = httpServer.address() as AddressInfo
            clientSocket = sockJsClientConnectionToTsonSocket(
                new SockJsClient(`http://127.0.0.1:${port}`),
            )
            clientStream = new TsonSocketStream(clientSocket)
        })
        sockJsServer.once('connection', sockJsConnection => {
            serverSocket = sockJsServerConnectionToTsonSocket(sockJsConnection)
            serverStream = new TsonSocketStream(serverSocket)
            setUpPromises()
            done()
        })
        httpServer.listen()
    })

    afterEach(done => {
        clientSocket.close()
        serverSocket.close()
        httpServer.close(done)
    })
}

describe.each<[string, () => void]>([
    ['WebSocket', setUpWebSocket(WebSocket)],
    ['ws', setUpWebSocket(ws)],
    ['SockJS', setUpSockJs],
])('%s', (socketType, setUp) => {
    setUp()

    describe('readyState === CONNECTING', () => {
        // Only the client socket can be CONNECTING.
        // Once it is OPEN, both the client and server socket should work in the same way.

        test('send invalid data', async () => {
            const onWrite = jest.fn()
            const onError = jest.fn()
            const onMessage = jest.fn()
            const invalidData = new Error()
            invalidData.name = 5 as any // `error.name` must be a string.
            clientStream.on('error', onError)
            serverSocket.addEventListener('message', onMessage)
            expect(clientSocket.readyState).toBe(ReadyState.CONNECTING)
            clientStream.write(invalidData, onWrite)
            await allClosed
            expect(onError).toHaveBeenCalledTimes(1)
            expect(onError).toHaveBeenCalledWith(tsonErrorMatcher)
            expect(onWrite).toHaveBeenCalledTimes(0)
            expect(onMessage).not.toHaveBeenCalled()
        })

        test('send valid data', async () => {
            const onWrite = jest.fn()
            const onMessage = jest.fn()
            const data = { key: 'value' }
            serverSocket.addEventListener('message', onMessage)
            expect(clientSocket.readyState).toBe(ReadyState.CONNECTING)
            clientStream.write(data, onWrite)
            clientStream.end()
            await allClosed
            expect(onWrite).toHaveBeenCalledTimes(1)
            expect(onWrite).toHaveBeenCalledWith()
            expect(onMessage).toBeCalledTimes(1)
            expect(decode(onMessage.mock.calls[0][0].data)).toEqual(data)
        })

        test('end a stream with pending writes', async () => {
            const onWrite = jest.fn()
            expect(clientSocket.readyState).toBe(ReadyState.CONNECTING)
            clientStream.write('message 1', onWrite)
            clientStream.write('message 2', onWrite)
            clientStream.write('message 3', onWrite)
            clientStream.end()
            await allClosed
            expect(onWrite).toHaveBeenCalledTimes(3)
            expect(onWrite).toHaveBeenNthCalledWith(1)
            expect(onWrite).toHaveBeenNthCalledWith(2)
            expect(onWrite).toHaveBeenNthCalledWith(3)
        })

        test('destroy a stream with pending writes', async () => {
            const onWrite = jest.fn()
            const onError = jest.fn()
            clientStream.on('error', onError)
            expect(clientSocket.readyState).toBe(ReadyState.CONNECTING)
            clientStream.write('message 1', onWrite)
            clientStream.write('message 2', onWrite)
            clientStream.write('message 3', onWrite)
            clientStream.destroy()
            await allClosed
            expect(onWrite).toHaveBeenCalledTimes(0)
            expect(onError).toHaveBeenCalledTimes(0)
        })

        test('destroy a stream with an error with pending writes', async () => {
            const onWrite = jest.fn()
            const onError = jest.fn()
            clientStream.on('error', onError)
            expect(clientSocket.readyState).toBe(ReadyState.CONNECTING)
            clientStream.write('message 1', onWrite)
            clientStream.write('message 2', onWrite)
            clientStream.write('message 3', onWrite)
            clientStream.destroy(error)
            await allClosed
            expect(onWrite).toHaveBeenCalledTimes(0)
            expect(onError).toHaveBeenCalledTimes(1)
            expect(onError).toHaveBeenCalledWith(error)
        })

        test('close a socket with pending writes', async () => {
            const onWrite = jest.fn()
            const onError = jest.fn()
            clientStream.on('error', onError)
            expect(clientSocket.readyState).toBe(ReadyState.CONNECTING)
            clientStream.write('message 1', onWrite)
            clientStream.write('message 2', onWrite)
            clientStream.write('message 3', onWrite)
            clientSocket.close()
            await allClosed
            expect(onWrite).toHaveBeenCalledTimes(0)

            // The socket implementations are a bit inconsistent with regard to error reporting.
            if (socketType === 'SockJS') {
                expect(onError).toHaveBeenCalledTimes(0)
            } else {
                expect(onError).toHaveBeenCalledTimes(1)
                expect(onError).toHaveBeenCalledWith(
                    expect.objectContaining({
                        message: expect.stringContaining('Socket error.'),
                        name: 'SyncOtError Socket',
                    }),
                )
            }
        })
    })

    describe.each(['client', 'server'])('%s', side => {
        beforeEach(async () => {
            if (side === 'server') {
                // Once fully connected, the sockets and streams should behave in exactly the same
                // way on both the client and server side, so we run all tests twice - once normally
                // and the second time with the client and server sockets and streams with swapped roles.
                const stream = clientStream
                clientStream = serverStream
                serverStream = stream
                const socket = clientSocket
                clientSocket = serverSocket
                serverSocket = socket
            } else {
                // Check it just in case to ensure that we run the tests with swapped sockets and streams too.
                expect(side).toBe('client')
            }
            await allOpen
        })

        if (socketType === 'SockJS') {
            // Only SockJS uses adapters and `binaryType` is not covered by other tests.
            test("socket adapter's binaryType", () => {
                expect(clientSocket.binaryType).toBe('arraybuffer')
                clientSocket.binaryType = 'arraybuffer'
                expect(
                    () => (clientSocket.binaryType = 'non-arraybuffer'),
                ).toThrow(
                    expect.objectContaining({
                        message: 'Argument "binaryType" must be "arraybuffer".',
                        name: 'AssertionError',
                    }),
                )
                expect(clientSocket.binaryType).toBe('arraybuffer')
            })
        } else {
            // The SockJS adapters encode/decode messages in base64 and emit only messages with ArrayBuffer.
            test('receives non-ArrayBuffer', async () => {
                const onData = jest.fn()
                const onError = jest.fn()
                clientStream.on('data', onData)
                clientStream.on('error', onError)
                serverSocket.send('abc' as any)
                await allClosed
                expect(onData).not.toHaveBeenCalled()
                expect(onError).toHaveBeenCalledTimes(1)
                expect(onError).toHaveBeenCalledWith(
                    expect.objectContaining({
                        message: 'Received data must be an ArrayBuffer.',
                        name: 'TypeError',
                    }),
                )
            })
        }

        test('receive TSON-encoded `null` value', async () => {
            const onData = jest.fn()
            const onError = jest.fn()
            clientStream.on('data', onData)
            clientStream.on('error', onError)
            serverSocket.send(encode(null))
            await allClosed
            expect(onData).not.toHaveBeenCalled()
            expect(onError).toHaveBeenCalledTimes(1)
            expect(onError).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Received data must not decode to `null`.',
                    name: 'TypeError',
                }),
            )
        })

        test('receive invalid TSON data', async () => {
            const onData = jest.fn()
            const onError = jest.fn()
            clientStream.on('data', onData)
            clientStream.on('error', onError)
            serverSocket.send(Buffer.allocUnsafe(0))
            await allClosed
            expect(onData).not.toHaveBeenCalled()
            expect(onError).toHaveBeenCalledTimes(1)
            expect(onError).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Type code expected.',
                    name: 'SyncOtError TSON',
                }),
            )
        })

        test('receive some data', async () => {
            const message1 = { key: 'value', a: [1, 2, 3], t: true }
            const message2 = 0
            const onData = jest.fn()
            clientStream.on('data', onData)
            serverSocket.send(encode(message1))
            serverSocket.send(encode(message2))
            await delay()
            serverSocket.close()
            await allClosed
            expect(onData).toHaveBeenCalledTimes(2)
            expect(onData).toHaveBeenNthCalledWith(1, message1)
            expect(onData).toHaveBeenNthCalledWith(2, message2)
        })

        test('send invalid data to an OPEN socket', async () => {
            const onWrite = jest.fn()
            const onError = jest.fn()
            const onMessage = jest.fn()
            const invalidData = new Error()
            invalidData.name = 5 as any // `error.name` must be a string.
            clientStream.on('error', onError)
            serverSocket.addEventListener('message', onMessage)
            expect(clientSocket.readyState).toBe(ReadyState.OPEN)
            clientStream.write(invalidData, onWrite)
            await allClosed
            expect(onError).toHaveBeenCalledTimes(1)
            expect(onError).toHaveBeenCalledWith(tsonErrorMatcher)
            expect(onWrite).toHaveBeenCalledTimes(0)
            expect(onMessage).not.toHaveBeenCalled()
        })

        if (!(socketType === 'SockJS' && side === 'server')) {
            // Server-side SockJS connection is closed immediately, when `close` is called.
            test('send invalid data to a CLOSING socket', async () => {
                const onWrite = jest.fn()
                const onError = jest.fn()
                const onMessage = jest.fn()
                const invalidData = new Error()
                invalidData.name = 5 as any // `error.name` must be a string.
                clientStream.on('error', onError)
                serverSocket.addEventListener('message', onMessage)
                clientSocket.close()
                expect(clientSocket.readyState).toBe(ReadyState.CLOSING)
                clientStream.write(invalidData, onWrite)
                await allClosed
                expect(onError).toHaveBeenCalledTimes(0)
                expect(onWrite).toHaveBeenCalledTimes(0)
                expect(onMessage).not.toHaveBeenCalled()
            })
        }

        test('send invalid data to a CLOSED socket', async () => {
            const onWrite = jest.fn()
            const onError = jest.fn()
            const onMessage = jest.fn()
            const invalidData = new Error()
            invalidData.name = 5 as any // `error.name` must be a string.
            clientStream.on('error', onError)
            serverSocket.addEventListener('message', onMessage)
            clientSocket.close()
            await allClosed
            expect(clientSocket.readyState).toBe(ReadyState.CLOSED)
            clientStream.write(invalidData, onWrite)
            await delay()
            expect(onError).toHaveBeenCalledTimes(1)
            expect(onError).toHaveBeenCalledWith(streamDestroyedMatcher)
            expect(onWrite).toHaveBeenCalledTimes(1)
            expect(onWrite).toHaveBeenCalledWith(streamDestroyedMatcher)
            expect(onMessage).not.toHaveBeenCalled()
        })

        test('send valid data to an OPEN socket', async () => {
            const onWrite = jest.fn()
            const onMessage = jest.fn()
            const data = { key: 'value' }
            serverSocket.addEventListener('message', onMessage)
            expect(clientSocket.readyState).toBe(ReadyState.OPEN)
            clientStream.write(data, onWrite)
            clientStream.end()
            await allClosed
            expect(onWrite).toHaveBeenCalledTimes(1)
            expect(onWrite).toHaveBeenCalledWith()
            expect(onMessage).toBeCalledTimes(1)
            expect(decode(onMessage.mock.calls[0][0].data)).toEqual(data)
        })

        if (!(socketType === 'SockJS' && side === 'server')) {
            // Server-side SockJS connection is closed immediately, when `close` is called.
            test('send valid data to a CLOSING socket', async () => {
                const onWrite = jest.fn()
                const onError = jest.fn()
                const onMessage = jest.fn()
                const data = { key: 'value' }
                serverSocket.addEventListener('message', onMessage)
                clientStream.on('error', onError)
                clientSocket.close()
                expect(clientSocket.readyState).toBe(ReadyState.CLOSING)
                clientStream.write(data, onWrite)
                await allClosed
                expect(onWrite).toHaveBeenCalledTimes(0)
                expect(onMessage).not.toBeCalled()
                expect(onError).toHaveBeenCalledTimes(0)
            })
        }

        test('send valid data to an CLOSED socket', async () => {
            const onWrite = jest.fn()
            const onError = jest.fn()
            const onMessage = jest.fn()
            const data = { key: 'value' }
            serverSocket.addEventListener('message', onMessage)
            clientStream.on('error', onError)
            clientSocket.close()
            await allClosed
            expect(clientSocket.readyState).toBe(ReadyState.CLOSED)
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
            serverSocket.addEventListener('message', onMessage)
            clientStream.write(m1)
            clientStream.write(m2)
            clientStream.write(m3)
            clientStream.end()
            await allClosed
            expect(onMessage).toHaveBeenCalledTimes(3)
            expect(decode(onMessage.mock.calls[0][0].data)).toEqual(m1)
            expect(decode(onMessage.mock.calls[1][0].data)).toEqual(m2)
            expect(decode(onMessage.mock.calls[2][0].data)).toEqual(m3)
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

        test('close socket', async () => {
            clientSocket.close()
            await allClosed
        })

        test('end stream', async () => {
            clientStream.end()
            await allClosed
        })

        test('destroy stream without error', async () => {
            clientStream.destroy()
            await allClosed
        })

        test('destroy stream with error', async () => {
            const onError = jest.fn()
            clientStream.on('error', onError)
            clientStream.destroy(error)
            await allClosed
            expect(onError).toHaveBeenCalledTimes(1)
            expect(onError).toHaveBeenCalledWith(error)
        })

        test('socket error event', async () => {
            const errorEvent = new Event('error') as Event & { error: Error }
            errorEvent.error = error
            const onError = jest.fn()
            clientStream.on('error', onError)

            // Send a fake error event using whatever means are available.
            if (socketType === 'WebSocket' && side === 'client') {
                // Browser WebSocket.
                ;(clientSocket as any).dispatchEvent(errorEvent)
            } else if (socketType === 'SockJS' && side === 'client') {
                // Client SockJS socket.
                ;(clientSocket as any).sockJs.dispatchEvent(errorEvent)
            } else if (socketType === 'SockJS' && side === 'server') {
                // Server SockJS socket.
                ;(clientSocket as any).sockJs.emit('error', errorEvent)
            } else {
                // "ws" module WebSocket.
                ;(clientSocket as any).emit('error', error)
            }

            await delay()
            expect(clientSocket.readyState).toBe(ReadyState.OPEN)
            expect(onError).toHaveBeenCalledTimes(1)
            expect(onError).toHaveBeenCalledWith(
                expect.objectContaining({
                    cause: expect.objectContaining({
                        message: 'test error',
                        name: 'Error',
                    }),
                    message: 'Socket error. => Error: test error',
                    name: 'SyncOtError Socket',
                }),
            )
        })
    })
})
