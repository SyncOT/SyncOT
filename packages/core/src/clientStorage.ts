import {
    DocumentId,
    DocumentVersion,
    Operation,
    SequenceNumber,
    TypeName,
} from './type'

/**
 * An interface for storing operations in the client, eg in memory, IndexedDB, etc.
 * Operations associated with different document types and IDs are managed separately.
 * Remote operations have been already saved on the server.
 * Local operations have not been saved on the server yet but are expected to be saved in the future.
 */
export interface ClientStorage {
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
