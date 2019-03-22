import { DocumentId, TypeName } from '@syncot/core'
import { EmitterInterface, SyncOtEmitter, toBuffer } from '@syncot/util'

/**
 * Type of the user ID.
 */
export type UserId = ArrayBuffer | string | number

/**
 * Returns true, if the specified value is a user id, otherwise returns false.
 */
export function isUserId(value: any): value is UserId {
    const type = typeof value
    return (
        type === 'string' || type === 'number' || value instanceof ArrayBuffer
    )
}

/**
 * Returns true, if the two provided values are equal user IDs, otherwise returns false.
 */
export function userIdEqual(value1: any, value2: any): boolean {
    const type = typeof value1

    if (type === 'string' || type === 'number') {
        return value1 === value2
    } else if (value1 instanceof ArrayBuffer && value2 instanceof ArrayBuffer) {
        return toBuffer(value1).compare(toBuffer(value2)) === 0
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
