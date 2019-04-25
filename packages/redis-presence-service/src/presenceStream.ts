import {
    Presence,
    PresenceAddedMessage,
    PresenceRemovedMessage,
} from '@syncot/presence'
import { Id, ScalarMap } from '@syncot/util'
import { AssertionError, strict as assert } from 'assert'
import { Duplex } from 'stream'

/**
 * A Presence object stream which emits data events whenever Presence objects
 * are added or removed.
 *
 * It gets Presence objects from 2 sources:
 *
 * - the `loadPresence` function passed into the constructor AND
 * - the `addPresence` and `removePresence` methods.
 *
 * The `loadPresence` function is called once on startup and then periodically
 * at the rate defined by the `pollingInterval` constructor parameter.
 *
 * The internal presence data, which drives the emitted `data` events, is updated
 * based on the last-write-wins policy with one exception - the internal presence
 * object is not updated with one loaded with `loadPresence`, if it has been updated
 * within 1 second by either `addPresence` or `removePresence` methods.
 */
export class PresenceStream extends Duplex {
    private publishedDataMap: ScalarMap<Id, PublishedData> = new ScalarMap()
    private timeoutHandle: NodeJS.Timeout | undefined = undefined

    /**
     *
     * @param loadPresence A function which loads a list of presence objects.
     * @param pollingInterval An interval at which `loadPresence` should be called in seconds.
     */
    public constructor(
        private readonly loadPresence: () => Promise<Presence[]>,
        private readonly pollingInterval: number,
    ) {
        super(presenceStreamOptions)
        assert.ok(
            Number.isSafeInteger(pollingInterval) && pollingInterval >= 10,
            'Argument "pollingInterval" must be a safe integer >= 10.',
        )
        this.scheduleLoadPresence()
    }

    public _read() {
        // Nothing to do.
    }
    public _write(
        _data: any,
        _encoding: any,
        callback: (error?: Error | null) => void,
    ) {
        callback(nonWritableError)
    }
    public _final(callback: () => void) {
        callback()
        this.destroy()
    }
    public _destroy(
        error: Error | null,
        callback: (error: Error | null) => void,
    ) {
        clearTimeout(this.timeoutHandle!)
        callback(error)
    }

    /**
     * Adds or replaces the specified presence object.
     */
    public addPresence(presence: Presence): void {
        const now = Date.now()
        const sessionId = presence.sessionId
        const publishedData = this.publishedDataMap.get(sessionId)

        if (publishedData) {
            publishedData.apiLastUpdated = now
            if (
                !publishedData.presence ||
                publishedData.presence.lastModified < presence.lastModified
            ) {
                publishedData.presence = presence
                this.push([true, presence])
            }
        } else {
            this.publishedDataMap.set(sessionId, {
                apiLastUpdated: now,
                loadLastUpdated: 0,
                presence,
            })
            this.push([true, presence])
        }
    }

    /**
     * Removes a presence object with the specified sessionId.
     */
    public removePresence(sessionId: Id): void {
        const now = Date.now()
        const publishedData = this.publishedDataMap.get(sessionId)

        if (publishedData) {
            publishedData.apiLastUpdated = now
            if (publishedData.presence) {
                publishedData.presence = null
                this.push([false, sessionId])
            }
        }
    }

    private scheduleLoadPresence = (): void => {
        this.timeoutHandle = setTimeout(
            this.scheduleLoadPresence,
            this.pollingInterval * 1000,
        )
        this.loadPresence().then(this.onLoadPresence, this.onError)
    }

    private onLoadPresence = (presenceList: Presence[]): void => {
        const now = Date.now()
        const presenceAddedMessage: PresenceAddedMessage = [true]
        const presenceRemovedMessage: PresenceRemovedMessage = [false]

        for (let i = 0, l = presenceList.length; i < l; ++i) {
            const presence = presenceList[i]
            const sessionId = presence.sessionId
            const publishedData = this.publishedDataMap.get(sessionId)

            if (publishedData) {
                publishedData.loadLastUpdated = now
                if (
                    publishedData.apiLastUpdated + 1000 <= now &&
                    (!publishedData.presence ||
                        publishedData.presence.lastModified <
                            presence.lastModified)
                ) {
                    publishedData.presence = presence
                    presenceAddedMessage.push(presence)
                }
            } else {
                this.publishedDataMap.set(sessionId, {
                    apiLastUpdated: 0,
                    loadLastUpdated: now,
                    presence,
                })
                presenceAddedMessage.push(presence)
            }
        }

        this.publishedDataMap.forEach((publishedData, sessionId) => {
            if (
                publishedData.loadLastUpdated !== now &&
                publishedData.apiLastUpdated + 1000 <= now
            ) {
                this.publishedDataMap.delete(sessionId)
                if (publishedData.presence) {
                    presenceRemovedMessage.push(sessionId)
                }
            }
        })

        if (presenceAddedMessage.length > 1) {
            this.push(presenceAddedMessage)
        }

        if (presenceRemovedMessage.length > 1) {
            this.push(presenceRemovedMessage)
        }
    }

    private onError = (error: Error): void => {
        this.emit('error', error)
    }
}

const presenceStreamOptions = {
    allowHalfOpen: false,
    objectMode: true,
}

const nonWritableError = new AssertionError({
    message: 'PresenceStream does not support "write".',
})

interface PublishedData {
    apiLastUpdated: number
    loadLastUpdated: number
    presence: Presence | null
}
