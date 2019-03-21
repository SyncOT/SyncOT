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
    localPresence: void
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
 * @event localPresence When the local presence has changed.
 * @event online The PresenceClient has connected to PresenceService.
 * @event offline The PresenceClient has disconnected from PresenceService.
 * @event error A presence-related error has occurred.
 * @event destroy The PresenceClient has been destroyed.
 */
export interface PresenceClient
    extends EmitterInterface<SyncOtEmitter<PresenceClientEvents>> {
    readonly sessionId: SessionId | undefined
    readonly userId: UserId | undefined
    location: Location
    readonly localPresence: Presence | undefined
    readonly online: boolean

    getPresenceBySessionId(sessionId: SessionId): Promise<Presence | undefined>
    getPresenceByUserId(userId: UserId): Promise<Presence[]>
    getPresenceByLocation(location: Location): Promise<Presence[]>
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
     * Submits a new presence object for the current session.
     */
    submitPresence(presence: Presence): Promise<void>

    getPresenceBySessionId(sessionId: SessionId): Promise<Presence | undefined>
    getPresenceByUserId(userId: UserId): Promise<Presence[]>
    getPresenceByLocation(location: Location): Promise<Presence[]>
}
