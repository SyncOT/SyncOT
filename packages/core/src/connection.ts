import { strict as assert } from 'assert'
import { EventEmitter } from 'events'
import { Duplex, finished } from 'stream'
import { createNotImplementedError, ErrorCodes, SyncOtError } from './error'
import { JsonArray, JsonValue } from './json'
import {
    assertUnreachable,
    Interface,
    NodeEventEmitter,
    throwError,
    validate,
    Validator,
} from './util'

type SessionId = number
type ServiceName = string
type ProxyName = string
type ActionName = string
type EventName = string
type StreamName = string

export type Service = EventEmitter
export interface ServiceDescriptor {
    name: ServiceName
    actions?: Set<ActionName>
    events?: Set<EventName>
    streams?: Set<StreamName>
    instance: Service
}
export interface RegisteredServiceDescriptor
    extends Required<ServiceDescriptor> {}
export type Proxy = EventEmitter
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
    disconnect: Error | null
}

/**
 * The list of supported `Message` types.
 */
export const enum MessageType {
    EVENT,
    CALL_REQUEST,
    CALL_REPLY,
    CALL_ERROR,
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
        case MessageType.CALL_REPLY:
        case MessageType.CALL_ERROR:
        case MessageType.STREAM_OUTPUT_DATA:
        case MessageType.STREAM_OUTPUT_END:
        case MessageType.STREAM_OUTPUT_ERROR:
            return Source.SERVICE
        case MessageType.CALL_REQUEST:
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
          id: SessionId
          data: JsonValue
      }
    | {
          type: MessageType.CALL_REQUEST | MessageType.STREAM_OPEN
          service: ServiceName | ProxyName
          name: EventName | ActionName | StreamName
          id: SessionId
          data: JsonArray
      }
    | {
          type:
              | MessageType.CALL_ERROR
              | MessageType.STREAM_INPUT_ERROR
              | MessageType.STREAM_OUTPUT_ERROR
          service: ServiceName | ProxyName
          name?: null
          id: SessionId
          data: Error
      }
    | {
          type:
              | MessageType.CALL_REPLY
              | MessageType.STREAM_INPUT_DATA
              | MessageType.STREAM_INPUT_END
              | MessageType.STREAM_OUTPUT_DATA
              | MessageType.STREAM_OUTPUT_END
          service: ServiceName | ProxyName
          name?: null
          id: SessionId
          data: JsonValue
      }

const invalid = (message: any, property: string | null): SyncOtError =>
    new SyncOtError(ErrorCodes.InvalidMessage, undefined, { message, property })

const validateMessage: Validator<Message> = validate([
    message =>
        typeof message === 'object' && message != null
            ? undefined
            : invalid(message, null),
    message =>
        Number.isSafeInteger(message.type) &&
        message.type >= MessageType.EVENT &&
        message.type <= MessageType.STREAM_OUTPUT_ERROR
            ? undefined
            : invalid(message, 'type'),
    message =>
        typeof message.service === 'string'
            ? undefined
            : invalid(message, 'service'),
    message =>
        (message.type === MessageType.EVENT ||
        message.type === MessageType.CALL_REQUEST ||
        message.type === MessageType.STREAM_OPEN
          ? typeof message.name === 'string'
          : message.name == null)
            ? undefined
            : invalid(message, 'name'),
    message =>
        Number.isSafeInteger(message.id) ? undefined : invalid(message, 'id'),
    message => {
        if (
            message.type === MessageType.CALL_REQUEST ||
            message.type === MessageType.STREAM_OPEN
        ) {
            return Array.isArray(message.data)
                ? undefined
                : invalid(message, 'data')
        }
        if (
            message.type === MessageType.CALL_ERROR ||
            message.type === MessageType.STREAM_INPUT_ERROR ||
            message.type === MessageType.STREAM_OUTPUT_ERROR
        ) {
            return message.data instanceof Error
                ? undefined
                : invalid(message, 'data')
        }
        switch (typeof message.data) {
            case 'object':
            case 'string':
            case 'number':
            case 'boolean':
                return
            default:
                return invalid(message, 'data')
        }
    },
])

class ConnectionImpl extends (EventEmitter as NodeEventEmitter<Events>) {
    private stream: Duplex | null = null
    private services: Map<ServiceName, RegisteredServiceDescriptor> = new Map()
    private proxies: Map<ProxyName, RegisteredProxyDescriptor> = new Map()

    /**
     * Connects to the specified stream and emits the `'connect'` event.
     *
     * When the `stream` is finished, the `Connection` emits the `'disconnect'` event.
     *
     * If the `stream` emits an `error` event, it is automatically destroyed and
     * the `Connection` emits the `'disconnect'` event with the `error`.
     *
     * Throws an error, if this connection is already associated with a different stream or
     * the specified `stream` is not a `Duplex` stream.
     *
     * @param stream The stream to connect to.
     */
    public connect(stream: Duplex): void {
        assert.ok(
            stream instanceof Duplex,
            'Argument "stream" must be a Duplex.',
        )
        assert.ok(
            !this.stream,
            'Connection is already associated with a stream.',
        )
        this.stream = stream
        stream.on('data', data => this.stream === stream && this.onData(data))
        finished(
            stream,
            error => this.stream === stream && this.disconnect(error),
        )
        this.emit('connect')
    }

    /**
     * Destroys the stream associated with this connection.
     * Emits the `'disconnect'` event with the optional `error`.
     */
    public disconnect(error?: Error): void {
        const stream = this.stream

        if (stream) {
            this.stream = null
            stream.destroy()
            this.emit('disconnect', error || null)
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
        assert.ok(
            instance instanceof EventEmitter,
            'Argument "instance" must be an EventEmitter.',
        )
        assert.ok(
            !this.services.has(name),
            `Service "${name}" has been already registered.`,
        )
        if (events.size > 0) {
            throw createNotImplementedError('Connection events not implemented')
        }
        if (streams.size > 0) {
            throw createNotImplementedError(
                'Connection streams not implemented',
            )
        }
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
        if (this.proxies.has(name)) {
            throw new SyncOtError(ErrorCodes.DuplicateProxy)
        }
        if (events.size > 0) {
            throw createNotImplementedError('Connection events not implemented')
        }
        if (streams.size > 0) {
            throw createNotImplementedError(
                'Connection streams not implemented',
            )
        }
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

    private initService(
        service: Service,
        serviceName: ServiceName,
        actions: Set<ActionName>,
    ): void {
        ;(this as EventEmitter).on(
            `message.${Source.PROXY}.${serviceName}`,
            (message: Message) => {
                switch (message.type) {
                    case MessageType.CALL_REQUEST: {
                        const action = message.name

                        if (actions.has(action)) {
                            Promise.resolve()
                                .then(() =>
                                    (service as any)[action].apply(
                                        service,
                                        message.data,
                                    ),
                                )
                                .then(
                                    data => {
                                        if (!this.isConnected()) {
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
                                            type: MessageType.CALL_REPLY,
                                        })
                                    },
                                    error => {
                                        if (!this.isConnected()) {
                                            return
                                        }
                                        this.send({
                                            ...message,
                                            data: error,
                                            name: null,
                                            type: MessageType.CALL_ERROR,
                                        })
                                    },
                                )
                        } else {
                            /* istanbul ignore if */
                            if (!this.isConnected()) {
                                return
                            }
                            this.send({
                                ...message,
                                data: new SyncOtError(ErrorCodes.NoService),
                                name: null,
                                type: MessageType.CALL_ERROR,
                            })
                        }
                        break
                    }
                    case MessageType.STREAM_OPEN: {
                        /* istanbul ignore if */
                        if (!this.isConnected()) {
                            return
                        }
                        this.send({
                            ...message,
                            data: new SyncOtError(ErrorCodes.NoService),
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
        const proxy = new EventEmitter()
        let nextSessionId = 1
        const actionSessions: Map<
            SessionId,
            {
                resolve: (value: JsonValue) => void
                reject: (error: Error) => void
            }
        > = new Map()

        actions.forEach(action => {
            assert.ok(!(action in proxy), `Proxy.${action} already exists.`)
            ;(proxy as any)[action] = (
                ...args: JsonValue[]
            ): Promise<JsonValue> => {
                const sessionId = nextSessionId++
                return new Promise<JsonValue>((resolve, reject) => {
                    actionSessions.set(sessionId, { resolve, reject })
                    this.send({
                        data: args,
                        id: sessionId,
                        name: action,
                        service: proxyName,
                        type: MessageType.CALL_REQUEST,
                    })
                })
            }
        })
        ;(this as EventEmitter).on(
            `message.${Source.SERVICE}.${proxyName}`,
            (message: Message) => {
                switch (message.type) {
                    case MessageType.CALL_REPLY: {
                        const id = message.id
                        const session = actionSessions.get(id)
                        if (session) {
                            actionSessions.delete(id)
                            session.resolve(message.data)
                        }
                        break
                    }
                    case MessageType.CALL_ERROR: {
                        const id = message.id
                        const session = actionSessions.get(id)
                        if (session) {
                            actionSessions.delete(id)
                            session.reject(message.data)
                        }
                        break
                    }
                }
            },
        )

        this.on('disconnect', () => {
            const error = new SyncOtError(ErrorCodes.Disconnected)
            const sessions = Array.from(actionSessions.values())
            actionSessions.clear()

            for (const { reject } of sessions) {
                reject(error)
            }
        })

        return proxy
    }

    private send(message: Message): void {
        throwError(validateMessage(message))

        if (this.stream) {
            this.stream.write(message)
        } else {
            throw new SyncOtError(ErrorCodes.Disconnected)
        }
    }

    private onData(message: Message): void {
        const error = validateMessage(message)

        if (error) {
            return this.disconnect(error)
        }

        // Emit an internal event for the services and proxies.
        const handled: boolean = (this as EventEmitter).emit(
            `message.${getSource(message)}.${message.service}`,
            message,
        )

        if (!handled) {
            /* istanbul ignore if */
            if (!this.isConnected()) {
                return
            }
            switch (message.type) {
                case MessageType.CALL_REQUEST:
                    return this.send({
                        ...message,
                        data: new SyncOtError(ErrorCodes.NoService),
                        name: null,
                        type: MessageType.CALL_ERROR,
                    })
                case MessageType.STREAM_OPEN:
                    return this.send({
                        ...message,
                        data: new SyncOtError(ErrorCodes.NoService),
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
 * @event disconnect Emitted with a `null` payload when the associated stream finishes.
 *   Emitted with an `error`, if the stream is destroyed due to an error.
 */
export interface Connection extends Interface<ConnectionImpl> {}

/**
 * Creates a new `Connection`.
 */
export function createConnection(): Connection {
    return new ConnectionImpl()
}
