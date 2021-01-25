import { Auth, AuthEvents } from '@syncot/auth'
import { Connection, createConnection } from '@syncot/connection'
import { invertedStreams, SyncOTEmitter, whenNextTick } from '@syncot/util'
import { Duplex } from 'readable-stream'
import {
    ContentClient,
    ContentService,
    createBaseOperation,
    createBaseSnapshot,
    createContentClient,
    createSchemaHash,
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
const versionStart = 6
const versionEnd = 17
const data = 'test-schema-data'
const hash = createSchemaHash(type, data)
const schema: Schema = { type, hash, data, meta: null }
const snapshot: Snapshot = createBaseSnapshot(type, id)
const operation: Operation = createBaseOperation(type, id)

class MockAuthClient extends SyncOTEmitter<AuthEvents> implements Auth {
    public active: boolean = true
    public userId: string | undefined = userId
    public sessionId: string | undefined = sessionId
    public logIn = jest.fn()
    public logOut = jest.fn()
    public mayReadContent = jest.fn()
    public mayWriteContent = jest.fn()
    public mayReadPresence = jest.fn()
    public mayWritePresence = jest.fn()
}
let authClient: MockAuthClient

class MockContentService
    extends SyncOTEmitter<AuthEvents>
    implements ContentService {
    public registerSchema = jest.fn()
    public getSchema = jest.fn(async () => schema)
    public getSnapshot = jest.fn(async () => snapshot)
    public submitOperation = jest.fn()
    public streamOperations = jest.fn<
        Promise<Duplex>,
        [string, string, number, number]
    >(() => {
        throw new Error('Not implemented')
    })
}

beforeEach(() => {
    authClient = new MockAuthClient()
})

describe('initialization errors', () => {
    test('connection === null', () => {
        expect(() =>
            createContentClient({ connection: null as any, authClient }),
        ).toThrow(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message:
                    'Argument "connection" must be a non-destroyed Connection.',
            }),
        )
    })

    test('connection.destroyed === true', () => {
        const connection = createConnection()
        connection.destroy()
        expect(() => createContentClient({ connection, authClient })).toThrow(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message:
                    'Argument "connection" must be a non-destroyed Connection.',
            }),
        )
    })

    test('authClient === null', () => {
        const connection = createConnection()
        expect(() =>
            createContentClient({ connection, authClient: null as any }),
        ).toThrow(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message:
                    'Argument "authClient" must be a non-destroyed Auth client.',
            }),
        )
    })

    test('authClient.destroyed === true', () => {
        const connection = createConnection()
        authClient.destroy()
        expect(() => createContentClient({ connection, authClient })).toThrow(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message:
                    'Argument "authClient" must be a non-destroyed Auth client.',
            }),
        )
    })

    test('duplicate serviceName', () => {
        const connection = createConnection()
        createContentClient({ connection, authClient })
        expect(() => createContentClient({ connection, authClient })).toThrow(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: 'Proxy "content" has been already registered.',
            }),
        )
    })
})

describe('activation state', () => {
    let connection: Connection
    beforeEach(() => {
        connection = createConnection()
    })
    afterEach(() => {
        connection.destroy()
    })

    test('initially active', async () => {
        const contentClient = createContentClient({ connection, authClient })
        const onActive = jest.fn()
        const onInactive = jest.fn()
        contentClient.on('active', onActive)
        contentClient.on('inactive', onInactive)
        expect(contentClient.active).toBe(false)
        expect(contentClient.userId).toBe(undefined)
        expect(contentClient.sessionId).toBe(undefined)
        await whenNextTick()
        expect(contentClient.active).toBe(true)
        expect(contentClient.userId).toBe(userId)
        expect(contentClient.sessionId).toBe(sessionId)
        expect(onActive).toHaveBeenCalledTimes(1)
        expect(onInactive).toHaveBeenCalledTimes(0)
    })

    test('initially inactive', async () => {
        authClient.active = false
        const contentClient = createContentClient({ connection, authClient })
        const onActive = jest.fn()
        const onInactive = jest.fn()
        contentClient.on('active', onActive)
        contentClient.on('inactive', onInactive)
        expect(contentClient.active).toBe(false)
        expect(contentClient.userId).toBe(undefined)
        expect(contentClient.sessionId).toBe(undefined)
        await whenNextTick()
        expect(contentClient.active).toBe(false)
        expect(contentClient.userId).toBe(undefined)
        expect(contentClient.sessionId).toBe(undefined)
        expect(onActive).toHaveBeenCalledTimes(0)
        expect(onInactive).toHaveBeenCalledTimes(0)
    })

    test('activate', async () => {
        authClient.active = false
        const contentClient = createContentClient({ connection, authClient })
        await whenNextTick()
        const onActive = jest.fn()
        const onInactive = jest.fn()
        contentClient.on('active', onActive)
        contentClient.on('inactive', onInactive)
        expect(contentClient.active).toBe(false)
        expect(contentClient.userId).toBe(undefined)
        expect(contentClient.sessionId).toBe(undefined)
        expect(onActive).toHaveBeenCalledTimes(0)
        expect(onInactive).toHaveBeenCalledTimes(0)

        // Activate
        authClient.active = true
        authClient.emit('active', { userId, sessionId })
        expect(contentClient.active).toBe(true)
        expect(contentClient.userId).toBe(userId)
        expect(contentClient.sessionId).toBe(sessionId)
        expect(onActive).toHaveBeenCalledTimes(0)
        expect(onInactive).toHaveBeenCalledTimes(0)
        await whenNextTick()
        expect(onActive).toHaveBeenCalledTimes(1)
        expect(onInactive).toHaveBeenCalledTimes(0)
    })

    test('deactivate', async () => {
        const contentClient = createContentClient({ connection, authClient })
        const onActive = jest.fn()
        const onInactive = jest.fn()
        contentClient.on('active', onActive)
        contentClient.on('inactive', onInactive)
        await whenNextTick()
        expect(contentClient.active).toBe(true)
        expect(contentClient.userId).toBe(userId)
        expect(contentClient.sessionId).toBe(sessionId)
        expect(onActive).toHaveBeenCalledTimes(1)
        expect(onInactive).toHaveBeenCalledTimes(0)
        onActive.mockClear()

        // Deactivate
        authClient.active = false
        authClient.emit('inactive')
        expect(contentClient.active).toBe(false)
        expect(contentClient.userId).toBe(undefined)
        expect(contentClient.sessionId).toBe(undefined)
        expect(onActive).toHaveBeenCalledTimes(0)
        expect(onInactive).toHaveBeenCalledTimes(0)
        await whenNextTick()
        expect(onActive).toHaveBeenCalledTimes(0)
        expect(onInactive).toHaveBeenCalledTimes(1)
    })

    test('destroy before initializing', async () => {
        const contentClient = createContentClient({ connection, authClient })
        const onActive = jest.fn()
        const onInactive = jest.fn()
        const onDestroy = jest.fn()
        contentClient.on('active', onActive)
        contentClient.on('inactive', onInactive)
        contentClient.on('destroy', onDestroy)
        expect(contentClient.destroyed).toBe(false)
        expect(contentClient.active).toBe(false)
        expect(contentClient.userId).toBe(undefined)
        expect(contentClient.sessionId).toBe(undefined)
        contentClient.destroy()
        expect(contentClient.destroyed).toBe(true)
        expect(contentClient.active).toBe(false)
        expect(contentClient.userId).toBe(undefined)
        expect(contentClient.sessionId).toBe(undefined)
        await whenNextTick()
        expect(contentClient.destroyed).toBe(true)
        expect(contentClient.active).toBe(false)
        expect(contentClient.userId).toBe(undefined)
        expect(contentClient.sessionId).toBe(undefined)
        expect(onDestroy).toHaveBeenCalledTimes(1)
        expect(onActive).toHaveBeenCalledTimes(0)
        expect(onInactive).toHaveBeenCalledTimes(0)
    })

    test('destroy after initializing', async () => {
        const contentClient = createContentClient({ connection, authClient })
        const onActive = jest.fn()
        const onInactive = jest.fn()
        const onDestroy = jest.fn()
        contentClient.on('active', onActive)
        contentClient.on('inactive', onInactive)
        contentClient.on('destroy', onDestroy)
        await whenNextTick()
        expect(contentClient.destroyed).toBe(false)
        expect(contentClient.active).toBe(true)
        expect(contentClient.userId).toBe(userId)
        expect(contentClient.sessionId).toBe(sessionId)
        expect(onDestroy).toHaveBeenCalledTimes(0)
        expect(onActive).toHaveBeenCalledTimes(1)
        expect(onInactive).toHaveBeenCalledTimes(0)
        onActive.mockClear()

        contentClient.destroy()
        expect(contentClient.destroyed).toBe(true)
        expect(contentClient.active).toBe(false)
        expect(contentClient.userId).toBe(undefined)
        expect(contentClient.sessionId).toBe(undefined)
        await whenNextTick()
        expect(onDestroy).toHaveBeenCalledTimes(1)
        expect(onActive).toHaveBeenCalledTimes(0)
        expect(onInactive).toHaveBeenCalledTimes(0)
    })

    test('destroy twice', async () => {
        const contentClient = createContentClient({ connection, authClient })
        const onDestroy = jest.fn()
        contentClient.on('destroy', onDestroy)
        contentClient.destroy()
        contentClient.destroy()
        await whenNextTick()
        expect(onDestroy).toHaveBeenCalledTimes(1)
    })

    test('destroy on connection destroyed', async () => {
        const contentClient = createContentClient({ connection, authClient })
        const onDestroy = jest.fn()
        contentClient.on('destroy', onDestroy)
        connection.destroy()
        await whenNextTick()
        expect(onDestroy).toHaveBeenCalledTimes(1)
    })

    test('destroy on authClient destroyed', async () => {
        const contentClient = createContentClient({ connection, authClient })
        const onDestroy = jest.fn()
        contentClient.on('destroy', onDestroy)
        authClient.destroy()
        await whenNextTick()
        expect(onDestroy).toHaveBeenCalledTimes(1)
    })
})

describe('proxy calls', () => {
    let clientStream: Duplex
    let serverStream: Duplex
    let clientConnection: Connection
    let serverConnection: Connection
    let contentClient: ContentClient
    let contentService: MockContentService

    beforeEach(() => {
        authClient = new MockAuthClient()
        ;[clientStream, serverStream] = invertedStreams({
            objectMode: true,
            allowHalfOpen: false,
        })
        clientConnection = createConnection()
        serverConnection = createConnection()
        clientConnection.connect(clientStream)
        serverConnection.connect(serverStream)
        contentService = new MockContentService()
        serverConnection.registerService({
            name: 'content',
            requestNames,
            instance: contentService,
        })
        contentClient = createContentClient({
            connection: clientConnection,
            authClient,
        })
    })

    afterEach(() => {
        clientConnection.destroy()
        serverConnection.destroy()
    })

    test('registerSchema', async () => {
        await expect(contentClient.registerSchema(schema)).resolves.toBe(null)
        expect(contentService.registerSchema).toHaveBeenCalledTimes(1)
        expect(contentService.registerSchema).toHaveBeenCalledWith(schema)
    })

    test('getSchema', async () => {
        await expect(contentClient.getSchema(hash)).resolves.toBe(schema)
        expect(contentService.getSchema).toHaveBeenCalledTimes(1)
        expect(contentService.getSchema).toHaveBeenCalledWith(hash)
    })

    test('getSnapshot', async () => {
        await expect(
            contentClient.getSnapshot(type, id, version),
        ).resolves.toBe(snapshot)
        expect(contentService.getSnapshot).toHaveBeenCalledTimes(1)
        expect(contentService.getSnapshot).toHaveBeenCalledWith(
            type,
            id,
            version,
        )
    })

    test('submitOperation', async () => {
        await expect(contentClient.submitOperation(operation)).resolves.toBe(
            null,
        )
        expect(contentService.submitOperation).toHaveBeenCalledTimes(1)
        expect(contentService.submitOperation).toHaveBeenCalledWith(operation)
    })

    test('streamOperations', async () => {
        const [inputStream, outputStream] = invertedStreams({
            allowHalfOpen: false,
            objectMode: true,
        })
        contentService.streamOperations.mockImplementationOnce(
            async () => outputStream,
        )
        const stream = await contentClient.streamOperations(
            type,
            id,
            versionStart,
            versionEnd,
        )
        try {
            expect(contentService.streamOperations).toHaveBeenCalledTimes(1)
            expect(contentService.streamOperations).toHaveBeenCalledWith(
                type,
                id,
                versionStart,
                versionEnd,
            )
            const onData = jest.fn()
            const onEnd = jest.fn()
            stream.on('data', onData)
            stream.on('end', onEnd)
            const streamData = { key: 'value' }
            inputStream.write(streamData)
            inputStream.end()
            await whenNextTick()
            expect(onData).toHaveBeenCalledTimes(1)
            expect(onData).toHaveBeenCalledWith(streamData)
            expect(onEnd).toHaveBeenCalledTimes(1)
            expect(onEnd).toHaveBeenCalledAfter(onData)
        } finally {
            stream.destroy()
        }
    })
})
