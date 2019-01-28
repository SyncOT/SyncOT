import { JsonValue } from './json'
import { Interface } from './util'

/**
 * The message exchanged by the message bus.
 */
export type Message = JsonValue
/**
 * Defines a single level in a hierarchy of topics.
 */
export type TopicItem = string | number | boolean
/**
 * An empty `Array` is the most generic `Topic` and can be used to receive all messages.
 * The more `TopicItem`s are appended to the `Array`, the more specific the `Topic`, which
 * can be used to receive only the required `Message`s efficiently.
 */
export type Topic = TopicItem[]
/**
 * Called when a message is sent to a topic.
 * @param topic The topic the message was sent to.
 * @param message The sent message.
 */
export type Callback = (topic: Topic, message: Message) => void

/**
 * A message bus for communication between SyncOT components.
 */
class MessageBusImpl {
    private listeners: Listeners = new Listeners()

    /**
     * Sends the `message` to the specified `topic` asynchronously.
     *
     * @param topic The topic to send the message to.
     * @param message A message to send.
     */
    public send(topic: Topic, message: Message): boolean {
        const topicCopy = topic.slice()
        const callbacks = this.listeners.getCallbacks(topic)
        Promise.resolve().then(() =>
            callbacks.forEach(callback => callback(topicCopy, message)),
        )
        return callbacks.length > 0
    }

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
    public on(topic: Topic, callback: Callback): this {
        this.listeners.registerCallback(topic, callback)
        return this
    }

    /**
     * Unregisters the previously registered `callback` from the specified `topic`.
     *
     * In case the same `callback` has been registered multiple times for the same topic,
     * only the most recently registered `callback` is unregistered.
     *
     * @param topic The topic the callback has been registered on.
     * @param callback The registered callback.
     */
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
        index: number = 0,
        callbacks: Callback[] = [],
    ): Callback[] {
        if (index < topic.length) {
            const childListeners = this.children.get(topic[index])

            if (childListeners != null) {
                childListeners.getCallbacks(topic, index + 1, callbacks)
            }
        } else {
            callbacks.push(...this.callbacks)
        }
        return callbacks
    }

    public registerCallback(
        topic: Topic,
        callback: Callback,
        index: number = 0,
    ): void {
        if (index < topic.length) {
            const topicItem = topic[index]
            let childListeners = this.children.get(topicItem)

            if (childListeners == null) {
                childListeners = new Listeners()
                this.children.set(topicItem, childListeners)
            }

            childListeners.registerCallback(topic, callback, index + 1)
        } else {
            this.callbacks.push(callback)
        }
    }

    public unregisterCallback(
        topic: Topic,
        callback: Callback,
        index: number = 0,
    ): void {
        if (index < topic.length) {
            const childListeners = this.children.get(topic[index])

            if (childListeners != null) {
                childListeners.unregisterCallback(topic, callback, index + 1)
            }
        } else {
            const lastIndex = this.callbacks.lastIndexOf(callback)

            if (lastIndex >= 0) {
                this.callbacks.splice(lastIndex, 1)
            }
        }
    }
}

export interface MessageBus extends Interface<MessageBusImpl> {}

export function createMessageBus(): MessageBus {
    return new MessageBusImpl()
}
