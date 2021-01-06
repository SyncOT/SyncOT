import {
    ContentStore,
    createBaseOperation,
    createBaseSnapshot,
    createContentStore,
    createOperationKey,
    createSchemaHash,
    minVersion,
    maxVersion,
    Operation,
    Schema,
    Snapshot,
} from '.'

const userId = 'test-user'
const operations: Operation[] = Array.from(Array(10), (_value, version) =>
    version === 0
        ? createBaseOperation('test-type', 'test-id')
        : {
              key: createOperationKey(userId),
              type: 'test-type',
              id: 'test-id',
              version,
              schema: 'test-schema',
              data: version,
              meta: null,
          },
)
const schema: Schema = {
    hash: createSchemaHash('test-type', 'test-data'),
    type: 'test-type',
    data: 'test-data',
    meta: null,
}
const snapshot: Snapshot = {
    key: 's-1',
    type: 't-1',
    id: 'i-1',
    version: 1,
    schema: 'test-schema',
    data: 'd-1',
    meta: {
        session: 's-1',
        time: Date.now(),
        user: 'u-1',
    },
}
let store: ContentStore

beforeEach(() => {
    store = createContentStore()
})

describe('storeSchema', () => {
    test('the same schema twice', async () => {
        await store.storeSchema(schema)
        await store.storeSchema(schema)
        await expect(store.loadSchema(schema.hash)).resolves.toStrictEqual(
            schema,
        )
    })
    test('different meta', async () => {
        const user = 'test-user'
        const time = Date.now()
        const session = 'test-session'
        const schemaWithMeta = { ...schema, meta: { session, time, user } }
        await store.storeSchema(schemaWithMeta)
        await store.storeSchema({
            ...schemaWithMeta,
            meta: { ...schemaWithMeta.meta, user: `${user}-different` },
        })
        await expect(store.loadSchema(schema.hash)).resolves.toStrictEqual(
            schemaWithMeta,
        )
    })
    test('different hash', async () => {
        const data = { a: 5 }
        const type1 = 'type-1'
        const type2 = 'type-2'
        const hash1 = createSchemaHash(type1, data)
        const hash2 = createSchemaHash(type2, data)
        const schema1 = { ...schema, hash: hash1, type: type1 }
        const schema2 = { ...schema, hash: hash2, type: type2 }
        await store.storeSchema(schema1)
        await store.storeSchema(schema2)
        await expect(store.loadSchema(hash1)).resolves.toStrictEqual(schema1)
        await expect(store.loadSchema(hash2)).resolves.toStrictEqual(schema2)
        await expect(store.loadSchema('missing-hash')).resolves.toBe(null)
    })
})

describe('storeOperation', () => {
    test('operation.version === 0', async () => {
        await expect(store.storeOperation(operations[0])).rejects.toEqual(
            expect.objectContaining({
                message: 'operation.version must be greater than minVersion.',
                name: 'SyncOTError Assert',
            }),
        )
    })

    test('operation.version out of sequence', async () => {
        await expect(store.storeOperation(operations[2])).rejects.toEqual(
            expect.objectContaining({
                message: 'Operation.version out of sequence.',
                name: 'SyncOTError Assert',
            }),
        )
    })

    test('duplicate operation.key', async () => {
        await store.storeOperation(operations[1])
        await expect(store.storeOperation(operations[1])).rejects.toEqual(
            expect.objectContaining({
                message: '"Operation" already exists.',
                name: 'SyncOTError AlreadyExists',
                entity: operations[1],
                entityName: 'Operation',
                key: 'key',
                value: operations[1].key,
            }),
        )
    })

    test('duplicate operation.version', async () => {
        await store.storeOperation(operations[1])
        await store.storeOperation(operations[2])
        await store.storeOperation(operations[3])
        await store.storeOperation(operations[4])
        const operation = {
            ...operations[2],
            key: createOperationKey(userId),
        }
        await expect(store.storeOperation(operation)).rejects.toEqual(
            expect.objectContaining({
                message: '"Operation" already exists.',
                name: 'SyncOTError AlreadyExists',
                entity: operation,
                entityName: 'Operation',
                key: 'version',
                value: 4,
            }),
        )
    })

    test('different types and IDs', async () => {
        const types = ['type-1', 'type-2']
        const ids = ['id-1', 'id-2']
        for (const type of types) {
            for (const id of ids) {
                const modifiedOperations = operations.map((operation) =>
                    operation.version === 0
                        ? createBaseOperation(type, id)
                        : {
                              ...operation,
                              type,
                              id,
                              key: createOperationKey(userId),
                          },
                )

                for (const operation of modifiedOperations.slice(1)) {
                    await store.storeOperation(operation)
                }

                await expect(
                    store.loadOperations(type, id, minVersion, maxVersion + 1),
                ).resolves.toStrictEqual(modifiedOperations)
            }
        }
    })
})

describe('loadOperations', () => {
    test('subset of existing operations', async () => {
        for (const operation of operations.slice(1)) {
            await store.storeOperation(operation)
        }
        await expect(
            store.loadOperations(operations[0].type, operations[0].id, 3, 7),
        ).resolves.toStrictEqual(operations.slice(3, 7))
    })
    test('load all existing operations', async () => {
        for (const operation of operations.slice(1)) {
            await store.storeOperation(operation)
        }
        await expect(
            store.loadOperations(
                operations[0].type,
                operations[0].id,
                minVersion,
                maxVersion + 1,
            ),
        ).resolves.toStrictEqual(operations)
    })
    test('load no operations', async () => {
        for (const operation of operations.slice(1)) {
            await store.storeOperation(operation)
        }
        await expect(
            store.loadOperations(
                operations[0].type,
                'different-id',
                minVersion + 1,
                maxVersion + 1,
            ),
        ).resolves.toStrictEqual([])
        await expect(
            store.loadOperations(
                operations[0].type,
                'different-id',
                minVersion,
                minVersion,
            ),
        ).resolves.toStrictEqual([])
    })
    test('load base operation', async () => {
        for (const operation of operations.slice(1)) {
            await store.storeOperation(operation)
        }
        await expect(
            store.loadOperations(
                operations[0].type,
                'different-id',
                minVersion,
                maxVersion + 1,
            ),
        ).resolves.toStrictEqual([
            createBaseOperation(operations[0].type, 'different-id'),
        ])
        await expect(
            store.loadOperations(
                operations[0].type,
                'different-id',
                minVersion,
                minVersion + 1,
            ),
        ).resolves.toStrictEqual([
            createBaseOperation(operations[0].type, 'different-id'),
        ])
    })
})

describe('storeSnapshot', () => {
    test('success', async () => {
        const snapshot2 = {
            ...snapshot,
            key: 'k-2',
            version: snapshot.version + 5,
        }
        await store.storeSnapshot(snapshot)
        await store.storeSnapshot(snapshot2)
        await expect(
            store.loadSnapshot(snapshot.type, snapshot.id, snapshot.version),
        ).resolves.toStrictEqual(snapshot)
        await expect(
            store.loadSnapshot(snapshot2.type, snapshot2.id, snapshot2.version),
        ).resolves.toStrictEqual(snapshot2)
    })
    test('invalid version', async () => {
        await expect(
            store.storeSnapshot({ ...snapshot, version: minVersion }),
        ).rejects.toStrictEqual(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: 'snapshot.version must be greater than minVersion.',
            }),
        )
    })
    test('duplicate key', async () => {
        const snapshot2 = {
            ...snapshot,
            version: snapshot.version + 5,
            data: 'd-2',
        }
        await store.storeSnapshot(snapshot)
        await expect(store.storeSnapshot(snapshot2)).rejects.toStrictEqual(
            expect.objectContaining({
                message: '"Snapshot" already exists.',
                name: 'SyncOTError AlreadyExists',
                entity: snapshot2,
                entityName: 'Snapshot',
                key: 'key',
                value: snapshot2.key,
            }),
        )
    })
    test('duplicate type, id and version', async () => {
        const snapshot2 = {
            ...snapshot,
            key: 'k-2',
            data: 'd-2',
        }
        await store.storeSnapshot(snapshot)
        await expect(store.storeSnapshot(snapshot2)).rejects.toStrictEqual(
            expect.objectContaining({
                message: '"Snapshot" already exists.',
                name: 'SyncOTError AlreadyExists',
                entity: snapshot2,
                entityName: 'Snapshot',
                key: 'version',
                value: snapshot2.version,
            }),
        )
    })
})

describe('loadSnapshot', () => {
    test('found', async () => {
        await store.storeSnapshot(snapshot)
        await expect(
            store.loadSnapshot(snapshot.type, snapshot.id, snapshot.version),
        ).resolves.toBe(snapshot)
    })
    test('found older version', async () => {
        const snapshot2 = { ...snapshot, key: 'k-2', version: 10 }
        const snapshot3 = { ...snapshot, key: 'k-3', version: 20 }
        await store.storeSnapshot(snapshot)
        await store.storeSnapshot(snapshot2)
        await store.storeSnapshot(snapshot3)
        await expect(
            store.loadSnapshot(snapshot.type, snapshot.id, 5),
        ).resolves.toBe(snapshot)
        await expect(
            store.loadSnapshot(snapshot.type, snapshot.id, 19),
        ).resolves.toBe(snapshot2)
        await expect(
            store.loadSnapshot(snapshot.type, snapshot.id, maxVersion),
        ).resolves.toBe(snapshot3)
    })
    test('fall back to base version', async () => {
        await store.storeSnapshot(snapshot)
        await expect(
            store.loadSnapshot(
                snapshot.type,
                snapshot.id + '-different',
                snapshot.version,
            ),
        ).resolves.toStrictEqual(
            createBaseSnapshot(snapshot.type, snapshot.id + '-different'),
        )
    })
})
