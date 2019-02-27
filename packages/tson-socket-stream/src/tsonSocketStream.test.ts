/**
 * @jest-environment jsdom
 */
/// <reference lib="dom" />
import { decode, encode } from '@syncot/tson'
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

const delay = (time = 0) => new Promise(resolve => setTimeout(resolve, time))

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
            const { address, family, port } = wsServer.address() as AddressInfo
            clientSocket = new webSocketConstructor(
                family === 'IPv6'
                    ? `ws://[${address}]:${port}`
                    : `ws://${address}:${port}`,
            )
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
            const {
                address,
                family,
                port,
            } = httpServer.address() as AddressInfo
            clientSocket = sockJsClientConnectionToTsonSocket(
                new SockJsClient(
                    family === 'IPv6'
                        ? `http://[${address}]:${port}`
                        : `http://${address}:${port}`,
                ),
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

describe.each([
    ['WebSocket', setUpWebSocket(WebSocket)],
    ['ws', setUpWebSocket(ws)],
    ['SockJS', setUpSockJs],
])('%s', (socketType, setUp) => {
    setUp()

    if (socketType === 'SockJS') {
        describe('adapters', () => {
            test('binaryType', () => {
                expect(clientSocket.binaryType).toBe('arraybuffer')
                expect(serverSocket.binaryType).toBe('arraybuffer')
                clientSocket.binaryType = 'arraybuffer'
                serverSocket.binaryType = 'arraybuffer'
                const errorMatcher = expect.objectContaining({
                    message: 'Argument "binaryType" must be "arraybuffer".',
                    name: 'AssertionError [ERR_ASSERTION]',
                })
                expect(
                    () => (clientSocket.binaryType = 'non-arraybuffer'),
                ).toThrow(errorMatcher)
                expect(
                    () => (serverSocket.binaryType = 'non-arraybuffer'),
                ).toThrow(errorMatcher)
            })
        })
    } else {
        test('client receives non-ArrayBuffer', async () => {
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
        serverSocket.send(new ArrayBuffer(0))
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
        serverSocket.close()
        await allClosed
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
        serverSocket.addEventListener('message', onMessage)
        expect(clientSocket.readyState).toBe(ReadyState.CONNECTING)
        clientStream.write(invalidData, onWrite)
        await allClosed
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
        serverSocket.addEventListener('message', onMessage)
        await allOpen
        expect(clientSocket.readyState).toBe(ReadyState.OPEN)
        clientStream.write(invalidData, onWrite)
        await allClosed
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
        serverSocket.addEventListener('message', onMessage)
        await allOpen
        clientSocket.close()
        expect(clientSocket.readyState).toBe(ReadyState.CLOSING)
        clientStream.write(invalidData, onWrite)
        await allClosed
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
        serverSocket.addEventListener('message', onMessage)
        await allOpen
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

    test('send valid data to a CONNECTING socket', async () => {
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

    test('send valid data to an OPEN socket', async () => {
        const onWrite = jest.fn()
        const onMessage = jest.fn()
        const data = { key: 'value' }
        serverSocket.addEventListener('message', onMessage)
        await allOpen
        expect(clientSocket.readyState).toBe(ReadyState.OPEN)
        clientStream.write(data, onWrite)
        clientStream.end()
        await allClosed
        expect(onWrite).toHaveBeenCalledTimes(1)
        expect(onWrite).toHaveBeenCalledWith()
        expect(onMessage).toBeCalledTimes(1)
        expect(decode(onMessage.mock.calls[0][0].data)).toEqual(data)
    })

    test('send valid data to an CLOSING socket', async () => {
        const onWrite = jest.fn()
        const onError = jest.fn()
        const onMessage = jest.fn()
        const data = { key: 'value' }
        serverSocket.addEventListener('message', onMessage)
        clientStream.on('error', onError)
        await allOpen
        clientSocket.close()
        expect(clientSocket.readyState).toBe(ReadyState.CLOSING)
        clientStream.write(data, onWrite)
        await allClosed
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
        serverSocket.addEventListener('message', onMessage)
        clientStream.on('error', onError)
        await allOpen
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

    test('end stream with a CONNECTING socket with pending writes', async () => {
        const onWrite = jest.fn()
        expect(clientSocket.readyState).toBe(ReadyState.CONNECTING)
        clientStream.write('message 1', onWrite)
        clientStream.write('message 2', onWrite)
        clientStream.write('message 3', onWrite)
        clientStream.end()
        await allClosed
        // The first write failed, so nodejs cancelled the other 2 writes.
        expect(onWrite).toHaveBeenCalledTimes(3)
        expect(onWrite).toHaveBeenCalledWith()
    })

    test('destroy a stream with a CONNECTING socket with pending writes', async () => {
        const onWrite = jest.fn()
        const onError = jest.fn()
        clientStream.on('error', onError)
        expect(clientSocket.readyState).toBe(ReadyState.CONNECTING)
        clientStream.write('message 1', onWrite)
        clientStream.write('message 2', onWrite)
        clientStream.write('message 3', onWrite)
        clientStream.destroy()
        await allClosed
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
        expect(clientSocket.readyState).toBe(ReadyState.CONNECTING)
        clientStream.write('message 1', onWrite)
        clientStream.write('message 2', onWrite)
        clientStream.write('message 3', onWrite)
        clientStream.destroy(error)
        await allClosed
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
        expect(clientSocket.readyState).toBe(ReadyState.CONNECTING)
        clientStream.write('message 1', onWrite)
        clientStream.write('message 2', onWrite)
        clientStream.write('message 3', onWrite)
        clientSocket.close()
        await allClosed
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
        await allClosed
        expect(onClientStreamClose).toHaveBeenCalledTimes(1)
        expect(onServerStreamClose).toHaveBeenCalledTimes(1)
    })

    test('close clientSocket', async () => {
        const onClientStreamClose = jest.fn()
        const onServerStreamClose = jest.fn()
        clientStream.on('close', onClientStreamClose)
        serverStream.on('close', onServerStreamClose)
        clientSocket.close()
        await allClosed
        expect(onClientStreamClose).toHaveBeenCalledTimes(1)
        expect(onServerStreamClose).toHaveBeenCalledTimes(1)
    })

    test('end clientStream', async () => {
        const onClientStreamClose = jest.fn()
        const onServerStreamClose = jest.fn()
        clientStream.on('close', onClientStreamClose)
        serverStream.on('close', onServerStreamClose)
        clientStream.end()
        await allClosed
        expect(onClientStreamClose).toHaveBeenCalledTimes(1)
        expect(onServerStreamClose).toHaveBeenCalledTimes(1)
    })

    test('end serverStream', async () => {
        const onClientStreamClose = jest.fn()
        const onServerStreamClose = jest.fn()
        clientStream.on('close', onClientStreamClose)
        serverStream.on('close', onServerStreamClose)
        serverStream.end()
        await allClosed
        expect(onClientStreamClose).toHaveBeenCalledTimes(1)
        expect(onServerStreamClose).toHaveBeenCalledTimes(1)
    })

    test('destroy client stream without error', async () => {
        const onClientStreamClose = jest.fn()
        const onServerStreamClose = jest.fn()
        clientStream.on('close', onClientStreamClose)
        serverStream.on('close', onServerStreamClose)
        clientStream.destroy()
        await allClosed
        expect(onClientStreamClose).toHaveBeenCalledTimes(1)
        expect(onServerStreamClose).toHaveBeenCalledTimes(1)
    })

    test('destroy server stream without error', async () => {
        const onClientStreamClose = jest.fn()
        const onServerStreamClose = jest.fn()
        clientStream.on('close', onClientStreamClose)
        serverStream.on('close', onServerStreamClose)
        serverStream.destroy()
        await allClosed
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
        await allClosed
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
        await allClosed
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
        await allClosed
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
        await allClosed
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
})
