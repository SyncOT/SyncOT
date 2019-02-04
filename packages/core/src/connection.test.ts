import { EventEmitter } from 'events'
import { Duplex } from 'stream'
import {
    Connection,
    createConnection,
    ErrorCodes,
    invertedStreams,
    JsonValue,
    MessageType,
    Proxy,
    SyncOtError,
} from '.'

const name = 'service-or-proxy-name'
const error = new Error('test error')
let connection: Connection
let stream1: Duplex
let stream2: Duplex
let instance: EventEmitter
const delay = () => new Promise(resolve => setTimeout(resolve, 0))
const errorToJson = (e: SyncOtError) => Promise.reject(e.toJSON())

beforeEach(() => {
    connection = createConnection()
    ;[stream1, stream2] = invertedStreams({ objectMode: true })
    instance = new EventEmitter()
})

describe('connection', () => {
    test('initially disconnected', () => {
        expect(connection.isConnected()).toBe(false)
    })
    test('connect', () => {
        const connectedCallback = jest.fn()
        connection.on('connect', connectedCallback)
        connection.connect(stream1)
        expect(connection.isConnected()).toBe(true)
        expect(connectedCallback).toHaveBeenCalledTimes(1)
    })
    test('connect twice', () => {
        expect.assertions(4)
        const connectedCallback = jest.fn()
        connection.on('connect', connectedCallback)
        connection.connect(stream1)
        try {
            connection.connect(stream1)
        } catch (e) {
            expect(e).toBeInstanceOf(SyncOtError)
            expect(e.code).toBe(ErrorCodes.AlreadyConnected)
        }
        expect(connection.isConnected()).toBe(true)
        expect(connectedCallback).toHaveBeenCalledTimes(1)
    })
    test('connect with an invalid stream', () => {
        expect.assertions(2)
        try {
            connection.connect({} as any)
        } catch (e) {
            expect(e).toBeInstanceOf(SyncOtError)
            expect(e.code).toBe(ErrorCodes.InvalidArgument)
        }
    })
    test('disconnect', async () => {
        const disconnectCallback = jest.fn()
        const closeCallback = jest.fn()
        connection.connect(stream1)
        connection.on('disconnect', disconnectCallback)
        stream1.on('close', closeCallback)
        connection.disconnect()
        expect(connection.isConnected()).toBe(false)
        expect(disconnectCallback).toHaveBeenCalledTimes(1)
        expect(disconnectCallback).toHaveBeenCalledWith(null)
        await delay()
        expect(closeCallback).toHaveBeenCalledTimes(1)
    })
    test('disconnect twice', () => {
        const disconnectCallback = jest.fn()
        connection.connect(stream1)
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
        connection.connect(stream1)
        expect(connection.isConnected()).toBe(true)
        connection.disconnect()
        expect(connection.isConnected()).toBe(false)
        connection.connect(stream2)
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
        connection.connect(stream1)
        connection.on('disconnect', disconnectCallback)
        stream1.on('close', closeCallback)
        connection.disconnect(error)
        expect(connection.isConnected()).toBe(false)
        expect(disconnectCallback).toHaveBeenCalledTimes(1)
        expect(disconnectCallback).toHaveBeenCalledWith(error)
        await delay()
        expect(closeCallback).toHaveBeenCalledTimes(1)
    })
    test('end stream', async () => {
        const disconnectCallback = jest.fn()
        connection.connect(stream1)
        connection.on('disconnect', disconnectCallback)
        stream1.push(null) // End the read stream.
        stream1.end() // End the write stream.
        await delay()
        expect(connection.isConnected()).toBe(false)
        expect(disconnectCallback).toHaveBeenCalledTimes(1)
        expect(disconnectCallback).toHaveBeenCalledWith(null)
    })
    test('destroy stream', async () => {
        const disconnectCallback = jest.fn()
        connection.connect(stream1)
        connection.on('disconnect', disconnectCallback)
        stream1.destroy()
        await delay()
        expect(connection.isConnected()).toBe(false)
        expect(disconnectCallback).toHaveBeenCalledTimes(1)
        expect(disconnectCallback.mock.calls[0][0]).toBeObject() // Premature close error.
    })
    test('close stream and disconnect', async () => {
        const disconnectCallback = jest.fn()
        connection.connect(stream1)
        connection.on('disconnect', disconnectCallback)
        stream1.push(null) // End the read stream.
        stream1.end() // End the write stream.
        connection.disconnect()
        expect(connection.isConnected()).toBe(false)
        await delay()
        expect(disconnectCallback).toHaveBeenCalledTimes(1) // Called only once.
        expect(disconnectCallback).toHaveBeenCalledWith(null)
    })
})

describe('service registration', () => {
    test('register with an invalid instance', () => {
        expect.assertions(3)
        try {
            connection.registerService({ name, instance: {} as any })
        } catch (error) {
            expect(error).toBeInstanceOf(SyncOtError)
            expect(error.code).toBe(ErrorCodes.InvalidArgument)
            expect(error.message).toBe('Service must be an EventEmitter')
        }
    })
    test('register with events - currently unimplemented', () => {
        expect.assertions(3)
        try {
            connection.registerService({
                events: new Set(['eventName']),
                instance,
                name,
            })
        } catch (error) {
            expect(error).toBeInstanceOf(SyncOtError)
            expect(error.code).toBe(ErrorCodes.NotImplemented)
            expect(error.message).toBe('Connection does not support events yet')
        }
    })
    test('register with streams - currently unimplemented', () => {
        expect.assertions(3)
        try {
            connection.registerService({
                instance,
                name,
                streams: new Set(['streamName']),
            })
        } catch (error) {
            expect(error).toBeInstanceOf(SyncOtError)
            expect(error.code).toBe(ErrorCodes.NotImplemented)
            expect(error.message).toBe(
                'Connection does not support streams yet',
            )
        }
    })
    test('register with a missing action', () => {
        expect.assertions(3)
        ;(instance as any).testAction = () => null
        try {
            connection.registerService({
                actions: new Set(['testAction', 'anotherAction']),
                instance,
                name,
            })
        } catch (error) {
            expect(error).toBeInstanceOf(SyncOtError)
            expect(error.code).toBe(ErrorCodes.InvalidArgument)
            expect(error.message).toBe(
                'Service.anotherAction must be a function',
            )
        }
    })
    test('register', () => {
        ;(instance as any).anotherAction = () => null
        ;(instance as any).testAction = () => null
        connection.registerService({
            actions: new Set(['testAction', 'anotherAction']),
            instance,
            name,
        })
    })
    test('register twice', () => {
        expect.assertions(2)
        connection.registerService({
            instance,
            name,
        })
        try {
            connection.registerService({
                instance: new EventEmitter(),
                name,
            })
        } catch (error) {
            expect(error).toBeInstanceOf(SyncOtError)
            expect(error.code).toBe(ErrorCodes.DuplicateService)
        }
    })
    test('get registered services', () => {
        const actions = new Set(['testAction', 'anotherAction'])
        const anotherName = 'another-service'
        const anotherInstance = new EventEmitter()
        ;(instance as any).anotherAction = () => null
        ;(instance as any).testAction = () => null
        connection.registerService({
            actions,
            instance,
            name,
        })
        connection.registerService({
            instance: anotherInstance,
            name: anotherName,
        })
        expect(connection.getServiceNames()).toEqual([name, anotherName])
        expect(connection.getServiceDescriptor(name)).toEqual({
            actions,
            events: new Set(),
            instance,
            name,
            streams: new Set(),
        })
        expect(connection.getService(name)).toBe(instance)
        expect(connection.getServiceDescriptor(anotherName)).toEqual({
            actions: new Set(),
            events: new Set(),
            instance: anotherInstance,
            name: anotherName,
            streams: new Set(),
        })
        expect(connection.getService(anotherName)).toBe(anotherInstance)
        expect(connection.getServiceDescriptor('missing')).toBe(undefined)
        expect(connection.getService('missing')).toBe(undefined)
    })
})

describe('proxy registration', () => {
    test('register with events - currently unimplemented', () => {
        expect.assertions(3)
        try {
            connection.registerProxy({ events: new Set(['eventName']), name })
        } catch (error) {
            expect(error).toBeInstanceOf(SyncOtError)
            expect(error.code).toBe(ErrorCodes.NotImplemented)
            expect(error.message).toBe('Connection does not support events yet')
        }
    })
    test('register with streams - currently unimplemented', () => {
        expect.assertions(3)
        try {
            connection.registerProxy({ name, streams: new Set(['streamName']) })
        } catch (error) {
            expect(error).toBeInstanceOf(SyncOtError)
            expect(error.code).toBe(ErrorCodes.NotImplemented)
            expect(error.message).toBe(
                'Connection does not support streams yet',
            )
        }
    })
    test('register with an action conflict', () => {
        expect.assertions(3)
        try {
            connection.registerProxy({
                actions: new Set(['testAction', 'addListener']),
                name,
            })
        } catch (error) {
            expect(error).toBeInstanceOf(SyncOtError)
            expect(error.code).toBe(ErrorCodes.InvalidArgument)
            expect(error.message).toBe('Proxy.addListener already exists')
        }
    })
    test('register', () => {
        connection.registerProxy({
            actions: new Set(['testAction', 'anotherAction']),
            name,
        })
    })
    test('register twice', () => {
        expect.assertions(2)
        connection.registerProxy({ name })
        try {
            connection.registerProxy({ name })
        } catch (error) {
            expect(error).toBeInstanceOf(SyncOtError)
            expect(error.code).toBe(ErrorCodes.DuplicateProxy)
        }
    })
    test('get registered services', () => {
        ;(instance as any).testAction = expect.any(Function)
        ;(instance as any).anotherAction = expect.any(Function)
        const actions = new Set(['testAction', 'anotherAction'])
        const anotherName = 'another-service'
        const anotherInstance = new EventEmitter()
        connection.registerProxy({ actions, name })
        connection.registerProxy({ name: anotherName })
        expect(connection.getProxyNames()).toEqual([name, anotherName])
        expect(connection.getProxyDescriptor(name)).toEqual({
            actions,
            events: new Set(),
            instance,
            name,
            streams: new Set(),
        })
        expect(connection.getProxy(name)).toEqual(instance)
        expect(connection.getProxyDescriptor(anotherName)).toEqual({
            actions: new Set(),
            events: new Set(),
            instance: anotherInstance,
            name: anotherName,
            streams: new Set(),
        })
        expect(connection.getProxy(anotherName)).toEqual(anotherInstance)
        expect(connection.getProxyDescriptor('missing')).toBe(undefined)
        expect(connection.getProxy('missing')).toBe(undefined)
    })
})

describe('message validation', () => {
    const baseMessage = {
        data: null,
        id: 0,
        name: 'name-1',
        service: 'service-1',
        type: MessageType.EVENT,
    }
    beforeEach(() => {
        connection.connect(stream1)
    })
    test.each([
        ['invalid message', true, null],
        [
            'invalid data (undefined)',
            { ...baseMessage, data: undefined },
            'data',
        ],
        [
            'invalid data (function)',
            { ...baseMessage, data: () => null },
            'data',
        ],
        ['invalid data (symbol)', { ...baseMessage, data: Symbol() }, 'data'],
        ['invalid id', { ...baseMessage, id: 0.5 }, 'id'],
        [
            'invalid name (type=EVENT)',
            { ...baseMessage, type: MessageType.EVENT, name: undefined },
            'name',
        ],
        [
            'invalid name (type=CALL_REQUEST)',
            { ...baseMessage, type: MessageType.CALL_REQUEST, name: undefined },
            'name',
        ],
        [
            'invalid name (type=STREAM_OPEN)',
            { ...baseMessage, type: MessageType.STREAM_OPEN, name: undefined },
            'name',
        ],
        [
            'invalid name (type=CALL_REPLY)',
            { ...baseMessage, type: MessageType.CALL_REPLY },
            'name',
        ],
        [
            'invalid name (type=CALL_ERROR)',
            { ...baseMessage, type: MessageType.CALL_ERROR },
            'name',
        ],
        [
            'invalid name (type=STREAM_INPUT_DATA)',
            { ...baseMessage, type: MessageType.STREAM_INPUT_DATA },
            'name',
        ],
        [
            'invalid name (type=STREAM_INPUT_END)',
            { ...baseMessage, type: MessageType.STREAM_INPUT_END },
            'name',
        ],
        [
            'invalid name (type=STREAM_INPUT_ERROR)',
            { ...baseMessage, type: MessageType.STREAM_INPUT_ERROR },
            'name',
        ],
        [
            'invalid name (type=STREAM_OUTPUT_DATA)',
            { ...baseMessage, type: MessageType.STREAM_OUTPUT_DATA },
            'name',
        ],
        [
            'invalid name (type=STREAM_OUTPUT_END)',
            { ...baseMessage, type: MessageType.STREAM_OUTPUT_END },
            'name',
        ],
        [
            'invalid name (type=STREAM_OUTPUT_ERROR)',
            { ...baseMessage, type: MessageType.STREAM_OUTPUT_ERROR },
            'name',
        ],
        ['invalid service', { ...baseMessage, service: undefined }, 'service'],
        ['invalid type (too small)', { ...baseMessage, type: -1 }, 'type'],
        ['invalid type (too big)', { ...baseMessage, type: 11 }, 'type'],
    ])('%s', async (_, message, property) => {
        const onDisconnect = jest.fn()
        connection.on('disconnect', onDisconnect)
        stream2.write(message)
        await delay()
        expect(onDisconnect.mock.calls.length).toBe(1)
        expect(onDisconnect.mock.calls[0][0]).toBeInstanceOf(SyncOtError)
        expect(onDisconnect.mock.calls[0][0].code).toBe(
            ErrorCodes.InvalidMessage,
        )
        expect(onDisconnect.mock.calls[0][0].details.message).toBe(message)
        expect(onDisconnect.mock.calls[0][0].details.property).toBe(property)
    })
    test.each([
        ['valid message', { ...baseMessage }],
        [
            'valid message (type=EVENT)',
            { ...baseMessage, type: MessageType.EVENT },
        ],
        [
            'valid type (CALL_REQUEST)',
            { ...baseMessage, type: MessageType.CALL_REQUEST },
        ],
        [
            'valid type (CALL_REPLY)',
            { ...baseMessage, name: undefined, type: MessageType.CALL_REPLY },
        ],
        [
            'valid type (CALL_ERROR)',
            { ...baseMessage, name: undefined, type: MessageType.CALL_ERROR },
        ],
        [
            'valid type (STREAM_OPEN)',
            { ...baseMessage, type: MessageType.STREAM_OPEN },
        ],
        [
            'valid type (STREAM_INPUT_DATA)',
            {
                ...baseMessage,
                name: undefined,
                type: MessageType.STREAM_INPUT_DATA,
            },
        ],
        [
            'valid type (STREAM_INPUT_END)',
            {
                ...baseMessage,
                name: undefined,
                type: MessageType.STREAM_INPUT_END,
            },
        ],
        [
            'valid type (STREAM_INPUT_ERROR)',
            {
                ...baseMessage,
                name: undefined,
                type: MessageType.STREAM_INPUT_ERROR,
            },
        ],
        [
            'valid type (STREAM_OUTPUT_DATA)',
            {
                ...baseMessage,
                name: undefined,
                type: MessageType.STREAM_OUTPUT_DATA,
            },
        ],
        [
            'valid type (STREAM_OUTPUT_END)',
            {
                ...baseMessage,
                name: undefined,
                type: MessageType.STREAM_OUTPUT_END,
            },
        ],
        [
            'valid type (STREAM_OUTPUT_ERROR)',
            {
                ...baseMessage,
                name: undefined,
                type: MessageType.STREAM_OUTPUT_ERROR,
            },
        ],
        ['valid data (null)', { ...baseMessage, data: null }],
        ['valid data (object)', { ...baseMessage, data: {} }],
        ['valid data (Array)', { ...baseMessage, data: [] }],
        ['valid data (string)', { ...baseMessage, data: '' }],
        ['valid data (number)', { ...baseMessage, data: 0 }],
        ['valid data (boolean)', { ...baseMessage, data: false }],
    ])('%s', async (_, message) => {
        const onDisconnect = jest.fn()
        connection.on('disconnect', onDisconnect)
        stream2.write(message)
        await delay()
        expect(onDisconnect).not.toHaveBeenCalled()
    })
})

describe('MessageType', () => {
    test.each([
        ['EVENT', MessageType.EVENT, 0],
        ['CALL_REQUEST', MessageType.CALL_REQUEST, 1],
        ['CALL_REPLY', MessageType.CALL_REPLY, 2],
        ['CALL_ERROR', MessageType.CALL_ERROR, 3],
        ['STREAM_OPEN', MessageType.STREAM_OPEN, 4],
        ['STREAM_INPUT_DATA', MessageType.STREAM_INPUT_DATA, 5],
        ['STREAM_INPUT_END', MessageType.STREAM_INPUT_END, 6],
        ['STREAM_INPUT_ERROR', MessageType.STREAM_INPUT_ERROR, 7],
        ['STREAM_OUTPUT_DATA', MessageType.STREAM_OUTPUT_DATA, 8],
        ['STREAM_OUTPUT_END', MessageType.STREAM_OUTPUT_END, 9],
        ['STREAM_OUTPUT_ERROR', MessageType.STREAM_OUTPUT_ERROR, 10],
    ])('%s', (_, actual, expected) => {
        expect(actual).toBe(expected)
    })
})

describe('proxy actions', () => {
    interface TestProxy extends Proxy {
        action1: (...args: JsonValue[]) => Promise<JsonValue>
        action2: (...args: JsonValue[]) => Promise<JsonValue>
    }
    let proxy1: TestProxy
    let proxy2: TestProxy
    const replyData = {
        anotherKey: 'value',
        reply: 'data',
    }
    const errorData = {
        code: ErrorCodes.ExternalError,
        details: { additional: 'info' },
        message: 'Test error',
    }

    beforeEach(() => {
        connection.connect(stream1)
        connection.registerProxy({
            actions: new Set(['action1', 'action2']),
            name: 'proxy-1',
        })
        connection.registerProxy({
            actions: new Set(['action1', 'action2']),
            name: 'proxy-2',
        })
        proxy1 = connection.getProxy('proxy-1') as TestProxy
        proxy2 = connection.getProxy('proxy-2') as TestProxy
    })

    test.each([null, undefined])(
        'request, reply (reply action name: %s)',
        async (actionName: string) => {
            const onData = jest.fn(message => {
                stream2.write({
                    ...message,
                    data: replyData,
                    name: actionName,
                    type: MessageType.CALL_REPLY,
                })
            })
            stream2.on('data', onData)
            await expect(
                proxy1.action1(1, 'abc', [1, 2, 3], { key: 'value' }, false),
            ).resolves.toBe(replyData)
        },
    )
    test.each([null, undefined])(
        'request, error (error action name: %s)',
        async (actionName: string) => {
            const onData = jest.fn(message => {
                stream2.write({
                    ...message,
                    data: errorData,
                    name: actionName,
                    type: MessageType.CALL_ERROR,
                })
            })
            stream2.on('data', onData)
            await expect(
                proxy2
                    .action1(1, 'abc', [1, 2, 3], { key: 'value' }, false)
                    .catch(errorToJson),
            ).rejects.toEqual(errorData)
        },
    )
    test(`request, reply (reply action name: action1)`, async () => {
        const onData = jest.fn(message => {
            stream2.write({
                ...message,
                data: replyData,
                name: 'action1',
                type: MessageType.CALL_REPLY,
            })
        })
        stream2.on('data', onData)
        await expect(
            proxy1
                .action1(1, 'abc', [1, 2, 3], { key: 'value' }, false)
                .catch(errorToJson),
        ).rejects.toEqual({
            code: ErrorCodes.Disconnected,
            details: null,
            message: '',
        })
    })
    test('request, reply, reply', async () => {
        const onDisconnect = jest.fn()
        const onData = jest.fn(message => {
            stream2.write({
                ...message,
                data: replyData,
                name: undefined,
                type: MessageType.CALL_REPLY,
            })
            stream2.write({
                ...message,
                data: replyData,
                name: undefined,
                type: MessageType.CALL_REPLY,
            })
        })
        stream2.on('data', onData)
        await expect(
            proxy1.action1(1, 'abc', [1, 2, 3], { key: 'value' }, false),
        ).resolves.toBe(replyData)
        expect(onDisconnect).not.toHaveBeenCalled()
    })
    test('request, error, error', async () => {
        const onDisconnect = jest.fn()
        const onData = jest.fn(message => {
            stream2.write({
                ...message,
                data: errorData,
                name: undefined,
                type: MessageType.CALL_ERROR,
            })
            stream2.write({
                ...message,
                data: errorData,
                name: undefined,
                type: MessageType.CALL_ERROR,
            })
        })
        stream2.on('data', onData)
        await expect(
            proxy2
                .action1(1, 'abc', [1, 2, 3], { key: 'value' }, false)
                .catch(errorToJson),
        ).rejects.toEqual(errorData)
        expect(onDisconnect).not.toHaveBeenCalled()
    })
    test('request, disconnect', async () => {
        const promise = proxy1
            .action1(1, 'abc', [1, 2, 3], { key: 'value' }, false)
            .catch(errorToJson)
        connection.disconnect()
        await expect(promise).rejects.toEqual({
            code: ErrorCodes.Disconnected,
            details: null,
            message: '',
        })
    })
    test('request, destroy stream', async () => {
        const promise = proxy1
            .action1(1, 'abc', [1, 2, 3], { key: 'value' }, false)
            .catch(errorToJson)
        stream1.destroy()
        await expect(promise).rejects.toEqual({
            code: ErrorCodes.Disconnected,
            details: null,
            message: '',
        })
    })
    test('disconnect, request', async () => {
        connection.disconnect()
        const promise = proxy1
            .action1(1, 'abc', [1, 2, 3], { key: 'value' }, false)
            .catch(errorToJson)
        await expect(promise).rejects.toEqual({
            code: ErrorCodes.Disconnected,
            details: null,
            message: '',
        })
    })
    test('concurrent requests - 2 proxies', async () => {
        const onData = jest.fn(message => {
            stream2.write({
                ...message,
                data: message.data.length,
                name: undefined,
                type: MessageType.CALL_REPLY,
            })
        })
        stream2.on('data', onData)
        const promise1 = proxy1.action1(
            1,
            'abc',
            [1, 2, 3],
            { key: 'value' },
            false,
        )
        const promise2 = proxy2.action1()
        await expect(promise1).resolves.toBe(5)
        await expect(promise2).resolves.toBe(0)
    })
    test('concurrent requests - 1 proxy, 2 actions', async () => {
        const onData = jest.fn(message => {
            stream2.write({
                ...message,
                data: message.data.length,
                name: undefined,
                type: MessageType.CALL_REPLY,
            })
        })
        stream2.on('data', onData)
        const promise1 = proxy1.action1(
            1,
            'abc',
            [1, 2, 3],
            { key: 'value' },
            false,
        )
        const promise2 = proxy1.action2()
        await expect(promise1).resolves.toBe(5)
        await expect(promise2).resolves.toBe(0)
    })
    test('concurrent requests - 1 proxy, 1 action', async () => {
        const onData = jest.fn(message => {
            stream2.write({
                ...message,
                data: message.data.length,
                name: undefined,
                type: MessageType.CALL_REPLY,
            })
        })
        stream2.on('data', onData)
        const promise1 = proxy1.action1(
            1,
            'abc',
            [1, 2, 3],
            { key: 'value' },
            false,
        )
        const promise2 = proxy1.action1()
        await expect(promise1).resolves.toBe(5)
        await expect(promise2).resolves.toBe(0)
    })
})

describe('no service', () => {
    const message = {
        data: null,
        id: 0,
        name: 'name-1',
        service: 'service-1',
        type: MessageType.EVENT,
    }
    beforeEach(() => {
        connection.connect(stream1)
    })
    test.each([
        ['action', MessageType.CALL_REQUEST, MessageType.CALL_ERROR],
        ['stream', MessageType.STREAM_OPEN, MessageType.STREAM_OUTPUT_ERROR],
    ])('%s', async (_, inputCode, outputCode) => {
        const onData = jest.fn()
        stream2.on('data', onData)
        stream2.write({
            ...message,
            type: inputCode,
        })
        await delay()
        expect(onData.mock.calls.length).toBe(1)
        expect(onData.mock.calls[0][0]).toEqual({
            ...message,
            data: {
                code: 'NoService',
                details: null,
                message: '',
            },
            name: null,
            type: outputCode,
        })
    })
})
