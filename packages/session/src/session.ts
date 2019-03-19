import { SyncOtEmitter } from '@syncot/util'

/**
 * A globally unique session id.
 * It's recorded in snapshots and operations as well as shared with other clients,
 * so some other, secret information must be used to securely create and restore sessions.
 */
export type SessionId = ArrayBuffer

/**
 * Events emitted by `SessionManager`.
 */
export interface SessionEvents {
    sessionOpen: void
    sessionActive: void
    sessionInactive: void
    sessionClose: void
    error: Error
}

/**
 * Manages a session on the client or server side.
 *
 * @event sessionOpen An existing session has been loaded or a new session created.
 * @event sessionActive A session has been activated between a client and a server.
 * @event sessionInactive A session has been deactivated between a client and a server.
 * @event sessionClose A session has been closed.
 * @event error A session-related error has occurred. The system will attempt to recover automatically.
 * @event destroy The SessionManager has been destroyed.
 */
export interface SessionManager extends SyncOtEmitter<SessionEvents> {
    /**
     * Returns the ID of the current session, or `undefined`, if there's no session.
     */
    getSessionId(): SessionId | undefined

    /**
     * Returns `true`, if there is an open session, otherwise `false`.
     */
    hasSession(): boolean

    /**
     * Returns `true`, if there is an active session, otherwise `false`.
     */
    hasActiveSession(): boolean
}
