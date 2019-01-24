import {
    ClientId,
    DocumentId,
    DocumentVersion,
    Operation,
    SequenceNumber,
    Snapshot,
    TypeName,
} from '@syncot/core'

export interface ClientStorageStatus {
    readonly clientId: ClientId
    readonly id: DocumentId
    readonly initialized: boolean
    readonly lastRemoteVersion: DocumentVersion
    readonly lastSequence: SequenceNumber
    readonly lastVersion: DocumentVersion
    readonly typeName: TypeName
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
     * Storage for the specific type and id combination can be re-initialised only after clearing it first.
     * Storage must be initialised before any operations can be stored.
     *
     * It fails with:
     *
     * - `InvalidSnapshot`, if `snapshot` is invalid.
     * - `AlreadyInitialized`, if the storage has been already initialized for the particular combination
     *   of type and id.
     *
     * @param snapshot The initial snapshot, which may be at any version.
     */
    init(snapshot: Snapshot): Promise<void>

    /**
     * Removes all data associated with the specified typeName and id.
     */
    clear(typeName: TypeName, id: DocumentId): Promise<void>

    /**
     * Returns the storage status for the specified combination of type and id.
     */
    getStatus(typeName: TypeName, id: DocumentId): Promise<ClientStorageStatus>

    /**
     * Stores the specified operation.
     *
     * It fails with
     *
     * - `InvalidOperation`, if `operation` is not valid.
     * - `NotInitialized`, if this `ClientStorage` has not been initialized for `operation.type` and `operation.id`.
     *
     * If `local` is `false`, then it fails with:
     *
     * - `UnexpectedVersionNumber`, if `operation.version` is not equal to `lastRemoteVersion + 1`.
     * - `UnexpectedClientId`, if `operation.client` is the `clientId` of this ClientStorage instance
     *   and there are no existing local operations.
     * - `UnexpectedSequenceNumber`, if `operation.client` is the `clientId` of this ClientStorage instance and
     *   `operation.sequence` is not equal to `sequence` of the first local operation.
     *
     * If `local` is `true`, then it fails with:
     *
     * - `UnexpectedClientId`, if `operation.client` is not the `clientId` of this ClientStorage instance.
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
     * Loads operations with the specified type and id.
     * The results may be optionally restricted to the specified *inclusive* range of versions.
     */
    load(
        typeName: TypeName,
        id: DocumentId,
        minVersion?: DocumentVersion,
        maxVersion?: DocumentVersion,
    ): Promise<Operation[]>
}
