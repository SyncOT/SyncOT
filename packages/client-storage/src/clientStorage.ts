import { Operation, Snapshot } from '@syncot/type'

export interface ClientStorageStatus {
    readonly documentId: string
    readonly documentType: string
    readonly initialized: boolean
    readonly lastRemoteVersion: number
    readonly lastSequence: number
    readonly lastVersion: number
    readonly sessionId: string
}

/**
 * An interface for storing snapshots and operations on the client, eg in memory, IndexedDB, etc.
 * Snapshots and Operations associated with different document types and IDs are managed separately.
 * Remote operations have been already saved on the server.
 * Local operations have not been saved on the server yet but are expected to be saved in the future.
 * Snapshots can be saved only for versions which have been already saved on the server.
 */
export interface ClientStorage {
    /**
     * Initialises storage for operations with types and ids matching those in the specified snapshot.
     * Storage for the specific `documentType` and `documentId` combination can be re-initialised only after clearing it first.
     * Storage must be initialised before any operations can be stored.
     *
     * It fails with:
     *
     * - `SyncOtError InvalidEntity`, if `snapshot` is invalid.
     * - `AlreadyInitialized`, if the storage has been already initialized for the particular combination
     *   of `documentType` and `documentId`.
     *
     * @param snapshot The initial snapshot, which may be at any version.
     */
    init(snapshot: Snapshot): Promise<void>

    /**
     * Removes all data associated with the specified `documentType` and `documentId`.
     */
    clear(documentType: string, documentId: string): Promise<void>

    /**
     * Returns the storage status for the specified combination of `documentType` and `documentId`.
     */
    getStatus(
        documentType: string,
        documentId: string,
    ): Promise<ClientStorageStatus>

    /**
     * Stores the specified operation.
     *
     * It fails with
     *
     * - `SyncOtError InvalidEntity`, if `operation` is not valid.
     * - `SyncOtError NotInitialized`, if this `ClientStorage` has not been initialized
     *   for `operation.documentType` and `operation.documentId`.
     *
     * If `local` is `false`, then it fails with:
     *
     * - `UnexpectedVersionNumber`, if `operation.version` is not equal to `lastRemoteVersion + 1`.
     * - `UnexpectedSessionId`, if `operation.session` is the `sessionId` of this ClientStorage instance
     *   and there are no existing local operations.
     * - `UnexpectedSequenceNumber`, if `operation.session` is the `sessionId` of this ClientStorage instance and
     *   `operation.sequence` is not equal to `sequence` of the first local operation.
     *
     * If `local` is `true`, then it fails with:
     *
     * - `UnexpectedSessionId`, if `operation.session` is not the `sessionId` of this ClientStorage instance.
     * - `UnexpectedSequenceNumber`, if `operation.sequence` is not equal to `lastSequence + 1`.
     * - `UnexpectedVersionNumber`, if `operation.version` is not equal to `lastVersion + 1`.
     *
     * @param operation The operation to store.
     * @param local If `true`, the operation has not been saved on the server yet and
     *   is subject to change when other remote (non-local) operations are saved.
     *   If `false`, the operation has been already saved on the server and will never change.
     *   Defaults to `false`.
     */
    store(operation: Operation, local?: boolean): Promise<void>

    /**
     * Loads operations with the specified `documentType` and `documentId`.
     * The results may be optionally restricted to the specified *inclusive* range of versions.
     */
    load(
        documentType: string,
        documentId: string,
        minVersion?: number,
        maxVersion?: number,
    ): Promise<Operation[]>
}
