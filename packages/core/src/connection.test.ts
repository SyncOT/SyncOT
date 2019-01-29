import { Duplex } from 'stream'
import { Connection, createConnection } from '.'
import { ErrorCodes, SyncOtError } from './error'

const error = new Error('test error')
let connection: Connection
let stream: Duplex
const delay = () => new Promise(resolve => setTimeout(resolve, 0))
const createStream = () =>
    new Duplex({
        read(): void {
            return
        },
        write(_chunk, _encoding, callback) {
            callback()
        },
    })

beforeEach(() => {
    connection = createConnection()
    stream = createStream()
})

describe('connection', () => {
    test('initially disconnected', () => {
        expect(connection.isConnected()).toBe(false)
    })
    test('connect', () => {
        const connectedCallback = jest.fn()
        connection.on('connect', connectedCallback)
        connection.connect(stream)
        expect(connection.isConnected()).toBe(true)
        expect(connectedCallback).toHaveBeenCalledTimes(1)
    })
    test('connect twice', () => {
        const connectedCallback = jest.fn()
        connection.on('connect', connectedCallback)
        connection.connect(stream)
        try {
            connection.connect(stream)
            expect.fail('Should not get here')
        } catch (e) {
            expect(e).toBeInstanceOf(SyncOtError)
            expect(e.code).toBe(ErrorCodes.AlreadyConnected)
        }
        expect(connection.isConnected()).toBe(true)
        expect(connectedCallback).toHaveBeenCalledTimes(1)
    })
    test('connect with an invalid stream', () => {
        try {
            connection.connect({} as any)
            expect.fail('Should not get here')
        } catch (e) {
            expect(e).toBeInstanceOf(SyncOtError)
            expect(e.code).toBe(ErrorCodes.InvalidArgument)
        }
    })
    test('disconnect', async () => {
        const disconnectCallback = jest.fn()
        const closeCallback = jest.fn()
        connection.connect(stream)
        connection.on('disconnect', disconnectCallback)
        stream.on('close', closeCallback)
        connection.disconnect()
        expect(connection.isConnected()).toBe(false)
        expect(disconnectCallback).toHaveBeenCalledTimes(1)
        expect(disconnectCallback).toHaveBeenCalledWith(null)
        await delay()
        expect(closeCallback).toHaveBeenCalledTimes(1)
    })
    test('disconnect twice', () => {
        const disconnectCallback = jest.fn()
        connection.connect(stream)
        connection.on('disconnect', disconnectCallback)
        connection.disconnect()
        connection.disconnect()
        expect(connection.isConnected()).toBe(false)
        expect(disconnectCallback).toHaveBeenCalledTimes(1)
        expect(disconnectCallback).toHaveBeenCalledWith(null)
    })
    test('connect, disconnect, connect, disconnect', () => {
        const connectCallback = jest.fn()
        const disconnectCallback = jest.fn()
        connection.on('connect', connectCallback)
        connection.on('disconnect', disconnectCallback)
        connection.connect(stream)
        expect(connection.isConnected()).toBe(true)
        connection.disconnect()
        expect(connection.isConnected()).toBe(false)
        connection.connect(createStream())
        expect(connection.isConnected()).toBe(true)
        connection.disconnect()
        expect(connection.isConnected()).toBe(false)
        expect(connectCallback).toHaveBeenCalledTimes(2)
        expect(disconnectCallback).toHaveBeenCalledTimes(2)
        expect(disconnectCallback).toHaveBeenCalledWith(null)
    })
    test('disconnect with an error', async () => {
        const disconnectCallback = jest.fn()
        const closeCallback = jest.fn()
        connection.connect(stream)
        connection.on('disconnect', disconnectCallback)
        stream.on('close', closeCallback)
        connection.disconnect(error)
        expect(connection.isConnected()).toBe(false)
        expect(disconnectCallback).toHaveBeenCalledTimes(1)
        expect(disconnectCallback).toHaveBeenCalledWith(error)
        await delay()
        expect(closeCallback).toHaveBeenCalledTimes(1)
    })
    test('end stream', async () => {
        const disconnectCallback = jest.fn()
        connection.connect(stream)
        connection.on('disconnect', disconnectCallback)
        stream.push(null) // End the read stream.
        stream.end() // End the write stream.
        await delay()
        expect(connection.isConnected()).toBe(false)
        expect(disconnectCallback).toHaveBeenCalledTimes(1)
        expect(disconnectCallback).toHaveBeenCalledWith(null)
    })
    test('destroy stream', async () => {
        const disconnectCallback = jest.fn()
        connection.connect(stream)
        connection.on('disconnect', disconnectCallback)
        stream.destroy()
        await delay()
        expect(connection.isConnected()).toBe(false)
        expect(disconnectCallback).toHaveBeenCalledTimes(1)
        expect(disconnectCallback.mock.calls[0][0]).toBeObject() // Premature close error.
    })
    test('close stream and disconnect', async () => {
        const disconnectCallback = jest.fn()
        connection.connect(stream)
        connection.on('disconnect', disconnectCallback)
        stream.push(null) // End the read stream.
        stream.end() // End the write stream.
        connection.disconnect()
        expect(connection.isConnected()).toBe(false)
        await delay()
        expect(disconnectCallback).toHaveBeenCalledTimes(1) // Called only once.
        expect(disconnectCallback).toHaveBeenCalledWith(null)
    })
})
