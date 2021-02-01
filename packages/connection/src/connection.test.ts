import { delay, invertedStreams, noop, whenNextTick } from '@syncot/util'
import { EventEmitter } from 'events'
import { Duplex, Readable, Stream } from 'readable-stream'
import {
    Connection,
    createConnection,
    Message,
    MessageType,
    Proxy,
    Service,
} from '.'

function omit<T extends object>(value: T, property: keyof T) {
    const newValue = { ...value }
    delete newValue[property]
    return newValue
}

const name = 'service-or-proxy-name'
const error = new Error('test error')
const testErrorMatcher = expect.objectContaining({
    message: 'test error',
    name: 'Error',
})
const invalidErrorObject = 5
const invalidErrorMatcher = expect.objectContaining({
    message: 'Invalid "error" object.',
    name: 'TypeError',
    error: invalidErrorObject,
})
const alreadyDestroyedMatcher = expect.objectContaining({
    message: 'Already destroyed.',
    name: 'SyncOTError Assert',
})
const invalidStreamMatcher = expect.objectContaining({
    message: 'Service returned an invalid stream.',
    name: 'RangeError',
})
let connection: Connection
let stream1: Duplex
let stream2: Duplex
interface Instance extends Service {
    testMethod?: (..._args: any) => any
    anotherMethod?: (..._args: any) => any
}
let instance: Instance

const whenClose = (stream: Duplex) =>
    new Promise((resolve) => stream.once('close', resolve))

const whenEnd = (stream: Duplex) =>
    new Promise((resolve) => stream.once('end', resolve))

const whenData = (stream: Duplex, expectedData: any) =>
    new Promise((resolve, reject) =>
        stream.once('data', (data) => {
            try {
                expect(data).toEqual(expectedData)
                resolve()
            } catch (e) {
                reject(e)
            }
        }),
    )

const errorMatcher = (errorName: string, errorMessage: string) =>
    expect.objectContaining({ message: errorMessage, name: errorName })

beforeEach(() => {
    connection = createConnection()
    ;[stream1, stream2] = invertedStreams({
        allowHalfOpen: false,
        objectMode: true,
    })
    instance = new EventEmitter()
})

describe('connection', () => {
    test('initially disconnected', () => {
        expect(connection.isConnected()).toBe(false)
        expect(connection.connectionId).toBe(0)
    })
    test('connect', async () => {
        const connectedCallback = jest.fn()
        connection.on('connect', connectedCallback)
        connection.connect(stream1)
        expect(connection.connectionId).toBe(1)
        expect(connection.isConnected()).toBe(true)
        await whenNextTick()
        expect(connectedCallback).toHaveBeenCalledTimes(1)
    })
    test('destroy, connect', () => {
        connection.destroy()
        expect(() => connection.connect(stream1)).toThrow(
            alreadyDestroyedMatcher,
        )
    })
    test('connect, destroy', async () => {
        const connectedCallback = jest.fn()
        const disconnectedCallback = jest.fn()
        const destroyedCallback = jest.fn()
        connection.on('connect', connectedCallback)
        connection.on('disconnect', disconnectedCallback)
        connection.on('destroy', destroyedCallback)
        connection.connect(stream1)
        connection.destroy()
        expect(connection.isConnected()).toBe(false)
        await whenNextTick()
        expect(connectedCallback).not.toHaveBeenCalled()
        expect(disconnectedCallback).not.toHaveBeenCalled()
        expect(destroyedCallback).toHaveBeenCalledTimes(1)
    })
    test('destroy twice', async () => {
        const onDestroy = jest.fn()
        connection.on('destroy', onDestroy)
        connection.destroy()
        connection.destroy()
        await whenNextTick()
        expect(onDestroy).toBeCalledTimes(1)
    })
    test('connect twice', async () => {
        const connectedCallback = jest.fn()
        connection.on('connect', connectedCallback)
        connection.connect(stream1)
        expect(() => connection.connect(stream1)).toThrow(
            errorMatcher(
                'SyncOTError Assert',
                'Connection is already associated with a stream.',
            ),
        )
        expect(connection.isConnected()).toBe(true)
        await whenNextTick()
        expect(connectedCallback).toHaveBeenCalledTimes(1)
    })
    test('connect with an invalid stream', () => {
        expect(() => connection.connect({} as any)).toThrow(
            errorMatcher(
                'SyncOTError Assert',
                'Argument "stream" must be an open Duplex.',
            ),
        )
    })
    test('connect with a destroyed stream', () => {
        stream1.destroy()
        expect(() => connection.connect(stream1)).toThrow(
            errorMatcher(
                'SyncOTError Assert',
                'Argument "stream" must be an open Duplex.',
            ),
        )
    })
    test('connect with a non-writable stream', () => {
        stream1.end()
        expect(() => connection.connect(stream1)).toThrow(
            errorMatcher(
                'SyncOTError Assert',
                'Argument "stream" must be an open Duplex.',
            ),
        )
    })
    test('connect with a non-readable stream', async () => {
        stream1.resume()
        stream2.end()
        await delay()
        expect(() => connection.connect(stream1)).toThrow(
            errorMatcher(
                'SyncOTError Assert',
                'Argument "stream" must be an open Duplex.',
            ),
        )
    })
    test('disconnect', async () => {
        const connectCallback = jest.fn()
        const disconnectCallback = jest.fn()
        const errorCallback = jest.fn()
        const closeCallback = jest.fn()
        connection.connect(stream1)
        expect(connection.connectionId).toBe(1)
        connection.on('connect', connectCallback)
        connection.on('disconnect', disconnectCallback)
        connection.on('error', errorCallback)
        stream1.on('close', closeCallback)
        connection.disconnect()
        expect(connection.connectionId).toBe(0)
        expect(connection.isConnected()).toBe(false)
        await whenNextTick()
        expect(connectCallback).toHaveBeenCalledTimes(1)
        expect(disconnectCallback).toHaveBeenCalledTimes(1)
        expect(connectCallback).toHaveBeenCalledBefore(disconnectCallback)
        await delay()
        expect(closeCallback).toHaveBeenCalledTimes(1)
        expect(errorCallback).not.toHaveBeenCalled()
    })
    test('disconnect twice', async () => {
        const disconnectCallback = jest.fn()
        const errorCallback = jest.fn()
        connection.connect(stream1)
        connection.on('disconnect', disconnectCallback)
        connection.on('error', errorCallback)
        connection.disconnect()
        connection.disconnect()
        expect(connection.isConnected()).toBe(false)
        await whenNextTick()
        expect(disconnectCallback).toHaveBeenCalledTimes(1)
        expect(errorCallback).not.toHaveBeenCalled()
    })
    test('connect, disconnect, connect, disconnect', async () => {
        const connectCallback = jest.fn()
        const errorCallback = jest.fn()
        const disconnectCallback = jest.fn()
        connection.on('connect', connectCallback)
        connection.on('disconnect', disconnectCallback)
        connection.on('error', errorCallback)
        expect(connection.connectionId).toBe(0)

        connection.connect(stream1)
        expect(connection.connectionId).toBe(1)
        expect(connection.isConnected()).toBe(true)
        connection.disconnect()
        expect(connection.connectionId).toBe(0)
        expect(connection.isConnected()).toBe(false)
        ;[stream1, stream2] = invertedStreams({
            allowHalfOpen: false,
            objectMode: true,
        })
        connection.connect(stream2)
        expect(connection.connectionId).toBe(2)
        expect(connection.isConnected()).toBe(true)
        connection.disconnect()
        expect(connection.connectionId).toBe(0)
        expect(connection.isConnected()).toBe(false)

        await whenNextTick()
        expect(connectCallback).toHaveBeenCalledTimes(2)
        expect(disconnectCallback).toHaveBeenCalledTimes(2)
        expect(errorCallback).not.toHaveBeenCalled()
    })
    test('end stream1', async () => {
        const disconnectCallback = jest.fn()
        const errorCallback = jest.fn()
        connection.connect(stream1)
        connection.on('disconnect', disconnectCallback)
        connection.on('error', errorCallback)
        stream2.resume()
        stream1.end()
        await delay()
        expect(connection.isConnected()).toBe(false)
        expect(disconnectCallback).toHaveBeenCalledTimes(1)
        expect(errorCallback).not.toHaveBeenCalled()
    })
    test('end stream2', async () => {
        const disconnectCallback = jest.fn()
        const errorCallback = jest.fn()
        connection.connect(stream1)
        connection.on('disconnect', disconnectCallback)
        connection.on('error', errorCallback)
        stream2.resume()
        stream2.end()
        await delay()
        expect(connection.isConnected()).toBe(false)
        expect(disconnectCallback).toHaveBeenCalledTimes(1)
        expect(errorCallback).not.toHaveBeenCalled()
    })
    test('destroy stream', async () => {
        const disconnectCallback = jest.fn()
        connection.connect(stream1)
        connection.on('disconnect', disconnectCallback)
        stream1.destroy()
        await delay()
        expect(connection.isConnected()).toBe(false)
        expect(disconnectCallback).toHaveBeenCalledTimes(1)
    })
    test('close stream and disconnect', async () => {
        const disconnectCallback = jest.fn()
        const errorCallback = jest.fn()
        connection.connect(stream1)
        connection.on('disconnect', disconnectCallback)
        connection.on('error', errorCallback)
        stream1.end()
        stream2.end()
        connection.disconnect()
        expect(connection.isConnected()).toBe(false)
        await delay()
        expect(disconnectCallback).toHaveBeenCalledTimes(1) // Called only once.
        expect(errorCallback).not.toHaveBeenCalled()
    })
    test('destroy stream and disconnect', async () => {
        const errorCallback = jest.fn()
        const disconnectCallback = jest.fn()
        connection.connect(stream1)
        connection.on('disconnect', disconnectCallback)
        connection.on('error', errorCallback)
        stream1.destroy()
        connection.disconnect()
        await delay()
        expect(connection.isConnected()).toBe(false)
        expect(disconnectCallback).toHaveBeenCalledTimes(1) // Called only once.
        expect(errorCallback).not.toHaveBeenCalled()
    })
})

describe('service registration', () => {
    test('register with an invalid instance', () => {
        expect(() =>
            connection.registerService({ name, instance: 5 as any }),
        ).toThrow(
            errorMatcher(
                'SyncOTError Assert',
                'Argument "instance" must be an object.',
            ),
        )
        expect(() =>
            connection.registerService({ name, instance: null as any }),
        ).toThrow(
            errorMatcher(
                'SyncOTError Assert',
                'Argument "instance" must be an object.',
            ),
        )
    })
    test('register with a missing method', () => {
        instance.testMethod = () => null
        expect(() =>
            connection.registerService({
                instance,
                name,
                requestNames: new Set(['testMethod', 'anotherMethod']),
            }),
        ).toThrow(
            errorMatcher(
                'SyncOTError Assert',
                'Service.anotherMethod must be a function.',
            ),
        )
    })
    test('register', () => {
        instance.anotherMethod = () => null
        instance.testMethod = () => null
        connection.registerService({
            eventNames: new Set(['event-1', 'event-2']),
            instance,
            name,
            requestNames: new Set(['testMethod', 'anotherMethod']),
        })
    })
    test('register twice', () => {
        connection.registerService({
            instance,
            name,
        })
        expect(() =>
            connection.registerService({
                instance: new EventEmitter(),
                name,
            }),
        ).toThrow(
            errorMatcher(
                'SyncOTError Assert',
                'Service "service-or-proxy-name" has been already registered.',
            ),
        )
    })
    test('get registered services', () => {
        const requestNames = new Set(['testMethod', 'anotherMethod'])
        const anotherName = 'another-service'
        const anotherInstance = Object.assign(new EventEmitter(), {
            test: () => undefined,
        })
        instance.anotherMethod = () => null
        instance.testMethod = () => null
        connection.registerService({
            instance,
            name,
            requestNames,
        })
        connection.registerService({
            instance: anotherInstance,
            name: anotherName,
        })
        expect(connection.getServiceNames()).toEqual([name, anotherName])
        expect(connection.getService(name)).toBe(instance)
        expect(connection.getService(anotherName)).toBe(anotherInstance)
        expect(connection.getService('missing')).toBe(undefined)
    })
    test('after destroy', () => {
        connection.destroy()
        expect(() =>
            connection.registerService({
                instance,
                name,
            }),
        ).toThrow(alreadyDestroyedMatcher)
    })
})

describe('proxy registration', () => {
    test('register with a method conflict', () => {
        expect(() =>
            connection.registerProxy({
                name,
                requestNames: new Set(['testMethod', 'toString']),
            }),
        ).toThrow(
            errorMatcher(
                'SyncOTError Assert',
                'Proxy.toString already exists.',
            ),
        )
    })
    test('register', () => {
        const proxy = connection.registerProxy({
            eventNames: new Set(['event-1', 'event-2']),
            name,
            requestNames: new Set(['testMethod', 'anotherMethod']),
        })
        expect(proxy).toBe(connection.getProxy(name))
    })
    test('register twice', () => {
        connection.registerProxy({ name })
        expect(() => connection.registerProxy({ name })).toThrow(
            errorMatcher(
                'SyncOTError Assert',
                'Proxy "service-or-proxy-name" has been already registered.',
            ),
        )
    })
    test('get registered proxies', () => {
        instance.testMethod = expect.any(Function)
        instance.anotherMethod = expect.any(Function)
        const requestNames = new Set(['testMethod', 'anotherMethod'])
        const anotherName = 'another-service'
        const anotherInstance = new EventEmitter()
        const proxy1 = connection.registerProxy({ requestNames, name })
        const proxy2 = connection.registerProxy({ name: anotherName })
        expect(connection.getProxyNames()).toEqual([name, anotherName])
        expect(connection.getProxy(name)).toEqual(instance)
        expect(connection.getProxy(name)).toBe(proxy1)
        expect(connection.getProxy(anotherName)).toEqual(anotherInstance)
        expect(connection.getProxy(anotherName)).toBe(proxy2)
        expect(connection.getProxy('missing')).toBe(undefined)
    })
    test('after destroy', () => {
        connection.destroy()
        expect(() =>
            connection.registerProxy({
                name,
            }),
        ).toThrow(alreadyDestroyedMatcher)
    })
})

describe('message validation', () => {
    const message = {
        data: [],
        id: 0,
        name: 'name-1',
        service: 'service-1',
        type: MessageType.EVENT,
    }
    beforeEach(() => {
        connection.connect(stream1)
    })
    test.each<[string, any, string | null]>([
        ['invalid message', true, null],
        [
            'invalid data (missing)',
            omit(
                { ...message, name: null, type: MessageType.REPLY_VALUE },
                'data',
            ),
            'data',
        ],
        [
            'invalid data ({}; message type: EVENT)',
            { ...message, data: {}, type: MessageType.EVENT },
            'data',
        ],
        [
            'invalid data ({}; message type: REQUEST)',
            { ...message, data: {}, type: MessageType.REQUEST },
            'data',
        ],
        [
            'invalid data ({}; message type: REPLY_ERROR)',
            { ...message, data: {}, name: null, type: MessageType.REPLY_ERROR },
            'data',
        ],
        [
            'invalid data ({}; message type: REPLY_STREAM)',
            {
                ...message,
                data: {},
                name: null,
                type: MessageType.REPLY_STREAM,
            },
            'data',
        ],
        [
            'invalid data ({}; message type: STREAM_INPUT_END)',
            {
                ...message,
                data: {},
                name: null,
                type: MessageType.STREAM_INPUT_END,
            },
            'data',
        ],
        [
            'invalid data ({}; message type: STREAM_OUTPUT_END)',
            {
                ...message,
                data: {},
                name: null,
                type: MessageType.STREAM_OUTPUT_END,
            },
            'data',
        ],
        [
            'invalid data ({}; message type: STREAM_INPUT_DESTROY)',
            {
                ...message,
                data: {},
                name: null,
                type: MessageType.STREAM_INPUT_DESTROY,
            },
            'data',
        ],
        [
            'invalid data ({}; message type: STREAM_OUTPUT_DESTROY)',
            {
                ...message,
                data: {},
                name: null,
                type: MessageType.STREAM_OUTPUT_DESTROY,
            },
            'data',
        ],
        [
            'invalid data (null; message type: STREAM_OUTPUT_DATA)',
            {
                ...message,
                data: null,
                name: null,
                type: MessageType.STREAM_OUTPUT_DATA,
            },
            'data',
        ],
        [
            'invalid data (undefined; message type: STREAM_OUTPUT_DATA)',
            {
                ...message,
                data: undefined,
                name: null,
                type: MessageType.STREAM_OUTPUT_DATA,
            },
            'data',
        ],
        [
            'invalid data (null; message type: STREAM_INPUT_DATA)',
            {
                ...message,
                data: null,
                name: null,
                type: MessageType.STREAM_INPUT_DATA,
            },
            'data',
        ],
        [
            'invalid data (undefined; message type: STREAM_INPUT_DATA)',
            {
                ...message,
                data: undefined,
                name: null,
                type: MessageType.STREAM_INPUT_DATA,
            },
            'data',
        ],
        ['invalid id', { ...message, id: 0.5 }, 'id'],
        [
            'invalid name (type=EVENT)',
            { ...message, type: MessageType.EVENT, name: undefined },
            'name',
        ],
        [
            'invalid name (type=REQUEST)',
            { ...message, type: MessageType.REQUEST, name: undefined },
            'name',
        ],
        [
            'invalid name (type=REPLY_VALUE)',
            { ...message, type: MessageType.REPLY_VALUE },
            'name',
        ],
        [
            'invalid name (type=REPLY_ERROR)',
            { ...message, type: MessageType.REPLY_ERROR },
            'name',
        ],
        [
            'invalid name (type=REPLY_STREAM)',
            { ...message, data: undefined, type: MessageType.REPLY_STREAM },
            'name',
        ],
        [
            'invalid name (type=STREAM_INPUT_DATA)',
            { ...message, type: MessageType.STREAM_INPUT_DATA },
            'name',
        ],
        [
            'invalid name (type=STREAM_INPUT_END)',
            {
                ...message,
                data: { destroy: false, error: null },
                type: MessageType.STREAM_INPUT_END,
            },
            'name',
        ],
        [
            'invalid name (type=STREAM_OUTPUT_DATA)',
            { ...message, type: MessageType.STREAM_OUTPUT_DATA },
            'name',
        ],
        [
            'invalid name (type=STREAM_OUTPUT_END)',
            {
                ...message,
                data: { destroy: false, error: null },
                type: MessageType.STREAM_OUTPUT_END,
            },
            'name',
        ],
        ['invalid service', { ...message, service: undefined }, 'service'],
        [
            'invalid type (too small)',
            { ...message, type: MessageType.EVENT - 1 },
            'type',
        ],
        [
            'invalid type (too big)',
            { ...message, type: MessageType.STREAM_OUTPUT_DESTROY + 1 },
            'type',
        ],
    ])('%s', async (_, invalidMessage, property) => {
        const onDisconnect = jest.fn()
        const onError = jest.fn()
        connection.on('disconnect', onDisconnect)
        connection.on('error', onError)
        stream2.write(invalidMessage)
        await delay()
        expect(connection.isConnected()).toBe(true)
        expect(onDisconnect).toHaveBeenCalledTimes(0)
        expect(onError).toHaveBeenCalledTimes(1)
        expect(onError).toHaveBeenCalledWith(
            expect.objectContaining({
                entity: invalidMessage,
                entityName: 'Message',
                key: property,
                message:
                    property == null
                        ? 'Invalid "Message".'
                        : `Invalid "Message.${property}".`,
                name: 'SyncOTError InvalidEntity',
            }),
        )
    })
    test.each<[string, { [P in keyof Message]: any }]>([
        ['valid message', { ...message }],
        ['valid message (type=EVENT)', { ...message, type: MessageType.EVENT }],
        ['valid type (REQUEST)', { ...message, type: MessageType.REQUEST }],
        [
            'valid type (REPLY_VALUE)',
            { ...message, name: null, type: MessageType.REPLY_VALUE },
        ],
        [
            'valid type (REPLY_ERROR)',
            {
                ...message,
                data: error,
                name: null,
                type: MessageType.REPLY_ERROR,
            },
        ],
        [
            'valid type (REPLY_STREAM)',
            {
                ...message,
                data: null,
                name: null,
                type: MessageType.REPLY_STREAM,
            },
        ],
        [
            'valid type (STREAM_INPUT_DATA)',
            {
                ...message,
                name: null,
                type: MessageType.STREAM_INPUT_DATA,
            },
        ],
        [
            'valid type (STREAM_INPUT_END)',
            {
                ...message,
                data: null,
                name: null,
                type: MessageType.STREAM_INPUT_END,
            },
        ],
        [
            'valid type (STREAM_INPUT_DESTROY)',
            {
                ...message,
                data: null,
                name: null,
                type: MessageType.STREAM_INPUT_DESTROY,
            },
        ],
        [
            'valid type (STREAM_OUTPUT_DATA)',
            {
                ...message,
                name: null,
                type: MessageType.STREAM_OUTPUT_DATA,
            },
        ],
        [
            'valid type (STREAM_OUTPUT_END)',
            {
                ...message,
                data: null,
                name: null,
                type: MessageType.STREAM_OUTPUT_END,
            },
        ],
        [
            'valid type (STREAM_OUTPUT_DESTROY)',
            {
                ...message,
                data: null,
                name: null,
                type: MessageType.STREAM_OUTPUT_DESTROY,
            },
        ],
        [
            'valid data (null)',
            {
                ...message,
                data: null,
                name: null,
                type: MessageType.REPLY_VALUE,
            },
        ],
        [
            'valid data (object)',
            { ...message, data: {}, name: null, type: MessageType.REPLY_VALUE },
        ],
        [
            'valid data (Array)',
            { ...message, data: [], name: null, type: MessageType.REPLY_VALUE },
        ],
        [
            'valid data (Array; type: REQUEST)',
            { ...message, data: [], type: MessageType.REQUEST },
        ],
        [
            'valid data (Array; type: EVENT)',
            { ...message, data: [], type: MessageType.EVENT },
        ],
        [
            'valid data (string)',
            { ...message, data: '', name: null, type: MessageType.REPLY_VALUE },
        ],
        [
            'valid data (number)',
            { ...message, data: 0, name: null, type: MessageType.REPLY_VALUE },
        ],
        [
            'valid data (boolean)',
            {
                ...message,
                data: false,
                name: null,
                type: MessageType.REPLY_VALUE,
            },
        ],
    ])('%s', async (_, validMessage) => {
        const onDisconnect = jest.fn()
        const onError = jest.fn()
        connection.on('disconnect', onDisconnect)
        connection.on('error', onError)
        stream2.write(validMessage)
        await delay()
        expect(onDisconnect).not.toHaveBeenCalled()
        expect(onError).not.toHaveBeenCalled()
    })
})

describe('MessageType', () => {
    test.each([
        ['EVENT', MessageType.EVENT, 0],
        ['REQUEST', MessageType.REQUEST, 1],
        ['REPLY_VALUE', MessageType.REPLY_VALUE, 2],
        ['REPLY_ERROR', MessageType.REPLY_ERROR, 3],
        ['REPLY_STREAM', MessageType.REPLY_STREAM, 4],
        ['STREAM_INPUT_DATA', MessageType.STREAM_INPUT_DATA, 5],
        ['STREAM_INPUT_END', MessageType.STREAM_INPUT_END, 6],
        ['STREAM_INPUT_DESTROY', MessageType.STREAM_INPUT_DESTROY, 7],
        ['STREAM_OUTPUT_DATA', MessageType.STREAM_OUTPUT_DATA, 8],
        ['STREAM_OUTPUT_END', MessageType.STREAM_OUTPUT_END, 9],
        ['STREAM_OUTPUT_DESTROY', MessageType.STREAM_OUTPUT_DESTROY, 10],
    ])('%s', (_, actual, expected) => {
        expect(actual).toBe(expected)
    })
})

describe('no service', () => {
    const message = {
        data: [],
        id: 0,
        name: 'name-1',
        service: 'unregistered-service',
        type: MessageType.EVENT,
    }
    beforeEach(() => {
        connection.connect(stream1)
        connection.registerService({
            instance: new EventEmitter(),
            name: 'a-service',
        })
    })
    test.each([
        [
            'request for an unregistered service',
            'unregistered-service',
            MessageType.REQUEST,
            MessageType.REPLY_ERROR,
        ],
        [
            'request for a registered service',
            'a-service',
            MessageType.REQUEST,
            MessageType.REPLY_ERROR,
        ],
    ])('%s', async (_, serviceName, inputCode, outputCode) => {
        const onData = jest.fn()
        stream2.on('data', onData)
        stream2.write({
            ...message,
            service: serviceName,
            type: inputCode,
        })
        await delay()
        expect(onData).toHaveBeenCalledTimes(1)
        expect(onData).toHaveBeenCalledWith(
            expect.objectContaining({
                ...message,
                data: errorMatcher(
                    'RangeError',
                    `No service to handle the request for "${serviceName}.${message.name}".`,
                ),
                name: null,
                service: serviceName,
                type: outputCode,
            }),
        )
    })
})

describe('service and proxy', () => {
    interface TestService extends Service {
        returnMethod: jest.Mock<any, any[]>
        resolveMethod: jest.Mock<Promise<any>, any[]>
        returnStreamMethod: jest.Mock<Duplex, any[]>
        resolveStreamMethod: jest.Mock<Promise<Duplex>, any[]>
        returnInvalidStreamMethod: jest.Mock<Stream, any[]>
        resolveInvalidStreamMethod: jest.Mock<Promise<Stream>, any[]>
        throwErrorMethod: jest.Mock<never, any[]>
        throwNonErrorMethod: jest.Mock<never, any[]>
        rejectErrorMethod: jest.Mock<Promise<never>, any[]>
        rejectNonErrorMethod: jest.Mock<Promise<never>, any[]>
    }
    interface TestProxy extends Proxy {
        returnMethod: jest.Mock<Promise<any>, any[]>
        resolveMethod: jest.Mock<Promise<any>, any[]>
        returnStreamMethod: jest.Mock<Promise<Duplex>, any[]>
        resolveStreamMethod: jest.Mock<Promise<Duplex>, any[]>
        returnInvalidStreamMethod: jest.Mock<Stream, any[]>
        resolveInvalidStreamMethod: jest.Mock<Promise<Stream>, any[]>
        throwErrorMethod: jest.Mock<Promise<never>, any[]>
        throwNonErrorMethod: jest.Mock<Promise<never>, any[]>
        rejectErrorMethod: jest.Mock<Promise<never>, any[]>
        rejectNonErrorMethod: jest.Mock<Promise<never>, any[]>
    }
    let proxy: TestProxy
    let service: TestService
    let returnedServiceStream: Duplex
    let returnedControllerStream: Duplex
    let resolvedServiceStream: Duplex
    let resolvedControllerStream: Duplex
    let returnedInvalidStream: Stream
    let resolvedInvalidStream: Stream
    const serviceName = 'a-service'
    const requestNames = new Set([
        'returnMethod',
        'resolveMethod',
        'returnStreamMethod',
        'resolveStreamMethod',
        'returnInvalidStreamMethod',
        'resolveInvalidStreamMethod',
        'throwErrorMethod',
        'throwNonErrorMethod',
        'rejectErrorMethod',
        'rejectNonErrorMethod',
    ])
    const eventNames = new Set(['testEvent', 'anotherTestEvent'])
    const params = ['abc', 5, true, { key: 'value' }, [1, 2, 3]]
    const replyData = {
        anotherKey: 'value',
        reply: 'data',
    }

    beforeEach(() => {
        ;[returnedServiceStream, returnedControllerStream] = invertedStreams({
            objectMode: true,
        })
        ;[resolvedServiceStream, resolvedControllerStream] = invertedStreams({
            objectMode: true,
        })
        returnedInvalidStream = new Readable()
        resolvedInvalidStream = new Readable()

        service = Object.assign(new EventEmitter(), {
            rejectErrorMethod: jest.fn((..._args: any[]) =>
                Promise.reject(error),
            ),
            rejectNonErrorMethod: jest.fn((..._args: any[]) =>
                Promise.reject(invalidErrorObject),
            ),
            resolveInvalidStreamMethod: jest.fn((..._args: any[]) =>
                Promise.resolve(resolvedInvalidStream),
            ),
            resolveMethod: jest.fn((..._args: any[]) => Promise.resolve(5)),
            resolveStreamMethod: jest.fn((..._args: any[]) =>
                Promise.resolve(resolvedServiceStream),
            ),
            returnInvalidStreamMethod: jest.fn(
                (..._args: any[]) => returnedInvalidStream,
            ),
            returnMethod: jest.fn((..._args: any[]) => 5),
            returnStreamMethod: jest.fn(
                (..._args: any[]) => returnedServiceStream,
            ),
            throwErrorMethod: jest.fn((..._args: any[]) => {
                throw error
            }),
            throwNonErrorMethod: jest.fn((..._args: any[]) => {
                throw invalidErrorObject
            }),
        })
        connection.connect(stream1)
        connection.registerService({
            eventNames,
            instance: service,
            name: serviceName,
            requestNames,
        })
        connection.registerProxy({
            eventNames,
            name: serviceName,
            requestNames,
        })
        proxy = connection.getProxy(serviceName) as TestProxy
    })

    describe('service requests', () => {
        const message: Message = {
            data: [],
            id: 0,
            name: 'returnMethod',
            service: serviceName,
            type: MessageType.REQUEST,
        }
        test.each([
            [
                'returnMethod',
                {
                    ...message,
                    data: 5,
                    name: null,
                    type: MessageType.REPLY_VALUE,
                },
            ],
            [
                'resolveMethod',
                {
                    ...message,
                    data: 5,
                    name: null,
                    type: MessageType.REPLY_VALUE,
                },
            ],
            [
                'returnStreamMethod',
                {
                    ...message,
                    data: null,
                    name: null,
                    type: MessageType.REPLY_STREAM,
                },
            ],
            [
                'resolveStreamMethod',
                {
                    ...message,
                    data: null,
                    name: null,
                    type: MessageType.REPLY_STREAM,
                },
            ],
            [
                'throwErrorMethod',
                {
                    ...message,
                    data: testErrorMatcher,
                    name: null,
                    type: MessageType.REPLY_ERROR,
                },
            ],
            [
                'rejectErrorMethod',
                {
                    ...message,
                    data: testErrorMatcher,
                    name: null,
                    type: MessageType.REPLY_ERROR,
                },
            ],
            [
                'throwNonErrorMethod',
                {
                    ...message,
                    data: invalidErrorMatcher,
                    name: null,
                    type: MessageType.REPLY_ERROR,
                },
            ],
            [
                'rejectNonErrorMethod',
                {
                    ...message,
                    data: invalidErrorMatcher,
                    name: null,
                    type: MessageType.REPLY_ERROR,
                },
            ],
        ])('%s', async (method, response) => {
            const onData = jest.fn()
            stream2.on('data', onData)
            stream2.write({
                ...message,
                name: method,
            })
            await delay()
            expect(onData.mock.calls.length).toBe(1)
            expect(onData.mock.calls[0][0]).toEqual(response)
        })
        test.each(['returnInvalidStreamMethod', 'resolveInvalidStreamMethod'])(
            '%s',
            async (method) => {
                const onError = jest.fn()
                const onData = jest.fn()
                connection.once('error', onError)
                stream2.on('data', onData)
                stream2.write({
                    ...message,
                    name: method,
                })
                await delay()
                expect(onData.mock.calls.length).toBe(1)
                expect(onData.mock.calls[0][0]).toEqual({
                    ...message,
                    data: invalidStreamMatcher,
                    name: null,
                    type: MessageType.REPLY_ERROR,
                })
                expect(onError).toHaveBeenCalledWith(invalidStreamMatcher)
            },
        )
        test('service call with params', async () => {
            const onData = jest.fn()
            stream2.on('data', onData)
            stream2.write({
                ...message,
                data: params,
            })
            await delay()
            expect(onData.mock.calls.length).toBe(1)
            expect(onData.mock.calls[0][0]).toEqual({
                ...message,
                data: 5,
                name: null,
                type: MessageType.REPLY_VALUE,
            })
            expect(service.returnMethod.mock.calls.length).toBe(1)
            expect(service.returnMethod.mock.calls[0]).toEqual(params)
            expect(service.returnMethod.mock.instances[0]).toBe(service)
        })
        test.each<[any]>([
            [5],
            ['abc'],
            [true],
            [null],
            [[1, 2, 3]],
            [{ key: 'value' }],
            [undefined],
            [() => true],
            [Symbol()],
        ])('service returned value: %p', async (value) => {
            service.returnMethod.mockReturnValue(value)
            const onData = jest.fn()
            stream2.on('data', onData)
            stream2.write(message)
            await delay()
            expect(onData.mock.calls.length).toBe(1)
            expect(onData.mock.calls[0][0]).toEqual({
                ...message,
                data: ['object', 'string', 'number', 'boolean'].includes(
                    typeof value,
                )
                    ? value
                    : null,
                name: null,
                type: MessageType.REPLY_VALUE,
            })
        })
        test('duplicate stream ID', async () => {
            const onData = jest.fn()
            const onReturnedClose = jest.fn()
            const onResolvedClose = jest.fn()
            stream2.on('data', onData)
            returnedServiceStream.on('close', onReturnedClose)
            resolvedServiceStream.on('close', onResolvedClose)
            stream2.write({
                ...message,
                name: 'returnStreamMethod',
            })
            stream2.write({
                ...message,
                name: 'resolveStreamMethod',
            })
            await delay()
            expect(onData).toHaveBeenCalledTimes(2)
            expect(onData).toHaveBeenNthCalledWith(1, {
                ...message,
                data: null,
                name: null,
                type: MessageType.REPLY_STREAM,
            })
            expect(onData).toHaveBeenNthCalledWith(2, {
                ...message,
                data: expect.objectContaining({
                    message: 'Duplicate request ID.',
                    name: 'RangeError',
                }),
                name: null,
                type: MessageType.REPLY_ERROR,
            })
            expect(onReturnedClose).toHaveBeenCalledTimes(0)
            expect(onResolvedClose).toHaveBeenCalledTimes(1)
        })
        test('disconnect with an active stream', async () => {
            const onData = jest.fn()
            const onError = jest.fn()
            const onClose = jest.fn()
            stream2.on('data', onData)
            stream2.write({
                ...message,
                name: 'returnStreamMethod',
            })
            await delay()
            returnedServiceStream.on('error', onError)
            returnedServiceStream.on('close', onClose)
            connection.disconnect()
            await delay()
            expect(onError).toHaveBeenCalledTimes(0)
            expect(onClose).toHaveBeenCalledTimes(1)
        })
        test('disconnect before returning a stream', async () => {
            let resolvePromise: (stream: Duplex) => void = noop
            const promise = new Promise<Duplex>(
                (resolve) => (resolvePromise = resolve),
            )
            service.resolveStreamMethod.mockReturnValue(promise)
            const onData = jest.fn()
            const onError = jest.fn()
            const onClose = jest.fn()
            stream2.on('data', onData)
            stream2.write({
                ...message,
                name: 'resolveStreamMethod',
            })
            await delay()
            resolvedServiceStream.on('error', onError)
            resolvedServiceStream.on('close', onClose)
            connection.disconnect()
            resolvePromise(resolvedServiceStream)
            await delay()
            expect(onData).not.toHaveBeenCalled()
            expect(onError).toHaveBeenCalledTimes(0)
            expect(onClose).toHaveBeenCalledTimes(1)
        })
        test('disconnect before resolving', async () => {
            const onData = jest.fn()
            let resolvePromise: () => void = noop
            const promise = new Promise<any>(
                (resolve, _) => (resolvePromise = resolve),
            )
            service.resolveMethod.mockReturnValue(promise)
            stream2.on('data', onData)
            stream2.write({ ...message, name: 'resolveMethod' })
            await delay()
            expect(resolvePromise).not.toBe(noop)
            connection.disconnect()
            resolvePromise()
            await delay()
            expect(onData).not.toHaveBeenCalled()
        })
        test('disconnect before rejecting', async () => {
            const onData = jest.fn()
            let rejectPromise: (error: Error) => void = noop
            const promise = new Promise<never>(
                (_, reject) => (rejectPromise = reject),
            )
            service.rejectErrorMethod.mockReturnValue(promise)
            stream2.on('data', onData)
            stream2.write({ ...message, name: 'rejectErrorMethod' })
            await delay()
            expect(rejectPromise).not.toBe(noop)
            connection.disconnect()
            rejectPromise(error)
            await delay()
            expect(onData).not.toHaveBeenCalled()
        })
        test('destroy stream before resolving', async () => {
            const onData = jest.fn()
            const onDisconnect = jest.fn()
            connection.on('disconnect', onDisconnect)
            let resolvePromise: () => void = noop
            const promise = new Promise<any>(
                (resolve, _) => (resolvePromise = resolve),
            )
            service.resolveMethod.mockReturnValue(promise)
            stream2.on('data', onData)
            stream2.write({ ...message, name: 'resolveMethod' })
            await delay()
            expect(resolvePromise).not.toBe(noop)
            stream1.destroy()
            resolvePromise()
            await delay()
            expect(onData).not.toHaveBeenCalled()
            expect(onDisconnect).toHaveBeenCalledTimes(1)
        })
        test('destroy stream before rejecting', async () => {
            const onData = jest.fn()
            const onDisconnect = jest.fn()
            connection.on('disconnect', onDisconnect)
            let rejectPromise: (error: Error) => void = noop
            const promise = new Promise<never>(
                (_, reject) => (rejectPromise = reject),
            )
            service.rejectErrorMethod.mockReturnValue(promise)
            stream2.on('data', onData)
            stream2.write({ ...message, name: 'rejectErrorMethod' })
            await delay()
            expect(rejectPromise).not.toBe(noop)
            stream1.destroy()
            rejectPromise(error)
            await delay()
            expect(onData).not.toHaveBeenCalled()
            expect(onDisconnect).toHaveBeenCalledTimes(1)
        })
        test('request, disconnect, connect, reply ok', async () => {
            const onData1 = jest.fn()
            const onData2 = jest.fn()
            let resolvePromise: () => void = () => expect.fail('')
            service.resolveMethod.mockReturnValue(
                new Promise<any>((resolve, _) => (resolvePromise = resolve)),
            )
            stream2.on('data', onData1)
            stream2.write({ ...message, name: 'resolveMethod' })
            await delay()
            expect(service.resolveMethod).toHaveBeenCalledTimes(1)
            connection.disconnect()
            ;[stream1, stream2] = invertedStreams({
                allowHalfOpen: false,
                objectMode: true,
            })
            stream2.on('data', onData2)
            connection.connect(stream1)
            resolvePromise()
            await delay()
            expect(onData1).not.toHaveBeenCalled()
            expect(onData2).not.toHaveBeenCalled()
        })
        test('request, disconnect, connect, reply error', async () => {
            const onData1 = jest.fn()
            const onData2 = jest.fn()
            let rejectPromise: (_: any) => void = () => expect.fail('')
            service.rejectErrorMethod.mockReturnValue(
                new Promise<never>((_, reject) => (rejectPromise = reject)),
            )
            stream2.on('data', onData1)
            stream2.write({ ...message, name: 'rejectErrorMethod' })
            await delay()
            expect(service.rejectErrorMethod).toHaveBeenCalledTimes(1)
            connection.disconnect()
            ;[stream1, stream2] = invertedStreams({
                allowHalfOpen: false,
                objectMode: true,
            })
            stream2.on('data', onData2)
            connection.connect(stream1)
            rejectPromise(error)
            await delay()
            expect(onData1).not.toHaveBeenCalled()
            expect(onData2).not.toHaveBeenCalled()
        })
    })

    describe('proxy requests', () => {
        test('request, reply', async () => {
            const onData = jest.fn((message) => {
                stream2.write({
                    ...message,
                    data: replyData,
                    name: null,
                    type: MessageType.REPLY_VALUE,
                })
            })
            stream2.on('data', onData)
            await expect(
                proxy.returnMethod(
                    1,
                    'abc',
                    [1, 2, 3],
                    { key: 'value' },
                    false,
                ),
            ).resolves.toBe(replyData)
        })
        test('request, stream', async () => {
            const onData = jest.fn((message) => {
                stream2.write({
                    ...message,
                    data: null,
                    name: null,
                    type: MessageType.REPLY_STREAM,
                })
            })
            stream2.on('data', onData)
            await expect(
                proxy.returnStreamMethod(
                    1,
                    'abc',
                    [1, 2, 3],
                    { key: 'value' },
                    false,
                ),
            ).resolves.toBeInstanceOf(Duplex)
        })
        test('request, error', async () => {
            const onData = jest.fn((message) => {
                stream2.write({
                    ...message,
                    data: error,
                    name: null,
                    type: MessageType.REPLY_ERROR,
                })
            })
            stream2.on('data', onData)
            await expect(
                proxy.returnMethod(
                    1,
                    'abc',
                    [1, 2, 3],
                    { key: 'value' },
                    false,
                ),
            ).rejects.toEqual(testErrorMatcher)
        })
        test(`request, invalid reply`, async () => {
            const onError = jest.fn()
            const onDisconnect = jest.fn()
            const onData = jest.fn((message) => {
                stream2.write({
                    ...message,
                    data: replyData,
                    name: 'returnMethod',
                    type: MessageType.REPLY_VALUE,
                })
            })
            connection.on('error', onError)
            connection.on('disconnect', onDisconnect)
            stream2.on('data', onData)
            // TODO ideally it should time out
            proxy.returnMethod(1, 'abc', [1, 2, 3], { key: 'value' }, false)
            await delay()
            expect(connection.isConnected()).toBe(true)
            expect(onDisconnect).toHaveBeenCalledTimes(0)
            expect(onError).toHaveBeenCalledTimes(1)
            expect(onError).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Invalid "Message.name".',
                    name: 'SyncOTError InvalidEntity',
                }),
            )
        })
        test('request, reply, reply', async () => {
            const onDisconnect = jest.fn()
            const onData = jest.fn((message) => {
                stream2.write({
                    ...message,
                    data: replyData,
                    name: null,
                    type: MessageType.REPLY_VALUE,
                })
                stream2.write({
                    ...message,
                    data: replyData,
                    name: null,
                    type: MessageType.REPLY_VALUE,
                })
            })
            stream2.on('data', onData)
            await expect(
                proxy.returnMethod(
                    1,
                    'abc',
                    [1, 2, 3],
                    { key: 'value' },
                    false,
                ),
            ).resolves.toBe(replyData)
            expect(onDisconnect).not.toHaveBeenCalled()
        })
        test('request, stream, stream', async () => {
            const onDisconnect = jest.fn()
            const onData = jest.fn((message) => {
                stream2.write({
                    ...message,
                    data: null,
                    name: null,
                    type: MessageType.REPLY_STREAM,
                })
                stream2.write({
                    ...message,
                    data: null,
                    name: null,
                    type: MessageType.REPLY_STREAM,
                })
            })
            stream2.on('data', onData)
            await expect(
                proxy.returnStreamMethod(
                    1,
                    'abc',
                    [1, 2, 3],
                    { key: 'value' },
                    false,
                ),
            ).resolves.toBeInstanceOf(Duplex)
            expect(onDisconnect).not.toHaveBeenCalled()
        })
        test('request, error, error', async () => {
            const onDisconnect = jest.fn()
            const onData = jest.fn((message) => {
                stream2.write({
                    ...message,
                    data: error,
                    name: null,
                    type: MessageType.REPLY_ERROR,
                })
                stream2.write({
                    ...message,
                    data: error,
                    name: null,
                    type: MessageType.REPLY_ERROR,
                })
            })
            stream2.on('data', onData)
            await expect(
                proxy.returnMethod(
                    1,
                    'abc',
                    [1, 2, 3],
                    { key: 'value' },
                    false,
                ),
            ).rejects.toEqual(testErrorMatcher)
            expect(onDisconnect).not.toHaveBeenCalled()
        })
        test('request, disconnect', async () => {
            const promise = proxy.returnMethod(
                1,
                'abc',
                [1, 2, 3],
                { key: 'value' },
                false,
            )
            connection.disconnect()
            await expect(promise).rejects.toEqual(
                errorMatcher(
                    'SyncOTError Disconnected',
                    'Disconnected, request failed.',
                ),
            )
        })
        test('request, stream, disconnect', async () => {
            const onClose = jest.fn()
            const onData = jest.fn((message) => {
                stream2.write({
                    ...message,
                    data: null,
                    name: null,
                    type: MessageType.REPLY_STREAM,
                })
            })
            stream2.on('data', onData)
            const stream = await proxy.returnStreamMethod(
                1,
                'abc',
                [1, 2, 3],
                { key: 'value' },
                false,
            )
            stream.on('close', onClose)
            connection.disconnect()
            await delay()
            expect(onClose).toHaveBeenCalledTimes(1)
        })
        test('request, stream, destroy presence stream, disconnect', async () => {
            const onError = jest.fn()
            const onClose = jest.fn()
            const onData = jest.fn((message) => {
                stream2.write({
                    ...message,
                    data: null,
                    name: null,
                    type: MessageType.REPLY_STREAM,
                })
            })
            stream2.on('data', onData)
            const stream = await proxy.returnStreamMethod(
                1,
                'abc',
                [1, 2, 3],
                { key: 'value' },
                false,
            )
            stream.on('error', onError)
            stream.on('close', onClose)
            stream.destroy()
            connection.disconnect()
            await delay()
            expect(onError).toHaveBeenCalledTimes(0)
            expect(onClose).toHaveBeenCalledTimes(1)
        })
        test('request, destroy stream', async () => {
            const promise = proxy.returnMethod(
                1,
                'abc',
                [1, 2, 3],
                { key: 'value' },
                false,
            )
            stream1.destroy()
            await expect(promise).rejects.toEqual(
                errorMatcher(
                    'SyncOTError Disconnected',
                    'Disconnected, request failed.',
                ),
            )
        })
        test('disconnect, request', async () => {
            connection.disconnect()
            const promise = proxy.returnMethod(
                1,
                'abc',
                [1, 2, 3],
                { key: 'value' },
                false,
            )
            await expect(promise).rejects.toEqual(
                errorMatcher(
                    'SyncOTError Disconnected',
                    'Disconnected, request failed.',
                ),
            )
        })
        test('concurrent requests - 2 proxies', async () => {
            connection.registerProxy({ name: 'proxy-2', requestNames })
            const proxy2 = connection.getProxy('proxy-2') as TestProxy
            const onData = jest.fn((message) => {
                stream2.write({
                    ...message,
                    data: message.data.length,
                    name: null,
                    type: MessageType.REPLY_VALUE,
                })
            })
            stream2.on('data', onData)
            const promise1 = proxy.returnMethod(
                1,
                'abc',
                [1, 2, 3],
                { key: 'value' },
                false,
            )
            const promise2 = proxy2.returnMethod()
            await expect(promise1).resolves.toBe(5)
            await expect(promise2).resolves.toBe(0)
        })
        test('concurrent requests - 1 proxy, 2 different request names', async () => {
            const onData = jest.fn((message) => {
                stream2.write({
                    ...message,
                    data: message.data.length,
                    name: null,
                    type: MessageType.REPLY_VALUE,
                })
            })
            stream2.on('data', onData)
            const promise1 = proxy.returnMethod(
                1,
                'abc',
                [1, 2, 3],
                { key: 'value' },
                false,
            )
            const promise2 = proxy.resolveMethod()
            await expect(promise1).resolves.toBe(5)
            await expect(promise2).resolves.toBe(0)
        })
        test('concurrent requests - 1 proxy, 1 request name', async () => {
            const onData = jest.fn((message) => {
                stream2.write({
                    ...message,
                    data: message.data.length,
                    name: null,
                    type: MessageType.REPLY_VALUE,
                })
            })
            stream2.on('data', onData)
            const promise1 = proxy.returnMethod(
                1,
                'abc',
                [1, 2, 3],
                { key: 'value' },
                false,
            )
            const promise2 = proxy.returnMethod()
            await expect(promise1).resolves.toBe(5)
            await expect(promise2).resolves.toBe(0)
        })
        test('invalid params', async () => {
            const invalidParams = [
                undefined as any,
                Symbol() as any,
                (() => undefined) as any,
            ]
            const onData = jest.fn((message) => {
                stream2.write({
                    ...message,
                    data: message.data,
                    name: null,
                    type: MessageType.REPLY_VALUE,
                })
            })
            stream2.on('data', onData)
            // The Proxy will send an Array of arguments. Connection verifies only
            // that the data is an Array and does not look inside for performance reasons.
            const promise = proxy.returnMethod(...invalidParams)
            await expect(promise).resolves.toEqual(invalidParams)
        })
    })

    describe('service events', () => {
        test('no params', async () => {
            const onMessage = jest.fn()
            stream2.on('data', onMessage)
            service.emit('testEvent')
            await whenNextTick()
            expect(onMessage).toHaveBeenCalledTimes(1)
            expect(onMessage).toHaveBeenCalledWith({
                data: [],
                id: 0,
                name: 'testEvent',
                service: serviceName,
                type: MessageType.EVENT,
            })
        })
        test('some params', async () => {
            const data = [1, 'test', true, [1, 2, 3], { key: 'value' }]
            const onMessage = jest.fn()
            stream2.on('data', onMessage)
            service.emit('anotherTestEvent', ...data)
            await whenNextTick()
            expect(onMessage).toHaveBeenCalledTimes(1)
            expect(onMessage).toHaveBeenCalledWith({
                data,
                id: 0,
                name: 'anotherTestEvent',
                service: serviceName,
                type: MessageType.EVENT,
            })
        })
        test('unregistered event', async () => {
            const onMessage = jest.fn()
            stream2.on('data', onMessage)
            service.emit('testEvent')
            service.emit('unregisteredEvent')
            service.emit('anotherTestEvent')
            await whenNextTick()
            expect(onMessage).toHaveBeenCalledTimes(2)
            expect(onMessage).toHaveBeenNthCalledWith(1, {
                data: [],
                id: 0,
                name: 'testEvent',
                service: serviceName,
                type: MessageType.EVENT,
            })
            expect(onMessage).toHaveBeenNthCalledWith(2, {
                data: [],
                id: 0,
                name: 'anotherTestEvent',
                service: serviceName,
                type: MessageType.EVENT,
            })
        })
        test('when disconnected', async () => {
            const onMessage = jest.fn()
            stream2.on('data', onMessage)
            connection.disconnect()
            service.emit('testEvent')
            await whenNextTick()
            expect(onMessage).toHaveBeenCalledTimes(0)
        })
    })

    describe('proxy events', () => {
        test('no params', async () => {
            const onTestEvent = jest.fn()
            proxy.on('testEvent', onTestEvent)
            stream2.write({
                data: [],
                id: 0,
                name: 'testEvent',
                service: serviceName,
                type: MessageType.EVENT,
            })
            await whenNextTick()
            expect(onTestEvent).toHaveBeenCalledTimes(1)
            expect(onTestEvent).toHaveBeenCalledWith()
        })
        test('some params', async () => {
            const data = [1, 'test', true, [1, 2, 3], { key: 'value' }]
            const onTestEvent = jest.fn()
            proxy.on('testEvent', onTestEvent)
            stream2.write({
                data,
                id: 0,
                name: 'testEvent',
                service: serviceName,
                type: MessageType.EVENT,
            })
            await whenNextTick()
            expect(onTestEvent).toHaveBeenCalledTimes(1)
            expect(onTestEvent).toHaveBeenCalledWith(...data)
        })
        test('unregistered event', async () => {
            const onTestEvent = jest.fn()
            const onAnotherTestEvent = jest.fn()
            const onUnregisteredEvent = jest.fn()
            proxy.on('testEvent', onTestEvent)
            proxy.on('unregisteredEvent', onUnregisteredEvent)
            proxy.on('anotherTestEvent', onAnotherTestEvent)
            stream2.write({
                data: [1],
                id: 0,
                name: 'testEvent',
                service: serviceName,
                type: MessageType.EVENT,
            })
            stream2.write({
                data: [2],
                id: 0,
                name: 'unregisteredEvent',
                service: serviceName,
                type: MessageType.EVENT,
            })
            stream2.write({
                data: [3],
                id: 0,
                name: 'anotherTestEvent',
                service: serviceName,
                type: MessageType.EVENT,
            })
            await whenNextTick()
            expect(onTestEvent).toHaveBeenCalledTimes(1)
            expect(onTestEvent).toHaveBeenCalledWith(1)
            expect(onUnregisteredEvent).toHaveBeenCalledTimes(0)
            expect(onAnotherTestEvent).toHaveBeenCalledTimes(1)
            expect(onAnotherTestEvent).toHaveBeenCalledWith(3)
        })
    })

    describe('service/proxy interaction', () => {
        let connection2: Connection
        let proxy2: TestProxy

        beforeEach(() => {
            connection2 = createConnection()
            connection2.connect(stream2)
            connection2.registerProxy({
                eventNames,
                name: serviceName,
                requestNames,
            })
            proxy2 = connection2.getProxy(serviceName) as TestProxy
        })

        test('event', async () => {
            const data = [1, 'test', true, [1, 2, 3], { key: 'value' }]
            const onTestEvent = jest.fn()
            proxy2.on('testEvent', onTestEvent)
            service.emit('testEvent', ...data)
            await whenNextTick()
            expect(onTestEvent).toHaveBeenCalledTimes(1)
            expect(onTestEvent).toHaveBeenCalledWith(...data)
        })
        test('request, reply', async () => {
            service.returnMethod.mockReturnValue(replyData)
            await expect(proxy2.returnMethod(...params)).resolves.toEqual(
                replyData,
            )

            expect(service.returnMethod.mock.calls.length).toBe(1)
            expect(service.returnMethod.mock.calls[0]).toEqual(params)
            expect(service.returnMethod.mock.instances[0]).toBe(service)
        })
        test('request, error', async () => {
            service.returnMethod.mockImplementation(() => Promise.reject(error))
            await expect(proxy2.returnMethod(...params)).rejects.toEqual(
                testErrorMatcher,
            )

            expect(service.returnMethod.mock.calls.length).toBe(1)
            expect(service.returnMethod.mock.calls[0]).toEqual(params)
            expect(service.returnMethod.mock.instances[0]).toBe(service)
        })

        describe('streams', () => {
            test('return stream, input destroy', async () => {
                const onError = jest.fn()
                const onClose = jest.fn()

                const proxyStream = await proxy2.returnStreamMethod(...params)

                expect(service.returnStreamMethod.mock.calls.length).toBe(1)
                expect(service.returnStreamMethod.mock.calls[0]).toEqual(params)
                expect(service.returnStreamMethod.mock.instances[0]).toBe(
                    service,
                )
                expect(proxyStream).toBeInstanceOf(Duplex)

                returnedServiceStream.on('error', onError)
                returnedServiceStream.on('close', onClose)

                process.nextTick(() => proxyStream.destroy())
                await whenClose(returnedServiceStream)

                expect(onError).toHaveBeenCalledTimes(0)
                expect(onClose).toHaveBeenCalledTimes(1)
            })

            test('resolve stream, output destroy', async () => {
                const onError = jest.fn()
                const onClose = jest.fn()

                const proxyStream = await proxy2.resolveStreamMethod(...params)
                expect(service.resolveStreamMethod.mock.calls.length).toBe(1)
                expect(service.resolveStreamMethod.mock.calls[0]).toEqual(
                    params,
                )
                expect(service.resolveStreamMethod.mock.instances[0]).toBe(
                    service,
                )
                expect(proxyStream).toBeInstanceOf(Duplex)

                proxyStream.on('error', onError)
                proxyStream.on('close', onClose)

                process.nextTick(() => resolvedServiceStream.destroy())
                await whenClose(proxyStream)

                expect(onError).toHaveBeenCalledTimes(0)
                expect(onClose).toHaveBeenCalledTimes(1)
            })

            test('resolve stream, input destroy with error', async () => {
                const onProxyError = jest.fn()
                const onServiceError = jest.fn()
                const onServiceClose = jest.fn()
                const proxyStream = await proxy2.resolveStreamMethod(...params)

                proxyStream.on('error', onProxyError)
                resolvedServiceStream.on('error', onServiceError)
                resolvedServiceStream.on('close', onServiceClose)

                process.nextTick(() => proxyStream.destroy(error))
                await whenClose(resolvedServiceStream)

                expect(onProxyError).toHaveBeenCalledTimes(1)
                expect(onServiceError).toHaveBeenCalledTimes(0)
                expect(onServiceClose).toHaveBeenCalledTimes(1)
            })

            test('return stream, output destroy with error', async () => {
                const onServiceError = jest.fn()
                const onProxyError = jest.fn()
                const onProxyClose = jest.fn()
                const proxyStream = await proxy2.returnStreamMethod(...params)

                returnedServiceStream.on('error', onServiceError)
                proxyStream.on('error', onProxyError)
                proxyStream.on('close', onProxyClose)

                process.nextTick(() => returnedServiceStream.destroy(error))
                await whenClose(proxyStream)

                expect(onServiceError).toHaveBeenCalledTimes(1)
                expect(onProxyError).toHaveBeenCalledTimes(0)
                expect(onProxyClose).toHaveBeenCalledTimes(1)
            })

            test('input data, output data, input end, output data, output end', async () => {
                const onInputClose = jest.fn()
                const onOutputClose = jest.fn()
                const proxyStream = await proxy2.returnStreamMethod(...params)
                proxyStream.on('close', onInputClose)
                returnedControllerStream.on('close', onOutputClose)

                process.nextTick(() => proxyStream.write(101))
                await whenData(returnedControllerStream, 101)

                process.nextTick(() => returnedControllerStream.write(201))
                await whenData(proxyStream, 201)

                process.nextTick(() => proxyStream.end())
                await whenEnd(returnedControllerStream)

                process.nextTick(() => returnedControllerStream.write(202))
                await whenData(proxyStream, 202)

                process.nextTick(() => returnedControllerStream.end())
                await whenEnd(proxyStream)

                expect(onInputClose).toHaveBeenCalledTimes(0)
                expect(onOutputClose).toHaveBeenCalledTimes(0)

                proxyStream.destroy()
                await delay()

                expect(onInputClose).toHaveBeenCalledTimes(1)
                expect(onOutputClose).toHaveBeenCalledTimes(1)
            })

            test('output data, input data, output end, input data, input end', async () => {
                const onInputClose = jest.fn()
                const onOutputClose = jest.fn()
                const proxyStream = await proxy2.resolveStreamMethod(...params)
                proxyStream.on('close', onInputClose)
                resolvedControllerStream.on('close', onOutputClose)

                process.nextTick(() => resolvedControllerStream.write(101))
                await whenData(proxyStream, 101)

                process.nextTick(() => proxyStream.write(201))
                await whenData(resolvedControllerStream, 201)

                process.nextTick(() => resolvedControllerStream.end())
                await whenEnd(proxyStream)

                process.nextTick(() => proxyStream.write(202))
                await whenData(resolvedControllerStream, 202)

                process.nextTick(() => proxyStream.end())
                await whenEnd(resolvedControllerStream)

                expect(onInputClose).toHaveBeenCalledTimes(0)
                expect(onOutputClose).toHaveBeenCalledTimes(0)

                resolvedControllerStream.destroy()
                await delay()

                expect(onInputClose).toHaveBeenCalledTimes(1)
                expect(onOutputClose).toHaveBeenCalledTimes(1)
            })
        })
    })
})
