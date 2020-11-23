import { Connection, createConnection } from '@syncot/connection'
import {
    invertedStreams,
    whenEvent,
    whenNextTick,
    whenError,
    noop,
} from '@syncot/util'
import { install as installClock, InstalledClock } from '@sinonjs/fake-timers'
import { Duplex } from 'readable-stream'
import { createPingService, PingService } from '.'
import { InternalPingService } from './service'

let clientStream: Duplex
let serverStream: Duplex
let clientConnection: Connection
let serverConnection: Connection
let clientPing: PingService
let serverPing: PingService

let clock: InstalledClock

const whenDestroy = whenEvent('destroy')
const whenPing = whenEvent('ping')
const whenPong = whenEvent('pong')

const invalidConnectionMatcher = expect.objectContaining({
    message: 'Argument "connection" must be a non-destroyed Connection.',
    name: 'SyncOTError Assert',
})
const invalidTimeoutMatcher = expect.objectContaining({
    message: 'Argument "timeout" must be a positive 32-bit integer.',
    name: 'SyncOTError Assert',
})
const pingFailedMatcher = expect.objectContaining({
    message:
        'Ping failed => RangeError: No service to handle the request for "ping.ping".',
    name: 'SyncOTError Ping',
})
const pingTimeoutMatcher = expect.objectContaining({
    message: 'Ping timed out',
    name: 'SyncOTError Ping',
})

beforeEach(() => {
    ;[clientStream, serverStream] = invertedStreams({
        allowHalfOpen: false,
        objectMode: true,
    })
    clientConnection = createConnection()
    serverConnection = createConnection()
    clientConnection.connect(clientStream)
    serverConnection.connect(serverStream)
})

afterEach(() => {
    clientConnection.destroy()
    serverConnection.destroy()
    // Ensure instances are not reused between tests.
    clientPing = undefined as any
    serverPing = undefined as any
})

test('invalid connection (missing)', () => {
    expect(() => createPingService({ connection: undefined as any })).toThrow(
        invalidConnectionMatcher,
    )
})
test('invalid connection (destroyed)', () => {
    serverConnection.destroy()
    expect(() => createPingService({ connection: serverConnection })).toThrow(
        invalidConnectionMatcher,
    )
})
test('destroy on connection destroy', async () => {
    serverPing = createPingService({ connection: serverConnection })
    serverConnection.destroy()
    await whenDestroy(serverPing)
})
test('destroy', async () => {
    serverPing = createPingService({ connection: serverConnection })
    serverPing.destroy()
    await whenDestroy(serverPing)
    serverPing.destroy()
})
test('invalid timeout - not an integer', () => {
    expect(() =>
        createPingService({ connection: serverConnection, timeout: 45.5 }),
    ).toThrow(invalidTimeoutMatcher)
})
describe('ping', () => {
    beforeEach(() => {
        clock = installClock()
    })

    afterEach(() => {
        clock.uninstall()
    })

    test('disconnected -> connected', async () => {
        clientConnection.disconnect()
        serverConnection.disconnect()
        clientPing = createPingService({ connection: clientConnection })
        serverPing = createPingService({ connection: serverConnection })
        expect(clock.countTimers()).toBe(0)
        ;[clientStream, serverStream] = invertedStreams({
            allowHalfOpen: false,
            objectMode: true,
        })
        clientConnection.connect(clientStream)
        serverConnection.connect(serverStream)
        await whenNextTick()
        expect(clock.countTimers()).toBe(2)
    })

    test('connected -> disconnected', async () => {
        clientPing = createPingService({ connection: clientConnection })
        serverPing = createPingService({ connection: serverConnection })
        expect(clock.countTimers()).toBe(2)

        clientConnection.disconnect()
        serverConnection.disconnect()
        await whenNextTick()
        expect(clock.countTimers()).toBe(0)
    })

    test('connected -> connection destroyed', async () => {
        clientPing = createPingService({ connection: clientConnection })
        serverPing = createPingService({ connection: serverConnection })
        expect(clock.countTimers()).toBe(2)

        clientConnection.destroy()
        serverConnection.destroy()
        await whenNextTick()
        expect(clock.countTimers()).toBe(0)
    })

    test('connected -> service destroyed', async () => {
        clientPing = createPingService({ connection: clientConnection })
        serverPing = createPingService({ connection: serverConnection })
        expect(clock.countTimers()).toBe(2)

        clientPing.destroy()
        serverPing.destroy()
        await whenNextTick()
        expect(clock.countTimers()).toBe(0)
    })

    test('successful ping', async () => {
        clientPing = createPingService({
            connection: clientConnection,
            timeout: 10,
        })
        serverPing = createPingService({
            connection: serverConnection,
            timeout: 10,
        })

        await Promise.all([
            whenPing(clientPing),
            whenPong(clientPing),
            whenPing(serverPing),
            whenPong(serverPing),
        ])
        expect(clock.now).toBe(0)

        clock.runToLastAsync()
        await Promise.all([
            whenPing(clientPing),
            whenPong(clientPing),
            whenPing(serverPing),
            whenPong(serverPing),
        ])
        expect(clock.now).toBe(5)

        clock.runToLastAsync()
        await Promise.all([
            whenPing(clientPing),
            whenPong(clientPing),
            whenPing(serverPing),
            whenPong(serverPing),
        ])
        expect(clock.now).toBe(10)

        clock.runToLastAsync()
        await Promise.all([
            whenPing(clientPing),
            whenPong(clientPing),
            whenPing(serverPing),
            whenPong(serverPing),
        ])
        expect(clock.now).toBe(15)
    })

    test('ping error', async () => {
        const onError = jest.fn()
        serverPing = createPingService({ connection: serverConnection })
        serverPing.once('error', onError)
        await whenError(serverPing)
        expect(onError).toHaveBeenCalledWith(pingFailedMatcher)
        expect(serverConnection.isConnected()).toBeFalse()
        expect(clock.countTimers()).toBe(0)

        // Recovery.
        clientPing = createPingService({ connection: clientConnection })
        ;[clientStream, serverStream] = invertedStreams({
            allowHalfOpen: false,
            objectMode: true,
        })
        clientConnection.connect(clientStream)
        serverConnection.connect(serverStream)

        await Promise.all([
            whenPing(clientPing),
            whenPong(clientPing),
            whenPing(serverPing),
            whenPong(serverPing),
        ])

        clock.runToLastAsync()
        await Promise.all([
            whenPing(clientPing),
            whenPong(clientPing),
            whenPing(serverPing),
            whenPong(serverPing),
        ])

        clock.runToLastAsync()
        await Promise.all([
            whenPing(clientPing),
            whenPong(clientPing),
            whenPing(serverPing),
            whenPong(serverPing),
        ])
    })

    test('ping timeout', async () => {
        clientPing = createPingService({ connection: clientConnection })
        serverPing = createPingService({ connection: serverConnection })

        const ping = jest.spyOn(
            clientPing as PingService & InternalPingService,
            'ping',
        )
        ping.mockReturnValueOnce(new Promise(noop))

        const onError = jest.fn()
        serverPing.once('error', onError)

        clock.runToLastAsync()

        await whenError(serverPing)
        expect(onError).toHaveBeenCalledWith(pingTimeoutMatcher)
        expect(serverConnection.isConnected()).toBeFalse()
        expect(clock.countTimers()).toBe(0)

        // Recovery.
        ;[clientStream, serverStream] = invertedStreams({
            allowHalfOpen: false,
            objectMode: true,
        })
        clientConnection.connect(clientStream)
        serverConnection.connect(serverStream)

        await Promise.all([
            whenPing(clientPing),
            whenPong(clientPing),
            whenPing(serverPing),
            whenPong(serverPing),
        ])

        clock.runToLastAsync()
        await Promise.all([
            whenPing(clientPing),
            whenPong(clientPing),
            whenPing(serverPing),
            whenPong(serverPing),
        ])

        clock.runToLastAsync()
        await Promise.all([
            whenPing(clientPing),
            whenPong(clientPing),
            whenPing(serverPing),
            whenPong(serverPing),
        ])
    })

    test('passive service', async () => {
        clientPing = createPingService({
            connection: clientConnection,
            timeout: 10,
        })
        serverPing = createPingService({
            connection: serverConnection,
            timeout: 10,
            passive: true,
        })
        const onPing = jest.fn()
        const onPong = jest.fn()
        serverPing.on('ping', onPing)
        serverPing.on('pong', onPong)
        expect(clock.countTimers()).toBe(1)

        await Promise.all([whenPing(clientPing), whenPong(clientPing)])
        expect(clock.now).toBe(0)

        clock.runToLastAsync()
        await Promise.all([whenPing(clientPing), whenPong(clientPing)])
        expect(clock.now).toBe(5)

        clock.runToLastAsync()
        await Promise.all([whenPing(clientPing), whenPong(clientPing)])
        expect(clock.now).toBe(10)

        clock.runToLastAsync()
        await Promise.all([whenPing(clientPing), whenPong(clientPing)])
        expect(clock.now).toBe(15)

        expect(onPing).not.toHaveBeenCalled()
        expect(onPong).not.toHaveBeenCalled()
    })
})
