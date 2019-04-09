import { Presence } from '@syncot/presence'
import { EmitterInterface, Id, SyncOtEmitter } from '@syncot/util'

/**
 * Events emitted by `AuthManager`.
 */
export interface AuthEvents {
    user: void
    auth: void
    authEnd: void
    userEnd: void
    error: Error
}

/**
 * Manages authentication and authorization on the client or server side.
 *
 * @event user A user ID has been set.
 * @event auth The user ID has been authenticated.
 * @event authEnd The user ID is no longer authenticated.
 * @event userEnd The user ID has been unset.
 * @event error An auth-related error has occurred. The system will attempt to recover automatically.
 * @event destroy The AuthManager has been destroyed.
 */
export interface AuthManager
    extends EmitterInterface<SyncOtEmitter<AuthEvents>> {
    /**
     * Gets the user ID, if present, otherwise returns undefined.
     */
    getUserId(): Id | undefined

    /**
     * Returns true, if the user ID is present, otherwise returns false.
     */
    hasUserId(): boolean

    /**
     * Returns true, if the user ID has been authenticated, otherwise returns false.
     */
    hasAuthenticatedUserId(): boolean

    /**
     * Resolves to true, if the user may read from the specified document,
     * otherwise resolves to false.
     */
    mayReadDocument(typeName: string, id: Id): Promise<boolean>

    /**
     * Resolves to true, if the user may write to the specified document,
     * otherwise resolves to false.
     */
    mayWriteDocument(typeName: string, id: Id): Promise<boolean>

    /**
     * Resolves to true, if the user may read/load the specified presence object,
     * otherwise resolves to false.
     */
    mayReadPresence(presence: Presence): Promise<boolean>

    /**
     * Resolves to true, if the user may write/store the specified presence object,
     * otherwise resolves to false.
     */
    mayWritePresence(presence: Presence): Promise<boolean>
}
