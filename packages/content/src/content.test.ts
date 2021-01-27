import {
    assert,
    combine,
    createId,
    createInvalidEntityError,
    whenNextTick,
} from '@syncot/util'
import {
    Content,
    ContentStore,
    ContentType,
    createAlreadyExistsError,
    createContent,
    createContentStore,
    createPubSub,
    createSchemaHash,
    maxOperationSize,
    maxSchemaSize,
    maxSnapshotSize,
    maxVersion,
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

    public validateSchema(schema: Schema): void {
        if (typeof schema.data !== 'string')
            throw createInvalidEntityError('Schema', schema, 'data')
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
let content: Content

beforeEach(async () => {
    shouldStoreSnapshot = jest.fn((snapshot) => snapshot.version % 10 === 0)
    onWarning = jest.fn()
    contentStore = createContentStore()
    contentType = new TestContentType()
    contentTypes = { [type]: contentType }
    pubSub = createPubSub()
    content = createContent({
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
            createContent({
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
            createContent({
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
            createContent({
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
            createContent({
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
            createContent({
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
            createContent({
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
            createContent({
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
            createContent({
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
            createContent({
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
            createContent({
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
            createContent({
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
            createContent({
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
        await expect(content.registerSchema(bigSchema)).rejects.toEqual(
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
        await expect(content.registerSchema(schema1)).rejects.toEqual(
            expect.objectContaining({
                name: 'TypeError',
                message: `Unsupported document type: ${type1}.`,
            }),
        )
    })

    test('validates schema', async () => {
        await expect(content.registerSchema(invalidSchema)).rejects.toEqual(
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
        await expect(content.getSchema(hash)).resolves.toBe(null)
        await content.registerSchema(newSchema)
        await expect(contentStore.loadSchema(hash)).resolves.toBe(newSchema)
        await expect(content.getSchema(hash)).resolves.toBe(newSchema)
    })

    test('try to register the same schema twice', async () => {
        const newSchema = {
            type,
            hash: createSchemaHash(type, 'new schema'),
            data: 'new schema',
            meta: { a: true },
        }
        const { hash } = newSchema
        await content.registerSchema(newSchema)
        await content.registerSchema(newSchema)
        await content.registerSchema({ ...newSchema, meta: { key: 'value' } })
        await expect(contentStore.loadSchema(hash)).resolves.toBe(newSchema)
        await expect(content.getSchema(hash)).resolves.toBe(newSchema)
    })

    test('fail to store the schema', async () => {
        const error = new Error('test error')
        const storeSchema = jest.spyOn(contentStore, 'storeSchema')
        storeSchema.mockImplementationOnce(async () => {
            throw error
        })
        await expect(content.registerSchema(validSchema)).rejects.toBe(error)
    })
})

describe('getSnapshot', () => {
    test('unsupported content type', async () => {
        const unsupportedType = 'unsupported-type'
        await expect(
            content.getSnapshot(unsupportedType, id, maxVersion),
        ).rejects.toEqual(
            expect.objectContaining({
                name: 'TypeError',
                message: `Unsupported document type: ${unsupportedType}.`,
            }),
        )
    })

    describe('no cache', () => {
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
        ])('get version %d', async (requestedVersion, loadedVersion, data) => {
            await expect(
                content.getSnapshot(type, id, requestedVersion),
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
        })

        test('store snapshots, if necessary', async () => {
            shouldStoreSnapshot.mockImplementation(
                (snapshot) => snapshot.version % 2 === 0,
            )
            await expect(
                content.getSnapshot(type, id, maxVersion),
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

            await expect(
                contentStore.loadSnapshot(type, id, 1),
            ).resolves.toEqual(expect.objectContaining({ version: 0 }))
            await expect(
                contentStore.loadSnapshot(type, id, 2),
            ).resolves.toEqual(expect.objectContaining({ version: 0 }))
            await expect(
                contentStore.loadSnapshot(type, id, 3),
            ).resolves.toEqual(expect.objectContaining({ version: 3 }))
            await expect(
                contentStore.loadSnapshot(type, id, 4),
            ).resolves.toEqual(expect.objectContaining({ version: 4 }))
            await expect(
                contentStore.loadSnapshot(type, id, 5),
            ).resolves.toEqual(expect.objectContaining({ version: 4 }))
            await expect(
                contentStore.loadSnapshot(type, id, 6),
            ).resolves.toEqual(expect.objectContaining({ version: 6 }))
        })
    })

    describe('cache', () => {
        test('load a cached snapshot requesting the exact version', async () => {
            await content.getSnapshot(type, id, maxVersion)
            const snapshot = await content.getSnapshot(type, id, 6)
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
            await content.getSnapshot(type, id, maxVersion)
            const snapshot = await content.getSnapshot(type, id, maxVersion)
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
            await content.getSnapshot(type, id, maxVersion)
            await contentStore.storeOperation(createOperation(7, 70)) // 280
            const snapshot = await content.getSnapshot(type, id, maxVersion)
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
            await content.getSnapshot(type, id, maxVersion)
            const snapshot = await content.getSnapshot(type, id, 5)
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
            await content.getSnapshot(type, id, maxVersion)
            await contentStore.storeOperation(createOperation(7, 70)) // 280
            await contentStore.storeOperation(createOperation(8, 80)) // 360
            await contentStore.storeOperation(createOperation(9, 90)) // 450
            // Cache the operations at versions 7, 8 and 9.
            await content.getSnapshot(type, id, maxVersion)
            const snapshot = await content.getSnapshot(type, id, 8)
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

        test('store snapshots, if necessary', async () => {
            // Cache the snapshot.
            await content.getSnapshot(type, id, maxVersion)
            await contentStore.storeOperation(createOperation(7, 70)) // 280
            await contentStore.storeOperation(createOperation(8, 80)) // 360
            await contentStore.storeOperation(createOperation(9, 90)) // 450
            await contentStore.storeOperation(createOperation(10, 100)) // 550
            // Cache the new operations.
            await content.getSnapshot(type, id, maxVersion)

            shouldStoreSnapshot.mockImplementation(
                (snapshot) => snapshot.version % 2 === 0,
            )
            await expect(
                content.getSnapshot(type, id, maxVersion),
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

            await expect(
                contentStore.loadSnapshot(type, id, 1),
            ).resolves.toEqual(expect.objectContaining({ version: 0 }))
            await expect(
                contentStore.loadSnapshot(type, id, 2),
            ).resolves.toEqual(expect.objectContaining({ version: 0 }))
            await expect(
                contentStore.loadSnapshot(type, id, 3),
            ).resolves.toEqual(expect.objectContaining({ version: 3 }))
            await expect(
                contentStore.loadSnapshot(type, id, 4),
            ).resolves.toEqual(expect.objectContaining({ version: 3 }))
            await expect(
                contentStore.loadSnapshot(type, id, 5),
            ).resolves.toEqual(expect.objectContaining({ version: 3 }))
            await expect(
                contentStore.loadSnapshot(type, id, 6),
            ).resolves.toEqual(expect.objectContaining({ version: 3 }))
            await expect(
                contentStore.loadSnapshot(type, id, 7),
            ).resolves.toEqual(expect.objectContaining({ version: 3 }))
            await expect(
                contentStore.loadSnapshot(type, id, 8),
            ).resolves.toEqual(expect.objectContaining({ version: 8 }))
            await expect(
                contentStore.loadSnapshot(type, id, 9),
            ).resolves.toEqual(expect.objectContaining({ version: 8 }))
            await expect(
                contentStore.loadSnapshot(type, id, 10),
            ).resolves.toEqual(expect.objectContaining({ version: 10 }))
        })
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
        await expect(content.submitOperation(operation)).rejects.toEqual(
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
        await expect(content.submitOperation(operation)).rejects.toEqual(
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
        await expect(content.submitOperation(operation)).rejects.toEqual(
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
        await expect(content.submitOperation(operation)).rejects.toEqual(
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
            content.submitOperation(operationToSubmit),
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
            await content.submitOperation(operation)
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
        content = createContent({
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
            await content.submitOperation(operation)
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
        await content.submitOperation(operation)
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
        await content.submitOperation(operation)
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
        const stream = content.streamOperations(type, id, 5, maxVersion)
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
        await expect(content.submitOperation(operation)).rejects.toEqual(
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
        const stream = content.streamOperations(type, id, 5, maxVersion)
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
        await expect(content.submitOperation(operation)).rejects.toBe(error)
        await whenNextTick()
        expect(onData).toHaveBeenCalledTimes(0)
    })
})
