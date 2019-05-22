import { noop } from '@syncot/util'
import { Clock, install as installClock, InstalledClock } from 'lolex'
import { Duplex } from 'readable-stream'
import {
    Connection,
    createConnection,
    createStreamManager,
    StreamManager,
} from '.'

let clock: InstalledClock<Clock>
let connection: Connection
let initialStream: Duplex
let createStream: jest.Mock<Promise<Duplex>>
let manager: StreamManager

const minDelay = 1
const maxDelay = 8
const delayFactor = 2
const read = () => undefined
const write = (
    _data: any,
    _encoding: string,
    callback: (error: Error | undefined) => void,
) => callback(undefined)
const testError = new Error('test error')
const newStream = () => new Duplex({ read, write })

const whenConnected = () =>
    new Promise(resolve => connection.once('connect', resolve))

const whenDisconnected = () =>
    new Promise(resolve => connection.once('disconnect', resolve))

const whenManagerError = (message: string = 'test error') =>
    new Promise<Error>(resolve => manager.once('error', resolve)).then(error =>
        expect(error.message).toBe(message),
    )

beforeEach(() => {
    clock = installClock()
    initialStream = newStream()
    connection = createConnection()
    connection.connect(initialStream)
    createStream = jest.fn()
    manager = createStreamManager({
        connection,
        createStream,
        delayFactor,
        maxDelay,
        minDelay,
    })
    expect(clock.countTimers()).toBe(0)
})

afterEach(() => {
    clock.uninstall()
    connection.destroy()
    manager.destroy()
})

test('invalid connection===undefined', () => {
    expect(() =>
        createStreamManager({
            connection: undefined as any,
            createStream,
        }),
    ).toThrow(
        expect.objectContaining({
            message:
                'Argument "connection" must be a non-destroyed connection.',
            name: 'AssertionError',
        }),
    )
})
test('invalid connection===destroyed-connection', () => {
    const newConnection = createConnection()
    newConnection.destroy()
    expect(() =>
        createStreamManager({
            connection: newConnection,
            createStream,
        }),
    ).toThrow(
        expect.objectContaining({
            message:
                'Argument "connection" must be a non-destroyed connection.',
            name: 'AssertionError',
        }),
    )
})
test('invalid createStream===undefined', () => {
    expect(() =>
        createStreamManager({
            connection,
            createStream: undefined as any,
        }),
    ).toThrow(
        expect.objectContaining({
            message: 'Argument "createStream" must be a function.',
            name: 'AssertionError',
        }),
    )
})
test('invalid minDelay==="5"', () => {
    expect(() =>
        createStreamManager({
            connection,
            createStream,
            minDelay: '5' as any,
        }),
    ).toThrow(
        expect.objectContaining({
            message: 'Argument "minDelay" must be a safe integer >= 1.',
            name: 'AssertionError',
        }),
    )
})
test('invalid minDelay===0', () => {
    expect(() =>
        createStreamManager({
            connection,
            createStream,
            minDelay: 0,
        }),
    ).toThrow(
        expect.objectContaining({
            message: 'Argument "minDelay" must be a safe integer >= 1.',
            name: 'AssertionError',
        }),
    )
})
test('invalid maxDelay==="5"', () => {
    expect(() =>
        createStreamManager({
            connection,
            createStream,
            maxDelay: '5' as any,
            minDelay: 1,
        }),
    ).toThrow(
        expect.objectContaining({
            message: 'Argument "maxDelay" must be a safe integer >= minDelay.',
            name: 'AssertionError',
        }),
    )
})
test('invalid maxDelay<minDelay', () => {
    expect(() =>
        createStreamManager({
            connection,
            createStream,
            maxDelay: 9,
            minDelay: 10,
        }),
    ).toThrow(
        expect.objectContaining({
            message: 'Argument "maxDelay" must be a safe integer >= minDelay.',
            name: 'AssertionError',
        }),
    )
})
test('invalid delayFactor==="5"', () => {
    expect(() =>
        createStreamManager({
            connection,
            createStream,
            delayFactor: '5' as any,
        }),
    ).toThrow(
        expect.objectContaining({
            message: 'Argument "delayFactor" must be a finite number >= 1.',
            name: 'AssertionError',
        }),
    )
})
test('invalid delayFactor===0', () => {
    expect(() =>
        createStreamManager({
            connection,
            createStream,
            delayFactor: 0,
        }),
    ).toThrow(
        expect.objectContaining({
            message: 'Argument "delayFactor" must be a finite number >= 1.',
            name: 'AssertionError',
        }),
    )
})

test('initially connected', async () => {
    expect(connection.isConnected()).toBe(true)
    expect(clock.countTimers()).toBe(0)
    expect(createStream).not.toHaveBeenCalled()
})

test('initially disconnected', async () => {
    expect(clock.countTimers()).toBe(0)
    const newConnection = createConnection()
    const newManager = createStreamManager({
        connection: newConnection,
        createStream,
        delayFactor,
        maxDelay,
        minDelay,
    })
    expect(newConnection.isConnected()).toBe(false)
    const stream = newStream()
    createStream.mockResolvedValueOnce(stream)
    clock.tick(0)
    await new Promise(resolve => newConnection.once('connect', resolve))
    expect(newConnection.isConnected()).toBe(true)
    expect(clock.countTimers()).toBe(0)
    newConnection.destroy()
    newManager.destroy()
})

test('disconnect, connect', async () => {
    connection.disconnect()
    await whenDisconnected()
    const stream = newStream()
    createStream.mockResolvedValueOnce(stream)
    clock.next()
    expect(clock.now).toBe(minDelay)
    await whenConnected()
    expect(connection.isConnected()).toBe(true)
    expect(clock.countTimers()).toBe(0)
})

test('destroy with a managed stream', async () => {
    connection.disconnect()
    await whenDisconnected()
    const stream = newStream()
    createStream.mockResolvedValueOnce(stream)
    clock.next()
    await whenConnected()

    manager.destroy()
    expect(stream.destroyed).toBe(true)
    await new Promise(resolve => manager.on('destroy', resolve))
    expect(connection.destroyed).toBe(false)
})

test('destroy without a managed stream', async () => {
    manager.destroy()
    expect(initialStream.destroyed).toBe(false)
    await new Promise(resolve => manager.on('destroy', resolve))
    expect(connection.destroyed).toBe(false)
})

test('destroy with scheduled connect', async () => {
    connection.disconnect()
    await whenDisconnected()
    expect(clock.countTimers()).toBe(1)
    manager.destroy()
    expect(clock.countTimers()).toBe(0)
    await new Promise(resolve => manager.on('destroy', resolve))
    expect(connection.destroyed).toBe(false)
})

test('destroy on connection destroy', async () => {
    connection.destroy()
    await new Promise(resolve => manager.once('destroy', resolve))
})

test('connect manually with scheduled connect', async () => {
    connection.disconnect()
    await whenDisconnected()
    expect(clock.countTimers()).toBe(1)
    connection.connect(newStream())
    await whenConnected()
    expect(clock.countTimers()).toBe(0)
})

test('reconnect retries', async () => {
    connection.disconnect()
    await whenDisconnected()

    let expectedNow = 0
    createStream.mockRejectedValue(testError)

    clock.next()
    expectedNow += 1
    expect(clock.now).toBe(expectedNow)
    await whenManagerError()

    clock.next()
    expectedNow += 2
    expect(clock.now).toBe(expectedNow)
    await whenManagerError()

    clock.next()
    expectedNow += 4
    expect(clock.now).toBe(expectedNow)
    await whenManagerError()

    clock.next()
    expectedNow += 8
    expect(clock.now).toBe(expectedNow)
    await whenManagerError()

    clock.next()
    expectedNow += 8
    expect(clock.now).toBe(expectedNow)
    await whenManagerError()

    const stream = newStream()
    createStream.mockResolvedValueOnce(stream)
    clock.next()
    expectedNow += 8
    expect(clock.now).toBe(expectedNow)
    await whenConnected()

    connection.disconnect()
    await whenDisconnected()
    clock.next()
    expectedNow += 1
    expect(clock.now).toBe(expectedNow)
    await whenManagerError()

    clock.next()
    expectedNow += 2
    expect(clock.now).toBe(expectedNow)
    await whenManagerError()
})

test('managed stream error', async () => {
    const stream = newStream()

    createStream.mockResolvedValueOnce(stream)
    connection.disconnect()
    await whenDisconnected()
    clock.next()
    await whenConnected()

    const onError = jest.fn()
    manager.on('error', onError)
    stream.on('error', noop)
    stream.emit('error', testError)
    await Promise.resolve()

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(testError)
})

test('non-managed stream error', async () => {
    const stream = initialStream

    const onError = jest.fn()
    manager.on('error', onError)
    stream.on('error', noop)
    stream.emit('error', testError)
    await Promise.resolve()

    expect(onError).toHaveBeenCalledTimes(0)
})

test('connected with scheduled connect', async () => {
    connection.disconnect()
    await whenDisconnected()

    connection.connect(newStream())
    clock.next()
    expect(clock.countTimers()).toBe(0)
    expect(createStream).toBeCalledTimes(0)
})

test('connected while creating a new stream', async () => {
    let resolvePromise: (stream: Duplex) => void
    const promise = new Promise<Duplex>(resolve => (resolvePromise = resolve))
    createStream.mockReturnValueOnce(promise)
    const directStream = newStream()
    const managerStream = newStream()

    connection.disconnect()
    await whenDisconnected()
    clock.next()
    connection.connect(directStream)
    const connectionId = connection.connectionId
    resolvePromise!(managerStream)
    await new Promise(resolve => managerStream.once('close', resolve))
    expect(connection.connectionId).toBe(connectionId)
    expect(directStream.destroyed).toBe(false)
})
