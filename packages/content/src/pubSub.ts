/**
 * The publish-subscribe interface for notifying about content changes.
 */
export interface PubSub {
    /**
     * Subscribes to receive messages published on the specified channel.
     * @param channel The channel name.
     * @param callback The function to call when a message in published.
     */
    subscribe(channel: string, callback: (message: any) => void): void
    /**
     * Unsubscribes the `callback` from the `channel`.
     * @param channel The channel name.
     * @param callback The same function which was earlier passed to `subscribe`.
     */
    unsubscribe(channel: string, callback: (message: any) => void): void
    /**
     * Publishes the `message` on the `channel`.
     * @param channel The channel name.
     * @param message The message to publish.
     */
    publish(channel: string, message: any): void
}
