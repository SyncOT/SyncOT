import { JsonValue } from './json'

/**
 * Defines a single level in a hierarchy of topics.
 */
type TopicItem = string | number | boolean
/**
 * An empty `Array` is the most generic `Topic` and can be used to receive all messages.
 * The more `TopicItem`s are appended to the `Array`, the more specific the `Topic`, which
 * can be used to receive only the required messages efficiently.
 */
export type Topic = TopicItem[]
/**
 * Called when a message is sent to a topic.
 * @param topic The topic the message was sent to.
 * @param message The sent message.
 */
type Callback = (topic: Topic, message: JsonValue) => void

/**
 * A message bus for communication between SyncOT components.
 *
 * @param M Message type.
 * @param TS Topic type for sending messages.
 * @param TR Topic type for receiving messages.
 */
export interface MessageBus<
    M extends JsonValue = JsonValue,
    TS extends Topic = Topic,
    TR extends Topic = TS
> {
    /**
     * Sends the `message` to the specified `topic` asynchronously.
     *
     * @param topic The topic to send the message to.
     * @param message A message to send.
     * @returns `true`, if some callbacks will be executed for this message, otherwise `false`.
     */
    send(topic: TS, message: M): boolean

    /**
     * Registers the `callback` on the specified `topic`.
     *
     * Messages sent to the specified `topic`, or its sub-topics, will trigger the `callback`.
     *
     * Only the callbacks which are registered at the time of the call to `send`
     * will receive the message. Registering or unregistering callbacks while a
     * message is being dispatched does not affect which callbacks will receive that message.
     *
     * The same `callback` may be registered mutiple times for the same topic or different topics.
     * When a matching message is sent, the callback is triggered once per registration.
     *
     * @param topic The topic to receive the messages on.
     * @param callback The callback to call when a message is sent.
     */
    on(topic: TR, callback: (topic: TS, message: M) => void): this

    /**
     * Unregisters the previously registered `callback` from the specified `topic`.
     *
     * In case the same `callback` has been registered multiple times for the same topic,
     * only the most recently registered `callback` is unregistered.
     *
     * @param topic The topic the callback has been registered on.
     * @param callback The registered callback.
     */
    off(topic: TR, callback: (topic: TS, message: M) => void): this
}

class MessageBusImpl implements MessageBus {
    private listeners: Listeners = new Listeners()

    public send(topic: Topic, message: JsonValue): boolean {
        const topicCopy = topic.slice()
        const callbacks = this.listeners.getCallbacks(topic)
        Promise.resolve().then(() =>
            callbacks.forEach(callback => callback(topicCopy, message)),
        )
        return callbacks.length > 0
    }

    public on(topic: Topic, callback: Callback): this {
        this.listeners.registerCallback(topic, callback)
        return this
    }

    public off(topic: Topic, callback: Callback): this {
        this.listeners.unregisterCallback(topic, callback)
        return this
    }
}

class Listeners {
    public callbacks: Callback[] = []
    public children: Map<TopicItem, Listeners> = new Map()

    public getCallbacks(
        topic: Topic,
        index: number = -1,
        callbacks: Callback[] = [],
    ): Callback[] {
        const nextIndex = index + 1
        if (nextIndex < topic.length) {
            const childListeners = this.children.get(topic[nextIndex])

            if (childListeners != null) {
                childListeners.getCallbacks(topic, nextIndex, callbacks)
            }
        }
        callbacks.push(...this.callbacks)
        return callbacks
    }

    public registerCallback(
        topic: Topic,
        callback: Callback,
        index: number = -1,
    ): void {
        const nextIndex = index + 1
        if (nextIndex < topic.length) {
            const topicItem = topic[nextIndex]
            let childListeners = this.children.get(topicItem)

            if (childListeners == null) {
                childListeners = new Listeners()
                this.children.set(topicItem, childListeners)
            }

            childListeners.registerCallback(topic, callback, nextIndex)
        } else {
            this.callbacks.push(callback)
        }
    }

    public unregisterCallback(
        topic: Topic,
        callback: Callback,
        index: number = -1,
    ): void {
        const nextIndex = index + 1
        if (nextIndex < topic.length) {
            const topicItem = topic[nextIndex]
            const childListeners = this.children.get(topicItem)

            if (childListeners != null) {
                childListeners.unregisterCallback(topic, callback, nextIndex)

                if (childListeners.isEmpty()) {
                    this.children.delete(topicItem)
                }
            }
        } else {
            const lastIndex = this.callbacks.lastIndexOf(callback)

            if (lastIndex >= 0) {
                this.callbacks.splice(lastIndex, 1)
            }
        }
    }

    private isEmpty(): boolean {
        return this.children.size === 0 && this.callbacks.length === 0
    }
}

/**
 * Creates a new `MessageBus`.
 *
 * To get a strongly typed MessageBus, cast the result, eg
 *
 * ```
 * const messageBus = createMessageBus() as
 *     MessageBus< // A custom topic and message type.
 *         { body: string }, // Message type.
 *         ['custom-topic', 'sub-topic'], // Topic type for sending.
 *         ['custom-topic', 'sub-topic'] | ['custom-topic'] // Topic type for listening.
 *     > &
 *     MessageBus<
 *         { data: number }, // Message type.
 *         ['a-topic'] // Topic type for sending and listening.
 *     > &
 *     MessageBus<...> &
 *     ...
 * ```
 */
export function createMessageBus(): MessageBus {
    return new MessageBusImpl()
}
