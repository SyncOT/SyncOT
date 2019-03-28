import { isUserId, UserId } from '@syncot/auth'
import { validate, Validator } from '@syncot/core'
import { createInvalidEntityError } from '@syncot/error'
import { isSessionId, SessionId } from '@syncot/session'
import { EmitterInterface, SyncOtEmitter, toBuffer } from '@syncot/util'

export type LocationId = ArrayBuffer | string | number | null

/**
 * Returns true, if the specified value is a location ID, otherwise returns false.
 */
export function isLocationId(value: any): value is LocationId {
    const type = typeof value
    return (
        type === 'string' ||
        type === 'number' ||
        value === null ||
        value instanceof ArrayBuffer
    )
}

/**
 * Returns true, if the two provided values are equal location IDs, otherwise returns false.
 */
export function locationIdEqual(value1: any, value2: any): boolean {
    const type = typeof value1

    if (type === 'string' || type === 'number' || value1 === null) {
        return value1 === value2
    } else if (value1 instanceof ArrayBuffer && value2 instanceof ArrayBuffer) {
        return toBuffer(value1).compare(toBuffer(value2)) === 0
    } else {
        return false
    }
}

export interface Presence {
    readonly sessionId: SessionId
    readonly userId: UserId
    readonly locationId: LocationId
    readonly data: any
    readonly lastModified: number
}

export const validatePresence: Validator<Presence> = validate([
    presence =>
        typeof presence === 'object' && presence != null
            ? undefined
            : createInvalidEntityError('Presence', presence, null),
    presence =>
        isSessionId(presence.sessionId)
            ? undefined
            : createInvalidEntityError('Presence', presence, 'sessionId'),
    presence =>
        isUserId(presence.userId)
            ? undefined
            : createInvalidEntityError('Presence', presence, 'userId'),
    presence =>
        isLocationId(presence.locationId)
            ? undefined
            : createInvalidEntityError('Presence', presence, 'locationId'),
    presence =>
        typeof presence.lastModified === 'number' &&
        Number.isFinite(presence.lastModified)
            ? undefined
            : createInvalidEntityError('Presence', presence, 'lastModified'),
    presence =>
        presence.hasOwnProperty('data')
            ? undefined
            : createInvalidEntityError('Presence', presence, 'data'),
])

export interface PresenceClientEvents {
    localPresence: void
    online: void
    offline: void
    error: Error
}

export interface PresenceServiceEvents {
    outOfSync: void
    inSync: void
    publish: void
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
 * @event outOfSync The managed presence is out of sync across the presence system.
 * @event inSync The managed presence is in sync across the presence system.
 * @event publish The managed presence has been published.
 * @event error A presence-related error has occurred.
 * @event destroy The PresenceClient has been destroyed.
 */
export interface PresenceService
    extends EmitterInterface<SyncOtEmitter<PresenceServiceEvents>> {
    /**
     * Submits a new presence object for the current session.
     */
    submitPresence(presence: Presence): Promise<void>

    /**
     * Removes the presence object from the current session.
     */
    removePresence(): Promise<void>

    getPresenceBySessionId(sessionId: SessionId): Promise<Presence | undefined>
    getPresenceByUserId(userId: UserId): Promise<Presence[]>
    getPresenceByLocationId(locationId: LocationId): Promise<Presence[]>
}
