import {
    createDisconnectedError,
    createInvalidEntityError,
    createNoServiceError,
} from '@syncot/error'
import {
    assertUnreachable,
    EmitterInterface,
    SyncOtEmitter,
    throwError,
    validate,
    Validator,
} from '@syncot/util'
import { AssertionError, strict as assert } from 'assert'
import { Duplex, finished } from 'stream'

type RequestId = number
type ServiceName = string
type ProxyName = string
type RequestName = string
type EventName = string

export type Service = object
export interface ServiceDescriptor {
    name: ServiceName
    eventNames?: Set<EventName>
    requestNames?: Set<RequestName>
    instance: Service
}
export interface RegisteredServiceDescriptor
    extends Required<ServiceDescriptor> {}
export type Proxy = object
export interface ProxyDescriptor {
    name: ProxyName
    eventNames?: Set<EventName>
    requestNames?: Set<RequestName>
}
export interface RegisteredProxyDescriptor extends Required<ProxyDescriptor> {
    instance: Proxy
}

interface Events {
    connect: void
    disconnect: void
    error: Error
}

/**
 * The list of supported `Message` types.
 */
export const enum MessageType {
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

enum Source {
    PROXY = 'proxy',
    SERVICE = 'service',
}

function getSource(message: Message): Source {
    switch (message.type) {
        case MessageType.EVENT:
        case MessageType.REPLY_VALUE:
        case MessageType.REPLY_ERROR:
        case MessageType.REPLY_STREAM:
        case MessageType.STREAM_OUTPUT_DATA:
        case MessageType.STREAM_OUTPUT_END:
        case MessageType.STREAM_OUTPUT_DESTROY:
            return Source.SERVICE
        case MessageType.REQUEST:
        case MessageType.STREAM_INPUT_DATA:
        case MessageType.STREAM_INPUT_END:
        case MessageType.STREAM_INPUT_DESTROY:
            return Source.PROXY
        /* istanbul ignore next */
        default:
            return assertUnreachable(message)
    }
}

/**
 * Defines the format of messages exchanged over the stream by `Connection` instances.
 */
export type Message =
    | {
          type: MessageType.EVENT
          service: ServiceName | ProxyName
          name: EventName | RequestName
          id: RequestId
          data: any
      }
    | {
          type: MessageType.REQUEST
          service: ServiceName | ProxyName
          name: EventName | RequestName
          id: RequestId
          data: any[]
      }
    | {
          type: MessageType.REPLY_ERROR
          service: ServiceName | ProxyName
          name: null
          id: RequestId
          data: Error
      }
    | {
          type: MessageType.REPLY_STREAM
          service: ServiceName | ProxyName
          name: null
          id: RequestId
          data: null
      }
    | {
          type: MessageType.STREAM_INPUT_END | MessageType.STREAM_OUTPUT_END
          service: ServiceName | ProxyName
          name: null
          id: RequestId
          data: null
      }
    | {
          type:
              | MessageType.STREAM_INPUT_DESTROY
              | MessageType.STREAM_OUTPUT_DESTROY
          service: ServiceName | ProxyName
          name: null
          id: RequestId
          data: null | Error
      }
    | {
          type:
              | MessageType.REPLY_VALUE
              | MessageType.STREAM_INPUT_DATA
              | MessageType.STREAM_OUTPUT_DATA
          service: ServiceName | ProxyName
          name: null
          id: RequestId
          data: any
      }

const validateMessage: Validator<Message> = validate([
    message =>
        typeof message === 'object' && message !== null
            ? undefined
            : createInvalidEntityError('Message', message, null),
    message =>
        Number.isSafeInteger(message.type) &&
        message.type >= MessageType.EVENT &&
        message.type <= MessageType.STREAM_OUTPUT_DESTROY
            ? undefined
            : createInvalidEntityError('Message', message, 'type'),
    message =>
        typeof message.service === 'string'
            ? undefined
            : createInvalidEntityError('Message', message, 'service'),
    message =>
        (message.type === MessageType.EVENT ||
        message.type === MessageType.REQUEST
          ? typeof message.name === 'string'
          : message.name === null)
            ? undefined
            : createInvalidEntityError('Message', message, 'name'),
    message =>
        Number.isSafeInteger(message.id)
            ? undefined
            : createInvalidEntityError('Message', message, 'id'),
    message => {
        if (message.type === MessageType.REQUEST) {
            return Array.isArray(message.data)
                ? undefined
                : createInvalidEntityError('Message', message, 'data')
        }
        if (message.type === MessageType.REPLY_ERROR) {
            return message.data instanceof Error
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
            return message.data === null || message.data instanceof Error
                ? undefined
                : createInvalidEntityError('Message', message, 'data')
        }
        return message.hasOwnProperty('data')
            ? undefined
            : createInvalidEntityError('Message', message, 'data')
    },
])

interface ProxyRequest {
    resolve: (value: any) => void
    reject: (error: Error) => void
}
type RequestMap = Map<RequestId, ProxyRequest>
type StreamMap = Map<RequestId, Duplex>
type Callback = (error: null | Error) => undefined

class ConnectionImpl extends SyncOtEmitter<Events> {
    private stream: Duplex | null = null
    private services: Map<ServiceName, RegisteredServiceDescriptor> = new Map()
    private proxies: Map<ProxyName, RegisteredProxyDescriptor> = new Map()
    private proxyRequests: RequestMap[] = []
    private serviceStreams: StreamMap[] = []
    private proxyStreams: StreamMap[] = []
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
     * When the `stream` is finished, the `Connection` emits the `'disconnect'` event.
     *
     * If the `stream` emits an `error` event, it is automatically destroyed and
     * the `Connection` emits the `error` event followed by the `'disconnect'` event.
     *
     * Throws an error, if this connection is already associated with a different stream or
     * the specified `stream` is not a `Duplex` stream.
     *
     * @param stream The stream to connect to.
     */
    public connect(stream: Duplex): void {
        this.assertNotDestroyed()
        assert.ok(
            stream instanceof Duplex,
            'Argument "stream" must be a Duplex.',
        )
        assert.ok(
            !this.stream,
            'Connection is already associated with a stream.',
        )
        this.stream = stream
        this._connectionId++

        stream.on('data', data => {
            if (this.stream === stream) {
                this.onData(data)
            }
        })

        finished(stream, error => {
            if (this.stream === stream) {
                if (
                    error &&
                    error.name !== 'Error [ERR_STREAM_PREMATURE_CLOSE]'
                ) {
                    // The `finished` function reports the original stream error as
                    // well as its own internal errors.
                    // The premature close error happens when calling destroy on the
                    // stream. It isn't really a problem, so we don't emit it.
                    this.emitAsync('error', error)
                }
                this.disconnect()
            }
        })

        // Just in case, destroy the stream on error becasue some streams remain open.
        stream.on('error', () => stream.destroy())

        this.emitAsync('connect')
    }

    /**
     * Destroys the stream associated with this connection and emits the `'disconnect'` event.
     * It is safe to call it at any time.
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
     * - When the stream emits an `error`, it gets destroyed automatically.
     * - The stream is managed by the Connection until the Connection gets disconnected or
     *   the stream emits `close` or `error`, so make sure `close` is emitted in normal operation
     *   or you'll have a memory leak.
     * - Stream data equal to `undefined` is ignored.
     * - The stream returned by the proxy is configured with `allowHalfOpen=true`.
     */
    public registerService({
        name,
        eventNames = new Set(),
        requestNames = new Set(),
        instance,
    }: ServiceDescriptor): void {
        this.assertNotDestroyed()
        assert.ok(
            instance != null && typeof instance === 'object',
            'Argument "instance" must be an object.',
        )
        assert.ok(
            !this.services.has(name),
            `Service "${name}" has been already registered.`,
        )
        assert.equal(eventNames.size, 0, 'Connection events not implemented')
        requestNames.forEach(requestName => {
            assert.equal(
                typeof (instance as any)[requestName],
                'function',
                `Service.${requestName} must be a function.`,
            )
        })
        this.initService(instance, name, requestNames)
        this.services.set(name, { eventNames, instance, name, requestNames })
    }

    public getServiceNames(): ServiceName[] {
        return Array.from(this.services.keys())
    }

    public getServiceDescriptor(
        name: ServiceName,
    ): RegisteredServiceDescriptor | undefined {
        return this.services.get(name)
    }

    public getService(name: ServiceName): Service | undefined {
        const descriptor = this.services.get(name)
        return descriptor && descriptor.instance
    }

    public registerProxy({
        name,
        requestNames = new Set(),
        eventNames = new Set(),
    }: ProxyDescriptor): void {
        this.assertNotDestroyed()
        assert.ok(
            !this.proxies.has(name),
            `Proxy "${name}" has been already registered.`,
        )
        assert.equal(eventNames.size, 0, 'Connection events not implemented')
        const instance = this.createProxy(name, requestNames)
        this.proxies.set(name, { eventNames, instance, name, requestNames })
    }

    public getProxyNames(): ProxyName[] {
        return Array.from(this.proxies.keys())
    }

    public getProxyDescriptor(
        name: ProxyName,
    ): RegisteredProxyDescriptor | undefined {
        return this.proxies.get(name)
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

    private initService(
        serviceInstance: Service,
        serviceName: ServiceName,
        requestNames: Set<RequestName>,
    ): void {
        const serviceStreams: Map<RequestId, Duplex> = new Map()
        this.serviceStreams.push(serviceStreams)

        this.on(
            `message.${Source.PROXY}.${serviceName}` as any,
            (message: Message) => {
                switch (message.type) {
                    case MessageType.REQUEST: {
                        const stream = this.stream
                        const { id, name, service } = message

                        if (requestNames.has(name)) {
                            Promise.resolve()
                                .then(() =>
                                    (serviceInstance as any)[name](
                                        ...message.data,
                                    ),
                                )
                                .then(
                                    reply => {
                                        if (this.stream !== stream) {
                                            return
                                        }

                                        if (reply instanceof Duplex) {
                                            if (serviceStreams.has(id)) {
                                                stream!.destroy(
                                                    new AssertionError({
                                                        message:
                                                            'Duplicate request ID.',
                                                    }),
                                                )
                                                return
                                            }

                                            const serviceStream = reply

                                            const onData = (data: any) => {
                                                if (
                                                    this.stream === stream &&
                                                    data != null
                                                ) {
                                                    this.send({
                                                        data,
                                                        id,
                                                        name: null,
                                                        service,
                                                        type:
                                                            MessageType.STREAM_OUTPUT_DATA,
                                                    })
                                                }
                                            }

                                            const onEnd = () => {
                                                if (this.stream === stream) {
                                                    this.send({
                                                        data: null,
                                                        id,
                                                        name: null,
                                                        service,
                                                        type:
                                                            MessageType.STREAM_OUTPUT_END,
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
                                                        type:
                                                            MessageType.STREAM_OUTPUT_DESTROY,
                                                    })
                                                }
                                            }

                                            const onError = (error: Error) => {
                                                removeListeners()
                                                serviceStreams.delete(id)

                                                if (this.stream === stream) {
                                                    this.send({
                                                        data: error,
                                                        id,
                                                        name: null,
                                                        service,
                                                        type:
                                                            MessageType.STREAM_OUTPUT_DESTROY,
                                                    })
                                                }

                                                serviceStream.destroy()
                                            }

                                            serviceStream.on('close', onClose)
                                            serviceStream.on('error', onError)
                                            serviceStream.on('data', onData)
                                            serviceStream.on('end', onEnd)

                                            const removeListeners = () => {
                                                serviceStream.off(
                                                    'close',
                                                    onClose,
                                                )
                                                serviceStream.off(
                                                    'error',
                                                    onError,
                                                )
                                                serviceStream.off(
                                                    'data',
                                                    onData,
                                                )
                                                serviceStream.off('end', onEnd)
                                            }

                                            serviceStreams.set(
                                                message.id,
                                                serviceStream,
                                            )

                                            this.send({
                                                data: null,
                                                id,
                                                name: null,
                                                service,
                                                type: MessageType.REPLY_STREAM,
                                            })
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
                                    },
                                    error => {
                                        if (this.stream === stream) {
                                            this.send({
                                                data: error,
                                                id,
                                                name: null,
                                                service,
                                                type: MessageType.REPLY_ERROR,
                                            })
                                        }
                                    },
                                )
                        } else {
                            this.send({
                                data: createNoServiceError(
                                    `No service to handle the request for "${service}.${name}".`,
                                ),
                                id,
                                name: null,
                                service,
                                type: MessageType.REPLY_ERROR,
                            })
                        }
                        break
                    }

                    case MessageType.STREAM_INPUT_DATA: {
                        const serviceStream = serviceStreams.get(message.id)
                        if (serviceStream) {
                            serviceStream.write(message.data)
                        }
                        break
                    }

                    case MessageType.STREAM_INPUT_END: {
                        const serviceStream = serviceStreams.get(message.id)
                        if (serviceStream) {
                            serviceStream.end()
                        }
                        break
                    }

                    case MessageType.STREAM_INPUT_DESTROY: {
                        const serviceStream = serviceStreams.get(message.id)
                        if (serviceStream) {
                            serviceStream.destroy(message.data as any)
                        }
                        break
                    }
                }
            },
        )
    }

    private createProxy(
        proxyName: ProxyName,
        requestNames: Set<RequestName>,
    ): Proxy {
        const proxy = {}
        let nextRequestId = 1
        const proxyRequests: RequestMap = new Map()
        const proxyStreams: StreamMap = new Map()
        this.proxyRequests.push(proxyRequests)
        this.proxyStreams.push(proxyStreams)

        requestNames.forEach(requestName => {
            assert.ok(
                !(requestName in proxy),
                `Proxy.${requestName} already exists.`,
            )
            ;(proxy as any)[requestName] = (...args: any[]): Promise<any> => {
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

        this.on(
            `message.${Source.SERVICE}.${proxyName}` as any,
            (message: Message) => {
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
                            proxyRequest.reject(message.data)
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
                                    if (
                                        this.stream === stream &&
                                        data != null
                                    ) {
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

                            const onClose = () => {
                                removeListeners()
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
                            }

                            const onError = (error: Error) => {
                                removeListeners()
                                proxyStreams.delete(id)

                                if (this.stream === stream) {
                                    this.send({
                                        data: error,
                                        id,
                                        name: null,
                                        service,
                                        type: MessageType.STREAM_INPUT_DESTROY,
                                    })
                                }

                                proxyStream.destroy()
                            }

                            proxyStream.on('close', onClose)
                            proxyStream.on('error', onError)

                            const removeListeners = () => {
                                proxyStream.off('close', onClose)
                                proxyStream.off('error', onError)
                            }

                            proxyRequest.resolve(proxyStream)
                        }
                        break
                    }

                    case MessageType.STREAM_OUTPUT_DATA: {
                        const serviceStream = proxyStreams.get(message.id)
                        if (serviceStream) {
                            serviceStream.push(message.data)
                        }
                        break
                    }

                    case MessageType.STREAM_OUTPUT_END: {
                        const serviceStream = proxyStreams.get(message.id)
                        if (serviceStream) {
                            serviceStream.push(null)
                        }
                        break
                    }

                    case MessageType.STREAM_OUTPUT_DESTROY: {
                        const serviceStream = proxyStreams.get(message.id)
                        if (serviceStream) {
                            serviceStream.destroy(message.data as any)
                        }
                        break
                    }
                }
            },
        )

        return proxy
    }

    private cleanUpServiceStreams(): void {
        const error = createDisconnectedError(
            'Disconnected, service stream destroyed.',
        )
        for (const streams of this.serviceStreams) {
            for (const stream of streams.values()) {
                stream.destroy(error)
            }
            streams.clear()
        }
    }

    private cleanUpProxyStreams(): void {
        const error = createDisconnectedError(
            'Disconnected, proxy stream destroyed.',
        )
        for (const streams of this.proxyStreams) {
            for (const stream of streams.values()) {
                stream.destroy(error)
            }
            streams.clear()
        }
    }

    private cleanUpProxyRequests(): void {
        const error = createDisconnectedError('Disconnected, request failed.')
        for (const requests of this.proxyRequests) {
            // Promises are resolved and rejected asynchronously, so it's safe to
            // iterate and clear the map directly without any risk of race conditions.
            for (const { reject } of requests.values()) {
                reject(error)
            }
            requests.clear()
        }
    }

    private send(message: Message): void {
        /* istanbul ignore if */
        if (!this.stream) {
            return assertUnreachable()
        }

        try {
            throwError(validateMessage(message))
            this.stream.write(message)
        } catch (error) {
            this.stream.destroy(error)
        }
    }

    private onData(message: Message): void {
        /* istanbul ignore if */
        if (!this.stream) {
            return assertUnreachable()
        }

        try {
            throwError(validateMessage(message))
        } catch (error) {
            this.stream.destroy(error)
            return
        }

        // Emit an internal event for the services and proxies.
        const handled: boolean = this.emit(
            `message.${getSource(message)}.${message.service}` as any,
            message,
        )

        if (!handled) {
            switch (message.type) {
                case MessageType.REQUEST: {
                    const { id, service } = message
                    return this.send({
                        data: createNoServiceError(
                            `No service to handle the request for "${
                                message.service
                            }.${message.name}".`,
                        ),
                        id,
                        name: null,
                        service,
                        type: MessageType.REPLY_ERROR,
                    })
                }
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
 * @event error Emitted when an error occurs. The associated stream is automatically disconnected
 *   after any error. The Connection automatically recovers from errors. Possible errors are:
 *
 *   - `SyncOtError InvalidEntity` - emitted when sending or receiving an invalid message.
 *     It indicates presence of a bug in SyncOT or the client code.
 *   - Errors from the associated stream are emitted as `Connection` errors.
 * @event destroy Emitted when the Connection is destroyed.
 */
export interface Connection extends EmitterInterface<ConnectionImpl> {}

/**
 * Creates a new `Connection`.
 */
export function createConnection(): Connection {
    return new ConnectionImpl()
}
