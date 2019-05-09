import { createInvalidEntityError } from '@syncot/error'
import {
    EmitterInterface,
    SyncOtEmitter,
    validate,
    Validator,
} from '@syncot/util'
import { Duplex } from 'stream'

export interface Presence {
    readonly sessionId: string
    readonly userId: string
    readonly locationId: string
    readonly data: any
    readonly lastModified: number
}

export const validatePresence: Validator<Presence> = validate([
    presence =>
        typeof presence === 'object' && presence != null
            ? undefined
            : createInvalidEntityError('Presence', presence, null),
    presence =>
        typeof presence.sessionId === 'string'
            ? undefined
            : createInvalidEntityError('Presence', presence, 'sessionId'),
    presence =>
        typeof presence.userId === 'string'
            ? undefined
            : createInvalidEntityError('Presence', presence, 'userId'),
    presence =>
        typeof presence.locationId === 'string'
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
    readonly sessionId: string | undefined
    readonly userId: string | undefined
    locationId: string | undefined
    data: any
    readonly localPresence: Presence | undefined
    readonly online: boolean

    getPresenceBySessionId(sessionId: string): Promise<Presence | null>
    getPresenceByUserId(userId: string): Promise<Presence[]>
    getPresenceByLocationId(locationId: string): Promise<Presence[]>

    streamPresenceBySessionId(sessionId: string): Promise<Duplex>
    streamPresenceByUserId(userId: string): Promise<Duplex>
    streamPresenceByLocationId(locationId: string): Promise<Duplex>
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

    getPresenceBySessionId(sessionId: string): Promise<Presence | null>
    getPresenceByUserId(userId: string): Promise<Presence[]>
    getPresenceByLocationId(locationId: string): Promise<Presence[]>

    streamPresenceBySessionId(sessionId: string): Promise<Duplex>
    streamPresenceByUserId(userId: string): Promise<Duplex>
    streamPresenceByLocationId(locationId: string): Promise<Duplex>
}

/**
 * Add the specified presence objects
 * to the current list of presence objects.
 */
export type PresenceAddedMessage = [true, ...Presence[]]

/**
 * Remove the presence objects with the specifed session IDs
 * from the current list of presence objects.
 */
export type PresenceRemovedMessage = [false, ...string[]]

/**
 * Presence messages emitted by the streams returned by `streamPresenceBy...` functions.
 */
export type PresenceMessage = PresenceAddedMessage | PresenceRemovedMessage
