import { AuthService, createAuthError } from '@syncot/auth'
import { Connection } from '@syncot/connection'
import {
    assert,
    combine,
    SyncOTEmitter,
    throwError,
    isOpenWritableStream,
} from '@syncot/util'
import { Duplex } from 'readable-stream'
import {
    ContentServiceEvents,
    ContentService,
    Operation,
    requestNames,
    Snapshot,
    validateOperation,
} from './content'
import { createNotFoundError, isAlreadyExistsError } from './error'
import { PubSub } from './pubSub'
import { ContentStore } from './store'
import { OperationStream } from './stream'

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
    serviceName = 'content',
}: CreateContentServiceOptions): ContentService {
    return new ProseMirrorContentService(
        connection,
        authService,
        contentStore,
        pubSub,
        serviceName,
    )
}

class ProseMirrorContentService
    extends SyncOTEmitter<ContentServiceEvents>
    implements ContentService {
    private streams: Map<string, Map<string, OperationStream[]>> = new Map()
    public constructor(
        private readonly connection: Connection,
        private readonly authService: AuthService,
        private readonly contentStore: ContentStore,
        private readonly pubSub: PubSub,
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
        for (const [_type, streamsByType] of this.streams) {
            for (const [_id, streamsById] of streamsByType) {
                for (const stream of streamsById) {
                    stream.destroy()
                }
            }
        }
        super.destroy()
    }

    public async getSnapshot(
        type: string,
        id: string,
        version?: number | null | undefined,
    ): Promise<Snapshot> {
        this.assertOk()
        assert(typeof type === 'string', 'Argument "type" must be a string.')
        assert(typeof id === 'string', 'Argument "id" must be a string.')
        if (!this.authService.mayReadContent(type, id)) {
            throw createAuthError('Not authorized to read this snapshot.')
        }
        assert(
            version == null ||
                (Number.isInteger(version) &&
                    version >= 0 &&
                    version <= Number.MAX_SAFE_INTEGER),
            'Argument "version" must be a non-negative integer or null.',
        )
        if (version != null && version !== 0) {
            throw createNotFoundError('Document version not found.')
        }
        return {
            type,
            id,
            version: 0,
            schema: '',
            data: null,
            meta: null,
        }
    }

    public async submitOperation(operation: Operation): Promise<void> {
        this.assertOk()
        throwError(validateOperation(operation))
        const { type, id, version } = operation
        if (!this.authService.mayWriteContent(type, id)) {
            throw createAuthError('Not authorized to submit this operation.')
        }
        const nextVersion = (await this.contentStore.getVersion(type, id)) + 1
        assert(version <= nextVersion, 'Operation.version out of sequence.')
        const storedOperation = {
            ...operation,
            meta: {
                ...operation.meta,
                session: this.authService.sessionId,
                time: Date.now(),
                user: this.authService.userId,
            },
        }
        try {
            await this.contentStore.storeOperation(storedOperation)
            this.pubSub.publish(combine('operation', type, id), storedOperation)
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

        const channel = combine('operation', type, id)
        const start = versionStart == null ? 0 : versionStart
        const end =
            versionEnd == null
                ? Number.MAX_SAFE_INTEGER
                : Math.max(versionEnd, start)
        const stream = new OperationStream(start, end)

        const streamsByType = this.streams.get(type) || new Map()
        this.streams.set(type, streamsByType)
        const streamsById = streamsByType.get(id) || []
        streamsByType.set(id, streamsById)

        streamsById.push(stream)
        if (streamsById.length === 1) {
            this.pubSub.subscribe(channel, this.onOperation)
        }

        stream.on('destroy', () => {
            const index = streamsById.indexOf(stream)
            if (index >= 0) {
                streamsById.splice(index, 1)
            }
            if (streamsById.length === 0) {
                this.pubSub.unsubscribe(channel, this.onOperation)
            }
        })

        this.updateStreams(type, id)

        return stream
    }

    private onDestroy = (): void => {
        this.destroy()
    }

    private onOperation = (operation: Operation): void => {
        this.updateStreams(operation.type, operation.id)
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

    private updateStreams(type: string, id: string): void {
        queueMicrotask(() => {
            const streamsByType = this.streams.get(type)
            if (!streamsByType) {
                return
            }

            const streamsById = streamsByType.get(id)
            if (!streamsById) {
                return
            }

            streamsById.forEach(async (stream) => {
                try {
                    const operations = await this.contentStore.loadOperations(
                        type,
                        id,
                        stream.versionNext,
                        stream.versionEnd,
                    )
                    if (isOpenWritableStream(stream)) {
                        for (const operation of operations) {
                            stream.pushOperation(operation)
                        }
                    }
                } catch (error) {
                    this.emitAsync('error', error)
                }
            })
        })
    }
}
