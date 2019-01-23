import {
    ClientId,
    DocumentId,
    DocumentVersion,
    Operation,
    SequenceNumber,
    Snapshot,
    TypeName,
} from './type'

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

    /**
     * Saves a remote operation and updates local operations as necessary.
     *
     * Fails with `InvalidOperation`, if `operation` is not valid.
     *
     * If trying to save an operation with the `clientId` equal to
     * the `clientId` configured in the client storage, then it fails with:
     *
     * - `UnexpectedClientId`, if there are no local operations.
     * - `UnexpectedSequenceNumber`, if the `operation`'s sequence number does not match
     *   the sequence number of the first local operation.
     * - `UnexpectedVersionNumber`, if the `operation`'s version number does not match
     *   the version number of the first local operation.
     *
     * If trying to save an `operation` with the `clientId` not equal to
     * the `clientId` configured in the client storage, then it fails with:
     *
     * - `UnexpectedVersionNumber`, if other remote operations exist and the `operation`'s version number
     *   is not equal to the last remote operation's version number + 1.
     * - `UnexpectedVersionNumber`, if local operations exist and the `operation`'s version number
     *   is not equal to the first local operation's version number.
     */
    saveRemoteOperation(operation: Operation): Promise<void>

    /**
     * Loads a list of remote operations for a specific document sorted by the version number.
     *
     * @param type Document type name.
     * @param id Document ID.
     * @param minVersion Minimum operation version, inclusive, defaults to `1`.
     * @param maxVersion Maximum operation version, inclusive, defaults to `Number.MAX_SAFE_INTEGER`.
     */
    loadRemoteOperations(
        type: TypeName,
        id: DocumentId,
        minVersion?: DocumentVersion,
        maxVersion?: DocumentVersion,
    ): Promise<Operation[]>

    /**
     * Saves a local operation.
     *
     * Fails with `InvalidOperation`, if `operation` is not valid.
     *
     * Fails with `UnexpectedClientId`, if trying to save an operation
     * with a client ID different from the one configured in the client storage.
     *
     * Fails with `UnexpectedSequenceNumber`, if trying to save an operation
     * with a sequence number which is not the last sequence number + 1.
     *
     * Fails with `UnexpectedVersionNumber`, if trying to save an operation
     * with a version number which is not equal to:
     *
     * - the last local operation version + 1, if it exists, or
     * - the last remote operation version + 1, if it exists, or
     * - 1.
     */
    saveLocalOperation(operation: Operation): Promise<void>

    /**
     * Loads a list of local operations for a specific document sorted by the sequence number.
     *
     * @param type Document type name.
     * @param id Document ID.
     * @param minSequenceNumber Minimum sequence number, inclusive, defaults to `0`.
     * @param maxSequenceNumber Maximum sequence number, inclusive, defaults to `Number.MAX_SAFE_INTEGER`.
     */
    loadLocalOperations(
        type: TypeName,
        id: DocumentId,
        minSequenceNumber?: SequenceNumber,
        maxSequenceNumber?: SequenceNumber,
    ): Promise<Operation[]>
}
