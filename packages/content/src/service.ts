import { AuthService, createAuthError } from '@syncot/auth'
import { Connection } from '@syncot/connection'
import {
    assert,
    combine,
    isOpenWritableStream,
    SyncOTEmitter,
    throwError,
} from '@syncot/util'
import { Duplex } from 'readable-stream'
import {
    ContentService,
    ContentServiceEvents,
    Operation,
    operationKeyUser,
    requestNames,
    Schema,
    SchemaKey,
    Snapshot,
    validateOperation,
    validateSchema,
} from './content'
import { createNotFoundError, isAlreadyExistsError } from './error'
import { PubSub } from './pubSub'
import { ContentStore } from './store'
import { OperationStream } from './stream'
import { ContentType } from './type'

/**
 * The options expected by `createContentService`.
 */
export interface CreateContentServiceOptions {
    /**
     * The connection for communication with the ContentClient.
     */
    connection: Connection
    /**
     * The AuthService used to verify user permissions.
     */
    authService: AuthService
    /**
     * The ContentStore to use for storing content.
     */
    contentStore: ContentStore
    /**
     * The PubSub to use for content-related notifications.
     */
    pubSub: PubSub
    /**
     * The content types to support.
     */
    contentTypes: { [key: string]: ContentType }
    /**
     * The name of the service to register with the connection.
     * Default is `content`.
     */
    serviceName?: string
}

/**
 * Creates a new ContentService instance.
 */
export function createContentService({
    connection,
    authService,
    contentStore,
    pubSub,
    contentTypes,
    serviceName = 'content',
}: CreateContentServiceOptions): ContentService {
    return new ProseMirrorContentService(
        connection,
        authService,
        contentStore,
        pubSub,
        contentTypes,
        serviceName,
    )
}

const { hasOwnProperty } = Object.prototype

class ProseMirrorContentService
    extends SyncOTEmitter<ContentServiceEvents>
    implements ContentService {
    private streams: Map<string, OperationStream[]> = new Map()
    public constructor(
        private readonly connection: Connection,
        private readonly authService: AuthService,
        private readonly contentStore: ContentStore,
        private readonly pubSub: PubSub,
        private readonly contentTypes: { [key: string]: ContentType },
        serviceName: string,
    ) {
        super()

        assert(
            this.connection && !this.connection.destroyed,
            'Argument "connection" must be a non-destroyed Connection.',
        )

        assert(
            this.authService && !this.authService.destroyed,
            'Argument "authService" must be a non-destroyed AuthService.',
        )

        assert(
            this.contentStore && typeof this.contentStore === 'object',
            'Argument "contentStore" must be a ContentStore instance.',
        )

        assert(
            this.pubSub && typeof this.pubSub === 'object',
            'Argument "pubSub" must be a PubSub instance.',
        )

        assert(
            this.contentTypes && typeof this.contentTypes === 'object',
            'Argument "contentTypes" must be an object.',
        )

        this.connection.registerService({
            instance: this,
            name: serviceName,
            requestNames,
        })

        this.connection.on('destroy', this.onDestroy)
        this.authService.on('destroy', this.onDestroy)
    }

    public destroy(): void {
        if (this.destroyed) {
            return
        }
        this.connection.off('destroy', this.onDestroy)
        this.authService.off('destroy', this.onDestroy)

        for (const [_, streams] of this.streams) {
            for (const stream of streams) {
                stream.destroy()
            }
        }

        super.destroy()
    }

    public async registerSchema(schema: Schema): Promise<void> {
        this.assertOk()
        throwError(validateSchema(schema))
        const contentType = this.getContentType(schema.type)
        throwError(contentType.validateSchema(schema))
        return this.contentStore.registerSchema({
            key: schema.key,
            type: schema.type,
            data: schema.data,
            meta: {
                ...schema.meta,
                session: this.authService.sessionId,
                time: Date.now(),
                user: this.authService.userId,
            },
        })
    }

    public async getSchema(key: string): Promise<Schema | null> {
        this.assertOk()
        assert(typeof key === 'string', 'Argument "key" must be a string.')
        return this.getSchemaInternal(key)
    }

    public async getSnapshot(
        type: string,
        id: string,
        version?: number | null | undefined,
    ): Promise<Snapshot | null> {
        this.assertOk()
        assert(typeof type === 'string', 'Argument "type" must be a string.')
        assert(typeof id === 'string', 'Argument "id" must be a string.')
        assert(
            version == null ||
                (Number.isInteger(version) &&
                    version >= 1 &&
                    version < Number.MAX_SAFE_INTEGER),
            'Argument "version" must be a non-negative integer or null.',
        )
        if (!this.authService.mayReadContent(type, id))
            throw createAuthError('Not authorized to read this snapshot.')
        return this.getSnapshotInternal(
            type,
            id,
            version || Number.MAX_SAFE_INTEGER - 1,
        )
    }

    public async submitOperation(operation: Operation): Promise<void> {
        this.assertOk()
        throwError(validateOperation(operation))

        const { type, id } = operation
        if (!this.authService.mayWriteContent(type, id)) {
            throw createAuthError('Not authorized to submit this operation.')
        }

        assert(
            operationKeyUser(operation.key) === this.authService.userId,
            'Operation.key does not contain the expected userId.',
        )

        const contentType = this.getContentType(operation.type)
        const schema = await this.getSchemaInternal(operation.schema)
        if (!schema) throw createNotFoundError('Schema')
        contentType.registerSchema(schema)
        let snapshot: Snapshot | null = null
        if (operation.version > 1) {
            snapshot = await this.getSnapshotInternal(
                operation.type,
                operation.id,
                operation.version - 1,
            )
            assert(
                snapshot && snapshot.version === operation.version - 1,
                'operation.version out of sequence.',
            )
        }
        const storedOperation: Operation = {
            key: operation.key,
            type: operation.type,
            id: operation.id,
            version: operation.version,
            schema: operation.schema,
            data: operation.data,
            meta: {
                ...operation.meta,
                session: this.authService.sessionId,
                time: Date.now(),
                user: this.authService.userId,
            },
        }
        snapshot = contentType.apply(snapshot, storedOperation)

        try {
            await this.contentStore.storeOperation(storedOperation)
            this.pubSub.publish(combine('operation', type, id), storedOperation)
            // TODO cache snapshot
        } catch (error) {
            if (isAlreadyExistsError(error)) {
                this.updateStreams(type, id)
            }
            throw error
        }
    }

    public async streamOperations(
        type: string,
        id: string,
        versionStart?: number | null | undefined,
        versionEnd?: number | null | undefined,
    ): Promise<Duplex> {
        this.assertOk()
        assert(typeof type === 'string', 'Argument "type" must be a string.')
        assert(typeof id === 'string', 'Argument "id" must be a string.')
        assert(
            versionStart == null ||
                (Number.isInteger(versionStart) &&
                    versionStart > 0 &&
                    versionStart <= Number.MAX_SAFE_INTEGER),
            'Argument "versionStart" must be a positive integer or null.',
        )
        assert(
            versionEnd == null ||
                (Number.isInteger(versionEnd) &&
                    versionEnd > 0 &&
                    versionEnd <= Number.MAX_SAFE_INTEGER),
            'Argument "versionEnd" must be a positive integer or null.',
        )
        if (!this.authService.mayReadContent(type, id)) {
            throw createAuthError('Not authorized to stream these operations.')
        }

        const start = versionStart == null ? 1 : versionStart
        const end =
            versionEnd == null
                ? Number.MAX_SAFE_INTEGER
                : Math.max(versionEnd, start)
        const streamKey = combine(type, id)
        const stream = new OperationStream(type, id, start, end)
        stream.on('error', this.onError)

        {
            const streams = this.streams.get(streamKey)
            if (streams) {
                this.streams.set(streamKey, streams.concat(stream))
            } else {
                this.streams.set(streamKey, [stream])
                this.pubSub.subscribe(
                    combine('operation', type, id),
                    this.onOperation,
                )
            }
        }

        stream.on('destroy', () => {
            const streams = this.streams.get(streamKey)
            if (streams) {
                if (streams.length === 1 && streams[0] === stream) {
                    this.streams.delete(streamKey)
                    this.pubSub.unsubscribe(
                        combine('operation', type, id),
                        this.onOperation,
                    )
                } else {
                    this.streams.set(
                        streamKey,
                        streams.filter((s) => s !== stream),
                    )
                }
            }
        })

        queueMicrotask(() => this.updateStreams(type, id))

        return stream
    }

    private onDestroy = (): void => {
        this.destroy()
    }

    private onError = (error: Error): void => {
        this.emitAsync('error', error)
    }

    private onOperation = (operation: Operation): void => {
        queueMicrotask(() => this.updateStreams(operation.type, operation.id))
    }

    private assertOk(): void {
        this.assertNotDestroyed()
        this.assertAuthenticated()
    }

    private assertAuthenticated(): void {
        if (!this.authService.active) {
            throw createAuthError('No authenticated user.')
        }
    }

    private getContentType(type: string): ContentType {
        if (!hasOwnProperty.call(this.contentTypes, type))
            throw new TypeError(`Unsupported document type: ${type}.`)
        return this.contentTypes[type]
    }

    private async getSchemaInternal(key: SchemaKey): Promise<Schema | null> {
        return this.contentStore.getSchema(key)
    }

    private async getSnapshotInternal(
        type: string,
        id: string,
        version: number,
    ): Promise<Snapshot | null> {
        const contentType = this.getContentType(type)
        let snapshot = await this.contentStore.loadSnapshot(type, id, version)
        const snapshotVersion = snapshot ? snapshot.version : 0

        if (snapshotVersion < version) {
            const operations = await this.contentStore.loadOperations(
                type,
                id,
                snapshotVersion + 1,
                version + 1,
            )
            for (const operation of operations) {
                snapshot = contentType.apply(snapshot, operation)
            }
        }

        return snapshot
    }

    private updateStreams(type: string, id: string): void {
        const streams = this.streams.get(combine(type, id))
        if (streams) {
            for (const stream of streams) {
                this.updateStream(stream)
            }
        }
    }

    private async updateStream(stream: OperationStream): Promise<void> {
        try {
            const operations = await this.contentStore.loadOperations(
                stream.type,
                stream.id,
                stream.versionNext,
                stream.versionEnd,
            )
            if (isOpenWritableStream(stream)) {
                for (const operation of operations) {
                    stream.pushOperation(operation)
                }
            }
        } catch (error) {
            this.onError(error)
        }
    }
}
