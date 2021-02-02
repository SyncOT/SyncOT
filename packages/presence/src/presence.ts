import { Auth } from '@syncot/auth'
import {
    createInvalidEntityError,
    EmitterInterface,
    TypedEventEmitter,
} from '@syncot/util'
import { Duplex } from 'readable-stream'

/**
 * A complete representation of user presence.
 */
export interface Presence {
    /**
     * The ID of the session which owns the presence.
     */
    readonly sessionId: string
    /**
     * The ID of the user which owns the presence.
     */
    readonly userId: string
    /**
     * The ID of the location where the user is present.
     */
    readonly locationId: string
    /**
     * Arbitrary extra data shared by the user.
     */
    readonly data: any
    /**
     * The timestamp indicating when the presence was last modified.
     */
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

/**
 * Events emitted by PresenceClient.
 */
export interface PresenceClientEvents {
    /**
     * Emitted when the local Presence changes.
     */
    presence: void
    error: Error
}

/**
 * Events emitted by PresenceService.
 */
export interface PresenceServiceEvents {
    error: Error
}

/**
 * Manages presence on the client side and synchronizes it with PresenceService.
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
 */
export interface PresenceService
    extends EmitterInterface<TypedEventEmitter<PresenceServiceEvents>> {
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
