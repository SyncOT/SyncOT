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
                    .catch(e => Promise.reject(e.toJSON())),
            ).rejects.toEqual(errorData)
        },
    )
})
