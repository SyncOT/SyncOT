import {
    assert,
    combine,
    createId,
    createInvalidEntityError,
    whenNextTick,
} from '@syncot/util'
import { install as installClock } from '@sinonjs/fake-timers'
import {
    ContentBackend,
    ContentStore,
    ContentType,
    createAlreadyExistsError,
    createContentBackend,
    createContentStore,
    createPubSub,
    createSchemaHash,
    maxOperationSize,
    maxSchemaSize,
    maxSnapshotSize,
    maxVersion,
    minVersion,
    Operation,
    PubSub,
    Schema,
    Snapshot,
} from '.'

const type = 'test-type'
const id = 'test-id'
const user = 'test-user'
const session = 'test-session'
const validSchema: Schema = {
    type,
    hash: createSchemaHash(type, 'test-schema-data'),
    data: 'test-schema-data',
    meta: { key: 'value' },
}
const invalidSchema: Schema = {
    type,
    hash: createSchemaHash(type, 5),
    data: 5,
    meta: { key: 'value' },
}

class TestContentType implements ContentType {
    private schemas: Map<string, Schema> = new Map()

    public validateSchema(schema: Schema): Schema {
        if (typeof schema.data !== 'string')
            throw createInvalidEntityError('Schema', schema, 'data')
        return schema
    }
    public hasSchema(hash: string): boolean {
        return this.schemas.has(hash)
    }
    public registerSchema(schema: Schema): void {
        if (this.hasSchema(schema.hash)) return
        this.schemas.set(schema.hash, schema)
    }
    public apply(snapshot: Snapshot, operation: Operation): Snapshot {
        assert(
            operation.type === snapshot.type,
            'operation.type must equal to snapshot.type.',
        )
        assert(
            operation.id === snapshot.id,
            'operation.id must equal to snapshot.id.',
        )
        assert(
            operation.version === snapshot.version + 1,
            'operation.version must equal to snapshot.version + 1.',
        )
        const schema = this.schemas.get(operation.schema)!
        assert(schema, 'operation.schema is not registered.')
        assert(
            Number.isSafeInteger(operation.data),
            'operation.data must be a safe integer.',
        )
        return {
            type: operation.type,
            id: operation.id,
            version: operation.version,
            schema: operation.schema,
            data: (snapshot.data || 0) + operation.data,
            meta: operation.meta,
        }
    }
}

function createSnapshot(version: number, data: number): Snapshot {
    return {
        type,
        id,
        version,
        schema: validSchema.hash,
        data,
        meta: {
            session,
            time: Date.now(),
            user,
        },
    }
}

function createOperation(version: number, data: number): Operation {
    return {
        key: createId(),
        type,
        id,
        version,
        schema: validSchema.hash,
        data,
        meta: {
            session,
            time: Date.now(),
            user,
        },
    }
}

let shouldStoreSnapshot: jest.Mock<boolean, [Snapshot]>
let onWarning: jest.Mock
let contentStore: ContentStore
let contentType: TestContentType
let contentTypes: { [type: string]: ContentType }
let pubSub: PubSub
let backend: ContentBackend

beforeEach(async () => {
    shouldStoreSnapshot = jest.fn((snapshot) => snapshot.version % 10 === 0)
    onWarning = jest.fn()
    contentStore = createContentStore()
    contentType = new TestContentType()
    contentTypes = { [type]: contentType }
    pubSub = createPubSub()
    backend = createContentBackend({
        contentStore,
        contentTypes,
        pubSub,
        shouldStoreSnapshot,
        onWarning,
    })

    await contentStore.storeSchema(validSchema)
    await contentStore.storeOperation(createOperation(1, 10)) // 10
    await contentStore.storeOperation(createOperation(2, 20)) // 30
    await contentStore.storeOperation(createOperation(3, 30)) // 60
    await contentStore.storeSnapshot(createSnapshot(3, 60))
    await contentStore.storeOperation(createOperation(4, 40)) // 100
    await contentStore.storeOperation(createOperation(5, 50)) // 150
    await contentStore.storeOperation(createOperation(6, 60)) // 210
})

describe('createContent', () => {
    test('invalid contentStore (null)', () => {
        expect(() =>
            createContentBackend({
                contentStore: null as any,
                contentTypes,
                pubSub,
            }),
        ).toThrow(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message:
                    'Argument "contentStore" must be a ContentStore instance.',
            }),
        )
    })
    test('invalid contentStore (5)', () => {
        expect(() =>
            createContentBackend({
                contentStore: 5 as any,
                contentTypes,
                pubSub,
            }),
        ).toThrow(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message:
                    'Argument "contentStore" must be a ContentStore instance.',
            }),
        )
    })
    test('invalid pubSub (null)', () => {
        expect(() =>
            createContentBackend({
                contentStore,
                contentTypes,
                pubSub: null as any,
            }),
        ).toThrow(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: 'Argument "pubSub" must be a PubSub instance.',
            }),
        )
    })
    test('invalid pubSub (5)', () => {
        expect(() =>
            createContentBackend({
                contentStore,
                contentTypes,
                pubSub: 5 as any,
            }),
        ).toThrow(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: 'Argument "pubSub" must be a PubSub instance.',
            }),
        )
    })
    test('invalid contentTypes (null)', () => {
        expect(() =>
            createContentBackend({
                contentStore,
                contentTypes: null as any,
                pubSub,
            }),
        ).toThrow(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: 'Argument "contentTypes" must be an object.',
            }),
        )
    })
    test('invalid contentTypes (5)', () => {
        expect(() =>
            createContentBackend({
                contentStore,
                contentTypes: 5 as any,
                pubSub,
            }),
        ).toThrow(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: 'Argument "contentTypes" must be an object.',
            }),
        )
    })
    test('invalid cacheTTL (5.5)', () => {
        expect(() =>
            createContentBackend({
                contentStore,
                contentTypes,
                pubSub,
                cacheTTL: 5.5,
            }),
        ).toThrow(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message:
                    'Argument "cacheTTL" must be a non-negative integer or undefined.',
            }),
        )
    })
    test('invalid cacheTTL (-1)', () => {
        expect(() =>
            createContentBackend({
                contentStore,
                contentTypes,
                pubSub,
                cacheTTL: -1,
            }),
        ).toThrow(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message:
                    'Argument "cacheTTL" must be a non-negative integer or undefined.',
            }),
        )
    })
    test('invalid cacheLimit (5.5)', () => {
        expect(() =>
            createContentBackend({
                contentStore,
                contentTypes,
                pubSub,
                cacheLimit: 5.5,
            }),
        ).toThrow(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message:
                    'Argument "cacheLimit" must be a non-negative integer or undefined.',
            }),
        )
    })
    test('invalid cacheLimit (-1)', () => {
        expect(() =>
            createContentBackend({
                contentStore,
                contentTypes,
                pubSub,
                cacheLimit: -1,
            }),
        ).toThrow(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message:
                    'Argument "cacheLimit" must be a non-negative integer or undefined.',
            }),
        )
    })
    test('invalid shouldStoreSnapshot (string)', () => {
        expect(() =>
            createContentBackend({
                contentStore,
                contentTypes,
                pubSub,
                shouldStoreSnapshot: 'f' as any,
            }),
        ).toThrow(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message:
                    'Argument "shouldStoreSnapshot" must be a function or undefined.',
            }),
        )
    })
    test('invalid onWarning (string)', () => {
        expect(() =>
            createContentBackend({
                contentStore,
                contentTypes,
                pubSub,
                onWarning: 'f' as any,
            }),
        ).toThrow(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message:
                    'Argument "onWarning" must be a function or undefined.',
            }),
        )
    })
})

describe('registerSchema', () => {
    test('schema too big', async () => {
        const schemaData1 = '!'.repeat(maxSchemaSize)
        const hash1 = createSchemaHash(type, schemaData1)
        const bigSchema: Schema = {
            type,
            hash: hash1,
            data: schemaData1,
            meta: null,
        }
        await expect(backend.registerSchema(bigSchema)).rejects.toEqual(
            expect.objectContaining({
                name: 'SyncOTError EntityTooLarge',
                message: '"Schema" too large.',
                entityName: 'Schema',
            }),
        )
    })

    test('unsupported content type', async () => {
        const data1 = 'schema-data'
        const type1 = 'unsupported-type'
        const schema1: Schema = {
            type: type1,
            hash: createSchemaHash(type1, data1),
            data: data1,
            meta: null,
        }
        await expect(backend.registerSchema(schema1)).rejects.toEqual(
            expect.objectContaining({
                name: 'TypeError',
                message: `Unsupported document type: ${type1}.`,
            }),
        )
    })

    test('validates schema', async () => {
        await expect(backend.registerSchema(invalidSchema)).rejects.toEqual(
            expect.objectContaining({
                name: 'SyncOTError InvalidEntity',
                message: 'Invalid "Schema.data".',
                entityName: 'Schema',
                entity: invalidSchema,
                key: 'data',
                cause: undefined,
            }),
        )
    })

    test('register schema', async () => {
        const newSchema = {
            type,
            hash: createSchemaHash(type, 'new schema'),
            data: 'new schema',
            meta: { a: true },
        }
        const { hash } = newSchema
        await expect(contentStore.loadSchema(hash)).resolves.toBe(null)
        await expect(backend.getSchema(hash)).resolves.toBe(null)
        await backend.registerSchema(newSchema)
        await expect(contentStore.loadSchema(hash)).resolves.toBe(newSchema)
        await expect(backend.getSchema(hash)).resolves.toBe(newSchema)
    })

    test('try to register the same schema twice', async () => {
        const newSchema = {
            type,
            hash: createSchemaHash(type, 'new schema'),
            data: 'new schema',
            meta: { a: true },
        }
        const { hash } = newSchema
        await backend.registerSchema(newSchema)
        await backend.registerSchema(newSchema)
        await backend.registerSchema({ ...newSchema, meta: { key: 'value' } })
        await expect(contentStore.loadSchema(hash)).resolves.toBe(newSchema)
        await expect(backend.getSchema(hash)).resolves.toBe(newSchema)
    })

    test('fail to store the schema', async () => {
        const error = new Error('test error')
        const storeSchema = jest.spyOn(contentStore, 'storeSchema')
        storeSchema.mockImplementationOnce(async () => {
            throw error
        })
        await expect(backend.registerSchema(validSchema)).rejects.toBe(error)
    })
})

describe('getSnapshot', () => {
    test('unsupported content type', async () => {
        const unsupportedType = 'unsupported-type'
        await expect(
            backend.getSnapshot(unsupportedType, id, maxVersion),
        ).rejects.toEqual(
            expect.objectContaining({
                name: 'TypeError',
                message: `Unsupported document type: ${unsupportedType}.`,
            }),
        )
    })

    test.each([
        [0, 0, null],
        [1, 1, 10],
        [2, 2, 30],
        [3, 3, 60],
        [4, 4, 100],
        [5, 5, 150],
        [6, 6, 210],
        [7, 6, 210],
        [maxVersion, 6, 210],
    ])(
        'get from database version %d',
        async (requestedVersion, loadedVersion, data) => {
            await expect(
                backend.getSnapshot(type, id, requestedVersion),
            ).resolves.toEqual(
                expect.objectContaining({
                    type,
                    id,
                    version: loadedVersion,
                    schema: data == null ? '' : validSchema.hash,
                    data,
                    meta:
                        data == null
                            ? expect.toBeNil()
                            : {
                                  session,
                                  time: expect.toBeNumber(),
                                  user,
                              },
                }),
            )
        },
    )

    test('get from database and store snapshots, if necessary', async () => {
        shouldStoreSnapshot.mockImplementation(
            (snapshot) => snapshot.version % 2 === 0,
        )
        await expect(
            backend.getSnapshot(type, id, maxVersion),
        ).resolves.toEqual(
            expect.objectContaining({
                type,
                id,
                version: 6,
                schema: validSchema.hash,
                data: 210,
                meta: {
                    session,
                    time: expect.toBeNumber(),
                    user,
                },
            }),
        )

        await expect(contentStore.loadSnapshot(type, id, 1)).resolves.toEqual(
            expect.objectContaining({ version: 0 }),
        )
        await expect(contentStore.loadSnapshot(type, id, 2)).resolves.toEqual(
            expect.objectContaining({ version: 0 }),
        )
        await expect(contentStore.loadSnapshot(type, id, 3)).resolves.toEqual(
            expect.objectContaining({ version: 3 }),
        )
        await expect(contentStore.loadSnapshot(type, id, 4)).resolves.toEqual(
            expect.objectContaining({ version: 4 }),
        )
        await expect(contentStore.loadSnapshot(type, id, 5)).resolves.toEqual(
            expect.objectContaining({ version: 4 }),
        )
        await expect(contentStore.loadSnapshot(type, id, 6)).resolves.toEqual(
            expect.objectContaining({ version: 6 }),
        )
    })

    test('load a cached snapshot requesting the exact version', async () => {
        await backend.getSnapshot(type, id, maxVersion)
        const snapshot = await backend.getSnapshot(type, id, 6)
        expect(snapshot).toEqual(
            expect.objectContaining({
                type,
                id,
                version: 6,
                schema: validSchema.hash,
                data: 210,
            }),
        )
    })

    test('load a cached snapshot requesting a higher version', async () => {
        await backend.getSnapshot(type, id, maxVersion)
        const snapshot = await backend.getSnapshot(type, id, maxVersion)
        expect(snapshot).toEqual(
            expect.objectContaining({
                type,
                id,
                version: 6,
                schema: validSchema.hash,
                data: 210,
            }),
        )
    })

    test('load a snapshot using a cached snapshot and operations from the database', async () => {
        await backend.getSnapshot(type, id, maxVersion)
        await contentStore.storeOperation(createOperation(7, 70)) // 280
        const snapshot = await backend.getSnapshot(type, id, maxVersion)
        expect(snapshot).toEqual(
            expect.objectContaining({
                type,
                id,
                version: 7,
                schema: validSchema.hash,
                data: 280,
            }),
        )
    })

    test('load a snapshot from the database, when only a later version is cached', async () => {
        await backend.getSnapshot(type, id, maxVersion)
        const snapshot = await backend.getSnapshot(type, id, 5)
        expect(snapshot).toEqual(
            expect.objectContaining({
                type,
                id,
                version: 5,
                schema: validSchema.hash,
                data: 150,
            }),
        )
    })

    test('load a snapshot using an older cached snapshot and operations', async () => {
        // Cache the snapshot at version 6.
        await backend.getSnapshot(type, id, maxVersion)
        await contentStore.storeOperation(createOperation(7, 70)) // 280
        await contentStore.storeOperation(createOperation(8, 80)) // 360
        await contentStore.storeOperation(createOperation(9, 90)) // 450
        // Cache the operations at versions 7, 8 and 9.
        await backend.getSnapshot(type, id, maxVersion)
        const snapshot = await backend.getSnapshot(type, id, 8)
        expect(snapshot).toEqual(
            expect.objectContaining({
                type,
                id,
                version: 8,
                schema: validSchema.hash,
                data: 360,
            }),
        )
    })

    test('load cached snapshot and store snapshots, if necessary', async () => {
        // Cache the snapshot.
        await backend.getSnapshot(type, id, maxVersion)
        await contentStore.storeOperation(createOperation(7, 70)) // 280
        await contentStore.storeOperation(createOperation(8, 80)) // 360
        await contentStore.storeOperation(createOperation(9, 90)) // 450
        await contentStore.storeOperation(createOperation(10, 100)) // 550
        // Cache the new operations.
        await backend.getSnapshot(type, id, maxVersion)

        shouldStoreSnapshot.mockImplementation(
            (snapshot) => snapshot.version % 2 === 0,
        )
        await expect(
            backend.getSnapshot(type, id, maxVersion),
        ).resolves.toEqual(
            expect.objectContaining({
                type,
                id,
                version: 10,
                schema: validSchema.hash,
                data: 550,
                meta: {
                    session,
                    time: expect.toBeNumber(),
                    user,
                },
            }),
        )

        await expect(contentStore.loadSnapshot(type, id, 1)).resolves.toEqual(
            expect.objectContaining({ version: 0 }),
        )
        await expect(contentStore.loadSnapshot(type, id, 2)).resolves.toEqual(
            expect.objectContaining({ version: 0 }),
        )
        await expect(contentStore.loadSnapshot(type, id, 3)).resolves.toEqual(
            expect.objectContaining({ version: 3 }),
        )
        await expect(contentStore.loadSnapshot(type, id, 4)).resolves.toEqual(
            expect.objectContaining({ version: 3 }),
        )
        await expect(contentStore.loadSnapshot(type, id, 5)).resolves.toEqual(
            expect.objectContaining({ version: 3 }),
        )
        await expect(contentStore.loadSnapshot(type, id, 6)).resolves.toEqual(
            expect.objectContaining({ version: 3 }),
        )
        await expect(contentStore.loadSnapshot(type, id, 7)).resolves.toEqual(
            expect.objectContaining({ version: 3 }),
        )
        await expect(contentStore.loadSnapshot(type, id, 8)).resolves.toEqual(
            expect.objectContaining({ version: 8 }),
        )
        await expect(contentStore.loadSnapshot(type, id, 9)).resolves.toEqual(
            expect.objectContaining({ version: 8 }),
        )
        await expect(contentStore.loadSnapshot(type, id, 10)).resolves.toEqual(
            expect.objectContaining({ version: 10 }),
        )
    })
})

describe('submitOperation', () => {
    test('operation too big', async () => {
        const operation: Operation = {
            key: createId(),
            type,
            id,
            version: 7,
            schema: validSchema.hash,
            data: 5,
            meta: {
                big: '!'.repeat(maxOperationSize),
            },
        }
        await expect(backend.submitOperation(operation)).rejects.toEqual(
            expect.objectContaining({
                name: 'SyncOTError EntityTooLarge',
                message: '"Operation" too large.',
                entityName: 'Operation',
            }),
        )
    })

    test('unsupported content type', async () => {
        const type1 = 'unsupported-type'
        const operation: Operation = {
            key: createId(),
            type: type1,
            id,
            version: 1,
            schema: 'some hash',
            data: 5,
            meta: null,
        }
        await expect(backend.submitOperation(operation)).rejects.toEqual(
            expect.objectContaining({
                name: 'TypeError',
                message: `Unsupported document type: ${type1}.`,
            }),
        )
    })

    test('schema not found', async () => {
        const operation: Operation = {
            key: createId(),
            type,
            id,
            version: 1,
            schema: 'unknown schema',
            data: 5,
            meta: null,
        }
        await expect(backend.submitOperation(operation)).rejects.toEqual(
            expect.objectContaining({
                name: 'SyncOTError NotFound',
                message: `"Schema" not found.`,
                entityName: 'Schema',
            }),
        )
    })

    test('operation.version not based on an existing snapshot', async () => {
        const operation: Operation = {
            key: createId(),
            type,
            id,
            version: 8,
            schema: validSchema.hash,
            data: 5,
            meta: null,
        }
        await expect(backend.submitOperation(operation)).rejects.toEqual(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: `operation.version out of sequence.`,
            }),
        )
    })

    test('snapshot too big', async () => {
        const operationToSubmit: Operation = {
            key: createId(),
            type,
            id,
            version: 7,
            schema: validSchema.hash,
            data: 5,
            meta: null,
        }
        const apply = contentType.apply
        jest.spyOn(contentType, 'apply').mockImplementation(
            (snapshot: Snapshot, operation: Operation): Snapshot => {
                const newSnapshot = apply.call(contentType, snapshot, operation)
                return operation.key === operationToSubmit.key
                    ? {
                          ...newSnapshot,
                          meta: {
                              ...newSnapshot.meta,
                              big: '!'.repeat(maxSnapshotSize),
                          },
                      }
                    : newSnapshot
            },
        )
        await expect(
            backend.submitOperation(operationToSubmit),
        ).rejects.toEqual(
            expect.objectContaining({
                name: 'SyncOTError EntityTooLarge',
                message: '"Snapshot" too large.',
                entityName: 'Snapshot',
            }),
        )
    })

    test('store operation', async () => {
        const onOperation = jest.fn()
        pubSub.subscribe(combine('operation', type, id), onOperation)

        for (let i = 7; i < 12; i++) {
            const operation: Operation = {
                key: createId(),
                type,
                id,
                version: i,
                schema: validSchema.hash,
                data: 1,
                meta: null,
            }
            await backend.submitOperation(operation)
            expect(onOperation).toHaveBeenCalledTimes(1)
            expect(onOperation).toHaveBeenCalledWith(operation)
            onOperation.mockClear()

            await expect(
                contentStore.loadOperations(type, id, i, i + 1),
            ).resolves.toStrictEqual([operation])

            await expect(
                contentStore.loadSnapshot(type, id, maxVersion),
            ).resolves.toEqual(
                expect.objectContaining({
                    version: Math.max(3, i - (i % 10)),
                }),
            )
        }
    })

    test('store operation with the default shouldStoreSnapshot function', async () => {
        const onOperation = jest.fn()
        pubSub.subscribe(combine('operation', type, id), onOperation)
        backend = createContentBackend({
            contentStore,
            pubSub,
            contentTypes,
        })

        for (let i = 7; i < 12; i++) {
            const operation: Operation = {
                key: createId(),
                type,
                id,
                version: i,
                schema: validSchema.hash,
                data: 1,
                meta: null,
            }
            await backend.submitOperation(operation)
            expect(onOperation).toHaveBeenCalledTimes(1)
            expect(onOperation).toHaveBeenCalledWith(operation)
            onOperation.mockClear()

            await expect(
                contentStore.loadOperations(type, id, i, i + 1),
            ).resolves.toStrictEqual([operation])

            await expect(
                contentStore.loadSnapshot(type, id, maxVersion),
            ).resolves.toEqual(
                expect.objectContaining({
                    version: 3,
                }),
            )
        }
    })

    test('store operation and fail to store snapshot with the already exists error', async () => {
        const onOperation = jest.fn()
        pubSub.subscribe(combine('operation', type, id), onOperation)
        const operation: Operation = {
            key: createId(),
            type,
            id,
            version: 7,
            schema: validSchema.hash,
            data: 1,
            meta: null,
        }
        const error = createAlreadyExistsError('Snapshot', {}, 'version', 7)
        jest.spyOn(contentStore, 'storeSnapshot').mockImplementationOnce(
            async () => {
                throw error
            },
        )
        shouldStoreSnapshot.mockReturnValue(true)
        await backend.submitOperation(operation)
        expect(onOperation).toHaveBeenCalledTimes(1)
        expect(onOperation).toHaveBeenCalledWith(operation)

        await expect(
            contentStore.loadOperations(type, id, 7, 8),
        ).resolves.toStrictEqual([operation])

        await whenNextTick()
        expect(onWarning).toHaveBeenCalledTimes(0)
    })

    test('store operation and fail to store snapshot with other error', async () => {
        const onOperation = jest.fn()
        pubSub.subscribe(combine('operation', type, id), onOperation)
        const operation: Operation = {
            key: createId(),
            type,
            id,
            version: 7,
            schema: validSchema.hash,
            data: 1,
            meta: null,
        }
        const error = new Error('test error')
        jest.spyOn(contentStore, 'storeSnapshot').mockImplementationOnce(
            async () => {
                throw error
            },
        )
        shouldStoreSnapshot.mockReturnValue(true)
        await backend.submitOperation(operation)
        expect(onOperation).toHaveBeenCalledTimes(1)
        expect(onOperation).toHaveBeenCalledWith(operation)

        await expect(
            contentStore.loadOperations(type, id, 7, 8),
        ).resolves.toStrictEqual([operation])

        await whenNextTick()
        expect(onWarning).toHaveBeenCalledTimes(1)
        expect(onWarning).toHaveBeenCalledWith(error)
    })

    test('trigger stream update on operation conflict', async () => {
        const onData = jest.fn()
        const stream = backend.streamOperations(type, id, 5, maxVersion)
        ;(await stream).on('data', onData)
        await whenNextTick()
        expect(onData).toHaveBeenCalledTimes(2)
        expect(onData).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ version: 5 }),
        )
        expect(onData).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ version: 6 }),
        )
        onData.mockClear()
        await contentStore.storeOperation(createOperation(7, 70)) // 280
        await contentStore.storeOperation(createOperation(8, 80)) // 360
        await contentStore.storeOperation(createOperation(9, 90)) // 450
        await whenNextTick()
        expect(onData).toHaveBeenCalledTimes(0)

        const operation: Operation = {
            key: createId(),
            type,
            id,
            version: 7,
            schema: validSchema.hash,
            data: 5,
            meta: null,
        }
        await expect(backend.submitOperation(operation)).rejects.toEqual(
            expect.objectContaining({
                name: 'SyncOTError AlreadyExists',
                message: '"Operation" already exists.',
                entityName: 'Operation',
                entity: operation,
                key: 'version',
                value: 9,
            }),
        )
        await whenNextTick()
        expect(onData).toHaveBeenCalledTimes(3)
        expect(onData).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ version: 7 }),
        )
        expect(onData).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ version: 8 }),
        )
        expect(onData).toHaveBeenNthCalledWith(
            3,
            expect.objectContaining({ version: 9 }),
        )
    })

    test('do not trigger stream update on other storage errors', async () => {
        const onData = jest.fn()
        const stream = backend.streamOperations(type, id, 5, maxVersion)
        ;(await stream).on('data', onData)
        await whenNextTick()
        expect(onData).toHaveBeenCalledTimes(2)
        expect(onData).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ version: 5 }),
        )
        expect(onData).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ version: 6 }),
        )
        onData.mockClear()
        await contentStore.storeOperation(createOperation(7, 70)) // 280
        await contentStore.storeOperation(createOperation(8, 80)) // 360
        await contentStore.storeOperation(createOperation(9, 90)) // 450
        await whenNextTick()
        expect(onData).toHaveBeenCalledTimes(0)

        const operation: Operation = {
            key: createId(),
            type,
            id,
            version: 7,
            schema: validSchema.hash,
            data: 5,
            meta: null,
        }
        const error = new Error('test error')
        jest.spyOn(contentStore, 'storeOperation').mockImplementationOnce(
            async () => {
                throw error
            },
        )
        await expect(backend.submitOperation(operation)).rejects.toBe(error)
        await whenNextTick()
        expect(onData).toHaveBeenCalledTimes(0)
    })
})

describe('streamOperations', () => {
    test('stream a subset of existing operations', async () => {
        const stream = await backend.streamOperations(type, id, 2, 5)
        const onData = jest.fn()
        const onEnd = jest.fn()
        const onClose = jest.fn()
        stream.on('data', onData)
        stream.on('end', onEnd)
        stream.on('close', onClose)
        await whenNextTick()
        expect(onData).toHaveBeenCalledTimes(3)
        expect(onData).toHaveBeenNthCalledWith(1, {
            key: expect.toBeString(),
            type,
            id,
            version: 2,
            schema: validSchema.hash,
            data: 20,
            meta: {
                session,
                time: expect.toBeNumber(),
                user,
            },
        })
        expect(onData).toHaveBeenNthCalledWith(2, {
            key: expect.toBeString(),
            type,
            id,
            version: 3,
            schema: validSchema.hash,
            data: 30,
            meta: {
                session,
                time: expect.toBeNumber(),
                user,
            },
        })
        expect(onData).toHaveBeenNthCalledWith(3, {
            key: expect.toBeString(),
            type,
            id,
            version: 4,
            schema: validSchema.hash,
            data: 40,
            meta: {
                session,
                time: expect.toBeNumber(),
                user,
            },
        })
        expect(onEnd).toHaveBeenCalledTimes(1)
        expect(onEnd).toHaveBeenCalledAfter(onData)
        expect(onClose).toHaveBeenCalledTimes(1)
        expect(onClose).toHaveBeenCalledAfter(onEnd)
    })

    test('stream existing and pending operations', async () => {
        const stream = await backend.streamOperations(type, id, 6, 9)
        const onData = jest.fn()
        const onEnd = jest.fn()
        const onClose = jest.fn()
        stream.on('data', onData)
        stream.on('end', onEnd)
        stream.on('close', onClose)
        await whenNextTick()
        expect(onData).toHaveBeenCalledTimes(1)
        expect(onData).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ version: 6 }),
        )
        await backend.submitOperation(createOperation(7, 70))
        await backend.submitOperation(createOperation(8, 80))
        await backend.submitOperation(createOperation(9, 90))
        await backend.submitOperation(createOperation(10, 100))
        await whenNextTick()
        expect(onData).toHaveBeenCalledTimes(3)
        expect(onData).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ version: 7 }),
        )
        expect(onData).toHaveBeenNthCalledWith(
            3,
            expect.objectContaining({ version: 8 }),
        )
        expect(onEnd).toHaveBeenCalledTimes(1)
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    test('stream pending operations', async () => {
        const stream = await backend.streamOperations(type, id, 8, 11)
        const onData = jest.fn()
        const onEnd = jest.fn()
        const onClose = jest.fn()
        stream.on('data', onData)
        stream.on('end', onEnd)
        stream.on('close', onClose)
        await whenNextTick()
        expect(onData).toHaveBeenCalledTimes(0)
        await backend.submitOperation(createOperation(7, 70))
        await backend.submitOperation(createOperation(8, 80))
        await backend.submitOperation(createOperation(9, 90))
        await backend.submitOperation(createOperation(10, 100))
        await backend.submitOperation(createOperation(11, 110))
        await backend.submitOperation(createOperation(12, 120))
        await whenNextTick()
        expect(onData).toHaveBeenCalledTimes(3)
        expect(onData).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ version: 8 }),
        )
        expect(onData).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ version: 9 }),
        )
        expect(onData).toHaveBeenNthCalledWith(
            3,
            expect.objectContaining({ version: 10 }),
        )
        expect(onEnd).toHaveBeenCalledTimes(1)
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    test('close the stream before receiving all data', async () => {
        const stream = await backend.streamOperations(type, id, 6, 11)
        const onData = jest.fn()
        const onEnd = jest.fn()
        const onClose = jest.fn()
        stream.on('data', onData)
        stream.on('end', onEnd)
        stream.on('close', onClose)
        await whenNextTick()
        expect(onData).toHaveBeenCalledTimes(1)
        stream.destroy()
        await whenNextTick()
        await backend.submitOperation(createOperation(7, 70))
        await backend.submitOperation(createOperation(8, 80))
        await backend.submitOperation(createOperation(9, 90))
        await backend.submitOperation(createOperation(10, 100))
        await backend.submitOperation(createOperation(11, 110))
        await backend.submitOperation(createOperation(12, 120))
        await whenNextTick()
        expect(onData).toHaveBeenCalledTimes(1)
        expect(onEnd).toHaveBeenCalledTimes(0)
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    test('close the stream before receiving any data', async () => {
        const stream = await backend.streamOperations(type, id, 7, 11)
        const onData = jest.fn()
        const onEnd = jest.fn()
        const onClose = jest.fn()
        stream.on('data', onData)
        stream.on('end', onEnd)
        stream.on('close', onClose)
        await whenNextTick()
        expect(onData).toHaveBeenCalledTimes(0)
        stream.destroy()
        await whenNextTick()
        await backend.submitOperation(createOperation(7, 70))
        await backend.submitOperation(createOperation(8, 80))
        await backend.submitOperation(createOperation(9, 90))
        await backend.submitOperation(createOperation(10, 100))
        await backend.submitOperation(createOperation(11, 110))
        await backend.submitOperation(createOperation(12, 120))
        await whenNextTick()
        expect(onData).toHaveBeenCalledTimes(0)
        expect(onEnd).toHaveBeenCalledTimes(0)
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    test('close the stream immediately', async () => {
        const stream = await backend.streamOperations(type, id, 7, 11)
        const onData = jest.fn()
        const onEnd = jest.fn()
        const onClose = jest.fn()
        stream.on('data', onData)
        stream.on('end', onEnd)
        stream.on('close', onClose)
        stream.destroy()
        await whenNextTick()
        expect(onData).toHaveBeenCalledTimes(0)
        expect(onEnd).toHaveBeenCalledTimes(0)
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    test('open 2 streams for the same type and id one after another (versionStart and versionEnd differ)', async () => {
        const onData1 = jest.fn()
        const onEnd1 = jest.fn()
        const onClose1 = jest.fn()
        const stream1 = await backend.streamOperations(type, id, 2, 5)
        stream1.on('data', onData1)
        stream1.on('end', onEnd1)
        stream1.on('close', onClose1)

        const onData2 = jest.fn()
        const onEnd2 = jest.fn()
        const onClose2 = jest.fn()
        const stream2 = await backend.streamOperations(type, id, 3, 8)
        stream2.on('data', onData2)
        stream2.on('end', onEnd2)
        stream2.on('close', onClose2)

        await whenNextTick()

        expect(onData1).toHaveBeenCalledTimes(3)
        expect(onData1).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ version: 2 }),
        )
        expect(onData1).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ version: 3 }),
        )
        expect(onData1).toHaveBeenNthCalledWith(
            3,
            expect.objectContaining({ version: 4 }),
        )
        expect(onEnd1).toHaveBeenCalledTimes(1)
        expect(onClose1).toHaveBeenCalledTimes(1)

        expect(onData2).toHaveBeenCalledTimes(4)
        expect(onData2).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ version: 3 }),
        )
        expect(onData2).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ version: 4 }),
        )
        expect(onData2).toHaveBeenNthCalledWith(
            3,
            expect.objectContaining({ version: 5 }),
        )
        expect(onData2).toHaveBeenNthCalledWith(
            4,
            expect.objectContaining({ version: 6 }),
        )
        expect(onEnd2).toHaveBeenCalledTimes(0)
        expect(onClose2).toHaveBeenCalledTimes(0)
    })

    test('open 2 streams for the same type and id one after another (versionStart are the same and versionEnd differ)', async () => {
        const onData1 = jest.fn()
        const onEnd1 = jest.fn()
        const onClose1 = jest.fn()
        const stream1 = await backend.streamOperations(type, id, 3, 5)
        stream1.on('data', onData1)
        stream1.on('end', onEnd1)
        stream1.on('close', onClose1)

        const onData2 = jest.fn()
        const onEnd2 = jest.fn()
        const onClose2 = jest.fn()
        const stream2 = await backend.streamOperations(type, id, 3, 8)
        stream2.on('data', onData2)
        stream2.on('end', onEnd2)
        stream2.on('close', onClose2)

        await whenNextTick()

        expect(onData1).toHaveBeenCalledTimes(2)
        expect(onData1).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ version: 3 }),
        )
        expect(onData1).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ version: 4 }),
        )
        expect(onEnd1).toHaveBeenCalledTimes(1)
        expect(onClose1).toHaveBeenCalledTimes(1)

        expect(onData2).toHaveBeenCalledTimes(4)
        expect(onData2).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ version: 3 }),
        )
        expect(onData2).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ version: 4 }),
        )
        expect(onData2).toHaveBeenNthCalledWith(
            3,
            expect.objectContaining({ version: 5 }),
        )
        expect(onData2).toHaveBeenNthCalledWith(
            4,
            expect.objectContaining({ version: 6 }),
        )
        expect(onEnd2).toHaveBeenCalledTimes(0)
        expect(onClose2).toHaveBeenCalledTimes(0)
    })

    test('open 2 streams for the same type and id simultaneously (versionStart and versionEnd differ)', async () => {
        const onData1 = jest.fn()
        const onEnd1 = jest.fn()
        const onClose1 = jest.fn()
        const onData2 = jest.fn()
        const onEnd2 = jest.fn()
        const onClose2 = jest.fn()

        await Promise.all([
            backend.streamOperations(type, id, 2, 5).then((stream) => {
                stream.on('data', onData1)
                stream.on('end', onEnd1)
                stream.on('close', onClose1)
            }),
            backend.streamOperations(type, id, 3, 8).then((stream) => {
                stream.on('data', onData2)
                stream.on('end', onEnd2)
                stream.on('close', onClose2)
            }),
        ])
        await whenNextTick()

        expect(onData1).toHaveBeenCalledTimes(3)
        expect(onData1).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ version: 2 }),
        )
        expect(onData1).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ version: 3 }),
        )
        expect(onData1).toHaveBeenNthCalledWith(
            3,
            expect.objectContaining({ version: 4 }),
        )
        expect(onEnd1).toHaveBeenCalledTimes(1)
        expect(onClose1).toHaveBeenCalledTimes(1)

        expect(onData2).toHaveBeenCalledTimes(4)
        expect(onData2).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ version: 3 }),
        )
        expect(onData2).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ version: 4 }),
        )
        expect(onData2).toHaveBeenNthCalledWith(
            3,
            expect.objectContaining({ version: 5 }),
        )
        expect(onData2).toHaveBeenNthCalledWith(
            4,
            expect.objectContaining({ version: 6 }),
        )
        expect(onEnd2).toHaveBeenCalledTimes(0)
        expect(onClose2).toHaveBeenCalledTimes(0)
    })

    test('open 2 streams for the same type and id simultaneously (disjoint version ranges)', async () => {
        const onData1 = jest.fn()
        const onEnd1 = jest.fn()
        const onClose1 = jest.fn()
        const onData2 = jest.fn()
        const onEnd2 = jest.fn()
        const onClose2 = jest.fn()

        await Promise.all([
            backend.streamOperations(type, id, 0, 3).then((stream) => {
                stream.on('data', onData1)
                stream.on('end', onEnd1)
                stream.on('close', onClose1)
            }),
            backend.streamOperations(type, id, 5, 8).then((stream) => {
                stream.on('data', onData2)
                stream.on('end', onEnd2)
                stream.on('close', onClose2)
            }),
        ])
        await whenNextTick()

        expect(onData1).toHaveBeenCalledTimes(3)
        expect(onData1).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ version: 0 }),
        )
        expect(onData1).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ version: 1 }),
        )
        expect(onData1).toHaveBeenNthCalledWith(
            3,
            expect.objectContaining({ version: 2 }),
        )
        expect(onEnd1).toHaveBeenCalledTimes(1)
        expect(onClose1).toHaveBeenCalledTimes(1)

        expect(onData2).toHaveBeenCalledTimes(2)
        expect(onData2).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ version: 5 }),
        )
        expect(onData2).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ version: 6 }),
        )
        expect(onEnd2).toHaveBeenCalledTimes(0)
        expect(onClose2).toHaveBeenCalledTimes(0)
    })

    test('open 2 streams for the same type and id simultaneously (versionStart are the same and versionEnd differ)', async () => {
        const onData1 = jest.fn()
        const onEnd1 = jest.fn()
        const onClose1 = jest.fn()
        const onData2 = jest.fn()
        const onEnd2 = jest.fn()
        const onClose2 = jest.fn()

        await Promise.all([
            backend.streamOperations(type, id, 3, 5).then((stream) => {
                stream.on('data', onData1)
                stream.on('end', onEnd1)
                stream.on('close', onClose1)
            }),
            backend.streamOperations(type, id, 3, 8).then((stream) => {
                stream.on('data', onData2)
                stream.on('end', onEnd2)
                stream.on('close', onClose2)
            }),
        ])
        await whenNextTick()

        expect(onData1).toHaveBeenCalledTimes(2)
        expect(onData1).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ version: 3 }),
        )
        expect(onData1).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ version: 4 }),
        )
        expect(onEnd1).toHaveBeenCalledTimes(1)
        expect(onClose1).toHaveBeenCalledTimes(1)

        expect(onData2).toHaveBeenCalledTimes(4)
        expect(onData2).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ version: 3 }),
        )
        expect(onData2).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ version: 4 }),
        )
        expect(onData2).toHaveBeenNthCalledWith(
            3,
            expect.objectContaining({ version: 5 }),
        )
        expect(onData2).toHaveBeenNthCalledWith(
            4,
            expect.objectContaining({ version: 6 }),
        )
        expect(onEnd2).toHaveBeenCalledTimes(0)
        expect(onClose2).toHaveBeenCalledTimes(0)
    })

    test('fail to load operations and recover', async () => {
        const clock = installClock()
        try {
            const error = new Error('test error')
            jest.spyOn(contentStore, 'loadOperations').mockImplementationOnce(
                async () => {
                    throw error
                },
            )
            const onError = jest.fn()
            const onData = jest.fn()
            const onEnd = jest.fn()
            const onClose = jest.fn()
            const stream = await backend.streamOperations(type, id, 2, 5)
            stream.on('error', onError)
            stream.on('data', onData)
            stream.on('end', onEnd)
            stream.on('close', onClose)

            await whenNextTick()
            expect(onData).toHaveBeenCalledTimes(0)
            expect(onError).toHaveBeenCalledTimes(1)
            expect(onError).toHaveBeenCalledWith(error)
            onError.mockClear()

            await whenNextTick()
            expect(onData).toHaveBeenCalledTimes(0)

            clock.tick(1000)
            await whenNextTick()
            expect(onData).toHaveBeenCalledTimes(3)
            expect(onData).toHaveBeenNthCalledWith(
                1,
                expect.objectContaining({ version: 2 }),
            )
            expect(onData).toHaveBeenNthCalledWith(
                2,
                expect.objectContaining({ version: 3 }),
            )
            expect(onData).toHaveBeenNthCalledWith(
                3,
                expect.objectContaining({ version: 4 }),
            )
            expect(onEnd).toHaveReturnedTimes(1)
            expect(onClose).toHaveReturnedTimes(1)
        } finally {
            clock.uninstall()
        }
    })

    test('fail to load operations and close stream', async () => {
        const clock = installClock()
        try {
            const error = new Error('test error')
            jest.spyOn(contentStore, 'loadOperations').mockImplementationOnce(
                async () => {
                    throw error
                },
            )
            const onError = jest.fn()
            const onData = jest.fn()
            const onEnd = jest.fn()
            const onClose = jest.fn()
            const stream = await backend.streamOperations(type, id, 2, 5)
            stream.on('error', onError)
            stream.on('data', onData)
            stream.on('end', onEnd)
            stream.on('close', onClose)

            await whenNextTick()
            expect(onData).toHaveBeenCalledTimes(0)
            expect(onError).toHaveBeenCalledTimes(1)
            expect(onError).toHaveBeenCalledWith(error)
            onError.mockClear()

            await whenNextTick()
            expect(onData).toHaveBeenCalledTimes(0)

            stream.destroy()

            clock.tick(1000)
            await whenNextTick()
            expect(onData).toHaveBeenCalledTimes(0)
            expect(onEnd).toHaveReturnedTimes(0)
            expect(onClose).toHaveReturnedTimes(1)
        } finally {
            clock.uninstall()
        }
    })

    test('stream a lot of operations', async () => {
        for (let i = 7; i < 110; i++) {
            await backend.submitOperation(createOperation(i, i * 10))
        }

        const onData = jest.fn()
        const onEnd = jest.fn()
        const onClose = jest.fn()
        const stream = await backend.streamOperations(
            type,
            id,
            minVersion,
            maxVersion,
        )
        stream.on('data', onData)
        stream.on('end', onEnd)
        stream.on('close', onClose)

        await whenNextTick()
        expect(onData).toHaveBeenCalledTimes(110)
    })

    test('stream no operations with versionStart === versionEnd', async () => {
        const onData = jest.fn()
        const onEnd = jest.fn()
        const onClose = jest.fn()
        const stream = await backend.streamOperations(type, id, 5, 5)
        stream.on('data', onData)
        stream.on('end', onEnd)
        stream.on('close', onClose)

        await whenNextTick()
        expect(onData).toHaveBeenCalledTimes(0)
        expect(onEnd).toHaveBeenCalledTimes(1)
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    test('stream no operations with versionStart > versionEnd', async () => {
        const onData = jest.fn()
        const onEnd = jest.fn()
        const onClose = jest.fn()
        const stream = await backend.streamOperations(type, id, 5, 4)
        stream.on('data', onData)
        stream.on('end', onEnd)
        stream.on('close', onClose)

        await whenNextTick()
        expect(onData).toHaveBeenCalledTimes(0)
        expect(onEnd).toHaveBeenCalledTimes(1)
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    test('stream cached operations', async () => {
        // Cache the snapshot.
        await backend.getSnapshot(type, id, maxVersion)
        // Add some cached operations.
        await backend.submitOperation(createOperation(7, 70))
        await backend.submitOperation(createOperation(8, 80))
        await backend.submitOperation(createOperation(9, 90))
        await backend.submitOperation(createOperation(10, 100))
        await backend.submitOperation(createOperation(11, 110))
        await backend.submitOperation(createOperation(12, 120))
        await backend.submitOperation(createOperation(13, 130))

        const onData = jest.fn()
        const onEnd = jest.fn()
        const onClose = jest.fn()
        const stream = await backend.streamOperations(type, id, 8, 12)
        stream.on('data', onData)
        stream.on('end', onEnd)
        stream.on('close', onClose)

        await whenNextTick()
        expect(onData).toHaveBeenCalledTimes(4)
        expect(onData).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ version: 8 }),
        )
        expect(onData).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ version: 9 }),
        )
        expect(onData).toHaveBeenNthCalledWith(
            3,
            expect.objectContaining({ version: 10 }),
        )
        expect(onData).toHaveBeenNthCalledWith(
            4,
            expect.objectContaining({ version: 11 }),
        )
        expect(onEnd).toHaveBeenCalledTimes(1)
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    test('stream operations from cache and database', async () => {
        // Cache the snapshot.
        await backend.getSnapshot(type, id, maxVersion)
        // Add some cached operations.
        await backend.submitOperation(createOperation(7, 70))
        await backend.submitOperation(createOperation(8, 80))
        await backend.submitOperation(createOperation(9, 90))
        // Add some non-cached operations.
        await contentStore.storeOperation(createOperation(10, 100))
        await contentStore.storeOperation(createOperation(11, 110))
        await contentStore.storeOperation(createOperation(12, 120))
        await contentStore.storeOperation(createOperation(13, 130))

        const onData = jest.fn()
        const onEnd = jest.fn()
        const onClose = jest.fn()
        const stream = await backend.streamOperations(type, id, 8, 12)
        stream.on('data', onData)
        stream.on('end', onEnd)
        stream.on('close', onClose)

        await whenNextTick()
        expect(onData).toHaveBeenCalledTimes(4)
        expect(onData).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ version: 8 }),
        )
        expect(onData).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ version: 9 }),
        )
        expect(onData).toHaveBeenNthCalledWith(
            3,
            expect.objectContaining({ version: 10 }),
        )
        expect(onData).toHaveBeenNthCalledWith(
            4,
            expect.objectContaining({ version: 11 }),
        )
        expect(onEnd).toHaveBeenCalledTimes(1)
        expect(onClose).toHaveBeenCalledTimes(1)
    })
})

describe('caching', () => {
    test('expire all cached items after 10s', async () => {
        const clock = installClock()
        try {
            expect(clock.countTimers()).toBe(0)

            // Cache a snapshot.
            await backend.getSnapshot(type, id, maxVersion)

            // Cached expiry timer.
            expect(clock.countTimers()).toBe(1)

            // The cache will expire in 1ms.
            clock.tick(10000)
            expect(clock.countTimers()).toBe(1)

            // The cache is cleared every second, so advance the clock by 1s.
            clock.tick(1000)
            expect(clock.countTimers()).toBe(0)

            const loadSnapshot = jest.spyOn(contentStore, 'loadSnapshot')
            await backend.getSnapshot(type, id, maxVersion)
            expect(loadSnapshot).toHaveBeenCalledTimes(1)
        } finally {
            clock.uninstall()
        }
    })

    test('expire some cached items after 10s', async () => {
        const id2 = id + '-other'
        await backend.submitOperation({
            key: createId(),
            type,
            id: id2,
            version: 1,
            schema: validSchema.hash,
            data: 1,
            meta: null,
        })

        const clock = installClock()
        try {
            expect(clock.countTimers()).toBe(0)

            // Cache 2 snapshots.
            await backend.getSnapshot(type, id, maxVersion)
            await backend.getSnapshot(type, id2, maxVersion)

            // Cached expiry timer.
            expect(clock.countTimers()).toBe(1)

            // The cache will expire in 1ms.
            clock.tick(10000)
            expect(clock.countTimers()).toBe(1)

            // Refresh one cache item.
            const loadSnapshot = jest.spyOn(contentStore, 'loadSnapshot')
            await backend.getSnapshot(type, id, maxVersion)
            expect(loadSnapshot).toHaveBeenCalledTimes(0)

            // The cache is cleared every second, so advance the clock by 1s.
            clock.tick(1000)
            expect(clock.countTimers()).toBe(1)

            // Load a snapshot from cache.
            await backend.getSnapshot(type, id, maxVersion)
            expect(loadSnapshot).toHaveBeenCalledTimes(0)

            // Load a snapshot from database.
            await backend.getSnapshot(type, id2, maxVersion)
            expect(loadSnapshot).toHaveBeenCalledTimes(1)
        } finally {
            clock.uninstall()
        }
    })

    test('do not expire a cache item, if a corresponding stream exists', async () => {
        const clock = installClock()
        try {
            // Cache a snapshot.
            await backend.getSnapshot(type, id, maxVersion)

            // Cached expiry timer.
            expect(clock.countTimers()).toBe(1)

            const stream = await backend.streamOperations(
                type,
                id,
                minVersion,
                maxVersion,
            )

            // The "expire cache" timer is stopped but the cache item remains
            // because of the stream.
            clock.tick(11000)
            expect(clock.countTimers()).toBe(0)

            // Load a cached snapshot.
            const loadSnapshot = jest.spyOn(contentStore, 'loadSnapshot')
            await backend.getSnapshot(type, id, maxVersion)
            expect(loadSnapshot).toHaveBeenCalledTimes(0)

            // The timer is not scheduled because of the stream.
            expect(clock.countTimers()).toBe(0)

            // The item will expire after 10s.
            stream.destroy()
            await whenNextTick()
            expect(clock.countTimers()).toBe(1)

            // The cache will expire in 1ms.
            clock.tick(10000)
            expect(clock.countTimers()).toBe(1)

            // The timer fires every 1s, so advance the clock accordingly.
            clock.tick(11000)
            expect(clock.countTimers()).toBe(0)

            // Load a snapshot from the database now.
            await backend.getSnapshot(type, id, maxVersion)
            expect(loadSnapshot).toHaveBeenCalledTimes(1)
        } finally {
            clock.uninstall()
        }
    })

    test('keep at most 50 operations', async () => {
        // Init the cache.
        await backend.getSnapshot(type, id, maxVersion)

        // Cache some operations.
        for (let i = 7; i < 100; i++) {
            await backend.submitOperation(createOperation(i, i * 10))
        }

        const loadOperations = jest.spyOn(contentStore, 'loadOperations')

        // Load operations from the cache.
        await backend.streamOperations(type, id, 50, 60)
        await whenNextTick()
        expect(loadOperations).toHaveBeenCalledTimes(0)

        // Load operations from the database.
        await backend.streamOperations(type, id, 49, 60)
        await whenNextTick()
        expect(loadOperations).toHaveBeenCalledTimes(1)
        expect(loadOperations).toHaveBeenCalledWith(type, id, 49, 60)
    })

    test('keep only operations which are at most 10s old', async () => {
        const clock = installClock()
        const id2 = id + '2'
        function createOperationWithTime(version: number): Operation {
            return {
                key: createId(),
                type,
                id: id2,
                version,
                schema: validSchema.hash,
                data: version,
                meta: {
                    session,
                    time: Date.now(),
                    user,
                },
            }
        }
        try {
            // Init cache.
            await backend.getSnapshot(type, id2, maxVersion)

            // Cache some operations.
            for (let i = 1; i < 21; i++) {
                await backend.submitOperation(createOperationWithTime(i))
                clock.tick(1000)
            }

            const loadOperations = jest.spyOn(contentStore, 'loadOperations')

            // Load operations from the cache.
            await backend.streamOperations(type, id2, 10, 15)
            await whenNextTick()
            expect(loadOperations).toHaveBeenCalledTimes(0)

            // Load operations from the database.
            await backend.streamOperations(type, id2, 9, 15)
            await whenNextTick()
            expect(loadOperations).toHaveBeenCalledTimes(1)
            expect(loadOperations).toHaveBeenCalledWith(type, id2, 9, 15)
        } finally {
            clock.uninstall()
        }
    })
})
