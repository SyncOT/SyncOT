import { Presence } from '@syncot/presence'
import { EmitterInterface, SyncOtEmitter } from '@syncot/util'

/**
 * Events emitted by `AuthService` and `AuthClient`.
 */
export interface AuthEvents {
    active: void
    inactive: void
    error: Error
}

/**
 * Manages authentication and authorization on the client side.
 *
 * @event active The AuthClient has an authenticated user.
 * @event inactive The AuthClient no longer has an authenticated.
 * @event error The AuthClient has experienced an error.
 * @event destroy The AuthClient has been destroyed.
 */
export interface AuthClient
    extends EmitterInterface<SyncOtEmitter<AuthEvents>> {
    /**
     * If a user is authenticated, then `true`, otherwise `false`.
     */
    readonly active: boolean
    /**
     * If `active===true`, then a session ID, otherwise `undefined`.
     */
    readonly sessionId: string | undefined
    /**
     * If `active===true`, then the ID of the authenticated user, otherwise `undefined`.
     */
    readonly userId: string | undefined
}

/**
 * Manages authentication and authorization on the server side.
 *
 * @event active The AuthService has an authenticated user.
 * @event inactive The AuthService no longer has an authenticated user.
 * @event error The AuthService has experienced an error.
 * @event destroy The AuthService has been destroyed.
 */
export interface AuthService
    extends EmitterInterface<SyncOtEmitter<AuthEvents>> {
    /**
     * If a user is authenticated, then `true`, otherwise `false`.
     */
    readonly active: boolean
    /**
     * If `active===true`, then a session ID, otherwise `undefined`.
     */
    readonly sessionId: string | undefined
    /**
     * If `active===true`, then the ID of the authenticated user, otherwise `undefined`.
     */
    readonly userId: string | undefined
    /**
     * Determines if the user may read from the specified document.
     */
    mayReadDocument(typeName: string, id: string): boolean | Promise<boolean>
    /**
     * Determines if the user may write to the specified document.
     */
    mayWriteDocument(typeName: string, id: string): boolean | Promise<boolean>
    /**
     * Determines if the user may read/load the specified presence object.
     */
    mayReadPresence(presence: Presence): boolean | Promise<boolean>
    /**
     * Determines if the user may write/store the specified presence object.
     */
    mayWritePresence(presence: Presence): boolean | Promise<boolean>
}
