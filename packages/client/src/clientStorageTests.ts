import {
    ClientId,
    createTypeManager,
    DocumentId,
    ErrorCodes,
    Operation,
    Snapshot,
    SyncOtError,
    Type,
    TypeManager,
    TypeName,
} from '@syncot/core'
import { ClientStorage, ClientStorageStatus } from '.'

interface ListSnapshot extends Snapshot {
    data: number[]
}
interface ListOperation extends Operation {
    data: { index: number; value: number }
}
const transformError = new Error('transform-error')
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
        if (operation.data == null || anotherOperation.data == null) {
            throw transformError
        }

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

const expectError = (code: ErrorCodes) => (error: any) => {
    expect(error).toBeInstanceOf(SyncOtError)
    expect(error.code).toBe(code)
}

export const clientStorageTests = (
    createClientStorage: (options: {
        clientId: ClientId
        typeManager: TypeManager
    }) => ClientStorage,
) => {
    const id: DocumentId = 'id-1'
    const operation: Operation = {
        client,
        data: { index: 0, value: 0 },
        id,
        kind: 'Operation',
        meta: null,
        sequence: 1,
        type: typeName,
        version: 6,
    }
    const snapshot: Snapshot = {
        client,
        data: { index: 0, value: 0 },
        id,
        kind: 'Snapshot',
        meta: null,
        sequence: 5,
        type: typeName,
        version: 5,
    }
    const status: ClientStorageStatus = {
        clientId: client,
        id,
        initialized: true,
        lastRemoteVersion: 5,
        lastSequence: 0,
        lastVersion: 5,
        typeName,
    }

    Object.freeze(operation)
    Object.freeze(operation.data)
    Object.freeze(snapshot)
    Object.freeze(snapshot.data)
    Object.freeze(status)

    let clientStorage: ClientStorage

    const getStatus = (typeNameIn = typeName, idIn = id) =>
        clientStorage.getStatus(typeNameIn, idIn)

    const load = (typeNameIn = typeName, idIn = id) =>
        clientStorage.load(typeNameIn, idIn)

    beforeEach(() => {
        clientStorage = createClientStorage({
            clientId: client,
            typeManager,
        })
    })

    describe('getStatus, init, clear', () => {
        const status0 = { ...status, lastRemoteVersion: 0, lastVersion: 0 }
        const uninitializedStatus0 = { ...status0, initialized: false }

        test('getStatus initialized to version 0', async () => {
            await clientStorage.init({ ...snapshot, version: 0 })
            await expect(getStatus()).resolves.toEqual(status0)
            await expect(load()).resolves.toEqual([])
        })

        test('getStatus initialized to version > 0', async () => {
            await clientStorage.init(snapshot)
            await expect(getStatus()).resolves.toEqual(status)
            await expect(load()).resolves.toEqual([])
        })

        test('getStatus uninitialized', async () => {
            await expect(getStatus()).resolves.toEqual(uninitializedStatus0)
        })

        test('getStatus after clear', async () => {
            await clientStorage.init(snapshot)
            await clientStorage.clear(typeName, id)
            await expect(getStatus()).resolves.toEqual(uninitializedStatus0)
        })

        test('init twice', async () => {
            expect.assertions(4)
            await clientStorage.init(snapshot)
            await clientStorage
                .init(snapshot)
                .catch(expectError(ErrorCodes.AlreadyInitialized))
            await expect(getStatus()).resolves.toEqual(status)
            await expect(load()).resolves.toEqual([])
        })

        test('clear twice', async () => {
            await clientStorage.init(snapshot)
            await clientStorage.clear(typeName, id)
            await clientStorage.clear(typeName, id)
            await expect(getStatus()).resolves.toEqual(uninitializedStatus0)
        })

        test('init 2 different type-id combinations', async () => {
            const id2 = 'id-2'
            await clientStorage.init(snapshot)
            await clientStorage.init({ ...snapshot, id: id2, version: 0 })
            await expect(getStatus()).resolves.toEqual(status)
            await expect(getStatus(typeName, id2)).resolves.toEqual({
                ...status0,
                id: id2,
            })
            await expect(load()).resolves.toEqual([])
            await expect(load(typeName, id2)).resolves.toEqual([])
        })
    })

    describe('store, load', () => {
        const remoteOperation = { ...operation, client: remoteClient }

        beforeEach(() => {
            clientStorage.init(snapshot)
        })

        describe('uninitialized', () => {
            test('load', async () => {
                await expect(
                    clientStorage.load(typeName, 'id-2'),
                ).rejects.toEqual(
                    expect.objectContaining({
                        message: 'Client storage not initialized.',
                        name: 'SyncOtError NotInitialized',
                    }),
                )
            })
            describe('store', () => {
                test.each([undefined, false, true])('local=%s', async local => {
                    await clientStorage.clear(typeName, id)
                    await expect(
                        clientStorage.store(operation, local),
                    ).rejects.toEqual(
                        expect.objectContaining({
                            message: 'Client storage not initialized.',
                            name: 'SyncOtError NotInitialized',
                        }),
                    )
                })
            })
        })

        describe('store an invalid operation', () => {
            test.each([undefined, false, true])('local=%s', async local => {
                const entity = { ...operation, data: undefined as any }
                await expect(
                    clientStorage.store(entity, local),
                ).rejects.toEqual(
                    expect.objectContaining({
                        entity,
                        entityName: 'Operation',
                        key: 'data',
                        message: 'Invalid "Operation.data".',
                        name: 'SyncOtError InvalidEntity',
                    }),
                )
                await expect(load()).resolves.toEqual([])
            })
        })

        describe('store a remote operation', () => {
            test.each([undefined, false])('local=%s', async local => {
                await clientStorage.store(remoteOperation, local)
                await expect(getStatus()).resolves.toEqual({
                    ...status,
                    lastRemoteVersion: 6,
                    lastVersion: 6,
                })
                await expect(load()).resolves.toEqual([remoteOperation])
            })
            test('local=true', async () => {
                expect.assertions(4)
                await clientStorage
                    .store(remoteOperation, true)
                    .catch(expectError(ErrorCodes.UnexpectedClientId))
                await expect(getStatus()).resolves.toEqual(status)
                await expect(load()).resolves.toEqual([])
            })
        })

        describe('store a local operation', () => {
            test.each([undefined, false])('local=undefined', async local => {
                expect.assertions(4)
                await clientStorage
                    .store(operation, local)
                    .catch(expectError(ErrorCodes.UnexpectedClientId))
                await expect(getStatus()).resolves.toEqual(status)
                await expect(load()).resolves.toEqual([])
            })
            test('local=true', async () => {
                await clientStorage.store(operation, true)
                await expect(getStatus()).resolves.toEqual({
                    ...status,
                    lastSequence: 1,
                    lastVersion: 6,
                })
                await expect(load()).resolves.toEqual([operation])
            })
        })

        describe('store errors', () => {
            const initialStatus = {
                ...status,
                lastRemoteVersion: 5,
                lastSequence: 2,
                lastVersion: 7,
            }
            const o0 = operation
            const o1 = { ...operation, sequence: 2, version: 7 }

            beforeEach(async () => {
                await clientStorage.store(o0, true)
                await clientStorage.store(o1, true)
            })

            describe('UnexpectedVersionNumber', () => {
                test.each([undefined, false])('local=%s', async local => {
                    expect.assertions(4)
                    await clientStorage
                        .store({ ...remoteOperation, version: 8 }, local)
                        .catch(expectError(ErrorCodes.UnexpectedVersionNumber))
                    await expect(getStatus()).resolves.toEqual(initialStatus)
                    await expect(load()).resolves.toEqual([o0, o1])
                })
                test('local=true', async () => {
                    expect.assertions(4)
                    await clientStorage
                        .store({ ...operation, sequence: 3, version: 6 }, true)
                        .catch(expectError(ErrorCodes.UnexpectedVersionNumber))
                    await expect(getStatus()).resolves.toEqual(initialStatus)
                    await expect(load()).resolves.toEqual([o0, o1])
                })
            })

            describe('UnexpectedSequenceNumber', () => {
                test.each([undefined, false])('local=%s', async local => {
                    expect.assertions(4)
                    await clientStorage
                        .store({ ...operation, sequence: 4, version: 6 }, local)
                        .catch(expectError(ErrorCodes.UnexpectedSequenceNumber))
                    await expect(getStatus()).resolves.toEqual(initialStatus)
                    await expect(load()).resolves.toEqual([o0, o1])
                })
                test('local=true', async () => {
                    expect.assertions(4)
                    await clientStorage
                        .store({ ...operation, sequence: 4, version: 8 }, true)
                        .catch(expectError(ErrorCodes.UnexpectedSequenceNumber))
                    await expect(getStatus()).resolves.toEqual(initialStatus)
                    await expect(load()).resolves.toEqual([o0, o1])
                })
            })
        })

        describe('store a remote operation with a local clientId', () => {
            test.each([undefined, false])('local=%s', async local => {
                const o1 = operation
                const o2 = { ...operation, sequence: 2, version: 7 }
                await clientStorage.store(o1, true)
                await clientStorage.store(o2, true)
                await clientStorage.store(o1, local)
                await expect(getStatus()).resolves.toEqual({
                    ...status,
                    lastRemoteVersion: 6,
                    lastSequence: 2,
                    lastVersion: 7,
                })
                await expect(load()).resolves.toEqual([o1, o2])
            })
        })

        describe('store a remote operation and transform local operations', () => {
            test.each([undefined, false])('local=%s', async local => {
                // Initial remote operations.
                const o0 = { ...remoteOperation, version: 6 }
                const o1 = { ...remoteOperation, version: 7 }
                // Local operations.
                const o2 = {
                    ...operation,
                    // index < remote index (6), so the index should remain unchanged
                    // and the remote index should be incremented.
                    data: { index: 5, value: 0 },
                    sequence: 1,
                    version: 8,
                }
                const o3 = {
                    ...operation,
                    // index === transformed remote index (7), so index should be incremented
                    // because the remote operation has the priority.
                    data: { index: 7, value: 1 },
                    sequence: 2,
                    version: 9,
                }
                const o4 = {
                    ...operation,
                    // index > transformed remote index (7), so the index should be incremented.
                    data: { index: 8, value: 2 },
                    sequence: 3,
                    version: 10,
                }
                const o5 = {
                    ...operation,
                    // index < transformed remote index (7), so the index should remain unchanged
                    // and the remote index should be incremented.
                    data: { index: 6, value: 3 },
                    sequence: 4,
                    version: 11,
                }
                // Remote operation which conflicts with the local operations.
                const o6 = {
                    ...remoteOperation,
                    data: { index: 6, value: 4 },
                    version: 8,
                }
                // Transformed local operations.
                const o7 = {
                    ...operation,
                    data: { index: 5, value: 0 },
                    sequence: 1,
                    version: 9,
                }
                const o8 = {
                    ...operation,
                    data: { index: 8, value: 1 },
                    sequence: 2,
                    version: 10,
                }
                const o9 = {
                    ...operation,
                    data: { index: 9, value: 2 },
                    sequence: 3,
                    version: 11,
                }
                const o10 = {
                    ...operation,
                    data: { index: 6, value: 3 },
                    sequence: 4,
                    version: 12,
                }
                await clientStorage.store(o0)
                await clientStorage.store(o1)
                await clientStorage.store(o2, true)
                await clientStorage.store(o3, true)
                await clientStorage.store(o4, true)
                await clientStorage.store(o5, true)
                await clientStorage.store(o6, local)
                await expect(getStatus()).resolves.toEqual({
                    ...status,
                    lastRemoteVersion: 8,
                    lastSequence: 4,
                    lastVersion: 12,
                })
                await expect(load()).resolves.toEqual([
                    o0,
                    o1,
                    o6,
                    o7,
                    o8,
                    o9,
                    o10,
                ])
            })
        })

        describe('store with transformation error', () => {
            test.each([undefined, false])('local=%s', async local => {
                const localOperation = { ...operation, data: null }
                expect.assertions(3)
                await clientStorage.store(localOperation, true)
                await clientStorage
                    .store(remoteOperation, local)
                    .catch(error => expect(error).toBe(transformError))
                await expect(getStatus()).resolves.toEqual({
                    ...status,
                    lastRemoteVersion: 5,
                    lastSequence: 1,
                    lastVersion: 6,
                })
                await expect(load()).resolves.toEqual([localOperation])
            })
        })

        describe('load', () => {
            const o0 = { ...remoteOperation, version: 6 }
            const o1 = { ...remoteOperation, version: 7 }
            const o2 = { ...remoteOperation, version: 8 }
            const o3 = { ...operation, sequence: 1, version: 9 }
            const o4 = { ...operation, sequence: 2, version: 10 }
            const o5 = { ...operation, sequence: 3, version: 11 }

            beforeEach(async () => {
                await clientStorage.store(o0)
                await clientStorage.store(o1)
                await clientStorage.store(o2)
                await clientStorage.store(o3, true)
                await clientStorage.store(o4, true)
                await clientStorage.store(o5, true)
            })

            test('no limit', async () => {
                await expect(clientStorage.load(typeName, id)).resolves.toEqual(
                    [o0, o1, o2, o3, o4, o5],
                )
            })
            test('big limit', async () => {
                await expect(
                    clientStorage.load(typeName, id, 3, 15),
                ).resolves.toEqual([o0, o1, o2, o3, o4, o5])
            })
            test('lower limit', async () => {
                await expect(
                    clientStorage.load(typeName, id, 8, undefined),
                ).resolves.toEqual([o2, o3, o4, o5])
            })
            test('upper limit', async () => {
                await expect(
                    clientStorage.load(typeName, id, undefined, 9),
                ).resolves.toEqual([o0, o1, o2, o3])
            })
            test('upper and lower limit', async () => {
                await expect(
                    clientStorage.load(typeName, id, 8, 9),
                ).resolves.toEqual([o2, o3])
            })
            test('lower limit equal to higher limit', async () => {
                await expect(
                    clientStorage.load(typeName, id, 8, 8),
                ).resolves.toEqual([o2])
            })
            test('out of bounds limit', async () => {
                await expect(
                    clientStorage.load(typeName, id, 15, 16),
                ).resolves.toEqual([])
            })
            test('lower limit higher than upper limit', async () => {
                await expect(
                    clientStorage.load(typeName, id, 9, 8),
                ).resolves.toEqual([])
            })
        })
    })
}
