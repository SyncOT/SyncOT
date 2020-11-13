import {
    Presence,
    PresenceAddedMessage,
    PresenceRemovedMessage,
} from '@syncot/presence'
import { noop } from '@syncot/util'
import { Duplex } from 'readable-stream'

/**
 * A Presence object stream which emits data events whenever Presence objects
 * are added or removed.
 */
export class PresenceStream extends Duplex {
    // These properties are for use by the Presence service.
    public loadAll: () => void = noop
    public loadOne: (id: string) => void = noop
    public channel: string = ''

    /**
     * Maps presence `sessionId` to `lastModified`.
     */
    private presenceMap: Map<string, number> = new Map()

    public constructor() {
        super(presenceStreamOptions)
    }

    public _read() {
        // Nothing to do.
    }
    public _write(
        _data: any,
        _encoding: any,
        callback: (error?: Error | null) => void,
    ) {
        callback(new TypeError('PresenceStream does not support "write".'))
    }
    public _final(callback: () => void) {
        callback()
        this.destroy()
    }

    /**
     * Adds or replaces the specified presence object and
     * emits a corresponding `data` event.
     */
    public addPresence(presence: Presence): void {
        const { sessionId, lastModified } = presence
        const oldLastModified = this.presenceMap.get(sessionId)

        if (oldLastModified !== lastModified) {
            this.presenceMap.set(sessionId, lastModified)
            this.push([true, presence])
        }
    }

    /**
     * Removes a presence object with the specified sessionId and
     * emits a corresponding `data` event.
     */
    public removePresence(sessionId: string): void {
        if (this.presenceMap.delete(sessionId)) {
            this.push([false, sessionId])
        }
    }

    /**
     * Adds or replaces the presence objects from the specified list and
     * removes the presence objects which are not in that list.
     * Emits `data` events only when presence objects are actually added,
     * replaced or deleted. Existing presence objects are compared based
     * on the `sessionId` and `lastModified` properties only.
     */
    public resetPresence = (presenceList: Presence[]): void => {
        const presenceAddedMessage: PresenceAddedMessage = [true]
        const presenceRemovedMessage: PresenceRemovedMessage = [false]

        // Add or replace presence.
        for (let i = 0, l = presenceList.length; i < l; ++i) {
            const presence = presenceList[i]
            const { sessionId, lastModified } = presence
            const oldLastModified = this.presenceMap.get(sessionId)

            if (oldLastModified !== lastModified) {
                presenceAddedMessage.push(presence)
                this.presenceMap.set(sessionId, lastModified)
            }
        }

        // Remove presence.
        // This algorithm is simple and fast for short presence lists, however,
        // it's not optimal for longer lists. Optimize it later, if necessary.
        this.presenceMap.forEach((_, sessionId) => {
            for (let i = 0, l = presenceList.length; i < l; ++i) {
                if (presenceList[i].sessionId === sessionId) {
                    return
                }
            }
            this.presenceMap.delete(sessionId)
            presenceRemovedMessage.push(sessionId)
        })

        if (presenceAddedMessage.length > 1) {
            this.push(presenceAddedMessage)
        }

        if (presenceRemovedMessage.length > 1) {
            this.push(presenceRemovedMessage)
        }
    }
}

const presenceStreamOptions = {
    allowHalfOpen: false,
    objectMode: true,
}
