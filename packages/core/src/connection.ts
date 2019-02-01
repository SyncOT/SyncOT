import { EventEmitter } from 'events'
import { Duplex, finished } from 'stream'
import { ErrorCodes, SyncOtError } from './error'
import { JsonMap, JsonValue } from './json'
import {
    assertUnreachable,
    Interface,
    NodeEventEmitter,
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
    error: SyncOtError
}

/**
 * The list of supported `Message` types.
 */
export const enum MessageType {
    EVENT,
    CALL_REQUEST,
    CALL_REPLY,
    CALL_ERROR,
    STREAM_INPUT_DATA,
    STREAM_INPUT_END,
    STREAM_INPUT_ERROR,
    STREAM_OUTPUT_DATA,
    STREAM_OUTPUT_END,
    STREAM_OUTPUT_ERROR,
}

type Source = 'proxy' | 'service'

function getSource(message: Message): Source {
    switch (message.type) {
        case MessageType.EVENT:
        case MessageType.CALL_REPLY:
        case MessageType.CALL_ERROR:
        case MessageType.STREAM_OUTPUT_DATA:
        case MessageType.STREAM_OUTPUT_END:
        case MessageType.STREAM_OUTPUT_ERROR:
            return 'service'
        case MessageType.CALL_REQUEST:
        case MessageType.STREAM_INPUT_DATA:
        case MessageType.STREAM_INPUT_END:
        case MessageType.STREAM_INPUT_ERROR:
            return 'proxy'
        default:
            return assertUnreachable(message.type)
    }
}

/**
 * Defines the format of messages exchanged over the stream by `Connection` instances.
 */
export interface Message extends JsonMap {
    type: MessageType
    service: ServiceName | ProxyName
    name: EventName | ActionName | StreamName
    id: SessionId
    data: JsonValue
}

const invalid = (message: any, property: string | null): SyncOtError =>
    new SyncOtError(ErrorCodes.InvalidMessage, undefined, { message, property })

const validateMessage: Validator<Message> = validate([
    message => (message !== null ? undefined : invalid(message, null)),
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
        typeof message.name === 'string' ? undefined : invalid(message, 'name'),
    message =>
        Number.isSafeInteger(message.id) ? undefined : invalid(message, 'id'),
    message => {
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
        if (!(stream instanceof Duplex)) {
            throw new SyncOtError(ErrorCodes.InvalidArgument)
        }
        if (this.stream) {
            throw new SyncOtError(ErrorCodes.AlreadyConnected)
        }
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
            this.emit('disconnect', error || null)
            stream.destroy()
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
        if (this.services.has(name)) {
            throw new SyncOtError(ErrorCodes.DuplicateService)
        }
        if (!(instance instanceof EventEmitter)) {
            throw new SyncOtError(
                ErrorCodes.InvalidArgument,
                'Service must be an EventEmitter',
            )
        }
        if (events.size > 0) {
            throw new SyncOtError(
                ErrorCodes.NotImplemented,
                'Connection does not support events yet',
            )
        }
        if (streams.size > 0) {
            throw new SyncOtError(
                ErrorCodes.NotImplemented,
                'Connection does not support streams yet',
            )
        }
        actions.forEach(action => {
            if (typeof (instance as any)[action] !== 'function') {
                throw new SyncOtError(
                    ErrorCodes.InvalidArgument,
                    `Service.${action} must be a function`,
                )
            }
        })
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
            throw new SyncOtError(
                ErrorCodes.NotImplemented,
                'Connection does not support events yet',
            )
        }
        if (streams.size > 0) {
            throw new SyncOtError(
                ErrorCodes.NotImplemented,
                'Connection does not support streams yet',
            )
        }
        const instance = this.createProxy(actions)
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

    private createProxy(actions: Set<ActionName>): Proxy {
        const proxy = new EventEmitter()

        actions.forEach(action => {
            if (action in proxy) {
                throw new SyncOtError(
                    ErrorCodes.InvalidArgument,
                    `Proxy.${action} already exists`,
                )
            }
            ;(proxy as any)[action] = (
                ..._args: JsonValue[]
            ): Promise<JsonValue> => {
                return new Promise((resolve, _reject) => {
                    resolve({})
                })
            }
        })

        return proxy
    }

    // TODO remove ts-ignore
    // @ts-ignore
    private send(message: Message): void {
        const error = validateMessage(message)

        if (error) {
            this.emit('error', error)
            return
        }

        if (!this.stream) {
            // TODO reply with an appropriate error message instead
            throw new SyncOtError(ErrorCodes.NotConnected)
        }

        this.stream.write(message)
        return
    }

    private onData(message: Message): void {
        const error = validateMessage(message)

        if (error) {
            this.emit('error', error)
            return
        }

        // Emit an internal event for the services.
        const handled: boolean = (this as EventEmitter).emit(
            `message.${getSource(message)}.${message.service}`,
            message,
        )

        if (!handled) {
            // TODO reply with an appropriate error message instead
            this.emit(
                'error',
                new SyncOtError(ErrorCodes.UnhandledMessage, undefined, {
                    message,
                }),
            )
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
 * @event error The following `SyncOtError`s may be emitted:
 *   - `InvalidMessage`: An invalid message has been received from the associated stream.
 */
export interface Connection extends Interface<ConnectionImpl> {}

/**
 * Creates a new `Connection`.
 */
export function createConnection(): Connection {
    return new ConnectionImpl()
}