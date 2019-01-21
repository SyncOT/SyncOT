import { ClientStorage } from './clientStorage'
import { ErrorCodes, SyncOtError } from './error'
import { createTypeManager } from './simpleTypeManager'
import {
    ClientId,
    DocumentId,
    Operation,
    Snapshot,
    Type,
    TypeName,
} from './type'
import { TypeManager } from './typeManager'

interface ListSnapshot extends Snapshot {
    data: number[]
}
interface ListOperation extends Operation {
    data: { index: number; value: number }
}
const typeName: TypeName = 'list-type'
const client: ClientId = 'client-id'
const remoteClient: ClientId = 'remote-client-id'
const typeManager: TypeManager = createTypeManager()
const type: Type = {
    name: typeName,
    create(id: DocumentId): ListSnapshot {
        return {
            client: '',
            data: [],
            id,
            kind: 'Snapshot',
            meta: null,
            sequence: 0,
            type: typeName,
            version: 0,
        }
    },
    apply(snapshot: ListSnapshot, operation: ListOperation): ListSnapshot {
        return {
            ...snapshot,
            client: operation.client,
            data: snapshot.data
                .slice()
                .splice(operation.data.index, operation.data.value),
            sequence: operation.sequence,
            version: operation.version,
        }
    },
    transform(
        operation: ListOperation,
        anotherOperation: ListOperation,
        priority: boolean,
    ): ListOperation {
        const index = operation.data.index
        const anotherIndex = anotherOperation.data.index
        const indexDelta =
            index < anotherIndex || (index === anotherIndex && priority) ? 0 : 1
        return {
            ...operation,
            data: {
                index: index + indexDelta,
                value: operation.data.value,
            },
            version: operation.version + 1,
        }
    },
}
Object.freeze(type)
typeManager.registerType(type)

export const clientStorageTests = (
    createClientStorage: (
        options: { clientId: ClientId; typeManager: TypeManager },
    ) => ClientStorage,
) => {
    const id: DocumentId = 'id-1'
    const operation: Operation = {
        client,
        data: null,
        id,
        kind: 'Operation',
        meta: null,
        sequence: 1,
        type: typeName,
        version: 1,
    }
    const snapshot: Snapshot = {
        client,
        data: null,
        id,
        kind: 'Snapshot',
        meta: null,
        sequence: 1,
        type: typeName,
        version: 1,
    }

    Object.freeze(operation)
    Object.freeze(snapshot)

    describe('ClientStorage', () => {
        let clientStorage: ClientStorage

        beforeEach(() => {
            clientStorage = createClientStorage({
                clientId: client,
                typeManager,
            })
        })

        test('save an invalid remote operation', async () => {
            expect.assertions(4)
            const o1 = { ...operation, version: 5, client: remoteClient }
            const o2 = {
                ...operation,
                client: remoteClient,
                data: undefined as any,
                version: 6,
            }
            const o3 = { ...operation, version: 6, client: remoteClient }
            await clientStorage.saveRemoteOperation(o1)

            await clientStorage
                .saveRemoteOperation(o2)
                .catch((error: SyncOtError) => {
                    expect(error).toBeInstanceOf(SyncOtError)
                    expect(error.code).toBe(ErrorCodes.InvalidOperation)
                })
            await clientStorage.saveRemoteOperation(o3)
            await expect(
                clientStorage.loadRemoteOperations(typeName, id),
            ).resolves.toEqual([o1, o3])
            await expect(
                clientStorage.loadLocalOperations(typeName, id),
            ).resolves.toEqual([])
        })

        test('save an invalid local operation', async () => {
            expect.assertions(4)
            const o1 = { ...operation, version: 1, sequence: 1 }
            const o2 = {
                ...operation,
                data: undefined as any,
                sequence: 2,
                version: 2,
            }
            const o3 = { ...operation, version: 2, sequence: 2 }
            await clientStorage.saveLocalOperation(o1)
            await clientStorage
                .saveLocalOperation(o2)
                .catch((error: SyncOtError) => {
                    expect(error).toBeInstanceOf(SyncOtError)
                    expect(error.code).toBe(ErrorCodes.InvalidOperation)
                })
            await clientStorage.saveLocalOperation(o3)
            await expect(
                clientStorage.loadRemoteOperations(typeName, id),
            ).resolves.toEqual([])
            await expect(
                clientStorage.loadLocalOperations(typeName, id),
            ).resolves.toEqual([o1, o3])
        })

        test('save remote operations starting at version 1', async () => {
            const o1 = { ...operation, version: 1, client: remoteClient }
            const o2 = { ...operation, version: 2, client: remoteClient }
            const o3 = { ...operation, version: 3, client: remoteClient }
            await clientStorage.saveRemoteOperation(o1)
            await clientStorage.saveRemoteOperation(o2)
            await clientStorage.saveRemoteOperation(o3)
            await expect(
                clientStorage.loadRemoteOperations(typeName, id),
            ).resolves.toEqual([o1, o2, o3])
            await expect(
                clientStorage.loadLocalOperations(typeName, id),
            ).resolves.toEqual([])
            await expect(
                clientStorage.loadLocalOperations(typeName, id),
            ).resolves.toEqual([])
        })

        test('save remote operations starting at version 5', async () => {
            const o1 = { ...operation, version: 5, client: remoteClient }
            const o2 = { ...operation, version: 6, client: remoteClient }
            const o3 = { ...operation, version: 7, client: remoteClient }
            await clientStorage.saveRemoteOperation(o1)
            await clientStorage.saveRemoteOperation(o2)
            await clientStorage.saveRemoteOperation(o3)
            await expect(
                clientStorage.loadRemoteOperations(typeName, id),
            ).resolves.toEqual([o1, o2, o3])
            await expect(
                clientStorage.loadLocalOperations(typeName, id),
            ).resolves.toEqual([])
        })

        test(
            'save a remote operation with a version number not matching the last' +
                " remote operation's version number plus 1",
            async () => {
                expect.assertions(4)
                const o0 = { ...operation, version: 4, client: remoteClient }
                const o1 = { ...operation, version: 5, client: remoteClient }
                const o2 = { ...operation, version: 7, client: remoteClient }
                const o3 = { ...operation, version: 6, client: remoteClient }
                await clientStorage.saveRemoteOperation(o0)
                await clientStorage.saveRemoteOperation(o1)
                await clientStorage
                    .saveRemoteOperation(o2)
                    .catch((error: SyncOtError) => {
                        expect(error).toBeInstanceOf(SyncOtError)
                        expect(error.code).toBe(
                            ErrorCodes.UnexpectedVersionNumber,
                        )
                    })
                await clientStorage.saveRemoteOperation(o3)
                await expect(
                    clientStorage.loadRemoteOperations(typeName, id),
                ).resolves.toEqual([o0, o1, o3])
                await expect(
                    clientStorage.loadLocalOperations(typeName, id),
                ).resolves.toEqual([])
            },
        )

        test(
            'save a remote operation with a version number not matching' +
                " the first local operation's version number",
            async () => {
                expect.assertions(4)
                const o0 = { ...operation, version: 1, sequence: 1 }
                const o1 = { ...operation, version: 2, sequence: 2 }
                const o2 = {
                    ...operation,
                    client: remoteClient,
                    sequence: 2,
                    version: 2,
                }
                await clientStorage.saveLocalOperation(o0)
                await clientStorage.saveLocalOperation(o1)
                await clientStorage
                    .saveRemoteOperation(o2)
                    .catch((error: SyncOtError) => {
                        expect(error).toBeInstanceOf(SyncOtError)
                        expect(error.code).toBe(
                            ErrorCodes.UnexpectedVersionNumber,
                        )
                    })
                await expect(
                    clientStorage.loadRemoteOperations(typeName, id),
                ).resolves.toEqual([])
                await expect(
                    clientStorage.loadLocalOperations(typeName, id),
                ).resolves.toEqual([o0, o1])
            },
        )

        test('save a remote operation and transform local operations', async () => {
            // Local operations
            const o0 = {
                ...operation,
                // index < remote index (6), so the index should remain unchanged
                // and the remote index should be incremented.
                data: { index: 5, value: 0 },
                sequence: 1,
                version: 1,
            }
            const o1 = {
                ...operation,
                // index === transformed remote index (7), so index should be incremented
                // because the remote operation has the priority.
                data: { index: 7, value: 1 },
                sequence: 2,
                version: 2,
            }
            const o2 = {
                ...operation,
                // index > transformed remote index (7), so the index should be incremented.
                data: { index: 8, value: 2 },
                sequence: 3,
                version: 3,
            }
            const o3 = {
                ...operation,
                // index < transformed remote index (7), so the index should remain unchanged
                // and the remote index should be incremented.
                data: { index: 6, value: 3 },
                sequence: 4,
                version: 4,
            }
            // Remote operation
            const o4 = {
                ...operation,
                client: remoteClient,
                data: { index: 6, value: 4 },
            }
            // Transformed local operations
            const o5 = {
                ...operation,
                data: { index: 5, value: 0 },
                sequence: 1,
                version: 2,
            }
            const o6 = {
                ...operation,
                data: { index: 8, value: 1 },
                sequence: 2,
                version: 3,
            }
            const o7 = {
                ...operation,
                data: { index: 9, value: 2 },
                sequence: 3,
                version: 4,
            }
            const o8 = {
                ...operation,
                data: { index: 6, value: 3 },
                sequence: 4,
                version: 5,
            }
            await clientStorage.saveLocalOperation(o0)
            await clientStorage.saveLocalOperation(o1)
            await clientStorage.saveLocalOperation(o2)
            await clientStorage.saveLocalOperation(o3)
            await clientStorage.saveRemoteOperation(o4)
            await expect(
                clientStorage.loadRemoteOperations(typeName, id),
            ).resolves.toEqual([o4])
            await expect(
                clientStorage.loadLocalOperations(typeName, id),
            ).resolves.toEqual([o5, o6, o7, o8])
        })

        test('save a remote operation with a local client ID but no local operations', async () => {
            expect.assertions(4)
            const o0 = { ...operation, version: 4, client: remoteClient }
            const o1 = { ...operation, version: 5, client: remoteClient }
            const o2 = { ...operation, version: 6 }
            const o3 = { ...operation, version: 6, client: remoteClient }
            await clientStorage.saveRemoteOperation(o0)
            await clientStorage.saveRemoteOperation(o1)
            await clientStorage
                .saveRemoteOperation(o2)
                .catch((error: SyncOtError) => {
                    expect(error).toBeInstanceOf(SyncOtError)
                    expect(error.code).toBe(ErrorCodes.UnexpectedClientId)
                })
            await clientStorage.saveRemoteOperation(o3)
            await expect(
                clientStorage.loadRemoteOperations(typeName, id),
            ).resolves.toEqual([o0, o1, o3])
            await expect(
                clientStorage.loadLocalOperations(typeName, id),
            ).resolves.toEqual([])
        })

        test(
            'save a remote operation with a local client ID and the sequence number not' +
                " matching the first local operation's sequence number",
            async () => {
                expect.assertions(4)
                const o0 = { ...operation, version: 1, sequence: 1 }
                const o1 = { ...operation, version: 2, sequence: 2 }
                const o2 = { ...operation, version: 3, sequence: 3 }
                const o3 = { ...operation, version: 1, sequence: 2 }
                await clientStorage.saveLocalOperation(o0)
                await clientStorage.saveLocalOperation(o1)
                await clientStorage.saveLocalOperation(o2)
                await clientStorage
                    .saveRemoteOperation(o3)
                    .catch((error: SyncOtError) => {
                        expect(error).toBeInstanceOf(SyncOtError)
                        expect(error.code).toBe(
                            ErrorCodes.UnexpectedSequenceNumber,
                        )
                    })
                await expect(
                    clientStorage.loadRemoteOperations(typeName, id),
                ).resolves.toEqual([])
                await expect(
                    clientStorage.loadLocalOperations(typeName, id),
                ).resolves.toEqual([o0, o1, o2])
            },
        )

        test(
            'save a remote operation with a local client ID and the version number not' +
                " matching the first local operation's version number",
            async () => {
                expect.assertions(4)
                const o0 = { ...operation, version: 1, sequence: 1 }
                const o1 = { ...operation, version: 2, sequence: 2 }
                const o2 = { ...operation, version: 3, sequence: 3 }
                const o3 = { ...operation, version: 2, sequence: 1 }
                await clientStorage.saveLocalOperation(o0)
                await clientStorage.saveLocalOperation(o1)
                await clientStorage.saveLocalOperation(o2)
                await clientStorage
                    .saveRemoteOperation(o3)
                    .catch((error: SyncOtError) => {
                        expect(error).toBeInstanceOf(SyncOtError)
                        expect(error.code).toBe(
                            ErrorCodes.UnexpectedVersionNumber,
                        )
                    })
                await expect(
                    clientStorage.loadRemoteOperations(typeName, id),
                ).resolves.toEqual([])
                await expect(
                    clientStorage.loadLocalOperations(typeName, id),
                ).resolves.toEqual([o0, o1, o2])
            },
        )

        test('save a local operation with an unexpected client ID', async () => {
            expect.assertions(4)
            const o0 = { ...operation, version: 1, sequence: 1 }
            const o1 = { ...operation, version: 2, sequence: 2 }
            const o2 = {
                ...operation,
                client: remoteClient,
                sequence: 3,
                version: 3,
            }
            await clientStorage.saveLocalOperation(o0)
            await clientStorage.saveLocalOperation(o1)
            await clientStorage
                .saveLocalOperation(o2)
                .catch((error: SyncOtError) => {
                    expect(error).toBeInstanceOf(SyncOtError)
                    expect(error.code).toBe(ErrorCodes.UnexpectedClientId)
                })
            await expect(
                clientStorage.loadRemoteOperations(typeName, id),
            ).resolves.toEqual([])
            await expect(
                clientStorage.loadLocalOperations(typeName, id),
            ).resolves.toEqual([o0, o1])
        })

        test(
            'save a local operation with an unexpected sequence number' +
                ' when there are no existing local operations',
            async () => {
                expect.assertions(4)
                const o0 = { ...operation, version: 1, sequence: 1 }
                const o1 = { ...operation, version: 2, sequence: 2 }
                const o2 = { ...operation, sequence: 1, version: 3 }
                const o3 = { ...operation, sequence: 3, version: 3 }
                await clientStorage.saveLocalOperation(o0)
                await clientStorage.saveLocalOperation(o1)
                await clientStorage.saveRemoteOperation(o0)
                await clientStorage.saveRemoteOperation(o1)
                await clientStorage
                    .saveLocalOperation(o2)
                    .catch((error: SyncOtError) => {
                        expect(error).toBeInstanceOf(SyncOtError)
                        expect(error.code).toBe(
                            ErrorCodes.UnexpectedSequenceNumber,
                        )
                    })
                await clientStorage.saveLocalOperation(o3)
                await expect(
                    clientStorage.loadRemoteOperations(typeName, id),
                ).resolves.toEqual([o0, o1])
                await expect(
                    clientStorage.loadLocalOperations(typeName, id),
                ).resolves.toEqual([o3])
            },
        )

        test(
            'save a local operation with an unexpected sequence number' +
                ' when there have never been existing local operations',
            async () => {
                expect.assertions(4)
                const o0 = { ...operation, version: 1, sequence: 2 }
                const o1 = { ...operation, version: 1, sequence: 1 }
                await clientStorage
                    .saveLocalOperation(o0)
                    .catch((error: SyncOtError) => {
                        expect(error).toBeInstanceOf(SyncOtError)
                        expect(error.code).toBe(
                            ErrorCodes.UnexpectedSequenceNumber,
                        )
                    })
                await clientStorage.saveLocalOperation(o1)
                await expect(
                    clientStorage.loadRemoteOperations(typeName, id),
                ).resolves.toEqual([])
                await expect(
                    clientStorage.loadLocalOperations(typeName, id),
                ).resolves.toEqual([o1])
            },
        )

        test(
            'save a local operation with an unexpected sequence number' +
                ' when there are existing local operations',
            async () => {
                expect.assertions(4)
                const o0 = { ...operation, version: 1, sequence: 1 }
                const o1 = { ...operation, version: 2, sequence: 2 }
                const o2 = { ...operation, sequence: 1, version: 3 }
                const o3 = { ...operation, sequence: 3, version: 3 }
                await clientStorage.saveLocalOperation(o0)
                await clientStorage.saveLocalOperation(o1)
                await clientStorage
                    .saveLocalOperation(o2)
                    .catch((error: SyncOtError) => {
                        expect(error).toBeInstanceOf(SyncOtError)
                        expect(error.code).toBe(
                            ErrorCodes.UnexpectedSequenceNumber,
                        )
                    })
                await clientStorage.saveLocalOperation(o3)
                await expect(
                    clientStorage.loadRemoteOperations(typeName, id),
                ).resolves.toEqual([])
                await expect(
                    clientStorage.loadLocalOperations(typeName, id),
                ).resolves.toEqual([o0, o1, o3])
            },
        )

        test(
            'save a local operation with a version number not equal to' +
                " the last local operation's version number plus 1",
            async () => {
                expect.assertions(4)
                const o0 = { ...operation, version: 1, sequence: 1 }
                const o1 = { ...operation, version: 2, sequence: 2 }
                const o2 = { ...operation, version: 4, sequence: 3 }
                const o3 = { ...operation, version: 3, sequence: 3 }
                await clientStorage.saveLocalOperation(o0)
                await clientStorage.saveLocalOperation(o1)
                await clientStorage
                    .saveLocalOperation(o2)
                    .catch((error: SyncOtError) => {
                        expect(error).toBeInstanceOf(SyncOtError)
                        expect(error.code).toBe(
                            ErrorCodes.UnexpectedVersionNumber,
                        )
                    })
                await clientStorage.saveLocalOperation(o3)
                await expect(
                    clientStorage.loadRemoteOperations(typeName, id),
                ).resolves.toEqual([])
                await expect(
                    clientStorage.loadLocalOperations(typeName, id),
                ).resolves.toEqual([o0, o1, o3])
            },
        )

        test(
            'save a local operation with a version number not equal to' +
                " the last remote operation's version number plus 1",
            async () => {
                expect.assertions(4)
                const o0 = { ...operation, version: 1, client: remoteClient }
                const o1 = { ...operation, version: 2, client: remoteClient }
                const o2 = { ...operation, version: 4, sequence: 1 }
                const o3 = { ...operation, version: 3, sequence: 1 }
                await clientStorage.saveRemoteOperation(o0)
                await clientStorage.saveRemoteOperation(o1)
                await clientStorage
                    .saveLocalOperation(o2)
                    .catch((error: SyncOtError) => {
                        expect(error).toBeInstanceOf(SyncOtError)
                        expect(error.code).toBe(
                            ErrorCodes.UnexpectedVersionNumber,
                        )
                    })
                await clientStorage.saveLocalOperation(o3)
                await expect(
                    clientStorage.loadRemoteOperations(typeName, id),
                ).resolves.toEqual([o0, o1])
                await expect(
                    clientStorage.loadLocalOperations(typeName, id),
                ).resolves.toEqual([o3])
            },
        )

        test('save a local operation with a version number not equal to 1', async () => {
            expect.assertions(4)
            const o0 = { ...operation, version: 2, sequence: 1 }
            await clientStorage
                .saveLocalOperation(o0)
                .catch((error: SyncOtError) => {
                    expect(error).toBeInstanceOf(SyncOtError)
                    expect(error.code).toBe(ErrorCodes.UnexpectedVersionNumber)
                })
            await expect(
                clientStorage.loadRemoteOperations(typeName, id),
            ).resolves.toEqual([])
            await expect(
                clientStorage.loadLocalOperations(typeName, id),
            ).resolves.toEqual([])
        })
    })
}
