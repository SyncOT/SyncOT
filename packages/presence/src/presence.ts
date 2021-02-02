import { Auth } from '@syncot/auth'
import {
    createInvalidEntityError,
    EmitterInterface,
    SyncOTEmitter,
    TypedEventEmitter,
} from '@syncot/util'
import { Duplex } from 'readable-stream'

export interface Presence {
    readonly sessionId: string
    readonly userId: string
    readonly locationId: string
    readonly data: any
    readonly lastModified: number
}

/**
 * Throws an error if `presence` is invalid.
 * @returns Unchanged `presence`.
 */
export function validatePresence(presence: Presence): Presence {
    if (typeof presence !== 'object' || presence == null)
        throw createInvalidEntityError('Presence', presence, null)

    if (typeof presence.sessionId !== 'string')
        throw createInvalidEntityError('Presence', presence, 'sessionId')

    if (typeof presence.userId !== 'string')
        throw createInvalidEntityError('Presence', presence, 'userId')

    if (typeof presence.locationId !== 'string')
        throw createInvalidEntityError('Presence', presence, 'locationId')

    if (
        typeof presence.lastModified !== 'number' ||
        !Number.isFinite(presence.lastModified)
    )
        throw createInvalidEntityError('Presence', presence, 'lastModified')

    if (!presence.hasOwnProperty('data'))
        throw createInvalidEntityError('Presence', presence, 'data')

    return presence
}

export interface PresenceClientEvents {
    presence: void
    error: Error
}

export interface PresenceServiceEvents {
    error: Error
}

/**
 * Manages presence on the client side and synchronizes it with PresenceService.
 *
 * @event presence When the local presence has changed.
 * @event active The PresenceClient starts to synchronize presence with the PresenceService.
 * @event inactive The PresenceClient stops to synchronize presence with the  PresenceService.
 * @event error A presence-related error has occurred.
 */
export interface PresenceClient
    extends EmitterInterface<TypedEventEmitter<PresenceClientEvents>> {
    /**
     * The Auth instance used for authentication and authorization.
     */
    readonly auth: Auth
    /**
     * The read-write local presence `locationId`.
     */
    locationId: string | undefined
    /**
     * The read-write local presence `data`.
     */
    data: any
    /**
     * The read-only local presence.
     * It is `undefined` when `auth.active === false` or `locationId` is `undefined`.
     */
    readonly presence: Presence | undefined

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
 * @event error A presence-related error has occurred.
 * @event destroy The PresenceClient has been destroyed.
 */
export interface PresenceService
    extends EmitterInterface<SyncOTEmitter<PresenceServiceEvents>> {
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
