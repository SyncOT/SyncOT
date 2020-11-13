/**
 * @jest-environment jsdom
 */
import { encode } from '@syncot/tson'
import { Duplex } from 'readable-stream'
import ws from 'ws'
import { createWebSocketStream } from '.'

const greeting = 'Hello'
const encodedGreeting = encode(greeting)
let server: ws.Server
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
    server = new ws.Server({ port: 0 })
    server.on('connection', (socket) => {
        socket.send(encodedGreeting)
        socket.close()
    })
    server.once('listening', () => {
        const { port } = server.address() as ws.AddressInfo
        url = `ws://127.0.0.1:${port}`
        done()
    })
})

afterAll((done) => {
    server.close(done)
})

test('invalid URL', () => {
    expect(() => createWebSocketStream({ url: 5 as any })).toThrow(
        expect.objectContaining({
            message: 'Argument "url" must be a string.',
            name: 'SyncOTError Assert',
        }),
    )
})

test('invalid timeout (< 0)', () => {
    expect(() => createWebSocketStream({ url, timeout: -1 })).toThrow(
        expect.objectContaining({
            message:
                'Argument "timeout" must be undefined or a safe integer >= 0.',
            name: 'SyncOTError Assert',
        }),
    )
})

test('invalid timeout (string)', () => {
    expect(() => createWebSocketStream({ url, timeout: '5' as any })).toThrow(
        expect.objectContaining({
            message:
                'Argument "timeout" must be undefined or a safe integer >= 0.',
            name: 'SyncOTError Assert',
        }),
    )
})

test('connect without timeout', async () => {
    const stream = await createWebSocketStream({ url })()
    await whenConnected(stream)
})

test('connect with timeout', async () => {
    const stream = await createWebSocketStream({ url, timeout: 5000 })()
    await whenConnected(stream)
})

test('time out while connecting', async () => {
    const streamPromise = createWebSocketStream({ url, timeout: 0 })()
    await expect(streamPromise).rejects.toEqual(
        expect.objectContaining({
            message: 'Timed out while establishing a WebSocket connection.',
            name: 'SyncOTError TSONSocket',
        }),
    )
})

test('fail to connect', async () => {
    await expect(
        createWebSocketStream({ url: 'ws://does-not-exist' })(),
    ).rejects.toEqual(
        expect.objectContaining({
            message: 'Failed to establish a WebSocket connection.',
            name: 'SyncOTError TSONSocket',
        }),
    )
})
