import { UserId } from '@syncot/auth'
import { SessionId } from '@syncot/session'
import { EmitterInterface, SyncOtEmitter } from '@syncot/util'
// import { Validator, validate } from '@syncot/core'
// import { createInvalidEntityError } from '@syncot/error'

export type LocationId = ArrayBuffer | string | number | null

export interface PresenceDataArray extends Array<PresenceData> {}
export interface PresenceDataObject {
    [key: string]: PresenceData
}
export type PresenceData =
    | ArrayBuffer
    | string
    | number
    | boolean
    | null
    | PresenceDataArray
    | PresenceDataObject

export interface Presence {
    readonly sessionId: SessionId
    readonly userId: UserId
    readonly locationId: LocationId
    readonly data: PresenceData
}

export interface PresenceClientEvents {
    localPresence: void
    online: void
    offline: void
    error: Error
}

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
    locationId: LocationId
    readonly localPresence: Presence | undefined
    readonly online: boolean

    getPresenceBySessionId(sessionId: SessionId): Promise<Presence | undefined>
    getPresenceByUserId(userId: UserId): Promise<Presence[]>
    getPresenceByLocationId(locationId: LocationId): Promise<Presence[]>
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
    getPresenceByLocationId(locationId: LocationId): Promise<Presence[]>
}

// export const validatePresence: Validator<Presence> = validate([
//     presence =>
//         typeof presence === 'object' && presence != null ? undefined : createInvalidEntityError('Presence', presence, null),
//     presence =>
//         typeof presence
// ])
