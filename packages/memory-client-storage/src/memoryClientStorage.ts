import {
    assertOperation,
    ClientId,
    ClientStorage,
    DocumentId,
    DocumentVersion,
    ErrorCodes,
    Operation,
    SequenceNumber,
    SyncOtError,
    TypeManager,
    TypeName,
} from '@syncot/core'

interface Context {
    localOperations: Operation[]
    remoteOperations: Operation[]
    sequence: SequenceNumber
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

    public async saveRemoteOperation(operation: Operation): Promise<void> {
        assertOperation(operation)

        const context = this.getContext(operation.type, operation.id)
        const { localOperations, remoteOperations } = context

        if (operation.client === this.clientId) {
            // This client has submitted the `operation` to the server earlier,
            // so it must be the first operation in `localOperations` and we have to
            // remove it from that list now, as it has become remote.

            if (localOperations.length === 0) {
                throw new SyncOtError(ErrorCodes.UnexpectedClientId)
            }

            const firstLocalOperation = localOperations[0]

            if (firstLocalOperation.sequence !== operation.sequence) {
                throw new SyncOtError(ErrorCodes.UnexpectedSequenceNumber)
            }

            if (firstLocalOperation.version !== operation.version) {
                throw new SyncOtError(ErrorCodes.UnexpectedVersionNumber)
            }

            localOperations.shift()
        } else {
            // Another client has submitted the `operation` to the server earlier,
            // so we have to transform the local operations.

            if (
                remoteOperations.length > 0 &&
                remoteOperations[remoteOperations.length - 1].version + 1 !==
                    operation.version
            ) {
                throw new SyncOtError(ErrorCodes.UnexpectedVersionNumber)
            }

            if (
                localOperations.length > 0 &&
                localOperations[0].version !== operation.version
            ) {
                throw new SyncOtError(ErrorCodes.UnexpectedVersionNumber)
            }

            let remoteOperation = operation
            const transformedLocalOperations = localOperations.map(
                localOperation => {
                    const transformedOperations = this.typeManager.transformX(
                        remoteOperation,
                        localOperation,
                    )

                    remoteOperation = transformedOperations[0]
                    return transformedOperations[1]
                },
            )

            context.localOperations = transformedLocalOperations
        }

        remoteOperations.push(operation)
    }

    public async loadRemoteOperations(
        type: TypeName,
        id: DocumentId,
        minVersion: DocumentVersion = 1,
        maxVersion: DocumentVersion = Number.MAX_SAFE_INTEGER,
    ): Promise<Operation[]> {
        return this.getContext(type, id).remoteOperations.filter(
            operation =>
                operation.version >= minVersion &&
                operation.version <= maxVersion,
        )
    }

    public async saveLocalOperation(operation: Operation): Promise<void> {
        assertOperation(operation)

        // Check clientId.
        if (operation.client !== this.clientId) {
            throw new SyncOtError(ErrorCodes.UnexpectedClientId)
        }

        const context = this.getContext(operation.type, operation.id)
        const { localOperations, remoteOperations, sequence } = context
        const expectedSequence = sequence + 1

        if (operation.sequence !== expectedSequence) {
            throw new SyncOtError(ErrorCodes.UnexpectedSequenceNumber)
        }

        if (localOperations.length > 0) {
            if (
                localOperations[localOperations.length - 1].version + 1 !==
                operation.version
            ) {
                throw new SyncOtError(ErrorCodes.UnexpectedVersionNumber)
            }
        } else if (remoteOperations.length > 0) {
            if (
                remoteOperations[remoteOperations.length - 1].version + 1 !==
                operation.version
            ) {
                throw new SyncOtError(ErrorCodes.UnexpectedVersionNumber)
            }
        } else if (operation.version !== 1) {
            throw new SyncOtError(ErrorCodes.UnexpectedVersionNumber)
        }

        localOperations.push(operation)
        context.sequence = expectedSequence
    }

    public async loadLocalOperations(
        type: TypeName,
        id: DocumentId,
        minSequenceNumber: SequenceNumber = 1,
        maxSequenceNumber: SequenceNumber = Number.MAX_SAFE_INTEGER,
    ): Promise<Operation[]> {
        return this.getContext(type, id).localOperations.filter(
            operation =>
                operation.sequence >= minSequenceNumber &&
                operation.sequence <= maxSequenceNumber,
        )
    }

    private getContext(type: TypeName, id: DocumentId): Context {
        const typeMap = this.contexts
        let idMap = typeMap.get(type)

        if (idMap == null) {
            idMap = new Map()
            typeMap.set(type, idMap)
        }

        let context = idMap.get(id)

        if (context == null) {
            context = {
                localOperations: [],
                remoteOperations: [],
                sequence: 0,
            }
            idMap.set(id, context)
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
