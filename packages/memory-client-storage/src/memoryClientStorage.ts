import {
    ClientStorage,
    DocumentId,
    DocumentOperation,
    DocumentVersion,
    ErrorCodes,
    SequenceNumber,
    SyncOtError,
} from '@syncot/core'

export class MemoryClientStorage implements ClientStorage {
    private remoteOperations: Map<DocumentId, DocumentOperation[]> = new Map()
    // private localOperations: Map<DocumentId, DocumentOperation[]> = new Map()

    public saveRemoteOperations(
        id: DocumentId,
        operations: DocumentOperation[],
    ): Promise<undefined> {
        let remoteOperations = this.remoteOperations.get(id)

        if (!remoteOperations) {
            remoteOperations = []
            this.remoteOperations.set(id, remoteOperations)
        }

        const remoteOperationsLength = remoteOperations.length
        const lastRemoteOperation: DocumentOperation | null =
            remoteOperationsLength > 0
                ? remoteOperations[remoteOperationsLength - 1]
                : null
        let previousOperation: DocumentOperation | null = null

        for (let i = 0, l = operations.length; i < l; ++i) {
            const currentOperation = operations[i]

            if (previousOperation) {
                if (
                    currentOperation.version !==
                    previousOperation.version + 1
                ) {
                    remoteOperations.length = remoteOperationsLength
                    return Promise.reject(
                        new SyncOtError(
                            ErrorCodes.InvalidArgument,
                            `Expected next version == ${previousOperation.version +
                                1}`,
                        ),
                    )
                }
            } else {
                if (currentOperation.version < 1) {
                    return Promise.reject(
                        new SyncOtError(
                            ErrorCodes.InvalidArgument,
                            'Expected first version >= 1',
                        ),
                    )
                }

                if (!Number.isSafeInteger(currentOperation.version)) {
                    return Promise.reject(
                        new SyncOtError(
                            ErrorCodes.InvalidArgument,
                            'Expected first version to be a safe integer',
                        ),
                    )
                }

                if (lastRemoteOperation) {
                    if (
                        currentOperation.version >
                        lastRemoteOperation.version + 1
                    ) {
                        return Promise.reject(
                            new SyncOtError(
                                ErrorCodes.InvalidArgument,
                                `Expected first version <= ${lastRemoteOperation.version +
                                    1}`,
                            ),
                        )
                    }
                } else {
                    if (currentOperation.version !== 1) {
                        return Promise.reject(
                            new SyncOtError(
                                ErrorCodes.InvalidArgument,
                                'Expected first version == 1',
                            ),
                        )
                    }
                }
            }

            previousOperation = currentOperation

            if (
                !lastRemoteOperation ||
                lastRemoteOperation.version < currentOperation.version
            ) {
                remoteOperations.push(currentOperation)
            }
        }

        return Promise.resolve(undefined)
    }

    public loadRemoteOperations(
        id: DocumentId,
        start: DocumentVersion = 1,
        end: DocumentVersion = Number.MAX_SAFE_INTEGER,
    ): Promise<DocumentOperation[]> {
        if (start < 1) {
            return Promise.reject(
                new SyncOtError(
                    ErrorCodes.InvalidArgument,
                    'Expected start version >= 1',
                ),
            )
        }

        if (!Number.isSafeInteger(start)) {
            return Promise.reject(
                new SyncOtError(
                    ErrorCodes.InvalidArgument,
                    'Expected start version to be a safe integer',
                ),
            )
        }

        if (end < 1) {
            return Promise.reject(
                new SyncOtError(
                    ErrorCodes.InvalidArgument,
                    'Expected end version >= 1',
                ),
            )
        }

        if (!Number.isSafeInteger(end)) {
            return Promise.reject(
                new SyncOtError(
                    ErrorCodes.InvalidArgument,
                    'Expected end version to be a safe integer',
                ),
            )
        }

        const remoteOperations = this.remoteOperations.get(id)

        if (!remoteOperations) {
            return Promise.resolve([])
        }

        return Promise.resolve(remoteOperations.slice(start - 1, end - 1))
    }

    public saveLocalOperations(
        _id: DocumentId,
        _operations: [DocumentOperation],
    ): Promise<undefined> {
        return Promise.reject(new Error('Not implemented'))
    }

    public loadLocalOperations(
        _id: DocumentId,
        _start?: SequenceNumber,
        _end?: SequenceNumber,
    ): Promise<[DocumentOperation]> {
        return Promise.reject(new Error('Not implemented'))
    }
}
