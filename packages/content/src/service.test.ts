import { AuthEvents, Auth } from '@syncot/auth'
import { Connection, createConnection } from '@syncot/connection'
import { SyncOTEmitter, whenNextTick } from '@syncot/util'
import { Duplex } from 'readable-stream'
import {
    Content,
    ContentService,
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

class MockAuthService extends SyncOTEmitter<AuthEvents> implements Auth {
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

class MockContent implements Content {
    public registerSchema = jest.fn()
    public getSchema = jest.fn(async () => schema)
    public getSnapshot = jest.fn(async () => snapshot)
    public submitOperation = jest.fn()
    public streamOperations = jest.fn(async () => new Duplex())
}

let connection: Connection
let authService: MockAuthService
let content: MockContent
let contentService: ContentService

beforeEach(() => {
    connection = createConnection()
    authService = new MockAuthService()
    content = new MockContent()
    contentService = createContentService({
        connection,
        authService,
        content,
    })
})
afterEach(() => {
    connection.destroy()
    contentService.destroy()
})

describe('initialization errors', () => {
    test('connection === null', () => {
        expect(() =>
            createContentService({
                connection: null as any,
                authService,
                content,
            }),
        ).toThrow(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message:
                    'Argument "connection" must be a non-destroyed Connection.',
            }),
        )
    })

    test('connection.destroyed === true', () => {
        connection.destroy()
        expect(() =>
            createContentService({ connection, authService, content }),
        ).toThrow(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message:
                    'Argument "connection" must be a non-destroyed Connection.',
            }),
        )
    })

    test('authService === null', () => {
        expect(() =>
            createContentService({
                connection,
                authService: null as any,
                content,
            }),
        ).toThrow(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message:
                    'Argument "authService" must be a non-destroyed Auth service.',
            }),
        )
    })

    test('authService.destroyed === true', () => {
        authService.destroy()
        expect(() =>
            createContentService({ connection, authService, content }),
        ).toThrow(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message:
                    'Argument "authService" must be a non-destroyed Auth service.',
            }),
        )
    })

    test('content === null', () => {
        expect(() =>
            createContentService({
                connection,
                authService,
                content: null as any,
            }),
        ).toThrow(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: 'Argument "content" must be a Content instance.',
            }),
        )
    })

    test('content === 5', () => {
        expect(() =>
            createContentService({
                connection,
                authService,
                content: 5 as any,
            }),
        ).toThrow(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: 'Argument "content" must be a Content instance.',
            }),
        )
    })

    test('duplicate serviceName', () => {
        const serviceName = 'test-content'
        createContentService({ connection, authService, content, serviceName })
        expect(() =>
            createContentService({
                connection,
                authService,
                content,
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

describe('destroy', () => {
    test('destroy once', async () => {
        const onDestroy = jest.fn()
        contentService.on('destroy', onDestroy)
        expect(contentService.destroyed).toBe(false)
        contentService.destroy()
        expect(contentService.destroyed).toBe(true)
        expect(onDestroy).toHaveBeenCalledTimes(0)
        await whenNextTick()
        expect(contentService.destroyed).toBe(true)
        expect(onDestroy).toHaveBeenCalledTimes(1)
    })

    test('destroy twice', async () => {
        const onDestroy = jest.fn()
        contentService.on('destroy', onDestroy)
        contentService.destroy()
        contentService.destroy()
        expect(contentService.destroyed).toBe(true)
        await whenNextTick()
        expect(onDestroy).toHaveBeenCalledTimes(1)
    })

    test('destroy on connection destroy', async () => {
        const onDestroy = jest.fn()
        contentService.on('destroy', onDestroy)
        connection.destroy()
        await whenNextTick()
        expect(contentService.destroyed).toBe(true)
        expect(onDestroy).toHaveBeenCalledTimes(1)
    })

    test('destroy on authService destroy', async () => {
        const onDestroy = jest.fn()
        contentService.on('destroy', onDestroy)
        authService.destroy()
        await whenNextTick()
        expect(contentService.destroyed).toBe(true)
        expect(onDestroy).toHaveBeenCalledTimes(1)
    })
})

describe.each(Array.from(requestNames))('%s', (requestName) => {
    test('service destroyed', async () => {
        contentService.destroy()
        await expect((contentService as any)[requestName]()).rejects.toEqual(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: 'Already destroyed.',
            }),
        )
    })

    test('not authenticated', async () => {
        authService.active = false
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
        expect(content.registerSchema).toHaveBeenCalledTimes(1)
        expect(content.registerSchema).toHaveBeenCalledWith({
            ...schema,
            meta: {
                session: authService.sessionId,
                user: authService.userId,
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
        expect(content.registerSchema).toHaveBeenCalledTimes(1)
        expect(content.registerSchema).toHaveBeenCalledWith({
            ...schema,
            meta: {
                session: authService.sessionId,
                user: authService.userId,
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
        expect(content.getSchema).toHaveBeenCalledTimes(1)
        expect(content.getSchema).toHaveBeenCalledWith(hash)
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
        authService.mayReadContent.mockImplementationOnce(async () => false)
        await expect(
            contentService.getSnapshot(type, id, version),
        ).rejects.toEqual(
            expect.objectContaining({
                name: 'SyncOTError Auth',
                message: 'Not authorized.',
            }),
        )
        expect(authService.mayReadContent).toHaveBeenCalledTimes(1)
        expect(authService.mayReadContent).toHaveBeenCalledWith(type, id)
        expect(content.getSnapshot).toHaveBeenCalledTimes(0)
    })

    test('get snapshot', async () => {
        await expect(
            contentService.getSnapshot(type, id, version),
        ).resolves.toEqual(snapshot)
        expect(authService.mayReadContent).toHaveBeenCalledTimes(1)
        expect(authService.mayReadContent).toHaveBeenCalledWith(type, id)
        expect(content.getSnapshot).toHaveBeenCalledTimes(1)
        expect(content.getSnapshot).toHaveBeenCalledWith(type, id, version)
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
        authService.mayWriteContent.mockImplementationOnce(async () => false)
        await expect(contentService.submitOperation(operation)).rejects.toEqual(
            expect.objectContaining({
                name: 'SyncOTError Auth',
                message: 'Not authorized.',
            }),
        )
        expect(authService.mayWriteContent).toHaveBeenCalledTimes(1)
        expect(authService.mayWriteContent).toHaveBeenCalledWith(type, id)
        expect(content.submitOperation).toHaveBeenCalledTimes(0)
    })

    test('submit operation (meta === null)', async () => {
        await expect(contentService.submitOperation(operation)).resolves.toBe(
            undefined,
        )
        expect(authService.mayWriteContent).toHaveBeenCalledTimes(1)
        expect(authService.mayWriteContent).toHaveBeenCalledWith(type, id)
        expect(content.submitOperation).toHaveBeenCalledTimes(1)
        expect(content.submitOperation).toHaveBeenCalledWith({
            ...operation,
            meta: {
                session: authService.sessionId,
                user: authService.userId,
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
        expect(authService.mayWriteContent).toHaveBeenCalledTimes(1)
        expect(authService.mayWriteContent).toHaveBeenCalledWith(type, id)
        expect(content.submitOperation).toHaveBeenCalledTimes(1)
        expect(content.submitOperation).toHaveBeenCalledWith({
            ...operation,
            meta: {
                session: authService.sessionId,
                user: authService.userId,
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
        authService.mayReadContent.mockImplementationOnce(async () => false)
        await expect(
            contentService.streamOperations(type, id, version, version + 5),
        ).rejects.toEqual(
            expect.objectContaining({
                name: 'SyncOTError Auth',
                message: 'Not authorized.',
            }),
        )
        expect(authService.mayReadContent).toHaveBeenCalledTimes(1)
        expect(authService.mayReadContent).toHaveBeenCalledWith(type, id)
        expect(content.streamOperations).toHaveBeenCalledTimes(0)
    })

    test('stream operations', async () => {
        const stream = await contentService.streamOperations(
            type,
            id,
            minVersion,
            maxVersion + 1,
        )
        expect(authService.mayReadContent).toHaveBeenCalledTimes(1)
        expect(authService.mayReadContent).toHaveBeenCalledWith(type, id)
        expect(content.streamOperations).toHaveBeenCalledTimes(1)
        expect(content.streamOperations).toHaveBeenCalledWith(
            type,
            id,
            minVersion,
            maxVersion + 1,
        )
        expect(stream).toBe(
            await content.streamOperations.mock.results[0].value,
        )
    })

    test('emits stream errors as own errors', async () => {
        const stream = await contentService.streamOperations(
            type,
            id,
            minVersion,
            maxVersion + 1,
        )
        const onError = jest.fn()
        contentService.on('error', onError)
        const error = new Error('test error')
        stream.emit('error', error)
        await whenNextTick()
        expect(onError).toHaveBeenCalledTimes(1)
        expect(onError).toHaveBeenCalledWith(error)
    })
})
