import { Connection, createConnection } from '@syncot/connection'
import { invertedStreams, noop, whenNextTick } from '@syncot/util'
import { install as installClock, InstalledClock } from '@sinonjs/fake-timers'
import { Duplex } from 'readable-stream'
import { createPing } from '.'

let clientStream: Duplex
let serverStream: Duplex
let clientConnection: Connection
let serverConnection: Connection

let clock: InstalledClock

beforeEach(() => {
    ;[clientStream, serverStream] = invertedStreams({
        allowHalfOpen: false,
        objectMode: true,
    })
    clientConnection = createConnection()
    serverConnection = createConnection()
    clientConnection.connect(clientStream)
    serverConnection.connect(serverStream)
    clock = installClock()
})

afterEach(() => {
    clientConnection.destroy()
    serverConnection.destroy()
    clock.uninstall()
})

test('invalid connection (null)', () => {
    expect(() => createPing({ connection: null as any })).toThrow(
        expect.objectContaining({
            message: 'Argument "connection" must be an object.',
            name: 'SyncOTError Assert',
        }),
    )
})

test('invalid connection (true)', () => {
    serverConnection.destroy()
    expect(() => createPing({ connection: true as any })).toThrow(
        expect.objectContaining({
            message: 'Argument "connection" must be an object.',
            name: 'SyncOTError Assert',
        }),
    )
})

test('invalid timeout (5.5)', () => {
    expect(() =>
        createPing({ connection: clientConnection, timeout: 5.5 }),
    ).toThrow(
        expect.objectContaining({
            message: 'Argument "timeout" must be a positive 32-bit integer.',
            name: 'SyncOTError Assert',
        }),
    )
})

test('invalid connection (-1)', () => {
    expect(() =>
        createPing({ connection: clientConnection, timeout: -1 }),
    ).toThrow(
        expect.objectContaining({
            message: 'Argument "timeout" must be a positive 32-bit integer.',
            name: 'SyncOTError Assert',
        }),
    )
})

test('schedule ping on init when connected', () => {
    createPing({ connection: clientConnection })
    expect(clock.countTimers()).toBe(1)
})

test('schedule ping on connect', async () => {
    clientConnection.disconnect()
    serverConnection.disconnect()

    createPing({ connection: clientConnection })
    expect(clock.countTimers()).toBe(0)
    ;[clientStream, serverStream] = invertedStreams({
        allowHalfOpen: false,
        objectMode: true,
    })
    clientConnection.connect(clientStream)
    serverConnection.connect(serverStream)
    await whenNextTick()
    expect(clock.countTimers()).toBe(1)
})

test('cancel scheduled ping on disconnect', async () => {
    createPing({ connection: clientConnection })
    expect(clock.countTimers()).toBe(1)
    clientConnection.disconnect()
    await whenNextTick()
    expect(clock.countTimers()).toBe(0)
})

test('cancel scheduled ping on connection destroy', async () => {
    createPing({ connection: clientConnection })
    expect(clock.countTimers()).toBe(1)
    clientConnection.destroy()
    await whenNextTick()
    expect(clock.countTimers()).toBe(0)
})

test('success', async () => {
    const onClientTimeout = jest.fn()
    const onServerTimeout = jest.fn()
    const pingClient = createPing({
        connection: clientConnection,
        timeout: 100,
    })
    // pingServer does not send ping messages here because it always receives ping
    // before its own timer fires.
    const pingServer = createPing({
        connection: serverConnection,
        timeout: 110,
    })
    pingClient.on('timeout', onClientTimeout)
    pingServer.on('timeout', onServerTimeout)

    await whenNextTick()
    expect(clock.countTimers()).toBe(2)
    clock.next()
    expect(clock.now).toBe(50)

    await whenNextTick()
    expect(clock.countTimers()).toBe(2)
    clock.next()
    expect(clock.now).toBe(100)

    await whenNextTick()
    expect(clock.countTimers()).toBe(2)
    clock.next()
    expect(clock.now).toBe(150)

    await whenNextTick()
    expect(clock.countTimers()).toBe(2)
    clock.next()
    expect(clock.now).toBe(200)

    expect(onClientTimeout).toHaveBeenCalledTimes(0)
    expect(onServerTimeout).toHaveBeenCalledTimes(0)
})

test('timeout (on delay)', () => {
    const onTimeout = jest.fn()
    const ping = createPing({ connection: clientConnection, timeout: 100 })
    ping.on('timeout', onTimeout)
    clock.setSystemTime(100)
    clock.next()
    expect(onTimeout).toHaveBeenCalledTimes(1)
})

test('timeout (peer not responding)', async () => {
    const onTimeout = jest.fn()
    const ping = createPing({ connection: clientConnection, timeout: 100 })
    ping.on('timeout', onTimeout)

    await whenNextTick()
    expect(clock.countTimers()).toBe(1)
    clock.next()
    expect(clock.now).toBe(50)
    expect(onTimeout).toHaveBeenCalledTimes(0)
    expect(clientConnection.isConnected()).toBe(true)

    await whenNextTick()
    expect(clock.countTimers()).toBe(1)
    clock.next()
    expect(clock.now).toBe(100)
    expect(onTimeout).toHaveBeenCalledTimes(1)
    expect(clientConnection.isConnected()).toBe(false)

    await whenNextTick()
    expect(clock.countTimers()).toBe(0)
})

test('timeout (peer stops responding)', async () => {
    const onClientTimeout = jest.fn()
    const onServerTimeout = jest.fn()
    const pingClient = createPing({
        connection: clientConnection,
        timeout: 100,
    })
    const pingServer = createPing({
        connection: serverConnection,
        timeout: 1000,
    })
    pingClient.on('timeout', onClientTimeout)
    pingServer.on('timeout', onServerTimeout)

    await whenNextTick()
    expect(clock.countTimers()).toBe(2)
    clock.next()
    expect(clock.now).toBe(50)

    await whenNextTick()
    expect(clock.countTimers()).toBe(2)
    clock.next()
    expect(clock.now).toBe(100)

    await whenNextTick()
    expect(clock.countTimers()).toBe(2)
    clock.next()
    expect(clock.now).toBe(150)

    await whenNextTick()
    expect(clock.countTimers()).toBe(2)
    clock.next()
    expect(clock.now).toBe(200)

    expect(onClientTimeout).toHaveBeenCalledTimes(0)
    expect(onServerTimeout).toHaveBeenCalledTimes(0)

    // Make pingServer stop responding.
    jest.spyOn(pingServer, 'ping').mockImplementation(() => new Promise(noop))

    // pingClient sends a ping request but does not get a reply.
    await whenNextTick()
    expect(clock.countTimers()).toBe(2)
    clock.next()
    expect(clock.now).toBe(250)
    expect(onClientTimeout).toHaveBeenCalledTimes(0)
    expect(onServerTimeout).toHaveBeenCalledTimes(0)
    expect(clientConnection.isConnected()).toBe(true)

    // pingClient closes the connection because it has not heard from pingServer.
    await whenNextTick()
    expect(clock.countTimers()).toBe(2)
    clock.next()
    expect(clock.now).toBe(300)
    expect(onClientTimeout).toHaveBeenCalledTimes(1)
    expect(onServerTimeout).toHaveBeenCalledTimes(0)
    expect(clientConnection.isConnected()).toBe(false)
    expect(serverConnection.isConnected()).toBe(true)
    await whenNextTick()
    expect(serverConnection.isConnected()).toBe(false)
})
