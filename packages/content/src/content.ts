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
import { maxVersion, minVersion } from './version'

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
     * @param versionStart The version number of the first operation to include. Defaults to minVersion.
     * @param versionEnd The version number of the first operation to exclude. Defaults to maxVersion + 1.
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
    /**
     * The min number of milliseconds for which to cache operations.
     * Defaults to 10000.
     */
    cacheTTL?: number
    /**
     * The max number of operations to cache.
     * Defaults to 50.
     */
    cacheLimit?: number
}

/**
 * Creates a new Content instance.
 */
export function createContent({
    contentStore,
    pubSub,
    contentTypes,
    cacheTTL = 10000,
    cacheLimit = 50,
}: CreateContentOptions): Content {
    return new DefaultContent(
        contentStore,
        pubSub,
        contentTypes,
        cacheTTL,
        cacheLimit,
    )
}

const { hasOwnProperty } = Object.prototype

/**
 * Represents per document state, indexed by `combine(type, id)`.
 */
interface State {
    /**
     * The first cached snapshot.
     */
    readonly firstSnapshot: Snapshot | null
    /**
     * The last cached snapshot.
     */
    readonly lastSnapshot: Snapshot | null
    /**
     * Operations which produce `lastSnapshot`, if applied to `firstSnapshot`.
     */
    readonly operations: Operation[]
    /**
     * Active operation streams.
     */
    readonly streams: OperationStream[]
}

class DefaultContent implements Content {
    private state: Map<string, State> = new Map()
    public constructor(
        private readonly contentStore: ContentStore,
        private readonly pubSub: PubSub,
        private readonly contentTypes: { [key: string]: ContentType },
        private cacheTTL: number,
        private cacheLimit: number,
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
        assert(
            Number.isInteger(cacheTTL) && cacheTTL >= 0,
            'Argument "cacheTTL" must be a positive integer or undefined.',
        )
        assert(
            Number.isInteger(cacheLimit) && cacheLimit >= 0,
            'Argument "cacheLimit" must be a positive integer or undefined.',
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
            version == null ? maxVersion : version,
        )
    }

    public async submitOperation(operation: Operation): Promise<void> {
        const { type, id, version } = operation

        const contentType = this.getContentType(operation.type)
        await this.ensureSchema(contentType, operation.schema)

        let snapshot = await this.loadSnapshot(type, id, version - 1)
        assert(
            version === (snapshot ? snapshot.version + 1 : minVersion),
            'operation.version out of sequence.',
        )
        snapshot = contentType.apply(snapshot, operation)

        try {
            await this.contentStore.storeOperation(operation)
            this.cacheOperations(combine(type, id), [operation], contentType)
            this.pubSub.publish(combine('operation', type, id), operation)
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
        const start = versionStart == null ? minVersion : versionStart
        const end =
            versionEnd == null ? maxVersion + 1 : Math.max(versionEnd, start)
        const stateKey = combine(type, id)
        const stream = new OperationStream(type, id, start, end)

        {
            const state = this.state.get(stateKey)
            if (state) {
                this.state.set(stateKey, {
                    ...state,
                    streams: state.streams.concat(stream),
                })
            } else {
                this.state.set(stateKey, {
                    firstSnapshot: null,
                    lastSnapshot: null,
                    operations: [],
                    streams: [stream],
                })
                this.pubSub.subscribe(
                    combine('operation', type, id),
                    this.onOperation,
                )
            }
        }

        stream.on('close', () => {
            const state = this.state.get(stateKey)
            if (state) {
                if (state.streams.length === 1 && state.streams[0] === stream) {
                    this.state.delete(stateKey)
                    this.pubSub.unsubscribe(
                        combine('operation', type, id),
                        this.onOperation,
                    )
                } else {
                    this.state.set(stateKey, {
                        ...state,
                        streams: state.streams.filter((s) => s !== stream),
                    })
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

    private async ensureSchema(
        contentType: ContentType,
        schemaKey: SchemaKey,
    ): Promise<void> {
        if (!contentType.hasSchema(schemaKey)) {
            const schema = await this.contentStore.loadSchema(schemaKey)
            if (!schema) throw createNotFoundError('Schema')
            contentType.registerSchema(schema)
        }
    }

    private async loadSnapshot(
        type: string,
        id: string,
        version: number,
    ): Promise<Snapshot | null> {
        let snapshot: Snapshot | null = null
        if (version <= 0) return snapshot
        const contentType = this.getContentType(type)
        const stateKey = combine(type, id)
        const state = this.state.get(stateKey)

        // Get a snapshot from the cache.
        if (state) {
            if (
                state.lastSnapshot === null ||
                state.lastSnapshot.version <= version
            ) {
                snapshot = state.lastSnapshot
            } else if (
                state.firstSnapshot === null ||
                state.firstSnapshot.version <= version
            ) {
                snapshot = state.firstSnapshot
                let versionNext = snapshot ? snapshot.version + 1 : minVersion
                if (versionNext <= version) {
                    for (const operation of state.operations) {
                        if (operation.version === versionNext) {
                            snapshot = contentType.apply(snapshot, operation)
                            versionNext++
                            if (versionNext > version) break
                        }
                    }
                }
            }
        }

        // Get a snapshot from the database.
        if (!snapshot) {
            snapshot = await this.contentStore.loadSnapshot(type, id, version)
        }

        // Get operations from the database.
        if (!snapshot || snapshot.version < version) {
            const operations = await this.loadOperations(
                type,
                id,
                snapshot ? snapshot.version + 1 : minVersion,
                version + 1,
            )
            for (const operation of operations) {
                snapshot = contentType.apply(snapshot, operation)
            }
        }

        // Cache only the latest snapshot.
        if (snapshot && version === maxVersion)
            this.cacheSnapshot(stateKey, snapshot)

        return snapshot
    }

    private async loadOperations(
        type: string,
        id: string,
        versionStart: number,
        versionEnd: number,
    ): Promise<Operation[]> {
        const operations: Operation[] = []
        if (versionEnd <= versionStart) return operations
        const contentType = this.getContentType(type)
        const stateKey = combine(type, id)
        const state = this.state.get(stateKey)

        // Get operations from the cache.
        if (
            state &&
            state.operations.length > 0 &&
            state.operations[0].version <= versionStart
        ) {
            for (const operation of state.operations) {
                if (
                    operation.version >= versionStart &&
                    operation.version < versionEnd
                ) {
                    operations.push(operation)
                }
            }
        }

        // Get operations from the database.
        const versionNext =
            operations.length === 0
                ? versionStart
                : operations[operations.length - 1].version + 1
        if (versionNext < versionEnd) {
            const loadedOperations = await this.contentStore.loadOperations(
                type,
                id,
                versionNext,
                versionEnd,
            )
            for (const loadedOperation of loadedOperations) {
                await this.ensureSchema(contentType, loadedOperation.schema)
                operations.push(loadedOperation)
            }
            this.cacheOperations(stateKey, operations, contentType)
        }

        return operations
    }

    private cacheSnapshot(stateKey: string, snapshot: Snapshot): void {
        // Get state.
        const state = this.state.get(stateKey)
        if (!state) return

        // Cache the snapshot only if it is newer
        // than the snapshot which we have already cached.
        if (
            state.lastSnapshot === null ||
            snapshot.version > state.lastSnapshot.version
        ) {
            this.state.set(stateKey, {
                ...state,
                firstSnapshot: snapshot,
                lastSnapshot: snapshot,
                operations: [],
            })
        }
    }

    private cacheOperations(
        stateKey: string,
        newOperations: Operation[],
        contentType: ContentType,
    ): void {
        // Get state.
        const state = this.state.get(stateKey)
        if (!state) return
        let { firstSnapshot, lastSnapshot } = state
        const operations = state.operations.slice(0)
        let operation: Operation

        // Add new operations.
        for (operation of newOperations) {
            if (
                operation.version ===
                (lastSnapshot ? lastSnapshot.version + 1 : minVersion)
            ) {
                lastSnapshot = contentType.apply(lastSnapshot, operation)
                operations.push(operation)
            }
        }

        // Remove old operations.
        const minCacheTime = Date.now() - this.cacheTTL
        const maxCacheLength = this.cacheLimit
        while (
            operations.length > 0 &&
            ((operation = operations[0]).meta == null ||
                operation.meta.time == null ||
                operation.meta.time < minCacheTime ||
                operations.length > maxCacheLength)
        ) {
            firstSnapshot = contentType.apply(firstSnapshot, operation)
            operations.shift()
        }

        this.state.set(stateKey, {
            ...state,
            firstSnapshot,
            lastSnapshot,
            operations,
        })
    }

    private updateStreams(
        type: string,
        id: string,
        operation?: Operation,
    ): void {
        const stateKey = combine(type, id)
        const state = this.state.get(stateKey)
        if (state) {
            for (const stream of state.streams) {
                this.updateStream(stream, operation)
            }
        }
    }

    private async updateStream(
        stream: OperationStream,
        newOperation?: Operation,
    ): Promise<void> {
        try {
            if (!isOpenWritableStream(stream)) return

            if (newOperation && stream.versionNext === newOperation.version) {
                stream.pushOperation(newOperation)
                return
            }

            const operations = await this.loadOperations(
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
