/**
 * @jest-environment jsdom
 */
import http from 'http'
import { AddressInfo } from 'net'
import { Duplex } from 'readable-stream'
import sockjs from 'sockjs'
import { createSockJsStream } from '.'

const greeting = 'Hello'
let server: http.Server
let url: string

const whenConnected = (stream: Duplex) =>
    new Promise((resolve, reject) => {
        stream.once('data', (data) => {
            try {
                expect(data).toBe(greeting)
                stream.once('close', resolve)
            } catch (error) {
                reject(error)
            }
        })
    })

beforeAll((done) => {
    const sockJsServer = sockjs.createServer({ log: () => undefined })
    sockJsServer.on('connection', (socket) => {
        socket.write(JSON.stringify(greeting))
        socket.close()
    })

    server = http.createServer()
    sockJsServer.installHandlers(server)
    server.listen(() => {
        const { port } = server.address() as AddressInfo
        url = `http://127.0.0.1:${port}`
        done()
    })
})

afterAll((done) => {
    server.close(done)
})

test('invalid URL', () => {
    expect(() => createSockJsStream({ url: 5 as any })).toThrow(
        expect.objectContaining({
            message: 'Argument "url" must be a string.',
            name: 'SyncOTError Assert',
        }),
    )
})

test('invalid timeout (< 0)', () => {
    expect(() => createSockJsStream({ url, timeout: -1 })).toThrow(
        expect.objectContaining({
            message:
                'Argument "timeout" must be undefined or a safe integer >= 0.',
            name: 'SyncOTError Assert',
        }),
    )
})

test('invalid timeout (string)', () => {
    expect(() => createSockJsStream({ url, timeout: '5' as any })).toThrow(
        expect.objectContaining({
            message:
                'Argument "timeout" must be undefined or a safe integer >= 0.',
            name: 'SyncOTError Assert',
        }),
    )
})

test('connect without timeout', async () => {
    const stream = await createSockJsStream({ url })()
    await whenConnected(stream)
})

test('connect with timeout', async () => {
    const stream = await createSockJsStream({ url, timeout: 5000 })()
    await whenConnected(stream)
})

test('time out while connecting', async () => {
    const streamPromise = createSockJsStream({ url, timeout: 0 })()
    await expect(streamPromise).rejects.toEqual(
        expect.objectContaining({
            message: 'Timed out while establishing a SockJS connection.',
            name: 'SyncOTError Socket',
        }),
    )
})

test('fail to connect', async () => {
    await expect(
        createSockJsStream({
            // Allow only one transport to get an error faster.
            sockJsOptions: { transports: ['websocket'] },
            url: 'http://does-not-exist.localhost',
        })(),
    ).rejects.toEqual(
        expect.objectContaining({
            message: 'Failed to establish a SockJS connection.',
            name: 'SyncOTError Socket',
        }),
    )
})
