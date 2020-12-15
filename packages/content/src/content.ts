import { assert, combine, isOpenWritableStream, throwError } from '@syncot/util'
import { Duplex } from 'readable-stream'
import { createNotFoundError, isAlreadyExistsError } from './error'
import { Operation } from './operation'
import { PubSub } from './pubSub'
import { Schema, SchemaKey } from './schema'
import { Snapshot } from './snapshot'
import { ContentStore } from './store'
import { OperationStream } from './stream'
import { ContentType } from './type'

/**
 * The options for the Content#submitOperation function.
 */
export interface SubmitOperationOptions {
    /**
     * Determines, if Content is allowed to rebase the operation internally,
     * if the version of the submitted operation conflicts with an existing operation.
     * This option is effective only if the ContentType, as determined by `Operation.type`, supports rebasing.
     * Defaults to `false`.
     */
    allowRebase?: boolean
}

/**
 * Content and schema management interface.
 */
export interface Content {
    /**
     * Registers the given schema, if it does not exist yet, otherwise does nothing.
     * @param schema The schema to register.
     */
    registerSchema(schema: Schema): Promise<void>

    /**
     * Gets a Schema by key.
     * @param key The schema key.
     * @returns An existing Schema with the given `key`, or `null`, if not found.
     */
    getSchema(key: SchemaKey): Promise<Schema | null>

    /**
     * Gets a snapshot of a document at a given version.
     *
     * @param type The document type.
     * @param id The document ID.
     * @param version The document version. Defaults to the latest version.
     * @returns A snapshot matching the params, or null, if not found.
     */
    getSnapshot(
        type: string,
        id: string,
        version?: number | null | undefined,
    ): Promise<Snapshot | null>

    /**
     * Submits the operation to update a document.
     *
     * - The `data` and `version` properties may be updated before the operation is recorded,
     *   if the operation is rebased internally on top of other operation recorded earlier.
     * - The `meta.time` property is always updated to the server time at which the operation
     *   is recorded.
     * - The `meta.user` property is always updated to match the ID of the user who sumbitted
     *   the operation.
     * - The `meta.session` property is always updated to match the ID of the session which
     *   the operation was submitted in.
     *
     * @param operation The operation to submit.
     * @param options The options providing additional control over the submition process.
     */
    submitOperation(
        operation: Operation,
        options?: SubmitOperationOptions,
    ): Promise<void>

    /**
     * Streams the specified operations.
     * @param type The document type.
     * @param id The document ID.
     * @param versionStart The version number of first operation to include. Defaults to 1.
     * @param versionEnd The version number of the first operation to exclude. Defaults to Number.MAX_SAFE_INTEGER.
     * @returns A stream of Operation objects.
     */
    streamOperations(
        type: string,
        id: string,
        versionStart?: number | null | undefined,
        versionEnd?: number | null | undefined,
    ): Promise<Duplex>
}

/**
 * The options expected by `createContent`.
 */
export interface CreateContentOptions {
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
}

/**
 * Creates a new Content instance.
 */
export function createContent({
    contentStore,
    pubSub,
    contentTypes,
}: CreateContentOptions): Content {
    return new DefaultContent(contentStore, pubSub, contentTypes)
}

const { hasOwnProperty } = Object.prototype

class DefaultContent implements Content {
    private streams: Map<string, OperationStream[]> = new Map()
    public constructor(
        private readonly contentStore: ContentStore,
        private readonly pubSub: PubSub,
        private readonly contentTypes: { [key: string]: ContentType },
    ) {
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
    }

    public async registerSchema(schema: Schema): Promise<void> {
        const contentType = this.getContentType(schema.type)
        throwError(contentType.validateSchema(schema))
        return this.contentStore.storeSchema(schema)
    }

    public async getSchema(key: string): Promise<Schema | null> {
        return this.contentStore.loadSchema(key)
    }

    public async getSnapshot(
        type: string,
        id: string,
        version?: number | null | undefined,
    ): Promise<Snapshot | null> {
        return this.loadSnapshot(
            type,
            id,
            version || Number.MAX_SAFE_INTEGER - 1,
        )
    }

    public async submitOperation(operation: Operation): Promise<void> {
        const { type, id, version } = operation

        const contentType = this.getContentType(operation.type)
        if (!contentType.hasSchema(operation.schema)) {
            const schema = await this.contentStore.loadSchema(operation.schema)
            if (!schema) throw createNotFoundError('Schema')
            contentType.registerSchema(schema)
        }

        let snapshot: Snapshot | null = null
        if (version > 1) {
            snapshot = await this.loadSnapshot(type, id, version - 1)
            assert(
                snapshot && snapshot.version === version - 1,
                'operation.version out of sequence.',
            )
        }
        snapshot = contentType.apply(snapshot, operation)

        try {
            await this.contentStore.storeOperation(operation)
            this.pubSub.publish(combine('operation', type, id), operation)
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
        const start = versionStart == null ? 1 : versionStart
        const end =
            versionEnd == null
                ? Number.MAX_SAFE_INTEGER
                : Math.max(versionEnd, start)
        const streamKey = combine(type, id)
        const stream = new OperationStream(type, id, start, end)

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

        queueMicrotask(() => this.updateStream(stream))

        return stream
    }

    private onOperation = (operation: Operation): void => {
        queueMicrotask(() =>
            this.updateStreams(operation.type, operation.id, operation),
        )
    }

    private getContentType(type: string): ContentType {
        if (!hasOwnProperty.call(this.contentTypes, type))
            throw new TypeError(`Unsupported document type: ${type}.`)
        return this.contentTypes[type]
    }

    private async loadSnapshot(
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

    private updateStreams(
        type: string,
        id: string,
        operation?: Operation,
    ): void {
        const streams = this.streams.get(combine(type, id))
        if (streams) {
            for (const stream of streams) {
                this.updateStream(stream, operation)
            }
        }
    }

    private async updateStream(
        stream: OperationStream,
        newOperation?: Operation,
    ): Promise<void> {
        if (!isOpenWritableStream(stream)) return

        if (newOperation && stream.versionNext === newOperation.version) {
            stream.pushOperation(newOperation)
            return
        }

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
            stream.emit('error', error)
        }
    }
}
