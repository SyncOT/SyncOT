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
import { strict as assert } from 'assert'
import { Duplex, finished } from 'stream'

type RequestId = number
type ServiceName = string
type ProxyName = string
type ActionName = string
type EventName = string
type StreamName = string

export type Service = object
export interface ServiceDescriptor {
    name: ServiceName
    actions?: Set<ActionName>
    events?: Set<EventName>
    streams?: Set<StreamName>
    instance: Service
}
export interface RegisteredServiceDescriptor
    extends Required<ServiceDescriptor> {}
export type Proxy = object
export interface ProxyDescriptor {
    name: ProxyName
    actions?: Set<ActionName>
    events?: Set<EventName>
    streams?: Set<StreamName>
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
    STREAM_OPEN,
    STREAM_INPUT_DATA,
    STREAM_INPUT_END,
    STREAM_INPUT_ERROR,
    STREAM_OUTPUT_DATA,
    STREAM_OUTPUT_END,
    STREAM_OUTPUT_ERROR,
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
        case MessageType.STREAM_OUTPUT_DATA:
        case MessageType.STREAM_OUTPUT_END:
        case MessageType.STREAM_OUTPUT_ERROR:
            return Source.SERVICE
        case MessageType.REQUEST:
        case MessageType.STREAM_OPEN:
        case MessageType.STREAM_INPUT_DATA:
        case MessageType.STREAM_INPUT_END:
        case MessageType.STREAM_INPUT_ERROR:
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
          name: EventName | ActionName | StreamName
          id: RequestId
          data: any
      }
    | {
          type: MessageType.REQUEST | MessageType.STREAM_OPEN
          service: ServiceName | ProxyName
          name: EventName | ActionName | StreamName
          id: RequestId
          data: any[]
      }
    | {
          type:
              | MessageType.REPLY_ERROR
              | MessageType.STREAM_INPUT_ERROR
              | MessageType.STREAM_OUTPUT_ERROR
          service: ServiceName | ProxyName
          name?: null
          id: RequestId
          data: Error
      }
    | {
          type:
              | MessageType.REPLY_VALUE
              | MessageType.STREAM_INPUT_DATA
              | MessageType.STREAM_INPUT_END
              | MessageType.STREAM_OUTPUT_DATA
              | MessageType.STREAM_OUTPUT_END
          service: ServiceName | ProxyName
          name?: null
          id: RequestId
          data: any
      }

const validateMessage: Validator<Message> = validate([
    message =>
        typeof message === 'object' && message != null
            ? undefined
            : createInvalidEntityError('Message', message, null),
    message =>
        Number.isSafeInteger(message.type) &&
        message.type >= MessageType.EVENT &&
        message.type <= MessageType.STREAM_OUTPUT_ERROR
            ? undefined
            : createInvalidEntityError('Message', message, 'type'),
    message =>
        typeof message.service === 'string'
            ? undefined
            : createInvalidEntityError('Message', message, 'service'),
    message =>
        (message.type === MessageType.EVENT ||
        message.type === MessageType.REQUEST ||
        message.type === MessageType.STREAM_OPEN
          ? typeof message.name === 'string'
          : message.name == null)
            ? undefined
            : createInvalidEntityError('Message', message, 'name'),
    message =>
        Number.isSafeInteger(message.id)
            ? undefined
            : createInvalidEntityError('Message', message, 'id'),
    message => {
        if (
            message.type === MessageType.REQUEST ||
            message.type === MessageType.STREAM_OPEN
        ) {
            return Array.isArray(message.data)
                ? undefined
                : createInvalidEntityError('Message', message, 'data')
        }
        if (
            message.type === MessageType.REPLY_ERROR ||
            message.type === MessageType.STREAM_INPUT_ERROR ||
            message.type === MessageType.STREAM_OUTPUT_ERROR
        ) {
            return message.data instanceof Error
                ? undefined
                : createInvalidEntityError('Message', message, 'data')
        }
        return message.hasOwnProperty('data')
            ? undefined
            : createInvalidEntityError('Message', message, 'data')
    },
])

class ConnectionImpl extends SyncOtEmitter<Events> {
    private stream: Duplex | null = null
    private services: Map<ServiceName, RegisteredServiceDescriptor> = new Map()
    private proxies: Map<ProxyName, RegisteredProxyDescriptor> = new Map()

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
            stream.destroy()
            this.emitAsync('disconnect')
        }
    }

    /**
     * Returns `true`, if this `Connection` is associated with a stream, otherwise `false`.
     */
    public isConnected(): boolean {
        return !!this.stream
    }

    public registerService({
        name,
        actions = new Set(),
        events = new Set(),
        streams = new Set(),
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
        assert.equal(events.size, 0, 'Connection events not implemented')
        assert.equal(streams.size, 0, 'Connection streams not implemented')
        actions.forEach(action => {
            assert.equal(
                typeof (instance as any)[action],
                'function',
                `Service.${action} must be a function.`,
            )
        })
        this.initService(instance, name, actions)
        this.services.set(name, { actions, events, instance, name, streams })
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
        actions = new Set(),
        events = new Set(),
        streams = new Set(),
    }: ProxyDescriptor): void {
        this.assertNotDestroyed()
        assert.ok(
            !this.proxies.has(name),
            `Proxy "${name}" has been already registered.`,
        )
        assert.equal(events.size, 0, 'Connection events not implemented')
        assert.equal(streams.size, 0, 'Connection streams not implemented')
        const instance = this.createProxy(name, actions)
        this.proxies.set(name, { actions, events, instance, name, streams })
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
        service: Service,
        serviceName: ServiceName,
        actions: Set<ActionName>,
    ): void {
        this.on(
            `message.${Source.PROXY}.${serviceName}` as any,
            (message: Message) => {
                switch (message.type) {
                    case MessageType.REQUEST: {
                        const stream = this.stream
                        const action = message.name

                        if (actions.has(action)) {
                            Promise.resolve()
                                .then(() =>
                                    (service as any)[action](...message.data),
                                )
                                .then(
                                    data => {
                                        if (this.stream !== stream) {
                                            return
                                        }
                                        const typeOfData = typeof data
                                        this.send({
                                            ...message,
                                            data:
                                                typeOfData === 'object' ||
                                                typeOfData === 'number' ||
                                                typeOfData === 'string' ||
                                                typeOfData === 'boolean'
                                                    ? data
                                                    : null,
                                            name: null,
                                            type: MessageType.REPLY_VALUE,
                                        })
                                    },
                                    error => {
                                        if (this.stream !== stream) {
                                            return
                                        }
                                        this.send({
                                            ...message,
                                            data: error,
                                            name: null,
                                            type: MessageType.REPLY_ERROR,
                                        })
                                    },
                                )
                        } else {
                            this.send({
                                ...message,
                                data: createNoServiceError(
                                    `No service to handle the request for "${
                                        message.service
                                    }.${message.name}".`,
                                ),
                                name: null,
                                type: MessageType.REPLY_ERROR,
                            })
                        }
                        break
                    }
                    case MessageType.STREAM_OPEN: {
                        this.send({
                            ...message,
                            data: createNoServiceError(
                                `No service to handle the stream for "${
                                    message.service
                                }.${message.name}".`,
                            ),
                            name: null,
                            type: MessageType.STREAM_OUTPUT_ERROR,
                        })
                        break
                    }
                }
            },
        )
    }

    private createProxy(proxyName: ProxyName, actions: Set<ActionName>): Proxy {
        const proxy = {}
        let nextRequestId = 1
        const actionRequests: Map<
            RequestId,
            {
                resolve: (value: any) => void
                reject: (error: Error) => void
            }
        > = new Map()

        actions.forEach(action => {
            assert.ok(!(action in proxy), `Proxy.${action} already exists.`)
            ;(proxy as any)[action] = (...args: any[]): Promise<any> => {
                if (this.stream) {
                    return new Promise((resolve, reject) => {
                        const requestId = nextRequestId++
                        actionRequests.set(requestId, { resolve, reject })
                        this.send({
                            data: args,
                            id: requestId,
                            name: action,
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
                        const request = actionRequests.get(id)
                        if (request) {
                            actionRequests.delete(id)
                            request.resolve(message.data)
                        }
                        break
                    }
                    case MessageType.REPLY_ERROR: {
                        const id = message.id
                        const request = actionRequests.get(id)
                        if (request) {
                            actionRequests.delete(id)
                            request.reject(message.data)
                        }
                        break
                    }
                }
            },
        )

        this.on('disconnect', () => {
            const error = createDisconnectedError(
                'Disconnected, request failed.',
            )
            // Promises are resolved and rejected asynchronously, so it's safe to
            // iterate and clear the map directly without any risk of race conditions.
            for (const { reject } of actionRequests.values()) {
                reject(error)
            }
            actionRequests.clear()
        })

        return proxy
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
                case MessageType.REQUEST:
                    return this.send({
                        ...message,
                        data: createNoServiceError(
                            `No service to handle the request for "${
                                message.service
                            }.${message.name}".`,
                        ),
                        name: null,
                        type: MessageType.REPLY_ERROR,
                    })
                case MessageType.STREAM_OPEN:
                    return this.send({
                        ...message,
                        data: createNoServiceError(
                            `No service to handle the stream for "${
                                message.service
                            }.${message.name}".`,
                        ),
                        name: null,
                        type: MessageType.STREAM_OUTPUT_ERROR,
                    })
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
