import { NodeEventEmitter } from '@syncot/util'

/**
 * A globally unique session id.
 * It's recorded in snapshots and operations as well as shared with other clients,
 * so some other, secret information must be used to securely create and restore sessions.
 */
export type SessionId = ArrayBuffer

interface Events {
    error: Error
    sessionOpen: SessionId
    sessionActive: SessionId
    sessionInactive: SessionId
    sessionClose: SessionId
}

/**
 * Manages a session on the client or server side.
 *
 * @event sessionOpen Emitted when an existing session is loaded or a new session created.
 * @event sessionActive Emitted when a session is activated between a client and a server.
 * @event sessionInactive Emitted when a session is deactivated between a client and a server.
 * @event sessionClose Emitted when a session is closed.
 * @event error Emitted when a session related error occurs. The system will attempt to recover
 *   automatically as soon as possible. The following errors may be emitted:
 *
 *   - `SyncOtError Session`: A session-related error occurred.
 */
export interface SessionManager extends NodeEventEmitter<Events> {
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

    /**
     * Destroys this component, so that it won't establish sessions anymore.
     */
    destroy(): void
}
