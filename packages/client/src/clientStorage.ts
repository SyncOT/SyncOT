import {
    assertOperation,
    assertSnapshot,
    DocumentId,
    DocumentVersion,
    Operation,
    SequenceNumber,
    Snapshot,
    TypeManager,
    TypeName,
} from '@syncot/core'
import {
    createAlreadyInitializedError,
    createNotInitializedError,
    createUnexpectedSequenceNumberError,
    createUnexpectedSessionIdError,
    createUnexpectedVersionNumberError,
} from '@syncot/error'
import { Id, idEqual, Interface } from '@syncot/util'

interface Context {
    lastRemoteVersion: DocumentVersion
    lastSequence: SequenceNumber
    lastVersion: DocumentVersion
    localIndex: number
    operations: Operation[]
    snapshot: Snapshot
}
type ContextMap = Map<TypeName, Map<DocumentId, Context>>

export interface ClientStorageStatus {
    readonly id: DocumentId
    readonly initialized: boolean
    readonly lastRemoteVersion: DocumentVersion
    readonly lastSequence: SequenceNumber
    readonly lastVersion: DocumentVersion
    readonly sessionId: Id
    readonly typeName: TypeName
}

/**
 * A ClientStorage implementation that stores the data in the main memory.
 */
class MemoryClientStorage {
    private contexts: ContextMap = new Map()

    public constructor(
        private sessionId: Id,
        private typeManager: TypeManager,
    ) {}

    /**
     * Initialises storage for operations with types and ids matching those in the specified snapshot.
     * Storage for the specific type and id combination can be re-initialised only after clearing it first.
     * Storage must be initialised before any operations can be stored.
     *
     * It fails with:
     *
     * - `SyncOtError InvalidEntity`, if `snapshot` is invalid.
     * - `AlreadyInitialized`, if the storage has been already initialized for the particular combination
     *   of type and id.
     *
     * @param snapshot The initial snapshot, which may be at any version.
     */
    public async init(snapshot: Snapshot): Promise<void> {
        assertSnapshot(snapshot)

        const { type, id, version } = snapshot
        const typeMap = this.contexts
        let idMap = typeMap.get(type)

        if (idMap == null) {
            idMap = new Map()
            typeMap.set(type, idMap)
        }

        if (idMap.has(id)) {
            throw createAlreadyInitializedError(
                'Client storage already initialized.',
            )
        }

        idMap.set(id, {
            lastRemoteVersion: version,
            lastSequence: 0,
            lastVersion: version,
            localIndex: 0,
            operations: [],
            snapshot,
        })
    }

    /**
     * Removes all data associated with the specified typeName and id.
     */
    public async clear(typeName: TypeName, id: DocumentId): Promise<void> {
        const typeNameMap = this.contexts
        const idMap = typeNameMap.get(typeName)

        if (idMap && idMap.delete(id) && idMap.size === 0) {
            typeNameMap.delete(typeName)
        }
    }

    /**
     * Returns the storage status for the specified combination of type and id.
     */
    public async getStatus(
        typeName: TypeName,
        id: DocumentId,
    ): Promise<ClientStorageStatus> {
        const context = this.getContext(typeName, id)

        if (context) {
            return {
                id,
                initialized: true,
                lastRemoteVersion: context.lastRemoteVersion,
                lastSequence: context.lastSequence,
                lastVersion: context.lastVersion,
                sessionId: this.sessionId,
                typeName,
            }
        } else {
            return {
                id,
                initialized: false,
                lastRemoteVersion: 0,
                lastSequence: 0,
                lastVersion: 0,
                sessionId: this.sessionId,
                typeName,
            }
        }
    }

    /**
     * Stores the specified operation.
     *
     * It fails with
     *
     * - `SyncOtError InvalidEntity`, if `operation` is not valid.
     * - `SyncOtError NotInitialized`, if this `ClientStorage` has not been initialized
     *   for `operation.type` and `operation.id`.
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
    public async store(
        operation: Operation,
        local: boolean = false,
    ): Promise<void> {
        assertOperation(operation)

        const context = this.getContextRequired(operation.type, operation.id)

        if (local) {
            // Store a new local operation.
            if (!idEqual(operation.sessionId, this.sessionId)) {
                throw createUnexpectedSessionIdError()
            }

            if (operation.sequence !== context.lastSequence + 1) {
                throw createUnexpectedSequenceNumberError()
            }

            if (operation.version !== context.lastVersion + 1) {
                throw createUnexpectedVersionNumberError()
            }

            context.operations.push(operation)
            context.lastVersion++
            context.lastSequence++
        } else {
            if (operation.version !== context.lastRemoteVersion + 1) {
                throw createUnexpectedVersionNumberError()
            }

            if (idEqual(operation.sessionId, this.sessionId)) {
                // Store own remote operation.
                if (context.localIndex >= context.operations.length) {
                    throw createUnexpectedSessionIdError()
                }

                if (
                    operation.sequence !==
                    context.operations[context.localIndex].sequence
                ) {
                    throw createUnexpectedSequenceNumberError()
                }

                context.localIndex++
                context.lastRemoteVersion++
            } else {
                // Store foreign remote operation.
                let remoteOperation = operation
                const newOperations = [operation]

                for (
                    let i = context.localIndex, l = context.operations.length;
                    i < l;
                    ++i
                ) {
                    const localOperation = context.operations[i]
                    const transformedOperations = this.typeManager.transformX(
                        remoteOperation,
                        localOperation,
                    )
                    remoteOperation = transformedOperations[0]
                    newOperations.push(transformedOperations[1])
                }

                for (let i = 0, l = newOperations.length; i < l; ++i) {
                    context.operations[context.localIndex + i] =
                        newOperations[i]
                }

                context.localIndex++
                context.lastRemoteVersion++
                context.lastVersion++
            }
        }
    }

    /**
     * Loads operations with the specified type and id.
     * The results may be optionally restricted to the specified *inclusive* range of versions.
     */
    public async load(
        typeName: TypeName,
        id: DocumentId,
        minVersion: DocumentVersion = 1,
        maxVersion: DocumentVersion = Number.MAX_SAFE_INTEGER,
    ): Promise<Operation[]> {
        return this.getContextRequired(typeName, id).operations.filter(
            operation =>
                operation.version >= minVersion &&
                operation.version <= maxVersion,
        )
    }

    private getContext(
        typeName: TypeName,
        id: DocumentId,
    ): Context | undefined {
        const typeNameMap = this.contexts
        const idMap = typeNameMap.get(typeName)

        if (idMap == null) {
            return undefined
        }

        const context = idMap.get(id)

        if (context == null) {
            return undefined
        }

        return context
    }

    private getContextRequired(typeName: TypeName, id: DocumentId): Context {
        const context = this.getContext(typeName, id)

        if (context == null) {
            throw createNotInitializedError('Client storage not initialized.')
        }

        return context
    }
}

/**
 * Options for `createClientStorage`.
 */
export interface CreateClientStorageParams {
    sessionId: Id
    typeManager: TypeManager
}

/**
 * An interface for storing snapshots and operations on the client, eg in memory, IndexedDB, etc.
 * Snapshots and Operations associated with different document types and IDs are managed separately.
 * Remote operations have been already saved on the server.
 * Local operations have not been saved on the server yet but are expected to be saved in the future.
 * Snapshots can be saved only for versions which have been already saved on the server.
 */
export interface ClientStorage extends Interface<MemoryClientStorage> {}

/**
 * Creates a new `ClientStorage` instance, which stores the data in memory.
 */
export function createClientStorage({
    sessionId,
    typeManager,
}: CreateClientStorageParams): ClientStorage {
    return new MemoryClientStorage(sessionId, typeManager)
}
