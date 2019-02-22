/**
 * @jest-environment jsdom
 */
import { decode, encode } from '@syncot/tson'
import ws from 'ws'
import { TsonWebSocketStream } from '.'

const delay = (time = 0) => new Promise(resolve => setTimeout(resolve, time))

const whenOpen = (socket: WebSocket) =>
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

const whenClosed = (socket: WebSocket) =>
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

test('send invalid data to a CONNECTING socket', async () => {
    const onWrite = jest.fn()
    const onError = jest.fn()
    const onMessage = jest.fn()
    const invalidData = new Error()
    invalidData.name = 5 as any // `error.name` must be a string.
    stream.on('error', onError)
    serverSocket.on('message', onMessage)
    expect(clientSocket.readyState).toBe(WebSocket.CONNECTING)
    stream.write(invalidData, onWrite)
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
    stream.on('error', onError)
    serverSocket.on('message', onMessage)
    await whenOpen(clientSocket)
    expect(clientSocket.readyState).toBe(WebSocket.OPEN)
    stream.write(invalidData, onWrite)
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
    stream.on('error', onError)
    serverSocket.on('message', onMessage)
    await whenOpen(clientSocket)
    clientSocket.close()
    expect(clientSocket.readyState).toBe(WebSocket.CLOSING)
    stream.write(invalidData, onWrite)
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
    stream.on('error', onError)
    serverSocket.on('message', onMessage)
    await whenOpen(clientSocket)
    clientSocket.close()
    await whenClosed(clientSocket)
    expect(clientSocket.readyState).toBe(WebSocket.CLOSED)
    stream.write(invalidData, onWrite)
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
    stream.write(data, onWrite)
    stream.end()
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
    stream.write(data, onWrite)
    stream.end()
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
    stream.on('error', onError)
    await whenOpen(clientSocket)
    clientSocket.close()
    expect(clientSocket.readyState).toBe(WebSocket.CLOSING)
    stream.write(data, onWrite)
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
    stream.on('error', onError)
    await whenOpen(clientSocket)
    clientSocket.close()
    await whenClosed(clientSocket)
    expect(clientSocket.readyState).toBe(WebSocket.CLOSED)
    stream.write(data, onWrite)
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
    stream.write(m1)
    stream.write(m2)
    stream.write(m3)
    stream.end()
    await whenClosed(clientSocket)
    expect(onMessage).toHaveBeenCalledTimes(3)
    expect(decode(onMessage.mock.calls[0][0])).toEqual(m1)
    expect(decode(onMessage.mock.calls[1][0])).toEqual(m2)
    expect(decode(onMessage.mock.calls[2][0])).toEqual(m3)
})

test('close a CONNECTING socket with pending writes', async () => {
    const onWrite = jest.fn()
    const onError = jest.fn()
    stream.on('error', onError)
    expect(clientSocket.readyState).toBe(WebSocket.CONNECTING)
    stream.write('message 1', onWrite)
    stream.write('message 2', onWrite)
    stream.write('message 3', onWrite)
    clientSocket.close()
    await whenClosed(clientSocket)
    // The first write failed, so nodejs cancelled the other 2 writes.
    expect(onWrite).toHaveBeenCalledTimes(1)
    expect(onWrite).toHaveBeenCalledWith(socketClosedMatcher)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(socketClosedMatcher)
})

test('close serverSocket', async () => {
    const onSocketClose = jest.fn()
    const onStreamClose = jest.fn()
    clientSocket.addEventListener('close', onSocketClose)
    stream.on('close', onStreamClose)
    serverSocket.close()
    await whenClosed(clientSocket)
    expect(onSocketClose).toHaveBeenCalledTimes(1)
    expect(onStreamClose).toHaveBeenCalledTimes(1)
})

test('close clientSocket', async () => {
    const onSocketClose = jest.fn()
    const onStreamClose = jest.fn()
    clientSocket.addEventListener('close', onSocketClose)
    stream.on('close', onStreamClose)
    clientSocket.close()
    await whenClosed(clientSocket)
    expect(onSocketClose).toHaveBeenCalledTimes(1)
    expect(onStreamClose).toHaveBeenCalledTimes(1)
})

test('end stream', async () => {
    const onSocketClose = jest.fn()
    const onStreamClose = jest.fn()
    clientSocket.addEventListener('close', onSocketClose)
    stream.on('close', onStreamClose)
    stream.end()
    await whenClosed(clientSocket)
    expect(onSocketClose).toHaveBeenCalledTimes(1)
    expect(onStreamClose).toHaveBeenCalledTimes(1)
})

test('destroy stream without error', async () => {
    const onSocketClose = jest.fn()
    const onStreamClose = jest.fn()
    clientSocket.addEventListener('close', onSocketClose)
    stream.on('close', onStreamClose)
    stream.destroy()
    await whenClosed(clientSocket)
    expect(onSocketClose).toHaveBeenCalledTimes(1)
    expect(onStreamClose).toHaveBeenCalledTimes(1)
})

test('destroy stream with error', async () => {
    const error = new Error()
    const onError = jest.fn()
    const onSocketClose = jest.fn()
    const onStreamClose = jest.fn()
    clientSocket.addEventListener('close', onSocketClose)
    stream.on('error', onError)
    stream.on('close', onStreamClose)
    stream.destroy(error)
    await whenClosed(clientSocket)
    expect(onSocketClose).toHaveBeenCalledTimes(1)
    expect(onStreamClose).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(error)
})

test('destroy stream and close socket on error', async () => {
    const error = new Error('test error')
    const onError = jest.fn()
    const onStreamClose = jest.fn()
    const onSocketClose = jest.fn()
    stream.on('error', onError)
    stream.on('close', onStreamClose)
    clientSocket.addEventListener('close', onSocketClose)
    stream.emit('error', error)
    await whenClosed(clientSocket)
    expect(onStreamClose).toHaveBeenCalledTimes(1)
    expect(onSocketClose).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(error)
})
