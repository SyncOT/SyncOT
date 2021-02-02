import { AuthEvents, Auth } from '@syncot/auth'
import { Connection, createConnection } from '@syncot/connection'
import { TypedEventEmitter } from '@syncot/util'
import { Duplex } from 'readable-stream'
import {
    ContentBackend,
    Content,
    createBaseOperation,
    createBaseSnapshot,
    createContentService,
    createSchemaHash,
    maxVersion,
    minVersion,
    Operation,
    Schema,
    Snapshot,
} from '.'
import { requestNames } from './requestNames'

const userId = 'test-user'
const sessionId = 'test-session'
const type = 'test-type'
const id = 'test-id'
const version = 5
const schemaData = 'test-schema-data'
const hash = createSchemaHash(type, schemaData)
const schema: Schema = {
    type,
    hash,
    data: schemaData,
    meta: null,
}
const snapshot: Snapshot = createBaseSnapshot(type, id)
const operation: Operation = createBaseOperation(type, id)

class MockAuthService extends TypedEventEmitter<AuthEvents> implements Auth {
    public active: boolean = true
    public userId: string = userId
    public sessionId: string = sessionId
    public logIn = jest.fn()
    public logOut = jest.fn()
    public mayReadContent = jest.fn(async () => true)
    public mayWriteContent = jest.fn(async () => true)
    public mayReadPresence = jest.fn(async () => true)
    public mayWritePresence = jest.fn(async () => true)
}

class MockContentBackend implements ContentBackend {
    public registerSchema = jest.fn()
    public getSchema = jest.fn(async () => schema)
    public getSnapshot = jest.fn(async () => snapshot)
    public submitOperation = jest.fn()
    public streamOperations = jest.fn(async () => new Duplex())
}

let connection: Connection
let auth: MockAuthService
let contentBackend: MockContentBackend
let contentService: Content

beforeEach(() => {
    connection = createConnection()
    auth = new MockAuthService()
    contentBackend = new MockContentBackend()
    contentService = createContentService({
        connection,
        auth,
        contentBackend,
    })
})
afterEach(() => {
    connection.destroy()
})

describe('initialization errors', () => {
    test('connection === null', () => {
        expect(() =>
            createContentService({
                connection: null as any,
                auth,
                contentBackend,
            }),
        ).toThrow(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: 'Argument "connection" must be an object.',
            }),
        )
    })

    test('connection === true', () => {
        expect(() =>
            createContentService({
                connection: true as any,
                auth,
                contentBackend,
            }),
        ).toThrow(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: 'Argument "connection" must be an object.',
            }),
        )
    })

    test('auth === null', () => {
        expect(() =>
            createContentService({
                connection,
                auth: null as any,
                contentBackend,
            }),
        ).toThrow(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: 'Argument "auth" must be an object.',
            }),
        )
    })

    test('auth === true', () => {
        expect(() =>
            createContentService({
                connection,
                auth: true as any,
                contentBackend,
            }),
        ).toThrow(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: 'Argument "auth" must be an object.',
            }),
        )
    })

    test('contentBackend === null', () => {
        expect(() =>
            createContentService({
                connection,
                auth,
                contentBackend: null as any,
            }),
        ).toThrow(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: 'Argument "contentBackend" must be an object.',
            }),
        )
    })

    test('contentBackend === 5', () => {
        expect(() =>
            createContentService({
                connection,
                auth,
                contentBackend: 5 as any,
            }),
        ).toThrow(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: 'Argument "contentBackend" must be an object.',
            }),
        )
    })

    test('duplicate serviceName', () => {
        const serviceName = 'test-content'
        createContentService({
            connection,
            auth,
            contentBackend,
            serviceName,
        })
        expect(() =>
            createContentService({
                connection,
                auth,
                contentBackend,
                serviceName,
            }),
        ).toThrow(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: `Service "${serviceName}" has been already registered.`,
            }),
        )
    })
})

describe.each(Array.from(requestNames))('%s', (requestName) => {
    test('not authenticated', async () => {
        auth.active = false
        await expect((contentService as any)[requestName]()).rejects.toEqual(
            expect.objectContaining({
                name: 'SyncOTError Auth',
                message: 'Not authenticated.',
            }),
        )
    })
})

describe('registerSchema', () => {
    test('invalid schema', async () => {
        const invalidSchema = { ...schema, hash: 'invalid-hash' }
        await expect(
            contentService.registerSchema(invalidSchema),
        ).rejects.toEqual(
            expect.objectContaining({
                name: 'SyncOTError InvalidEntity',
                message: 'Invalid "Schema.hash".',
                entityName: 'Schema',
                entity: invalidSchema,
                key: 'hash',
                cause: undefined,
            }),
        )
    })

    test('register schema (meta === null)', async () => {
        await expect(contentService.registerSchema(schema)).resolves.toBe(
            undefined,
        )
        expect(contentBackend.registerSchema).toHaveBeenCalledTimes(1)
        expect(contentBackend.registerSchema).toHaveBeenCalledWith({
            ...schema,
            meta: {
                session: auth.sessionId,
                user: auth.userId,
                time: expect.toBeNumber(),
            },
        })
    })

    test('register schema (meta !== null)', async () => {
        await expect(
            contentService.registerSchema({
                ...schema,
                meta: {
                    session: 'wrong session',
                    user: 'wrong user',
                    time: 0,
                    extra: 'value',
                },
            }),
        ).resolves.toBe(undefined)
        expect(contentBackend.registerSchema).toHaveBeenCalledTimes(1)
        expect(contentBackend.registerSchema).toHaveBeenCalledWith({
            ...schema,
            meta: {
                session: auth.sessionId,
                user: auth.userId,
                time: expect.toBeNumber(),
                extra: 'value',
            },
        })
    })
})

describe('getSchema', () => {
    test('invalid key', async () => {
        await expect(contentService.getSchema(5 as any)).rejects.toEqual(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: 'Argument "key" must be a string.',
            }),
        )
    })

    test('get schema', async () => {
        await expect(contentService.getSchema(hash)).resolves.toEqual(schema)
        expect(contentBackend.getSchema).toHaveBeenCalledTimes(1)
        expect(contentBackend.getSchema).toHaveBeenCalledWith(hash)
    })
})

describe('getSnapshot', () => {
    test('invalid type', async () => {
        await expect(
            contentService.getSnapshot(5 as any, id, version),
        ).rejects.toEqual(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: 'Argument "type" must be a string.',
            }),
        )
    })

    test('invalid id', async () => {
        await expect(
            contentService.getSnapshot(type, 5 as any, version),
        ).rejects.toEqual(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: 'Argument "id" must be a string.',
            }),
        )
    })

    test('invalid version (string)', async () => {
        await expect(
            contentService.getSnapshot(type, id, '5' as any),
        ).rejects.toEqual(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: `Argument "version" must be an integer between minVersion (inclusive) and maxVersion (inclusive).`,
            }),
        )
    })

    test('invalid version (too small)', async () => {
        await expect(
            contentService.getSnapshot(type, id, minVersion - 1),
        ).rejects.toEqual(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: `Argument "version" must be an integer between minVersion (inclusive) and maxVersion (inclusive).`,
            }),
        )
    })

    test('invalid version (too big)', async () => {
        await expect(
            contentService.getSnapshot(type, id, maxVersion + 1),
        ).rejects.toEqual(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: `Argument "version" must be an integer between minVersion (inclusive) and maxVersion (inclusive).`,
            }),
        )
    })

    test('not authorized', async () => {
        auth.mayReadContent.mockImplementationOnce(async () => false)
        await expect(
            contentService.getSnapshot(type, id, version),
        ).rejects.toEqual(
            expect.objectContaining({
                name: 'SyncOTError Auth',
                message: 'Not authorized.',
            }),
        )
        expect(auth.mayReadContent).toHaveBeenCalledTimes(1)
        expect(auth.mayReadContent).toHaveBeenCalledWith(type, id)
        expect(contentBackend.getSnapshot).toHaveBeenCalledTimes(0)
    })

    test('get snapshot', async () => {
        await expect(
            contentService.getSnapshot(type, id, version),
        ).resolves.toEqual(snapshot)
        expect(auth.mayReadContent).toHaveBeenCalledTimes(1)
        expect(auth.mayReadContent).toHaveBeenCalledWith(type, id)
        expect(contentBackend.getSnapshot).toHaveBeenCalledTimes(1)
        expect(contentBackend.getSnapshot).toHaveBeenCalledWith(
            type,
            id,
            version,
        )
    })
})

describe('submitOperation', () => {
    test('invalid operation', async () => {
        const invalidOperation: Operation = { ...operation, type: 5 as any }
        await expect(
            contentService.submitOperation(invalidOperation),
        ).rejects.toEqual(
            expect.objectContaining({
                name: 'SyncOTError InvalidEntity',
                message: 'Invalid "Operation.type".',
                entityName: 'Operation',
                entity: invalidOperation,
                key: 'type',
                cause: undefined,
            }),
        )
    })

    test('not authorized', async () => {
        auth.mayWriteContent.mockImplementationOnce(async () => false)
        await expect(contentService.submitOperation(operation)).rejects.toEqual(
            expect.objectContaining({
                name: 'SyncOTError Auth',
                message: 'Not authorized.',
            }),
        )
        expect(auth.mayWriteContent).toHaveBeenCalledTimes(1)
        expect(auth.mayWriteContent).toHaveBeenCalledWith(type, id)
        expect(contentBackend.submitOperation).toHaveBeenCalledTimes(0)
    })

    test('submit operation (meta === null)', async () => {
        await expect(contentService.submitOperation(operation)).resolves.toBe(
            undefined,
        )
        expect(auth.mayWriteContent).toHaveBeenCalledTimes(1)
        expect(auth.mayWriteContent).toHaveBeenCalledWith(type, id)
        expect(contentBackend.submitOperation).toHaveBeenCalledTimes(1)
        expect(contentBackend.submitOperation).toHaveBeenCalledWith({
            ...operation,
            meta: {
                session: auth.sessionId,
                user: auth.userId,
                time: expect.toBeNumber(),
            },
        })
    })

    test('submit operation (meta !== null)', async () => {
        await expect(
            contentService.submitOperation({
                ...operation,
                meta: {
                    session: 'wrong session',
                    user: 'wrong user',
                    time: 0,
                    extra: 'value',
                },
            }),
        ).resolves.toBe(undefined)
        expect(auth.mayWriteContent).toHaveBeenCalledTimes(1)
        expect(auth.mayWriteContent).toHaveBeenCalledWith(type, id)
        expect(contentBackend.submitOperation).toHaveBeenCalledTimes(1)
        expect(contentBackend.submitOperation).toHaveBeenCalledWith({
            ...operation,
            meta: {
                session: auth.sessionId,
                user: auth.userId,
                time: expect.toBeNumber(),
                extra: 'value',
            },
        })
    })
})

describe('streamOperations', () => {
    test('invalid type', async () => {
        await expect(
            contentService.streamOperations(5 as any, id, version, version + 3),
        ).rejects.toEqual(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: 'Argument "type" must be a string.',
            }),
        )
    })

    test('invalid id', async () => {
        await expect(
            contentService.streamOperations(
                type,
                5 as any,
                version,
                version + 3,
            ),
        ).rejects.toEqual(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: 'Argument "id" must be a string.',
            }),
        )
    })

    test('invalid versionStart (string)', async () => {
        await expect(
            contentService.streamOperations(type, id, '5' as any, version),
        ).rejects.toEqual(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: `Argument "versionStart" must be an integer between minVersion (inclusive) and maxVersion (inclusive).`,
            }),
        )
    })

    test('invalid versionStart (too small)', async () => {
        await expect(
            contentService.streamOperations(type, id, minVersion - 1, version),
        ).rejects.toEqual(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: `Argument "versionStart" must be an integer between minVersion (inclusive) and maxVersion (inclusive).`,
            }),
        )
    })

    test('invalid versionStart (too big)', async () => {
        await expect(
            contentService.streamOperations(type, id, maxVersion + 1, version),
        ).rejects.toEqual(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: `Argument "versionStart" must be an integer between minVersion (inclusive) and maxVersion (inclusive).`,
            }),
        )
    })

    test('invalid versionEnd (string)', async () => {
        await expect(
            contentService.streamOperations(type, id, version, '5' as any),
        ).rejects.toEqual(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: `Argument "versionEnd" must be an integer between minVersion (inclusive) and maxVersion (exclusive).`,
            }),
        )
    })

    test('invalid versionEnd (too small)', async () => {
        await expect(
            contentService.streamOperations(type, id, version, minVersion - 1),
        ).rejects.toEqual(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: `Argument "versionEnd" must be an integer between minVersion (inclusive) and maxVersion (exclusive).`,
            }),
        )
    })

    test('invalid versionEnd (too big)', async () => {
        await expect(
            contentService.streamOperations(type, id, version, maxVersion + 2),
        ).rejects.toEqual(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: `Argument "versionEnd" must be an integer between minVersion (inclusive) and maxVersion (exclusive).`,
            }),
        )
    })

    test('not authorized', async () => {
        auth.mayReadContent.mockImplementationOnce(async () => false)
        await expect(
            contentService.streamOperations(type, id, version, version + 5),
        ).rejects.toEqual(
            expect.objectContaining({
                name: 'SyncOTError Auth',
                message: 'Not authorized.',
            }),
        )
        expect(auth.mayReadContent).toHaveBeenCalledTimes(1)
        expect(auth.mayReadContent).toHaveBeenCalledWith(type, id)
        expect(contentBackend.streamOperations).toHaveBeenCalledTimes(0)
    })

    test('stream operations', async () => {
        const stream = await contentService.streamOperations(
            type,
            id,
            minVersion,
            maxVersion + 1,
        )
        expect(auth.mayReadContent).toHaveBeenCalledTimes(1)
        expect(auth.mayReadContent).toHaveBeenCalledWith(type, id)
        expect(contentBackend.streamOperations).toHaveBeenCalledTimes(1)
        expect(contentBackend.streamOperations).toHaveBeenCalledWith(
            type,
            id,
            minVersion,
            maxVersion + 1,
        )
        expect(stream).toBe(
            await contentBackend.streamOperations.mock.results[0].value,
        )
    })
})
