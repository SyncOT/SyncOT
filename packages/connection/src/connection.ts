import {
    createInvalidEntityError,
    CustomError,
    fromJSON,
    isCustomError,
    toJSON,
} from '@syncot/error'
import { EmitterInterface, SyncOTEmitter } from '@syncot/events'
import { isOpenDuplexStream, isStream } from '@syncot/stream'
import { assert, validate, Validator } from '@syncot/util'
import { Duplex } from 'readable-stream'
import {
    createDisconnectedError,
    createDuplicateIdError,
    createInvalidStreamError,
    createNoServiceError,
} from './error'

type RequestId = number
type ServiceName = string
type ProxyName = string
type RequestName = string
type EventName = string

interface ProxyRequest {
    resolve: (value: any) => void
    reject: (error: Error) => void
}
type RequestMap = Map<RequestId, ProxyRequest>
type StreamMap = Map<RequestId, Duplex>
type Callback = (error: null | Error) => undefined

export type Service = object
export interface ServiceDescriptor {
    name: ServiceName
    eventNames?: Set<EventName>
    requestNames?: Set<RequestName>
    instance: Service
}
interface RegisteredServiceDescriptor extends Required<ServiceDescriptor> {
    streams: StreamMap
}

export type Proxy = object
export interface ProxyDescriptor {
    name: ProxyName
    eventNames?: Set<EventName>
    requestNames?: Set<RequestName>
}
interface RegisteredProxyDescriptor extends Required<ProxyDescriptor> {
    instance: Proxy
    requests: RequestMap
    streams: StreamMap
}

interface Events {
    connect: void
    disconnect: void
    error: Error
}

/**
 * The list of supported `Message` types.
 */
export enum MessageType {
    EVENT,
    REQUEST,
    REPLY_VALUE,
    REPLY_ERROR,
    REPLY_STREAM,
    STREAM_INPUT_DATA,
    STREAM_INPUT_END,
    STREAM_INPUT_DESTROY,
    STREAM_OUTPUT_DATA,
    STREAM_OUTPUT_END,
    STREAM_OUTPUT_DESTROY,
}

/**
 * Defines the format of messages exchanged over the stream by `Connection` instances.
 */
export type Message =
    | EventMessage
    | RequestMessage
    | ReplyValueMessage
    | ReplyErrorMessage
    | ReplyStreamMessage
    | StreamEndMessage
    | StreamDestroyMessage
    | StreamDataMessage

interface EventMessage {
    type: MessageType.EVENT
    service: ServiceName | ProxyName
    name: EventName | RequestName
    id: RequestId
    data: any
}
interface RequestMessage {
    type: MessageType.REQUEST
    service: ServiceName | ProxyName
    name: EventName | RequestName
    id: RequestId
    data: any[]
}
interface ReplyValueMessage {
    type: MessageType.REPLY_VALUE
    service: ServiceName | ProxyName
    name: null
    id: RequestId
    data: any
}
interface ReplyErrorMessage {
    type: MessageType.REPLY_ERROR
    service: ServiceName | ProxyName
    name: null
    id: RequestId
    data: CustomError
}
interface ReplyStreamMessage {
    type: MessageType.REPLY_STREAM
    service: ServiceName | ProxyName
    name: null
    id: RequestId
    data: null
}
interface StreamEndMessage {
    type: MessageType.STREAM_INPUT_END | MessageType.STREAM_OUTPUT_END
    service: ServiceName | ProxyName
    name: null
    id: RequestId
    data: null
}
interface StreamDestroyMessage {
    type: MessageType.STREAM_INPUT_DESTROY | MessageType.STREAM_OUTPUT_DESTROY
    service: ServiceName | ProxyName
    name: null
    id: RequestId
    data: null
}
interface StreamDataMessage {
    type: MessageType.STREAM_INPUT_DATA | MessageType.STREAM_OUTPUT_DATA
    service: ServiceName | ProxyName
    name: null
    id: RequestId
    data: any
}

const validateMessage: Validator<Message> = validate([
    (message) =>
        typeof message === 'object' && message !== null
            ? undefined
            : createInvalidEntityError('Message', message, null),
    (message) =>
        Number.isSafeInteger(message.type) &&
        message.type >= MessageType.EVENT &&
        message.type <= MessageType.STREAM_OUTPUT_DESTROY
            ? undefined
            : createInvalidEntityError('Message', message, 'type'),
    (message) =>
        typeof message.service === 'string'
            ? undefined
            : createInvalidEntityError('Message', message, 'service'),
    (message) =>
        (
            message.type === MessageType.EVENT ||
            message.type === MessageType.REQUEST
                ? typeof message.name === 'string'
                : message.name === null
        )
            ? undefined
            : createInvalidEntityError('Message', message, 'name'),
    (message) =>
        Number.isSafeInteger(message.id)
            ? undefined
            : createInvalidEntityError('Message', message, 'id'),
    (message) => {
        if (message.type === MessageType.REQUEST) {
            return Array.isArray(message.data)
                ? undefined
                : createInvalidEntityError('Message', message, 'data')
        }
        if (message.type === MessageType.REPLY_ERROR) {
            return isCustomError(message.data)
                ? undefined
                : createInvalidEntityError('Message', message, 'data')
        }
        if (message.type === MessageType.REPLY_STREAM) {
            return message.data === null
                ? undefined
                : createInvalidEntityError('Message', message, 'data')
        }
        if (
            message.type === MessageType.STREAM_INPUT_END ||
            message.type === MessageType.STREAM_OUTPUT_END
        ) {
            return message.data === null
                ? undefined
                : createInvalidEntityError('Message', message, 'data')
        }
        if (
            message.type === MessageType.STREAM_INPUT_DATA ||
            message.type === MessageType.STREAM_OUTPUT_DATA
        ) {
            return message.data != null
                ? undefined
                : createInvalidEntityError('Message', message, 'data')
        }
        if (
            message.type === MessageType.STREAM_INPUT_DESTROY ||
            message.type === MessageType.STREAM_OUTPUT_DESTROY
        ) {
            return message.data === null
                ? undefined
                : createInvalidEntityError('Message', message, 'data')
        }
        return message.hasOwnProperty('data')
            ? undefined
            : createInvalidEntityError('Message', message, 'data')
    },
])

class ConnectionImpl extends SyncOTEmitter<Events> {
    private stream: Duplex | null = null
    private services: Map<ServiceName, RegisteredServiceDescriptor> = new Map()
    private proxies: Map<ProxyName, RegisteredProxyDescriptor> = new Map()
    private _connectionId: number = 0

    /**
     * When disconnected, it is 0.
     * When connected, it is a positive integer which is incremented every time a connection
     * to a new stream is established.
     */
    public get connectionId(): number {
        return this.stream ? this._connectionId : 0
    }

    /**
     * Connects to the specified stream and emits the `'connect'` event.
     *
     * When the `stream` emits `close`, `end` or `finish`, `Connection#disconnect` is called automatically.
     *
     * Throws an error, if this connection is already associated with a different stream or
     * the specified `stream` is not a `Duplex` stream.
     *
     * @param stream The stream to connect to.
     */
    public connect(stream: Duplex): void {
        this.assertNotDestroyed()
        assert(
            isOpenDuplexStream(stream),
            'Argument "stream" must be an open Duplex.',
        )
        assert(!this.stream, 'Connection is already associated with a stream.')
        this.stream = stream
        this._connectionId++

        const onData = (data: Message) => {
            /* istanbul ignore else */
            if (this.stream === stream) {
                this.onData(data)
            }
        }

        const onDone = () => {
            if (this.stream === stream) {
                this.disconnect()
            }
        }

        stream.on('data', onData)
        stream.on('finish', onDone)
        stream.on('end', onDone)
        stream.on('close', onDone)

        this.emitAsync('connect')
    }

    /**
     * Destroys the stream associated with this connection and emits the `'disconnect'` event.
     * It is safe to call it at any time.
     * In order to reuse this `Connection`, call `connect` with a new stream.
     */
    public disconnect(): void {
        const stream = this.stream

        if (stream) {
            this.stream = null
            this.emitAsync('disconnect')
            this.cleanUpServiceStreams()
            this.cleanUpProxyStreams()
            this.cleanUpProxyRequests()
            stream.destroy()
        }
    }

    /**
     * Returns `true`, if this `Connection` is associated with a stream, otherwise `false`.
     */
    public isConnected(): boolean {
        return !!this.stream
    }

    /**
     * Registers a service which can be called through this connection.
     *
     * If any of the service's methods returns, or resolves to, a Duplex stream,
     * it will be automatically connected to a Duplex stream returned by a proxy which initiated
     * the method call. When using this feature, keep in mind the following limitations which apply
     * on both the service and proxy side, unless specified otherwise:
     *
     * - The stream is assumed to operate in object mode, so stream data may be of any type
     *   and encoding is not used.
     * - The stream is managed by the Connection until the Connection gets disconnected or
     *   the stream emits `close`, so make sure `close` is emitted in normal operation
     *   or you'll have a memory leak.
     * - Stream data equal to `undefined` is ignored.
     * - The stream returned by the proxy is configured with `allowHalfOpen=true` and `autoDestroy=false`.
     */
    public registerService({
        name: serviceName,
        eventNames = new Set(),
        requestNames = new Set(),
        instance,
    }: ServiceDescriptor): void {
        this.assertNotDestroyed()
        assert(
            instance != null && typeof instance === 'object',
            'Argument "instance" must be an object.',
        )
        assert(
            !this.services.has(serviceName),
            `Service "${serviceName}" has been already registered.`,
        )
        assert(eventNames.size === 0, 'Connection events not implemented')
        requestNames.forEach((requestName) => {
            assert(
                typeof (instance as any)[requestName] === 'function',
                `Service.${requestName} must be a function.`,
            )
        })

        this.services.set(serviceName, {
            eventNames,
            instance,
            name: serviceName,
            requestNames,
            streams: new Map(),
        })
    }

    public getServiceNames(): ServiceName[] {
        return Array.from(this.services.keys())
    }

    public getService(name: ServiceName): Service | undefined {
        const descriptor = this.services.get(name)
        return descriptor && descriptor.instance
    }

    public registerProxy({
        name: proxyName,
        requestNames = new Set(),
        eventNames = new Set(),
    }: ProxyDescriptor): void {
        this.assertNotDestroyed()
        assert(
            !this.proxies.has(proxyName),
            `Proxy "${proxyName}" has been already registered.`,
        )
        assert(eventNames.size === 0, 'Connection events not implemented')

        const instance = {}
        let nextRequestId = 1
        const proxyRequests: RequestMap = new Map()
        const proxyStreams: StreamMap = new Map()

        requestNames.forEach((requestName) => {
            assert(
                !(requestName in instance),
                `Proxy.${requestName} already exists.`,
            )
            ;(instance as any)[requestName] = (
                ...args: any[]
            ): Promise<any> => {
                if (this.stream) {
                    return new Promise((resolve, reject) => {
                        const requestId = nextRequestId++
                        proxyRequests.set(requestId, { resolve, reject })
                        this.send({
                            data: args,
                            id: requestId,
                            name: requestName,
                            service: proxyName,
                            type: MessageType.REQUEST,
                        })
                    })
                } else {
                    return Promise.reject(
                        createDisconnectedError(
                            'Disconnected, request failed.',
                        ),
                    )
                }
            }
        })

        this.proxies.set(proxyName, {
            eventNames,
            instance,
            name: proxyName,
            requestNames,
            requests: proxyRequests,
            streams: proxyStreams,
        })
    }

    public getProxyNames(): ProxyName[] {
        return Array.from(this.proxies.keys())
    }

    public getProxy(name: ProxyName): Proxy | undefined {
        const descriptor = this.proxies.get(name)
        return descriptor && descriptor.instance
    }

    public destroy(): void {
        if (this.destroyed) {
            return
        }
        this.disconnect()
        super.destroy()
    }

    private cleanUpServiceStreams(): void {
        for (const { streams } of this.services.values()) {
            for (const stream of streams.values()) {
                stream.destroy()
            }
            streams.clear()
        }
    }

    private cleanUpProxyStreams(): void {
        const error = createDisconnectedError('Disconnected, stream destroyed.')
        for (const { streams } of this.proxies.values()) {
            for (const stream of streams.values()) {
                if (stream.destroyed !== true) {
                    stream.destroy(error)
                }
            }
            streams.clear()
        }
    }

    private cleanUpProxyRequests(): void {
        const error = createDisconnectedError('Disconnected, request failed.')
        for (const { requests } of this.proxies.values()) {
            // Promises are resolved and rejected asynchronously, so it's safe to
            // iterate and clear the map directly without any risk of race conditions.
            for (const { reject } of requests.values()) {
                reject(error)
            }
            requests.clear()
        }
    }

    private send(message: Message): void {
        const error = validateMessage(message)
        // It should be impossible to send invalid data but check just in case.
        /* istanbul ignore if */
        if (error) {
            this.emitAsync('error', error)
        } else if (this.stream!.writable && !(this.stream as any).destroyed) {
            // Unfortunately, checking both `writable` and the private `destroyed`
            // property is necessary to ensure that writing is safe.
            this.stream!.write(message)
        }
    }

    private onData(message: Message): void {
        const error = validateMessage(message)
        if (error) {
            this.emitAsync('error', error)
        } else {
            this.onMessage(message)
        }
    }

    private onMessage(message: Message): void {
        const { id, name, service, type } = message
        if (
            type === MessageType.REQUEST ||
            type === MessageType.STREAM_INPUT_DATA ||
            type === MessageType.STREAM_INPUT_END ||
            type === MessageType.STREAM_INPUT_DESTROY
        ) {
            const serviceDescriptor = this.services.get(service)

            if (
                type === MessageType.REQUEST &&
                (!serviceDescriptor ||
                    !serviceDescriptor.requestNames.has(name!))
            ) {
                this.send({
                    data: toJSON(
                        createNoServiceError(
                            `No service to handle the request for "${service}.${name}".`,
                        ),
                    ),
                    id,
                    name: null,
                    service,
                    type: MessageType.REPLY_ERROR,
                })
            } else if (serviceDescriptor) {
                this.onServiceMessage(serviceDescriptor, message)
            }
        } else {
            const proxyDescriptor = this.proxies.get(service)

            if (proxyDescriptor) {
                this.onProxyMessage(proxyDescriptor, message)
            }
        }
    }

    private onServiceMessage(
        descriptor: RegisteredServiceDescriptor,
        message: Message,
    ): void {
        switch (message.type) {
            case MessageType.REQUEST:
                this.onServiceRequest(descriptor, message)
                break
            case MessageType.STREAM_INPUT_DATA:
                this.onServiceStreamInputData(descriptor, message)
                break
            case MessageType.STREAM_INPUT_END:
                this.onServiceStreamInputEnd(descriptor, message)
                break
            case MessageType.STREAM_INPUT_DESTROY:
                this.onServiceStreamInputDestroy(descriptor, message)
                break
        }
    }

    private async onServiceRequest(
        { instance, streams: serviceStreams }: RegisteredServiceDescriptor,
        message: RequestMessage,
    ): Promise<void> {
        const stream = this.stream
        const { id, name, service } = message

        try {
            const reply = await (instance as any)[name](...message.data)

            if (this.stream !== stream) {
                if (isStream(reply)) {
                    reply.destroy()
                }
            } else if (isOpenDuplexStream(reply)) {
                const serviceStream = reply

                if (serviceStreams.has(id)) {
                    this.send({
                        data: toJSON(
                            createDuplicateIdError('Duplicate request ID.'),
                        ),
                        id,
                        name: null,
                        service,
                        type: MessageType.REPLY_ERROR,
                    })
                    serviceStream.destroy()
                    return
                }

                const onData = (data: any) => {
                    /* istanbul ignore else */
                    if (this.stream === stream && data != null) {
                        this.send({
                            data,
                            id,
                            name: null,
                            service,
                            type: MessageType.STREAM_OUTPUT_DATA,
                        })
                    }
                }

                const onEnd = () => {
                    /* istanbul ignore else */
                    if (this.stream === stream) {
                        this.send({
                            data: null,
                            id,
                            name: null,
                            service,
                            type: MessageType.STREAM_OUTPUT_END,
                        })
                    }
                }

                const onClose = () => {
                    removeListeners()
                    serviceStreams.delete(id)

                    if (this.stream === stream) {
                        this.send({
                            data: null,
                            id,
                            name: null,
                            service,
                            type: MessageType.STREAM_OUTPUT_DESTROY,
                        })
                    }
                }

                serviceStream.on('close', onClose)
                serviceStream.on('data', onData)
                serviceStream.on('end', onEnd)

                const removeListeners = () => {
                    serviceStream.off('close', onClose)
                    serviceStream.off('data', onData)
                    serviceStream.off('end', onEnd)
                }

                serviceStreams.set(message.id, serviceStream)

                this.send({
                    data: null,
                    id,
                    name: null,
                    service,
                    type: MessageType.REPLY_STREAM,
                })
            } else if (isStream(reply)) {
                const error = createInvalidStreamError(
                    'Service returned an invalid stream.',
                )
                this.emitAsync('error', error)
                this.send({
                    data: toJSON(error),
                    id,
                    name: null,
                    service,
                    type: MessageType.REPLY_ERROR,
                })
                reply.destroy()
            } else {
                const typeOfReply = typeof reply
                const data =
                    typeOfReply === 'object' ||
                    typeOfReply === 'number' ||
                    typeOfReply === 'string' ||
                    typeOfReply === 'boolean'
                        ? reply
                        : null
                this.send({
                    data,
                    id,
                    name: null,
                    service,
                    type: MessageType.REPLY_VALUE,
                })
            }
        } catch (error) {
            if (this.stream === stream) {
                this.send({
                    data: toJSON(error),
                    id,
                    name: null,
                    service,
                    type: MessageType.REPLY_ERROR,
                })
            }
        }
    }

    private onServiceStreamInputData(
        { streams: serviceStreams }: RegisteredServiceDescriptor,
        message: StreamDataMessage,
    ): void {
        const serviceStream = serviceStreams.get(message.id)
        /* istanbul ignore else */
        if (serviceStream) {
            serviceStream.write(message.data)
        }
    }

    private onServiceStreamInputEnd(
        { streams: serviceStreams }: RegisteredServiceDescriptor,
        message: StreamEndMessage,
    ): void {
        const serviceStream = serviceStreams.get(message.id)
        /* istanbul ignore else */
        if (serviceStream) {
            serviceStream.end()
        }
    }

    private onServiceStreamInputDestroy(
        { streams: serviceStreams }: RegisteredServiceDescriptor,
        message: StreamDestroyMessage,
    ): void {
        const serviceStream = serviceStreams.get(message.id)
        if (serviceStream) {
            serviceStream.destroy()
        }
    }

    private onProxyMessage(
        {
            requests: proxyRequests,
            streams: proxyStreams,
        }: RegisteredProxyDescriptor,
        message: Message,
    ): void {
        switch (message.type) {
            case MessageType.REPLY_VALUE: {
                const id = message.id
                const proxyRequest = proxyRequests.get(id)
                if (proxyRequest) {
                    proxyRequests.delete(id)
                    proxyRequest.resolve(message.data)
                }
                break
            }

            case MessageType.REPLY_ERROR: {
                const id = message.id
                const proxyRequest = proxyRequests.get(id)
                if (proxyRequest) {
                    proxyRequests.delete(id)
                    proxyRequest.reject(fromJSON(message.data))
                }
                break
            }

            case MessageType.REPLY_STREAM: {
                const stream = this.stream
                const { id, service } = message
                const proxyRequest = proxyRequests.get(id)

                if (proxyRequest) {
                    proxyRequests.delete(id)

                    const proxyStream = new Duplex({
                        final: (callback: Callback) => {
                            /* istanbul ignore else */
                            if (this.stream === stream) {
                                this.send({
                                    data: null,
                                    id,
                                    name: null,
                                    service,
                                    type: MessageType.STREAM_INPUT_END,
                                })
                            }
                            callback(null)
                        },
                        objectMode: true,
                        read: () => undefined,
                        write: (
                            data: any,
                            _encoding: string,
                            callback: Callback,
                        ) => {
                            /* istanbul ignore else */
                            if (this.stream === stream && data != null) {
                                this.send({
                                    data,
                                    id,
                                    name: null,
                                    service,
                                    type: MessageType.STREAM_INPUT_DATA,
                                })
                            }
                            callback(null)
                        },
                    })

                    proxyStreams.set(id, proxyStream)

                    proxyStream.on('close', () => {
                        proxyStreams.delete(id)

                        if (this.stream === stream) {
                            this.send({
                                data: null,
                                id,
                                name: null,
                                service,
                                type: MessageType.STREAM_INPUT_DESTROY,
                            })
                        }
                    })

                    proxyRequest.resolve(proxyStream)
                }
                break
            }

            case MessageType.STREAM_OUTPUT_DATA: {
                const serviceStream = proxyStreams.get(message.id)
                /* istanbul ignore else */
                if (serviceStream) {
                    serviceStream.push(message.data)
                }
                break
            }

            case MessageType.STREAM_OUTPUT_END: {
                const serviceStream = proxyStreams.get(message.id)
                /* istanbul ignore else */
                if (serviceStream) {
                    serviceStream.push(null)
                }
                break
            }

            case MessageType.STREAM_OUTPUT_DESTROY: {
                const serviceStream = proxyStreams.get(message.id)
                if (serviceStream) {
                    serviceStream.destroy()
                }
                break
            }
        }
    }
}

/**
 * Exposes a higher level protocol over a duplex object stream.
 * The other end of the stream should be connected to another `Connection`.
 *
 * @event connect Emitted when this `Connection` gets associated with a stream.
 * @event disconnect Emitted when the associated stream finishes.
 * @event error Emitted when an error occurs. Possible errors are:
 *
 *   - `SyncOTError InvalidEntity` - emitted when sending or receiving an invalid message.
 *     It indicates presence of a bug in SyncOT or the client code.
 *   - `SyncOTError InvalidStream` - emitted when a service returns a stream, or a promise which
 *     resolves to a stream, and that stream is already destroyed, not readable, or not writable.
 * @event destroy Emitted when the Connection is destroyed.
 */
export interface Connection extends EmitterInterface<ConnectionImpl> {}

/**
 * Creates a new `Connection`.
 */
export function createConnection(): Connection {
    return new ConnectionImpl()
}
