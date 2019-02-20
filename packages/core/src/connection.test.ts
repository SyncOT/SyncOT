import { EventEmitter } from 'events'
import { Duplex } from 'stream'
import {
    Connection,
    createConnection,
    ErrorCodes,
    invertedStreams,
    JsonValue,
    Message,
    MessageType,
    Proxy,
    Service,
    SyncOtError,
} from '.'

const name = 'service-or-proxy-name'
const error = new Error('test error')
const testErrorMatcher = expect.objectContaining({
    message: 'test error',
    name: 'Error',
})
let connection: Connection
let stream1: Duplex
let stream2: Duplex
let instance: EventEmitter
const delay = () => new Promise(resolve => setTimeout(resolve, 0))

const errorMatcher = (errorName: string, errorMessage: string) =>
    expect.objectContaining({ message: errorMessage, name: errorName })
const syncOterrorMatcher = (code: ErrorCodes, message: string = '') =>
    expect.objectContaining({
        code,
        message,
        name: 'Error',
    })

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
        const connectedCallback = jest.fn()
        connection.on('connect', connectedCallback)
        connection.connect(stream1)
        expect(() => connection.connect(stream1)).toThrow(
            syncOterrorMatcher(ErrorCodes.AlreadyConnected),
        )
        expect(connection.isConnected()).toBe(true)
        expect(connectedCallback).toHaveBeenCalledTimes(1)
    })
    test('connect with an invalid stream', () => {
        expect(() => connection.connect({} as any)).toThrow(
            errorMatcher(
                'AssertionError [ERR_ASSERTION]',
                'Argument "stream" must be a Duplex.',
            ),
        )
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
        expect(() =>
            connection.registerService({ name, instance: {} as any }),
        ).toThrow(
            errorMatcher(
                'AssertionError [ERR_ASSERTION]',
                'Argument "instance" must be an EventEmitter.',
            ),
        )
    })
    test('register with events - currently unimplemented', () => {
        expect(() =>
            connection.registerService({
                events: new Set(['eventName']),
                instance,
                name,
            }),
        ).toThrow(
            errorMatcher(
                'SyncOtError NotImplemented',
                'Connection events not implemented',
            ),
        )
    })
    test('register with streams - currently unimplemented', () => {
        expect(() =>
            connection.registerService({
                instance,
                name,
                streams: new Set(['streamName']),
            }),
        ).toThrow(
            errorMatcher(
                'SyncOtError NotImplemented',
                'Connection streams not implemented',
            ),
        )
    })
    test('register with a missing action', () => {
        ;(instance as any).testAction = () => null
        expect(() =>
            connection.registerService({
                actions: new Set(['testAction', 'anotherAction']),
                instance,
                name,
            }),
        ).toThrow(
            errorMatcher(
                'AssertionError [ERR_ASSERTION]',
                'Service.anotherAction must be a function.',
            ),
        )
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
        connection.registerService({
            instance,
            name,
        })
        expect(() =>
            connection.registerService({
                instance: new EventEmitter(),
                name,
            }),
        ).toThrow(syncOterrorMatcher(ErrorCodes.DuplicateService))
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
        expect(() =>
            connection.registerProxy({ events: new Set(['eventName']), name }),
        ).toThrow(
            errorMatcher(
                'SyncOtError NotImplemented',
                'Connection events not implemented',
            ),
        )
    })
    test('register with streams - currently unimplemented', () => {
        expect(() =>
            connection.registerProxy({
                name,
                streams: new Set(['streamName']),
            }),
        ).toThrow(
            errorMatcher(
                'SyncOtError NotImplemented',
                'Connection streams not implemented',
            ),
        )
    })
    test('register with an action conflict', () => {
        expect(() =>
            connection.registerProxy({
                actions: new Set(['testAction', 'addListener']),
                name,
            }),
        ).toThrow(
            errorMatcher(
                'AssertionError [ERR_ASSERTION]',
                'Proxy.addListener already exists.',
            ),
        )
    })
    test('register', () => {
        connection.registerProxy({
            actions: new Set(['testAction', 'anotherAction']),
            name,
        })
    })
    test('register twice', () => {
        connection.registerProxy({ name })
        expect(() => connection.registerProxy({ name })).toThrow(
            syncOterrorMatcher(ErrorCodes.DuplicateProxy),
        )
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
    test.each([
        ['invalid message', true, null],
        ['invalid data (undefined)', { ...message, data: undefined }, 'data'],
        ['invalid data (function)', { ...message, data: () => null }, 'data'],
        [
            'invalid data ({}; message type: CALL_REQUEST)',
            { ...message, data: {}, type: MessageType.CALL_REQUEST },
            'data',
        ],
        [
            'invalid data ({}; message type: STREAM_OPEN)',
            { ...message, data: {}, type: MessageType.STREAM_OPEN },
            'data',
        ],
        [
            'invalid data ({}; message type: CALL_ERROR)',
            { ...message, data: {}, name: null, type: MessageType.CALL_ERROR },
            'data',
        ],
        [
            'invalid data ({}; message type: STREAM_INPUT_ERROR)',
            {
                ...message,
                data: {},
                name: null,
                type: MessageType.STREAM_INPUT_ERROR,
            },
            'data',
        ],
        [
            'invalid data ({}; message type: STREAM_OUTPUT_ERROR)',
            {
                ...message,
                data: {},
                name: null,
                type: MessageType.STREAM_OUTPUT_ERROR,
            },
            'data',
        ],
        ['invalid data (symbol)', { ...message, data: Symbol() }, 'data'],
        ['invalid id', { ...message, id: 0.5 }, 'id'],
        [
            'invalid name (type=EVENT)',
            { ...message, type: MessageType.EVENT, name: undefined },
            'name',
        ],
        [
            'invalid name (type=CALL_REQUEST)',
            { ...message, type: MessageType.CALL_REQUEST, name: undefined },
            'name',
        ],
        [
            'invalid name (type=STREAM_OPEN)',
            { ...message, type: MessageType.STREAM_OPEN, name: undefined },
            'name',
        ],
        [
            'invalid name (type=CALL_REPLY)',
            { ...message, type: MessageType.CALL_REPLY },
            'name',
        ],
        [
            'invalid name (type=CALL_ERROR)',
            { ...message, type: MessageType.CALL_ERROR },
            'name',
        ],
        [
            'invalid name (type=STREAM_INPUT_DATA)',
            { ...message, type: MessageType.STREAM_INPUT_DATA },
            'name',
        ],
        [
            'invalid name (type=STREAM_INPUT_END)',
            { ...message, type: MessageType.STREAM_INPUT_END },
            'name',
        ],
        [
            'invalid name (type=STREAM_INPUT_ERROR)',
            { ...message, type: MessageType.STREAM_INPUT_ERROR },
            'name',
        ],
        [
            'invalid name (type=STREAM_OUTPUT_DATA)',
            { ...message, type: MessageType.STREAM_OUTPUT_DATA },
            'name',
        ],
        [
            'invalid name (type=STREAM_OUTPUT_END)',
            { ...message, type: MessageType.STREAM_OUTPUT_END },
            'name',
        ],
        [
            'invalid name (type=STREAM_OUTPUT_ERROR)',
            { ...message, type: MessageType.STREAM_OUTPUT_ERROR },
            'name',
        ],
        ['invalid service', { ...message, service: undefined }, 'service'],
        ['invalid type (too small)', { ...message, type: -1 }, 'type'],
        ['invalid type (too big)', { ...message, type: 11 }, 'type'],
    ])('%s', async (_, invalidMessage, property) => {
        const onDisconnect = jest.fn()
        connection.on('disconnect', onDisconnect)
        stream2.write(invalidMessage)
        await delay()
        expect(onDisconnect.mock.calls.length).toBe(1)
        expect(onDisconnect.mock.calls[0][0]).toBeInstanceOf(SyncOtError)
        expect(onDisconnect.mock.calls[0][0].code).toBe(
            ErrorCodes.InvalidMessage,
        )
        expect(onDisconnect.mock.calls[0][0].details.message).toBe(
            invalidMessage,
        )
        expect(onDisconnect.mock.calls[0][0].details.property).toBe(property)
    })
    test.each([
        ['valid message', { ...message }],
        ['valid message (type=EVENT)', { ...message, type: MessageType.EVENT }],
        [
            'valid type (CALL_REQUEST)',
            { ...message, type: MessageType.CALL_REQUEST },
        ],
        [
            'valid type (CALL_REPLY)',
            { ...message, name: undefined, type: MessageType.CALL_REPLY },
        ],
        [
            'valid type (CALL_ERROR)',
            {
                ...message,
                data: error,
                name: undefined,
                type: MessageType.CALL_ERROR,
            },
        ],
        [
            'valid type (STREAM_OPEN)',
            { ...message, type: MessageType.STREAM_OPEN },
        ],
        [
            'valid type (STREAM_INPUT_DATA)',
            {
                ...message,
                name: undefined,
                type: MessageType.STREAM_INPUT_DATA,
            },
        ],
        [
            'valid type (STREAM_INPUT_END)',
            {
                ...message,
                name: undefined,
                type: MessageType.STREAM_INPUT_END,
            },
        ],
        [
            'valid type (STREAM_INPUT_ERROR)',
            {
                ...message,
                data: error,
                name: undefined,
                type: MessageType.STREAM_INPUT_ERROR,
            },
        ],
        [
            'valid type (STREAM_OUTPUT_DATA)',
            {
                ...message,
                name: undefined,
                type: MessageType.STREAM_OUTPUT_DATA,
            },
        ],
        [
            'valid type (STREAM_OUTPUT_END)',
            {
                ...message,
                name: undefined,
                type: MessageType.STREAM_OUTPUT_END,
            },
        ],
        [
            'valid type (STREAM_OUTPUT_ERROR)',
            {
                ...message,
                data: error,
                name: undefined,
                type: MessageType.STREAM_OUTPUT_ERROR,
            },
        ],
        ['valid data (null)', { ...message, data: null }],
        ['valid data (object)', { ...message, data: {} }],
        ['valid data (Array)', { ...message, data: [] }],
        [
            'valid data (Array; type: CALL_REQUEST)',
            { ...message, data: [], type: MessageType.CALL_REQUEST },
        ],
        [
            'valid data (Array; type: STREAM_OPEN)',
            { ...message, data: [], type: MessageType.STREAM_OPEN },
        ],
        ['valid data (string)', { ...message, data: '' }],
        ['valid data (number)', { ...message, data: 0 }],
        ['valid data (boolean)', { ...message, data: false }],
    ])('%s', async (_, validMessage) => {
        const onDisconnect = jest.fn()
        connection.on('disconnect', onDisconnect)
        stream2.write(validMessage)
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
            'action for an unregistered service',
            'unregistered-service',
            MessageType.CALL_REQUEST,
            MessageType.CALL_ERROR,
        ],
        [
            'stream for an unregistered service',
            'unregistered-service',
            MessageType.STREAM_OPEN,
            MessageType.STREAM_OUTPUT_ERROR,
        ],
        [
            'action for a registered service',
            'a-service',
            MessageType.CALL_REQUEST,
            MessageType.CALL_ERROR,
        ],
        [
            'stream for a registered service',
            'a-service',
            MessageType.STREAM_OPEN,
            MessageType.STREAM_OUTPUT_ERROR,
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
        expect(onData.mock.calls.length).toBe(1)
        expect(onData.mock.calls[0][0]).toEqual({
            ...message,
            data: syncOterrorMatcher(ErrorCodes.NoService),
            name: null,
            service: serviceName,
            type: outputCode,
        })
    })
})

describe('service and proxy', () => {
    interface TestService extends Service, Proxy {
        returnMethod(...args: JsonValue[]): Promise<JsonValue>
        resolveMethod(...args: JsonValue[]): Promise<JsonValue>
        throwErrorMethod(...args: JsonValue[]): Promise<JsonValue>
        rejectErrorMethod(...args: JsonValue[]): Promise<JsonValue>
    }
    type TestProxy = TestService
    let proxy: TestProxy
    let service: TestService
    const serviceName = 'a-service'
    const actions = new Set([
        'returnMethod',
        'resolveMethod',
        'throwErrorMethod',
        'rejectErrorMethod',
    ])
    const params = ['abc', 5, true, { key: 'value' }, [1, 2, 3]]
    const replyData = {
        anotherKey: 'value',
        reply: 'data',
    }

    beforeEach(() => {
        service = new EventEmitter() as TestService
        service.returnMethod = jest.fn(() => 5 as any)
        service.resolveMethod = jest.fn(() => Promise.resolve(5))
        service.throwErrorMethod = jest.fn(() => {
            throw error
        })
        service.rejectErrorMethod = jest.fn(() => Promise.reject(error))
        connection.connect(stream1)
        connection.registerService({
            actions,
            instance: service,
            name: serviceName,
        })
        connection.registerProxy({
            actions,
            name: serviceName,
        })
        proxy = connection.getProxy(serviceName) as TestProxy
    })

    describe('service actions', () => {
        const message: Message = {
            data: [],
            id: 0,
            name: 'returnMethod',
            service: serviceName,
            type: MessageType.CALL_REQUEST,
        }
        test.each([
            [
                'returnMethod',
                {
                    ...message,
                    data: 5,
                    name: null,
                    type: MessageType.CALL_REPLY,
                },
            ],
            [
                'resolveMethod',
                {
                    ...message,
                    data: 5,
                    name: null,
                    type: MessageType.CALL_REPLY,
                },
            ],
            [
                'throwErrorMethod',
                {
                    ...message,
                    data: testErrorMatcher,
                    name: null,
                    type: MessageType.CALL_ERROR,
                },
            ],
            [
                'rejectErrorMethod',
                {
                    ...message,
                    data: testErrorMatcher,
                    name: null,
                    type: MessageType.CALL_ERROR,
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
                type: MessageType.CALL_REPLY,
            })
            const returnMethod = service.returnMethod as any
            expect(returnMethod.mock.calls.length).toBe(1)
            expect(returnMethod.mock.calls[0]).toEqual(params)
            expect(returnMethod.mock.instances[0]).toBe(service)
        })
        test.each([
            [5],
            ['abc'],
            [true],
            [null],
            [[1, 2, 3]],
            [{ key: 'value' }],
            [undefined],
            [() => true],
            [Symbol()],
        ])('service returned value: %p', async value => {
            ;(service.returnMethod as any).mockReturnValue(value)
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
                type: MessageType.CALL_REPLY,
            })
        })
        test('disconnect before resolving', async () => {
            const onData = jest.fn()
            const noop = () => undefined
            let resolvePromise: () => void = noop
            const promise = new Promise(
                (resolve, _) => (resolvePromise = resolve),
            )
            ;(service.returnMethod as any).mockReturnValue(promise)
            stream2.on('data', onData)
            stream2.write(message)
            await delay()
            expect(resolvePromise).not.toBe(noop)
            connection.disconnect()
            resolvePromise()
            await delay()
            expect(onData).not.toHaveBeenCalled()
        })
        test('disconnect before rejecting', async () => {
            const onData = jest.fn()
            const noop = () => undefined
            let rejectPromise: (error: Error) => void = noop
            const promise = new Promise((_, reject) => (rejectPromise = reject))
            ;(service.returnMethod as any).mockReturnValue(promise)
            stream2.on('data', onData)
            stream2.write(message)
            await delay()
            expect(rejectPromise).not.toBe(noop)
            connection.disconnect()
            rejectPromise(error)
            await delay()
            expect(onData).not.toHaveBeenCalled()
        })
        test('destroy stream before resolving', async () => {
            const onData = jest.fn()
            const noop = () => undefined
            let resolvePromise: () => void = noop
            const promise = new Promise(
                (resolve, _) => (resolvePromise = resolve),
            )
            ;(service.returnMethod as any).mockReturnValue(promise)
            stream2.on('data', onData)
            stream2.write(message)
            await delay()
            expect(resolvePromise).not.toBe(noop)
            stream1.destroy()
            resolvePromise()
            await delay()
            expect(onData).not.toHaveBeenCalled()
        })
        test('destroy stream before rejecting', async () => {
            const onData = jest.fn()
            const noop = () => undefined
            let rejectPromise: (error: Error) => void = noop
            const promise = new Promise((_, reject) => (rejectPromise = reject))
            ;(service.returnMethod as any).mockReturnValue(promise)
            stream2.on('data', onData)
            stream2.write(message)
            await delay()
            expect(rejectPromise).not.toBe(noop)
            stream1.destroy()
            rejectPromise(error)
            await delay()
            expect(onData).not.toHaveBeenCalled()
        })
    })

    describe('proxy actions', () => {
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
                    proxy.returnMethod(
                        1,
                        'abc',
                        [1, 2, 3],
                        { key: 'value' },
                        false,
                    ),
                ).resolves.toBe(replyData)
            },
        )
        test.each([null, undefined])(
            'request, error (error action name: %s)',
            async (actionName: string) => {
                const onData = jest.fn(message => {
                    stream2.write({
                        ...message,
                        data: error,
                        name: actionName,
                        type: MessageType.CALL_ERROR,
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
            },
        )
        test(`request, reply (reply action name: returnMethod)`, async () => {
            const onData = jest.fn(message => {
                stream2.write({
                    ...message,
                    data: replyData,
                    name: 'returnMethod',
                    type: MessageType.CALL_REPLY,
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
            ).rejects.toEqual(syncOterrorMatcher(ErrorCodes.Disconnected))
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
        test('request, error, error', async () => {
            const onDisconnect = jest.fn()
            const onData = jest.fn(message => {
                stream2.write({
                    ...message,
                    data: error,
                    name: undefined,
                    type: MessageType.CALL_ERROR,
                })
                stream2.write({
                    ...message,
                    data: error,
                    name: undefined,
                    type: MessageType.CALL_ERROR,
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
                syncOterrorMatcher(ErrorCodes.Disconnected),
            )
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
                syncOterrorMatcher(ErrorCodes.Disconnected),
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
                syncOterrorMatcher(ErrorCodes.Disconnected),
            )
        })
        test('concurrent requests - 2 proxies', async () => {
            connection.registerProxy({ actions, name: 'proxy-2' })
            const proxy2 = connection.getProxy('proxy-2') as TestProxy
            const onData = jest.fn(message => {
                stream2.write({
                    ...message,
                    data: message.data.length,
                    name: undefined,
                    type: MessageType.CALL_REPLY,
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
            const onData = jest.fn(message => {
                stream2.write({
                    ...message,
                    data: message.data,
                    name: undefined,
                    type: MessageType.CALL_REPLY,
                })
            })
            stream2.on('data', onData)
            // The Proxy will send an Array of arguments. Connection verifies only
            // that the data is an Array and does not look inside for performance reasons.
            const promise = proxy.returnMethod(...invalidParams)
            await expect(promise).resolves.toEqual(invalidParams)
        })
    })

    describe('service/proxy interaction', () => {
        let connection2: Connection
        let proxy2: TestProxy

        beforeEach(() => {
            connection2 = createConnection()
            connection2.connect(stream2)
            connection2.registerProxy({ actions, name: serviceName })
            proxy2 = connection2.getProxy(serviceName) as TestProxy
        })

        test('request, reply', async () => {
            ;(service.returnMethod as any).mockResolvedValue(replyData)
            await expect(proxy2.returnMethod(...params)).resolves.toEqual(
                replyData,
            )
            const returnMethod = service.returnMethod as any
            expect(returnMethod.mock.calls.length).toBe(1)
            expect(returnMethod.mock.calls[0]).toEqual(params)
            expect(returnMethod.mock.instances[0]).toBe(service)
        })
        test('request, error', async () => {
            ;(service.returnMethod as any).mockImplementation(() =>
                Promise.reject(error),
            )
            await expect(proxy2.returnMethod(...params)).rejects.toEqual(
                testErrorMatcher,
            )
            const returnMethod = service.returnMethod as any
            expect(returnMethod.mock.calls.length).toBe(1)
            expect(returnMethod.mock.calls[0]).toEqual(params)
            expect(returnMethod.mock.instances[0]).toBe(service)
        })
    })
})
