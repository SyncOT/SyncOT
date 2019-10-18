import {
    createInvalidEntityError,
    EmitterInterface,
    SyncOtEmitter,
    validate,
    Validator,
} from '@syncot/util'
import { SpanContext } from 'opentracing'
import { Duplex } from 'readable-stream'

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
    presence: void
    active: void
    inactive: void
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
 * @event destroy The PresenceClient has been destroyed.
 */
export interface PresenceClient
    extends EmitterInterface<SyncOtEmitter<PresenceClientEvents>> {
    /**
     * The read-only local presence `sessionId`.
     * It is `undefined` if, and only if, `active` is `false`.
     */
    readonly sessionId: string | undefined
    /**
     * The read-only local presence `userId`.
     * It is `undefined` if, and only if, `active` is `false`.
     */
    readonly userId: string | undefined
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
     * It is `undefined` if, and only if,
     * either `sessionId`, `userId` or `locationId` is `undefined`.
     */
    readonly presence: Presence | undefined
    /**
     * If `true`, `presence` is synchronized with the PresenceService, otherwise `false`.
     */
    readonly active: boolean

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
    extends EmitterInterface<SyncOtEmitter<PresenceServiceEvents>> {
    /**
     * Submits a new presence object for the current session.
     */
    submitPresence(presence: Presence, context?: SpanContext): Promise<void>

    /**
     * Removes the presence object from the current session.
     */
    removePresence(context?: SpanContext): Promise<void>

    getPresenceBySessionId(
        sessionId: string,
        context?: SpanContext,
    ): Promise<Presence | null>
    getPresenceByUserId(
        userId: string,
        context?: SpanContext,
    ): Promise<Presence[]>
    getPresenceByLocationId(
        locationId: string,
        context?: SpanContext,
    ): Promise<Presence[]>

    streamPresenceBySessionId(
        sessionId: string,
        context?: SpanContext,
    ): Promise<Duplex>
    streamPresenceByUserId(
        userId: string,
        context?: SpanContext,
    ): Promise<Duplex>
    streamPresenceByLocationId(
        locationId: string,
        context?: SpanContext,
    ): Promise<Duplex>
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
