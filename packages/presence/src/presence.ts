import { UserId } from '@syncot/auth'
import { SessionId } from '@syncot/session'
import { EmitterInterface, SyncOtEmitter } from '@syncot/util'

/**
 * The type of a "place" where a user might be present.
 */
export type Location = ArrayBuffer | string | number | boolean | null

/**
 * Defines user presence.
 */
export interface Presence {
    readonly sessionId: SessionId
    readonly userId: UserId
    readonly location: Location
}

/**
 * Events emitted by `PresenceClient`.
 */
export interface PresenceClientEvents {
    ready: void
    presenceChange: void
    online: void
    offline: void
    error: Error
}

/**
 * Events emitted by `PresenceService`.
 */
export interface PresenceServiceEvents {
    error: Error
}

/**
 * Manages presence on the client side and synchronizes it with PresenceService.
 *
 * @event ready The PresenceClient has been initialized.
 *   It is an error to use PresenceClient before it fires the "ready" event.
 * @event presenceChange The local presence object has changed.
 * @event online The PresenceClient has connected to PresenceService.
 * @event offline The PresenceClient has disconnected from PresenceService.
 * @event error A presence-related error has occurred.
 * @event destroy The PresenceClient has been destroyed.
 */
export interface PresenceClient
    extends EmitterInterface<SyncOtEmitter<PresenceClientEvents>> {
    /**
     * Get the current local presence object.
     */
    getCurrentPresence(): Presence

    /**
     * Sets the location of the local presence object.
     */
    setLocation(location: Location): void
}

/**
 * Manages presence on the server side.
 *
 * @event error A presence-related error has occurred.
 * @event destroy The PresenceClient has been destroyed.
 */
export interface PresenceService
    extends EmitterInterface<SyncOtEmitter<PresenceServiceEvents>> {
    /**
     * Initializes PresenceService with the specified presence object.
     */
    init(presence: Presence): Promise<void>

    /**
     * Sets the location to the specified value.
     */
    setLocation(location: Location): Promise<void>

    getPresenceBySessionId(sessionId: SessionId): Promise<Presence>
    getPresenceByUserId(userId: UserId): Promise<Presence[]>
    getPresenceByLocation(location: Location): Promise<Presence[]>
}
