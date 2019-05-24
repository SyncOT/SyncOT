import { Presence } from '@syncot/presence'
import { EmitterInterface, SyncOtEmitter } from '@syncot/util'

/**
 * Events emitted by `AuthService` and `AuthClient`.
 */
export interface AuthEvents {
    user: void
    auth: void
    authEnd: void
    userEnd: void
    error: Error
}

/**
 * Manages authentication and authorization on the client side.
 *
 * @event user A user ID has been set.
 * @event auth The user ID has been authenticated.
 * @event authEnd The user ID is no longer authenticated.
 * @event userEnd The user ID has been unset.
 * @event error An auth-related error has occurred. The system will attempt to recover automatically.
 * @event destroy The AuthManager has been destroyed.
 */
export interface AuthClient
    extends EmitterInterface<SyncOtEmitter<AuthEvents>> {
    /**
     * Gets the user ID, if present, otherwise returns undefined.
     */
    getUserId(): string | undefined

    /**
     * Returns true, if the user ID is present, otherwise returns false.
     */
    hasUserId(): boolean

    /**
     * Returns true, if the user ID has been authenticated, otherwise returns false.
     */
    hasAuthenticatedUserId(): boolean
}

/**
 * Manages authentication and authorization on the server side.
 *
 * @event user A user ID has been set.
 * @event auth The user ID has been authenticated.
 * @event authEnd The user ID is no longer authenticated.
 * @event userEnd The user ID has been unset.
 * @event error An auth-related error has occurred. The system will attempt to recover automatically.
 * @event destroy The AuthManager has been destroyed.
 */
export interface AuthService extends AuthClient {
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
