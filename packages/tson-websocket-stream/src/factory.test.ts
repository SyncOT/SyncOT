/**
 * @jest-environment jsdom
 */
import { encode } from '@syncot/tson'
import { Clock, install as installClock, InstalledClock } from 'lolex'
import { Duplex } from 'readable-stream'
import ws from 'ws'
import { createWebSocketStream } from '.'

const greeting = 'Hello'
const encodedGreeting = encode(greeting)
let clock: InstalledClock<Clock>
let server: ws.Server
let url: string

const whenConnected = (stream: Duplex) =>
    new Promise((resolve, reject) => {
        stream.once('data', data => {
            try {
                expect(data).toBe(greeting)
                stream.once('close', resolve)
            } catch (error) {
                reject(error)
            }
        })
    })

beforeAll(done => {
    server = new ws.Server({ port: 0 })
    server.on('connection', socket => {
        socket.send(encodedGreeting)
        socket.close()
    })
    server.once('listening', () => {
        const { address, family, port } = server.address() as ws.AddressInfo
        url =
            family === 'IPv6'
                ? `ws://[${address}]:${port}`
                : `ws://${address}:${port}`
        done()
    })
})

afterAll(done => {
    server.close(done)
})

beforeEach(() => {
    clock = installClock()
})

afterEach(() => {
    clock.uninstall()
})

test('invalid URL', () => {
    expect(() => createWebSocketStream(5 as any)).toThrow(
        expect.objectContaining({
            message: 'Argument "webSocketUrl" must be a string.',
            name: 'AssertionError',
        }),
    )
})

test('invalid timeout (< 0)', () => {
    expect(() => createWebSocketStream(url, -1)).toThrow(
        expect.objectContaining({
            message:
                'Argument "timeout" must be undefined or a safe integer >= 0.',
            name: 'AssertionError',
        }),
    )
})

test('invalid timeout (string)', () => {
    expect(() => createWebSocketStream(url, '5' as any)).toThrow(
        expect.objectContaining({
            message:
                'Argument "timeout" must be undefined or a safe integer >= 0.',
            name: 'AssertionError',
        }),
    )
})

test('connect without timeout', async () => {
    const stream = await createWebSocketStream(url)()
    await whenConnected(stream)
})

test('connect with timeout===0', async () => {
    const stream = await createWebSocketStream(url, 0)()
    await whenConnected(stream)
})

test('connect with timeout===1000', async () => {
    const stream = await createWebSocketStream(url, 1000)()
    await whenConnected(stream)
})

test('time out while connecting (timeout===1000)', async () => {
    const streamPromise = createWebSocketStream(url, 1000)()
    clock.next()
    await expect(streamPromise).rejects.toEqual(
        expect.objectContaining({
            message: 'Timed out while establishing a WebSocket connection.',
            name: 'SyncOtError Socket',
        }),
    )
})

test('do not time out while connecting (timeout===undefined)', async () => {
    const streamPromise = createWebSocketStream(url)()
    clock.next()
    const stream = await streamPromise
    await whenConnected(stream)
})

test('fail to connect', async () => {
    await expect(
        createWebSocketStream('ws://does-not-exist.localhost')(),
    ).rejects.toEqual(
        expect.objectContaining({
            message: 'Failed to establish a WebSocket connection.',
            name: 'SyncOtError Socket',
        }),
    )
})
