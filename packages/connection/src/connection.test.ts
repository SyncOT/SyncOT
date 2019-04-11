import { invertedStreams } from '@syncot/util'
import { Duplex } from 'stream'
import {
    Connection,
    createConnection,
    Message,
    MessageType,
    Proxy,
    RegisteredProxyDescriptor,
    RegisteredServiceDescriptor,
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
const alreadyDestroyedMatcher = expect.objectContaining({
    message: 'Already destroyed.',
    name: 'AssertionError [ERR_ASSERTION]',
})
let connection: Connection
let stream1: Duplex
let stream2: Duplex
let instance: {
    testMethod?: (..._args: any) => any
    anotherMethod?: (..._args: any) => any
}
const delay = () => new Promise(resolve => setTimeout(resolve, 0))

const errorMatcher = (errorName: string, errorMessage: string) =>
    expect.objectContaining({ message: errorMessage, name: errorName })

beforeEach(() => {
    connection = createConnection()
    ;[stream1, stream2] = invertedStreams({ objectMode: true })
    instance = {}
})

describe('connection', () => {
    test('initially disconnected', () => {
        expect(connection.isConnected()).toBe(false)
    })
    test('connect', async () => {
        const connectedCallback = jest.fn()
        connection.on('connect', connectedCallback)
        connection.connect(stream1)
        expect(connection.isConnected()).toBe(true)
        await Promise.resolve()
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
        await Promise.resolve()
        expect(connectedCallback).not.toHaveBeenCalled()
        expect(disconnectedCallback).not.toHaveBeenCalled()
        expect(destroyedCallback).toHaveBeenCalledTimes(1)
    })
    test('destroy twice', async () => {
        const onDestroy = jest.fn()
        connection.on('destroy', onDestroy)
        connection.destroy()
        connection.destroy()
        await Promise.resolve()
        expect(onDestroy).toBeCalledTimes(1)
    })
    test('connect twice', async () => {
        const connectedCallback = jest.fn()
        connection.on('connect', connectedCallback)
        connection.connect(stream1)
        expect(() => connection.connect(stream1)).toThrow(
            errorMatcher(
                'AssertionError [ERR_ASSERTION]',
                'Connection is already associated with a stream.',
            ),
        )
        expect(connection.isConnected()).toBe(true)
        await Promise.resolve()
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
        const connectCallback = jest.fn()
        const disconnectCallback = jest.fn()
        const errorCallback = jest.fn()
        const closeCallback = jest.fn()
        connection.connect(stream1)
        connection.on('connect', connectCallback)
        connection.on('disconnect', disconnectCallback)
        connection.on('error', errorCallback)
        stream1.on('close', closeCallback)
        connection.disconnect()
        expect(connection.isConnected()).toBe(false)
        await Promise.resolve()
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
        await Promise.resolve()
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
        connection.connect(stream1)
        expect(connection.isConnected()).toBe(true)
        connection.disconnect()
        expect(connection.isConnected()).toBe(false)
        connection.connect(stream2)
        expect(connection.isConnected()).toBe(true)
        connection.disconnect()
        expect(connection.isConnected()).toBe(false)
        await Promise.resolve()
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
    test('stream error', async () => {
        const disconnectCallback = jest.fn()
        const errorCallback = jest.fn()
        connection.connect(stream1)
        connection.on('disconnect', disconnectCallback)
        connection.on('error', errorCallback)
        stream1.emit('error', error)
        await delay()
        expect(connection.isConnected()).toBe(false)
        expect(disconnectCallback).toHaveBeenCalledTimes(1)
        expect(errorCallback).toHaveBeenCalledTimes(1)
        expect(errorCallback).toHaveBeenCalledBefore(disconnectCallback)
        expect(errorCallback).toHaveBeenCalledWith(testErrorMatcher)
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
                'AssertionError [ERR_ASSERTION]',
                'Argument "instance" must be an object.',
            ),
        )
        expect(() =>
            connection.registerService({ name, instance: null as any }),
        ).toThrow(
            errorMatcher(
                'AssertionError [ERR_ASSERTION]',
                'Argument "instance" must be an object.',
            ),
        )
    })
    test('register with events - currently unimplemented', () => {
        expect(() =>
            connection.registerService({
                eventNames: new Set(['eventName']),
                instance,
                name,
            }),
        ).toThrow(
            errorMatcher(
                'AssertionError [ERR_ASSERTION]',
                'Connection events not implemented',
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
                'AssertionError [ERR_ASSERTION]',
                'Service.anotherMethod must be a function.',
            ),
        )
    })
    test('register', () => {
        instance.anotherMethod = () => null
        instance.testMethod = () => null
        connection.registerService({
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
                instance: {},
                name,
            }),
        ).toThrow(
            errorMatcher(
                'AssertionError [ERR_ASSERTION]',
                'Service "service-or-proxy-name" has been already registered.',
            ),
        )
    })
    test('get registered services', () => {
        const requestNames = new Set(['testMethod', 'anotherMethod'])
        const anotherName = 'another-service'
        const anotherInstance = { test: () => undefined }
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
        expect(connection.getServiceDescriptor(name)).toEqual({
            eventNames: new Set(),
            instance,
            name,
            requestNames,
        } as RegisteredServiceDescriptor)
        expect(connection.getService(name)).toBe(instance)
        expect(connection.getServiceDescriptor(anotherName)).toEqual({
            eventNames: new Set(),
            instance: anotherInstance,
            name: anotherName,
            requestNames: new Set(),
        } as RegisteredServiceDescriptor)
        expect(connection.getService(anotherName)).toBe(anotherInstance)
        expect(connection.getServiceDescriptor('missing')).toBe(undefined)
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
    test('register with events - currently unimplemented', () => {
        expect(() =>
            connection.registerProxy({
                eventNames: new Set(['eventName']),
                name,
            }),
        ).toThrow(
            errorMatcher(
                'AssertionError [ERR_ASSERTION]',
                'Connection events not implemented',
            ),
        )
    })
    test('register with a method conflict', () => {
        expect(() =>
            connection.registerProxy({
                name,
                requestNames: new Set(['testMethod', 'toString']),
            }),
        ).toThrow(
            errorMatcher(
                'AssertionError [ERR_ASSERTION]',
                'Proxy.toString already exists.',
            ),
        )
    })
    test('register', () => {
        connection.registerProxy({
            name,
            requestNames: new Set(['testMethod', 'anotherMethod']),
        })
    })
    test('register twice', () => {
        connection.registerProxy({ name })
        expect(() => connection.registerProxy({ name })).toThrow(
            errorMatcher(
                'AssertionError [ERR_ASSERTION]',
                'Proxy "service-or-proxy-name" has been already registered.',
            ),
        )
    })
    test('get registered proxies', () => {
        instance.testMethod = expect.any(Function)
        instance.anotherMethod = expect.any(Function)
        const requestNames = new Set(['testMethod', 'anotherMethod'])
        const anotherName = 'another-service'
        const anotherInstance = {}
        connection.registerProxy({ requestNames, name })
        connection.registerProxy({ name: anotherName })
        expect(connection.getProxyNames()).toEqual([name, anotherName])
        expect(connection.getProxyDescriptor(name)).toEqual({
            eventNames: new Set(),
            instance,
            name,
            requestNames,
        } as RegisteredProxyDescriptor)
        expect(connection.getProxy(name)).toEqual(instance)
        expect(connection.getProxyDescriptor(anotherName)).toEqual({
            eventNames: new Set(),
            instance: anotherInstance,
            name: anotherName,
            requestNames: new Set(),
        } as RegisteredProxyDescriptor)
        expect(connection.getProxy(anotherName)).toEqual(anotherInstance)
        expect(connection.getProxyDescriptor('missing')).toBe(undefined)
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
        ['invalid data (missing)', omit(message, 'data'), 'data'],
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
            { ...message, type: MessageType.STREAM_INPUT_END },
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
        ['invalid service', { ...message, service: undefined }, 'service'],
        [
            'invalid type (too small)',
            { ...message, type: MessageType.EVENT - 1 },
            'type',
        ],
        [
            'invalid type (too big)',
            { ...message, type: MessageType.STREAM_OUTPUT_END + 1 },
            'type',
        ],
    ])('%s', async (_, invalidMessage, property) => {
        const onDisconnect = jest.fn()
        const onError = jest.fn()
        connection.on('disconnect', onDisconnect)
        connection.on('error', onError)
        stream2.write(invalidMessage)
        await delay()
        expect(connection.isConnected()).toBe(false)
        expect(onDisconnect).toHaveBeenCalledTimes(1)
        expect(onError).toHaveBeenCalledTimes(1)
        expect(onError).toHaveBeenCalledBefore(onDisconnect)
        expect(onError).toHaveBeenCalledWith(
            expect.objectContaining({
                entity: invalidMessage,
                entityName: 'Message',
                key: property,
                message:
                    property == null
                        ? 'Invalid "Message".'
                        : `Invalid "Message.${property}".`,
                name: 'SyncOtError InvalidEntity',
            }),
        )
    })
    test.each<[string, { [P in keyof Message]: any }]>([
        ['valid message', { ...message }],
        ['valid message (type=EVENT)', { ...message, type: MessageType.EVENT }],
        ['valid type (REQUEST)', { ...message, type: MessageType.REQUEST }],
        [
            'valid type (REPLY_VALUE)',
            { ...message, name: undefined, type: MessageType.REPLY_VALUE },
        ],
        [
            'valid type (REPLY_ERROR)',
            {
                ...message,
                data: error,
                name: undefined,
                type: MessageType.REPLY_ERROR,
            },
        ],
        [
            'valid type (REPLY_STREAM)',
            {
                ...message,
                data: undefined,
                name: undefined,
                type: MessageType.REPLY_STREAM,
            },
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
        ['valid data (null)', { ...message, data: null }],
        [
            'valid data (null; type: REPLY_STREAM)',
            {
                ...message,
                data: null,
                name: null,
                type: MessageType.REPLY_STREAM,
            },
        ],
        ['valid data (object)', { ...message, data: {} }],
        ['valid data (Array)', { ...message, data: [] }],
        [
            'valid data (Array; type: REQUEST)',
            { ...message, data: [], type: MessageType.REQUEST },
        ],
        ['valid data (string)', { ...message, data: '' }],
        ['valid data (number)', { ...message, data: 0 }],
        ['valid data (boolean)', { ...message, data: false }],
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
        ['STREAM_OUTPUT_DATA', MessageType.STREAM_OUTPUT_DATA, 7],
        ['STREAM_OUTPUT_END', MessageType.STREAM_OUTPUT_END, 8],
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
            instance: {},
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
                    'SyncOtError NoService',
                    `No service to handle the request for "${serviceName}.${
                        message.name
                    }".`,
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
        throwErrorMethod: jest.Mock<never, any[]>
        throwNonErrorMethod: jest.Mock<never, any[]>
        rejectErrorMethod: jest.Mock<Promise<never>, any[]>
        rejectNonErrorMethod: jest.Mock<Promise<never>, any[]>
    }
    interface TestProxy extends Proxy {
        returnMethod: jest.Mock<Promise<any>, any[]>
        resolveMethod: jest.Mock<Promise<any>, any[]>
        throwErrorMethod: jest.Mock<Promise<never>, any[]>
        throwNonErrorMethod: jest.Mock<Promise<never>, any[]>
        rejectErrorMethod: jest.Mock<Promise<never>, any[]>
        rejectNonErrorMethod: jest.Mock<Promise<never>, any[]>
    }
    let proxy: TestProxy
    let service: TestService
    const serviceName = 'a-service'
    const requestNames = new Set([
        'returnMethod',
        'resolveMethod',
        'throwErrorMethod',
        'throwNonErrorMethod',
        'rejectErrorMethod',
        'rejectNonErrorMethod',
    ])
    const params = ['abc', 5, true, { key: 'value' }, [1, 2, 3]]
    const replyData = {
        anotherKey: 'value',
        reply: 'data',
    }

    beforeEach(() => {
        service = {
            rejectErrorMethod: jest.fn((..._args: any[]) =>
                Promise.reject(error),
            ),
            rejectNonErrorMethod: jest.fn((..._args: any[]) =>
                Promise.reject(5),
            ),
            resolveMethod: jest.fn((..._args: any[]) => Promise.resolve(5)),
            returnMethod: jest.fn((..._args: any[]) => 5),
            throwErrorMethod: jest.fn((..._args: any[]) => {
                throw error
            }),
            throwNonErrorMethod: jest.fn((..._args: any[]) => {
                throw 5
            }),
        }
        connection.connect(stream1)
        connection.registerService({
            instance: service,
            name: serviceName,
            requestNames,
        })
        connection.registerProxy({
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
        test.each(['throwNonErrorMethod', 'rejectNonErrorMethod'])(
            '%s',
            async method => {
                const onError = jest.fn()
                const onDisconnect = jest.fn()
                connection.on('error', onError)
                connection.on('disconnect', onDisconnect)
                stream2.write({
                    ...message,
                    name: method,
                })
                await delay()
                expect(onDisconnect).toHaveBeenCalledTimes(1)
                expect(onError).toHaveBeenCalledTimes(1)
                expect(onError).toHaveBeenCalledBefore(onDisconnect)
                expect(onError).toHaveBeenCalledWith(
                    expect.objectContaining({
                        message: 'Invalid "Message.data".',
                        name: 'SyncOtError InvalidEntity',
                    }),
                )
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
        ])('service returned value: %p', async value => {
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
        test('disconnect before resolving', async () => {
            const onData = jest.fn()
            const noop = () => undefined
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
            const noop = () => undefined
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
            const onError = jest.fn()
            const onDisconnect = jest.fn()
            connection.on('disconnect', onDisconnect)
            connection.on('error', onError)
            const noop = () => undefined
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
            expect(onError).toHaveBeenCalledTimes(1)
            expect(onError).toHaveBeenCalledBefore(onDisconnect)
            expect(onError).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Cannot call write after a stream was destroyed',
                    name: 'Error [ERR_STREAM_DESTROYED]',
                }),
            )
        })
        test('destroy stream before rejecting', async () => {
            const onData = jest.fn()
            const onError = jest.fn()
            const onDisconnect = jest.fn()
            connection.on('disconnect', onDisconnect)
            connection.on('error', onError)
            const noop = () => undefined
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
            expect(onError).toHaveBeenCalledTimes(1)
            expect(onError).toHaveBeenCalledBefore(onDisconnect)
            expect(onError).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Cannot call write after a stream was destroyed',
                    name: 'Error [ERR_STREAM_DESTROYED]',
                }),
            )
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
            ;[stream1, stream2] = invertedStreams({ objectMode: true })
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
            ;[stream1, stream2] = invertedStreams({ objectMode: true })
            stream2.on('data', onData2)
            connection.connect(stream1)
            rejectPromise(error)
            await delay()
            expect(onData1).not.toHaveBeenCalled()
            expect(onData2).not.toHaveBeenCalled()
        })
    })

    describe('proxy requests', () => {
        test.each([null, undefined])(
            'request, reply (reply name: %s)',
            async replyName => {
                const onData = jest.fn(message => {
                    stream2.write({
                        ...message,
                        data: replyData,
                        name: replyName,
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
            },
        )
        test.each([null, undefined])(
            'request, error (error name: %s)',
            async replyName => {
                const onData = jest.fn(message => {
                    stream2.write({
                        ...message,
                        data: error,
                        name: replyName,
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
            },
        )
        test(`request, reply (reply name: returnMethod)`, async () => {
            const onError = jest.fn()
            const onDisconnect = jest.fn()
            const onData = jest.fn(message => {
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
            await expect(
                proxy.returnMethod(
                    1,
                    'abc',
                    [1, 2, 3],
                    { key: 'value' },
                    false,
                ),
            ).rejects.toEqual(
                errorMatcher(
                    'SyncOtError Disconnected',
                    'Disconnected, request failed.',
                ),
            )
            expect(connection.isConnected()).toBe(false)
            expect(onDisconnect).toHaveBeenCalledTimes(1)
            expect(onError).toHaveBeenCalledTimes(1)
            expect(onError).toHaveBeenCalledBefore(onDisconnect)
            expect(onError).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Invalid "Message.name".',
                    name: 'SyncOtError InvalidEntity',
                }),
            )
        })
        test('request, reply, reply', async () => {
            const onDisconnect = jest.fn()
            const onData = jest.fn(message => {
                stream2.write({
                    ...message,
                    data: replyData,
                    name: undefined,
                    type: MessageType.REPLY_VALUE,
                })
                stream2.write({
                    ...message,
                    data: replyData,
                    name: undefined,
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
        test('request, error, error', async () => {
            const onDisconnect = jest.fn()
            const onData = jest.fn(message => {
                stream2.write({
                    ...message,
                    data: error,
                    name: undefined,
                    type: MessageType.REPLY_ERROR,
                })
                stream2.write({
                    ...message,
                    data: error,
                    name: undefined,
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
                    'SyncOtError Disconnected',
                    'Disconnected, request failed.',
                ),
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
                errorMatcher(
                    'SyncOtError Disconnected',
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
                    'SyncOtError Disconnected',
                    'Disconnected, request failed.',
                ),
            )
        })
        test('concurrent requests - 2 proxies', async () => {
            connection.registerProxy({ name: 'proxy-2', requestNames })
            const proxy2 = connection.getProxy('proxy-2') as TestProxy
            const onData = jest.fn(message => {
                stream2.write({
                    ...message,
                    data: message.data.length,
                    name: undefined,
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
            const onData = jest.fn(message => {
                stream2.write({
                    ...message,
                    data: message.data.length,
                    name: undefined,
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
            const onData = jest.fn(message => {
                stream2.write({
                    ...message,
                    data: message.data.length,
                    name: undefined,
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
            const onData = jest.fn(message => {
                stream2.write({
                    ...message,
                    data: message.data,
                    name: undefined,
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

    describe('service/proxy interaction', () => {
        let connection2: Connection
        let proxy2: TestProxy

        beforeEach(() => {
            connection2 = createConnection()
            connection2.connect(stream2)
            connection2.registerProxy({
                name: serviceName,
                requestNames,
            })
            proxy2 = connection2.getProxy(serviceName) as TestProxy
        })

        test('request, reply', async () => {
            service.returnMethod.mockReturnValue(replyData)
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
