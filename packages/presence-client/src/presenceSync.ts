import { Presence, PresenceClient, PresenceMessage } from '@syncot/presence'
import { assert, EmitterInterface, noop, SyncOtEmitter } from '@syncot/util'
import { Duplex } from 'readable-stream'

/**
 * The events emitted by `PresenceSync`.
 */
export interface PresenceSyncEvents {
    change: string
    error: Error
}

/**
 * Keeps a subset `Presence` objects in sync with a server.
 * @event change `(sessionId: string) => void` Emitted after the `Presence` object
 *   with the specified `sessionId` has changed.
 * @event error `(error: Error) => void` Emitted when an underlying `Presence` stream gets an error.
 * @event destroy `() => void` Emitted once this `PresenceSync` object gets destroyed.
 */
export interface PresenceSync
    extends EmitterInterface<SyncOtEmitter<PresenceSyncEvents>> {
    /**
     * A map of Presence objects indexed by sessionId.
     * It is synchronized with a server based on a filter.
     */
    readonly presence: ReadonlyMap<string, Presence>
}

/**
 * Synchronizes `Presence` objects by the specified `sessionId`.
 */
export function syncPresenceBySessionId(
    presenceClient: PresenceClient,
    sessionId: string,
): PresenceSync {
    assertPresenceClient(presenceClient)
    assertString(sessionId, 'sessionId')
    return new Sync(presenceClient, sessionId, undefined, undefined)
}

/**
 * Synchronizes `Presence` objects by the specified `userId`.
 */
export function syncPresenceByUserId(
    presenceClient: PresenceClient,
    userId: string,
): PresenceSync {
    assertPresenceClient(presenceClient)
    assertString(userId, 'userId')
    return new Sync(presenceClient, undefined, userId, undefined)
}

/**
 * Synchronizes `Presence` objects by the specified `locationId`.
 */
export function syncPresenceByLocationId(
    presenceClient: PresenceClient,
    locationId: string,
): PresenceSync {
    assertPresenceClient(presenceClient)
    assertString(locationId, 'locationId')
    return new Sync(presenceClient, undefined, undefined, locationId)
}

/**
 * Synchronizes `Presence` objects by the current `locationId`.
 */
export function syncPresenceByCurrentLocationId(
    presenceClient: PresenceClient,
): PresenceSync {
    assertPresenceClient(presenceClient)
    return new Sync(presenceClient, undefined, undefined, undefined)
}

function assertPresenceClient(presenceClient: PresenceClient): void {
    assert(
        presenceClient && !presenceClient.destroyed,
        'Argument "presenceClient" must be a non-destroyed PresenceClient.',
    )
}

function assertString(value: string, name: string): void {
    assert(typeof value === 'string', `Argument "${name}" must be a string.`)
}

class Sync extends SyncOtEmitter<PresenceSyncEvents> implements PresenceSync {
    public readonly presence: Map<string, Presence> = new Map()
    private stream: Duplex | undefined = undefined
    private streamPromise: Promise<Duplex> | undefined = undefined
    private currentLocationId: string | undefined = undefined

    public constructor(
        private readonly presenceClient: PresenceClient,
        private readonly sessionId: string | undefined,
        private readonly userId: string | undefined,
        private readonly locationId: string | undefined,
    ) {
        super()
        this.presenceClient.on('destroy', this.onDestroy)
        this.presenceClient.on('active', this.onOnline)
        this.presenceClient.on('presence', this.onLocalPresence)
        this.initStream()
    }

    public destroy(): void {
        if (this.destroyed) {
            return
        }
        this.presenceClient.off('destroy', this.onDestroy)
        this.presenceClient.off('active', this.onOnline)
        this.presenceClient.off('presence', this.onLocalPresence)
        this.streamPromise = undefined
        if (this.stream) {
            this.stream.destroy()
        }
        super.destroy()
    }

    private onDestroy = (): void => {
        this.destroy()
    }

    private onOnline = (): void => {
        this.initStream()
    }

    private onError = (error: Error): void => {
        this.emitAsync('error', error)
    }

    private onData = (message: PresenceMessage): void => {
        if (message[0]) {
            for (let i = 1, l = message.length; i < l; ++i) {
                const presence = message[i] as Presence
                this.presence.set(presence.sessionId, presence)
                this.emitAsync('change', presence.sessionId)
            }
        } else {
            for (let i = 1, l = message.length; i < l; ++i) {
                const sessionId = message[i] as string
                this.presence.delete(sessionId)
                this.emitAsync('change', sessionId)
            }
        }
    }

    private onClose = (): void => {
        this.stream!.off('error', this.onError)
        this.stream!.off('data', this.onData)
        this.stream!.off('close', this.onClose)
        this.stream!.on('error', noop)
        this.stream = undefined
        this.presence.forEach(presence => {
            this.emitAsync('change', presence.sessionId)
        })
        this.presence.clear()
        this.initStream()
    }

    private onLocalPresence = (): void => {
        if (
            this.stream &&
            this.sessionId === undefined &&
            this.userId === undefined &&
            this.locationId === undefined &&
            this.currentLocationId !== this.presenceClient.locationId
        ) {
            // We're syncing by `currentLocationId` which has just changed,
            // so we need to close the old stream and open a new one for
            // the new `locationId`.
            this.stream.destroy()
        }
    }

    private initStream(): void {
        if (this.stream) {
            this.stream.destroy()
            return
        }

        if (!this.presenceClient.active) {
            return
        }

        this.currentLocationId = this.presenceClient.locationId
        const streamPromise =
            this.sessionId !== undefined
                ? this.presenceClient.streamPresenceBySessionId(this.sessionId)
                : this.userId !== undefined
                ? this.presenceClient.streamPresenceByUserId(this.userId)
                : this.locationId !== undefined
                ? this.presenceClient.streamPresenceByLocationId(
                      this.locationId,
                  )
                : this.currentLocationId !== undefined
                ? this.presenceClient.streamPresenceByLocationId(
                      this.currentLocationId,
                  )
                : undefined
        this.streamPromise = streamPromise

        if (!streamPromise) {
            return
        }

        streamPromise.then(
            stream => {
                if (this.streamPromise === streamPromise) {
                    this.stream = stream
                    this.stream.on('error', this.onError)
                    this.stream.on('data', this.onData)
                    this.stream.on('close', this.onClose)
                } else {
                    stream.on('error', noop)
                    stream.destroy()
                }
            },
            error => {
                if (this.streamPromise === streamPromise) {
                    this.onError(error)
                }
            },
        )
    }
}
