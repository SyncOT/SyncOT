import {
    ContentStore,
    createContentStore,
    createOperationKey,
    Operation,
    Schema,
} from '.'

const userId = 'test-user'
const operations: Operation[] = Array.from(Array(10), (_value, version) => ({
    key: createOperationKey(userId),
    type: 'test-type',
    id: 'test-id',
    version,
    schema: 0,
    data: version,
    meta: null,
}))
const schema: Schema = {
    key: 100,
    type: 'test-type',
    data: 'test-data',
    meta: null,
}
let store: ContentStore

beforeEach(() => {
    store = createContentStore()
})

describe('registerSchema', () => {
    test('the same schema twice', async () => {
        await expect(store.registerSchema(schema)).resolves.toBe(0)
        await expect(store.registerSchema(schema)).resolves.toBe(0)
        await expect(store.getSchema(0)).resolves.toStrictEqual({
            ...schema,
            key: 0,
        })
        await expect(store.getSchema(1)).resolves.toBe(null)
    })
    test('different meta', async () => {
        const user = 'test-user'
        const time = Date.now()
        const session = 'test-session'
        const schemaWithMeta = { ...schema, meta: { session, time, user } }
        await expect(store.registerSchema(schemaWithMeta)).resolves.toBe(0)
        await expect(
            store.registerSchema({
                ...schemaWithMeta,
                meta: { ...schemaWithMeta.meta, user: `${user}-different` },
            }),
        ).resolves.toBe(0)
        await expect(store.getSchema(0)).resolves.toStrictEqual({
            ...schemaWithMeta,
            key: 0,
        })
        await expect(store.getSchema(1)).resolves.toBe(null)
    })
    test('different key', async () => {
        await expect(store.registerSchema({ ...schema, key: 5 })).resolves.toBe(
            0,
        )
        await expect(store.registerSchema({ ...schema, key: 7 })).resolves.toBe(
            0,
        )
        await expect(store.getSchema(0)).resolves.toStrictEqual({
            ...schema,
            key: 0,
        })
        await expect(store.getSchema(1)).resolves.toBe(null)
    })
    test('different type', async () => {
        await expect(
            store.registerSchema({ ...schema, type: 'type-1' }),
        ).resolves.toBe(0)
        await expect(
            store.registerSchema({ ...schema, type: 'type-2' }),
        ).resolves.toBe(1)
        await expect(store.getSchema(0)).resolves.toStrictEqual({
            ...schema,
            key: 0,
            type: 'type-1',
        })
        await expect(store.getSchema(1)).resolves.toStrictEqual({
            ...schema,
            key: 1,
            type: 'type-2',
        })
        await expect(store.getSchema(2)).resolves.toBe(null)
    })
    test('different data', async () => {
        await expect(
            store.registerSchema({ ...schema, data: 'data-1' }),
        ).resolves.toBe(0)
        await expect(
            store.registerSchema({ ...schema, data: 'data-2' }),
        ).resolves.toBe(1)
        await expect(store.getSchema(0)).resolves.toStrictEqual({
            ...schema,
            key: 0,
            data: 'data-1',
        })
        await expect(store.getSchema(1)).resolves.toStrictEqual({
            ...schema,
            key: 1,
            data: 'data-2',
        })
        await expect(store.getSchema(2)).resolves.toBe(null)
    })
})

describe('storeOperation', () => {
    test('operation.version === 0', async () => {
        await expect(store.storeOperation(operations[0])).rejects.toEqual(
            expect.objectContaining({
                message: 'Operation.version must be a positive integer.',
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
                const modifiedOperations = operations
                    .slice(1)
                    .map((operation) => ({
                        ...operation,
                        type,
                        id,
                        key: createOperationKey(userId),
                    }))

                for (const operation of modifiedOperations) {
                    await store.storeOperation(operation)
                }

                await expect(store.getVersion(type, id)).resolves.toBe(
                    modifiedOperations[modifiedOperations.length - 1].version,
                )

                await expect(
                    store.loadOperations(type, id, 1, Number.MAX_SAFE_INTEGER),
                ).resolves.toStrictEqual(modifiedOperations)

                for (const operation of modifiedOperations) {
                    await expect(
                        store.loadOperation(operation.key),
                    ).resolves.toStrictEqual(operation)
                }
            }
        }
    })
})

describe('loadOperation', () => {
    test('existing operation', async () => {
        await store.storeOperation(operations[1])
        await expect(
            store.loadOperation(operations[1].key),
        ).resolves.toStrictEqual(operations[1])
    })
    test('non-existent operation', async () => {
        await store.storeOperation(operations[1])
        await expect(
            store.loadOperation(createOperationKey(userId)),
        ).resolves.toBe(null)
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
                1,
                Number.MAX_SAFE_INTEGER,
            ),
        ).resolves.toStrictEqual(operations.slice(1))
    })
    test('load non-existent operations', async () => {
        for (const operation of operations.slice(1)) {
            await store.storeOperation(operation)
        }
        await expect(
            store.loadOperations(
                operations[0].type,
                'different-id',
                1,
                Number.MAX_SAFE_INTEGER,
            ),
        ).resolves.toStrictEqual([])
    })
})

describe('getVersion', () => {
    test('existing document', async () => {
        for (const operation of operations.slice(1)) {
            await store.storeOperation(operation)
        }
        await expect(
            store.getVersion(operations[0].type, operations[0].id),
        ).resolves.toBe(operations[operations.length - 1].version)
    })
    test('non-existent document', async () => {
        for (const operation of operations.slice(1)) {
            await store.storeOperation(operation)
        }
        await expect(
            store.getVersion(operations[0].type, 'different-id'),
        ).resolves.toBe(0)
    })
})
