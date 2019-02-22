/**
 * @jest-environment jsdom
 */
import { encode } from '@syncot/tson'
import ws from 'ws'
import { TsonWebSocketStream } from '.'

const whenClosed = (socket: WebSocket) =>
    new Promise(resolve =>
        socket.readyState === WebSocket.CLOSED
            ? resolve()
            : socket.addEventListener('close', resolve),
    )

let server: ws.Server
let clientSocket: WebSocket
let serverSocket: ws
let stream: TsonWebSocketStream

beforeEach(done => {
    server = new ws.Server({ port: 0 })
    server.once('listening', () => {
        const { address, family, port } = server.address() as ws.AddressInfo
        clientSocket = new WebSocket(
            family === 'IPv6'
                ? `ws://[${address}]:${port}`
                : `ws://${address}:${port}`,
        )
        stream = new TsonWebSocketStream(clientSocket)
    })
    server.once('connection', newServerSocket => {
        serverSocket = newServerSocket
        done()
    })
})

afterEach(done => {
    server.close(done)
})

test('invalid WebSocket', () => {
    expect(() => new TsonWebSocketStream({} as WebSocket)).toThrow(
        expect.objectContaining({
            message: 'Argument "webSocket" must be an instance of "WebSocket".',
            name: 'AssertionError [ERR_ASSERTION]',
        }),
    )
})

test('receive non-ArrayBuffer', async () => {
    const onData = jest.fn()
    const onError = jest.fn()
    const onStreamClose = jest.fn()
    const onWebSocketClose = jest.fn()
    stream.on('data', onData)
    stream.on('error', onError)
    stream.on('close', onStreamClose)
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
    stream.on('data', onData)
    stream.on('error', onError)
    stream.on('close', onStreamClose)
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
    stream.on('data', onData)
    stream.on('error', onError)
    stream.on('close', onStreamClose)
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
    stream.on('data', onData)
    serverSocket.send(encode(message1))
    serverSocket.send(encode(message2))
    serverSocket.close()
    await whenClosed(clientSocket)
    expect(onData).toHaveBeenCalledTimes(2)
    expect(onData).toHaveBeenNthCalledWith(1, message1)
    expect(onData).toHaveBeenNthCalledWith(2, message2)
})
