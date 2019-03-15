import { DocumentId, TypeName } from '@syncot/core'
import { NodeEventEmitter } from '@syncot/util'

/**
 * Type of the user ID.
 */
export type UserId = ArrayBuffer

/**
 * Events emitted by `AuthManager`.
 */
export interface AuthEvents {
    authOpen: void
    authActive: void
    authInactive: void
    authClose: void
    error: Error
    destroy: void
}

/**
 * Manages authentication and authorization on the client or server side.
 *
 * @event authOpen A user ID has been set.
 * @event authActive The user ID has been agreed upon by the client and server.
 * @event authInactive The user ID is no longer agreed upon by the client and server,
 *   usually because they have become disconnected.
 * @event authClose The user ID has been unset.
 * @event error An auth-related error has occurred. The system will attempt to recover automatically.
 * @event destroy The AuthManager has been destroyed.
 */
export interface AuthManager extends NodeEventEmitter<AuthEvents> {
    /**
     * Gets the user ID.
     */
    getUserId(): UserId | undefined

    /**
     * Returns true, if the user ID is present, otherwise returns false.
     */
    hasUserId(): boolean

    /**
     * Returns true, if the user ID has been agreed upon by the client and server.
     */
    hasActiveUserId(): boolean

    /**
     * Returns true, or a Promise which resolves to true, if the user may
     * read from the specified document.
     * Returns false, or a Promise which resolves to false, if the user may not
     * read from the specified document.
     */
    mayRead(type: TypeName, id: DocumentId): boolean | Promise<boolean>

    /**
     * Returns true, or a Promise which resolves to true, if the user may
     * write to the specified document.
     * Returns false, or a Promise which resolves to false, if the user may not
     * write to the specified document.
     */
    mayWrite(type: TypeName, id: DocumentId): boolean | Promise<boolean>

    /**
     * Destroys this component.
     */
    destroy(): void
}
