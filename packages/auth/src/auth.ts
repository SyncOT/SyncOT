import { EmitterInterface, TypedEventEmitter } from '@syncot/util'

/**
 * Events emitted by `Auth`.
 */
export interface AuthEvents {
    /**
     * Emitted when a user becomes authenticated.
     */
    active: { userId: string; sessionId: string }
    /**
     * Emitted when a user stops being authenticated.
     */
    inactive: void
    /**
     * Emitted on error.
     */
    error: Error
}

/**
 * Request names supported by Auth over Connection.
 */
export const requestNames = new Set([
    'logIn',
    'logOut',
    'mayReadContent',
    'mayWriteContent',
    'mayReadPresence',
    'mayWritePresence',
])

/**
 * Event names supported by Auth over Connection.
 */
export const eventNames = new Set(['active', 'inactive'])

/**
 * Manages authentication and authorization.
 */
export interface Auth<Credentials = any, Presence = any>
    extends EmitterInterface<TypedEventEmitter<AuthEvents>> {
    /**
     * If a user is authenticated, then `true`, otherwise `false`.
     */
    readonly active: boolean
    /**
     * If `active` is `true`, then a session ID, otherwise `undefined`.
     * It is intended for uniquely identifying sessions only and must not be used for security.
     * The `sessionId` is public and may be freely shared with connected clients.
     */
    readonly sessionId: string | undefined
    /**
     * If `active` is `true`, then the ID of the authenticated user, otherwise `undefined`.
     */
    readonly userId: string | undefined

    /**
     * Logs in using the specified credentials to create a new session.
     * @param credentials The credentials to use.
     *   If omitted, an Auth implementation may attempt to retrieve credentials internally.
     *   If credentials are not provided and cannot be obtained internally, the function fails.
     */
    logIn(credentials?: Credentials): Promise<void>

    /**
     * Logs out to terminate the current session.
     */
    logOut(): Promise<void>

    /**
     * Determines if the user may read the specified document's content.
     */
    mayReadContent(type: string, id: string): boolean | Promise<boolean>
    /**
     * Determines if the user may write the specified document's content.
     */
    mayWriteContent(type: string, id: string): boolean | Promise<boolean>
    /**
     * Determines if the user may read the specified presence object.
     */
    mayReadPresence(presence: Presence): boolean | Promise<boolean>
    /**
     * Determines if the user may write the specified presence object.
     */
    mayWritePresence(presence: Presence): boolean | Promise<boolean>
}
