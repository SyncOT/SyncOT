import { EventEmitter } from 'events'
import { PubSub } from './pubSub'

/**
 * Creates a PubSub which broadcasts messages only locally - within the current process.
 */
export function createPubSub(): PubSub {
    return new LocalPubSub()
}

class LocalPubSub implements PubSub {
    private readonly hub: EventEmitter = new EventEmitter()

    public subscribe(channel: string, callback: (message: any) => void): void {
        this.hub.on(channel, callback)
    }

    public unsubscribe(
        channel: string,
        callback: (message: any) => void,
    ): void {
        this.hub.off(channel, callback)
    }

    public publish(channel: string, message: any): void {
        this.hub.emit(channel, message)
    }
}
