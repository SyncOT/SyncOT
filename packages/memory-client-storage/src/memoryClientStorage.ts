import {
    assertOperation,
    assertSnapshot,
    ClientId,
    ClientStorage,
    ClientStorageStatus,
    DocumentId,
    DocumentVersion,
    ErrorCodes,
    Operation,
    SequenceNumber,
    Snapshot,
    SyncOtError,
    TypeManager,
    TypeName,
} from '@syncot/core'

interface Context {
    lastRemoteVersion: DocumentVersion
    lastSequence: SequenceNumber
    lastVersion: DocumentVersion
    localIndex: number
    operations: Operation[]
    snapshot: Snapshot
}
type ContextMap = Map<TypeName, Map<DocumentId, Context>>

/**
 * A ClientStorage implementation that stores the data in memory.
 */
class MemoryClientStorage implements ClientStorage {
    private contexts: ContextMap = new Map()

    public constructor(
        private clientId: ClientId,
        private typeManager: TypeManager,
    ) {}

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
            throw new SyncOtError(ErrorCodes.AlreadyInitialized)
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

    public async clear(typeName: TypeName, id: DocumentId): Promise<void> {
        const typeNameMap = this.contexts
        const idMap = typeNameMap.get(typeName)

        if (idMap && idMap.delete(id) && idMap.size === 0) {
            typeNameMap.delete(typeName)
        }
    }

    public async getStatus(
        typeName: TypeName,
        id: DocumentId,
    ): Promise<ClientStorageStatus> {
        const context = this.getContext(typeName, id)

        if (context) {
            return {
                clientId: this.clientId,
                id,
                initialized: true,
                lastRemoteVersion: context.lastRemoteVersion,
                lastSequence: context.lastSequence,
                lastVersion: context.lastVersion,
                typeName,
            }
        } else {
            return {
                clientId: this.clientId,
                id,
                initialized: false,
                lastRemoteVersion: 0,
                lastSequence: 0,
                lastVersion: 0,
                typeName,
            }
        }
    }

    public async store(
        operation: Operation,
        local: boolean = false,
    ): Promise<void> {
        assertOperation(operation)

        const context = this.getContextRequired(operation.type, operation.id)

        if (local) {
            // Store a new local operation.
            if (operation.client !== this.clientId) {
                throw new SyncOtError(ErrorCodes.UnexpectedClientId)
            }

            if (operation.sequence !== context.lastSequence + 1) {
                throw new SyncOtError(ErrorCodes.UnexpectedSequenceNumber)
            }

            if (operation.version !== context.lastVersion + 1) {
                throw new SyncOtError(ErrorCodes.UnexpectedVersionNumber)
            }

            context.operations.push(operation)
            context.lastVersion++
            context.lastSequence++
        } else {
            if (operation.version !== context.lastRemoteVersion + 1) {
                throw new SyncOtError(ErrorCodes.UnexpectedVersionNumber)
            }

            if (operation.client === this.clientId) {
                // Store own remote operation.
                if (context.localIndex >= context.operations.length) {
                    throw new SyncOtError(ErrorCodes.UnexpectedClientId)
                }

                if (
                    operation.sequence !==
                    context.operations[context.localIndex].sequence
                ) {
                    throw new SyncOtError(ErrorCodes.UnexpectedSequenceNumber)
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
            throw new SyncOtError(ErrorCodes.NotInitialized)
        }

        return context
    }
}

/**
 * Options for `createClientStorage`.
 */
export interface CreateClientStorageParams {
    clientId: ClientId
    typeManager: TypeManager
}

/**
 * Creates a new `ClientStorage` instance, which stores the data in memory.
 */
export function createClientStorage({
    clientId,
    typeManager,
}: CreateClientStorageParams): ClientStorage {
    return new MemoryClientStorage(clientId, typeManager)
}
