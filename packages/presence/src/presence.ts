import { createInvalidEntityError } from '@syncot/error'
import {
    EmitterInterface,
    Id,
    isId,
    SyncOtEmitter,
    validate,
    Validator,
} from '@syncot/util'
import { Duplex } from 'stream'

export interface Presence {
    readonly sessionId: Id
    readonly userId: Id
    readonly locationId: Id
    readonly data: any
    readonly lastModified: number
}

export const validatePresence: Validator<Presence> = validate([
    presence =>
        typeof presence === 'object' && presence != null
            ? undefined
            : createInvalidEntityError('Presence', presence, null),
    presence =>
        isId(presence.sessionId)
            ? undefined
            : createInvalidEntityError('Presence', presence, 'sessionId'),
    presence =>
        isId(presence.userId)
            ? undefined
            : createInvalidEntityError('Presence', presence, 'userId'),
    presence =>
        isId(presence.locationId)
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
    readonly sessionId: Id | undefined
    readonly userId: Id | undefined
    locationId: Id | undefined
    data: any
    readonly localPresence: Presence | undefined
    readonly online: boolean

    getPresenceBySessionId(sessionId: Id): Promise<Presence | null>
    getPresenceByUserId(userId: Id): Promise<Presence[]>
    getPresenceByLocationId(locationId: Id): Promise<Presence[]>

    streamPresenceBySessionId(sessionId: Id): Promise<Duplex>
    streamPresenceByUserId(userId: Id): Promise<Duplex>
    streamPresenceByLocationId(locationId: Id): Promise<Duplex>
}

/**
 * Manages presence on the server side.
 *
 * @event outOfSync The managed presence is out of sync across the presence system.
 * @event inSync The managed presence is in sync across the presence system.
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

    getPresenceBySessionId(sessionId: Id): Promise<Presence | null>
    getPresenceByUserId(userId: Id): Promise<Presence[]>
    getPresenceByLocationId(locationId: Id): Promise<Presence[]>

    streamPresenceBySessionId(sessionId: Id): Promise<Duplex>
    streamPresenceByUserId(userId: Id): Promise<Duplex>
    streamPresenceByLocationId(locationId: Id): Promise<Duplex>
}

/**
 * The type of PresenceMessage instances.
 */
export const enum PresenceMessageType {
    /**
     * Remove all current presence objects and add the specified presence objects.
     */
    RESET,
    /**
     * Add the specified presence objects to the current list of presence objects.
     */
    ADD,
    /**
     * Remove the presence objects with the specifed session IDs from the current list of presence objects.
     */
    REMOVE,
}

/**
 * Presence messages emitted by the streams returned by `streamPresenceBy...` functions.
 */
export type PresenceMessage =
    | [PresenceMessageType.RESET, ...Presence[]]
    | [PresenceMessageType.ADD, ...Presence[]]
    | [PresenceMessageType.REMOVE, ...Id[]]
