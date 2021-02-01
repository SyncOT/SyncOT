import { Auth, AuthEvents } from '@syncot/auth'
import { Connection, createConnection } from '@syncot/connection'
import { invertedStreams, SyncOTEmitter, whenNextTick } from '@syncot/util'
import { Duplex } from 'readable-stream'
import {
    Content,
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

class MockAuth extends SyncOTEmitter<AuthEvents> implements Auth {
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
let auth: MockAuth

class MockContentService implements Content {
    public auth = new MockAuth()
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
    auth = new MockAuth()
})

describe('initialization errors', () => {
    test('connection === null', () => {
        expect(() =>
            createContentClient({ connection: null as any, auth }),
        ).toThrow(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: 'Argument "connection" must be an object.',
            }),
        )
    })

    test('connection === true', () => {
        expect(() =>
            createContentClient({ connection: true as any, auth }),
        ).toThrow(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: 'Argument "connection" must be an object.',
            }),
        )
    })

    test('auth === null', () => {
        const connection = createConnection()
        expect(() =>
            createContentClient({ connection, auth: null as any }),
        ).toThrow(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: 'Argument "auth" must be an object.',
            }),
        )
    })

    test('auth === true', () => {
        const connection = createConnection()
        expect(() =>
            createContentClient({ connection, auth: true as any }),
        ).toThrow(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: 'Argument "auth" must be an object.',
            }),
        )
    })

    test('duplicate serviceName', () => {
        const connection = createConnection()
        createContentClient({ connection, auth })
        expect(() => createContentClient({ connection, auth })).toThrow(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: 'Proxy "content" has been already registered.',
            }),
        )
    })
})

describe('proxy calls', () => {
    let clientStream: Duplex
    let serverStream: Duplex
    let clientConnection: Connection
    let serverConnection: Connection
    let contentClient: Content
    let contentService: MockContentService

    beforeEach(() => {
        auth = new MockAuth()
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
            auth,
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
