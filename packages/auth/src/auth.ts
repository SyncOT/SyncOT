import { DocumentId, TypeName } from '@syncot/core'
import { EmitterInterface, SyncOtEmitter, toBuffer } from '@syncot/util'

/**
 * Type of the user ID.
 */
export type UserId = ArrayBuffer | string | number

/**
 * Returns true, if user id is valid, otherwise returns false.
 */
export function isValidUserId(userId: UserId): boolean {
    const type = typeof userId
    return (
        type === 'string' || type === 'number' || userId instanceof ArrayBuffer
    )
}

/**
 * Returns true, if the two provided user IDs are valid and equal, otherwise returns false.
 */
export function userIdEqual(userId1: UserId, userId2: UserId): boolean {
    const type = typeof userId1

    if (type === 'string' || type === 'number') {
        return userId1 === userId2
    } else if (
        userId1 instanceof ArrayBuffer &&
        userId2 instanceof ArrayBuffer
    ) {
        return toBuffer(userId1).compare(toBuffer(userId2)) === 0
    } else {
        return false
    }
}

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
    getUserId(): UserId | undefined

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
    mayRead(type: TypeName, id: DocumentId): Promise<boolean>

    /**
     * Resolves to true, if the user may write to the specified document,
     * otherwise resolves to false.
     */
    mayWrite(type: TypeName, id: DocumentId): Promise<boolean>
}
