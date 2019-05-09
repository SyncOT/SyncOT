import {
    Presence,
    PresenceAddedMessage,
    PresenceRemovedMessage,
} from '@syncot/presence'
import { ScalarMap } from '@syncot/util'
import { AssertionError } from 'assert'
import { Duplex } from 'stream'

/**
 * A Presence object stream which emits data events whenever Presence objects
 * are added or removed.
 */
export class PresenceStream extends Duplex {
    private presenceMap: ScalarMap<string, Presence> = new ScalarMap()

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
        callback(nonWritableError)
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
        this.presenceMap.set(presence.sessionId, presence)
        this.push([true, presence])
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
     * Add or replaces the presence objects from the specified list and
     * remove the presence objects which are not in that list.
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
            const sessionId = presence.sessionId
            const currentPresence = this.presenceMap.get(sessionId)

            if (
                !currentPresence ||
                currentPresence.lastModified !== presence.lastModified
            ) {
                presenceAddedMessage.push(presence)
                this.presenceMap.set(sessionId, presence)
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

const nonWritableError = new AssertionError({
    message: 'PresenceStream does not support "write".',
})
