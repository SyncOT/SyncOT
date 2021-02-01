import {
    assert,
    combine,
    createEntityTooLargeError,
    exponentialBackOffStrategy,
    first,
    last,
    noop,
    WorkLoop,
    workLoop,
} from '@syncot/util'
import { Duplex } from 'readable-stream'
import { createNotFoundError, isAlreadyExistsError } from './error'
import { createBaseOperation, Operation } from './operation'
import { PubSub } from './pubSub'
import { Schema, SchemaHash } from './schema'
import { createBaseSnapshot, Snapshot } from './snapshot'
import { ContentStore } from './store'
import { OperationStream } from './stream'
import { ContentType } from './type'
import {
    maxOperationSize,
    maxSchemaSize,
    maxSnapshotSize,
    minVersion,
} from './limits'

/**
 * Content and schema management interface.
 */
export interface ContentBackend {
    /**
     * Registers the given schema, if it does not exist yet, otherwise does nothing.
     * @param schema The schema to register.
     */
    registerSchema(schema: Schema): Promise<void>

    /**
     * Gets a Schema by hash.
     * @param hash The schema hash.
     * @returns An existing Schema with the given `hash`, or `null`, if not found.
     */
    getSchema(hash: SchemaHash): Promise<Schema | null>

    /**
     * Gets the latest document snapshot at or below the given version.
     *
     * @param type The document type.
     * @param id The document ID.
     * @param version The document version.
     * @returns A snapshot matching the params.
     */
    getSnapshot(type: string, id: string, version: number): Promise<Snapshot>

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
     */
    submitOperation(operation: Operation): Promise<void>

    /**
     * Streams the specified operations.
     * @param type The document type.
     * @param id The document ID.
     * @param versionStart The version number of the first operation to include.
     * @param versionEnd The version number of the first operation to exclude.
     * @returns A stream of Operation objects.
     */
    streamOperations(
        type: string,
        id: string,
        versionStart: number,
        versionEnd: number,
    ): Promise<Duplex>
}

/**
 * The options expected by `createContentBackend`.
 */
export interface CreateContentBackendOptions {
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
     * Defines the min number of milliseconds for which to cache snapshots and operations in memory.
     * Defaults to 10000.
     */
    cacheTTL?: number
    /**
     * The max number of operations to cache.
     * Defaults to 50.
     */
    cacheLimit?: number
    /**
     * Indicates if the specified snapshot should be stored in `contentStore`.
     * Defaults to: `(snapshot) => snapshot.version % 1000 === 0`.
     */
    shouldStoreSnapshot?: (snapshot: Snapshot) => boolean
    /**
     * A function called when a non-critical error occurs.
     * Defaults to: `(error) => console.warn(error)`.
     *
     * Warnings are emitted in the following situations:
     * - saving a snapshot fails.
     */
    onWarning?: (error: Error) => void
}

/**
 * Creates a new ContentBackend instance.
 */
export function createContentBackend({
    contentStore,
    pubSub,
    contentTypes,
    cacheTTL = 10000,
    cacheLimit = 50,
    shouldStoreSnapshot = (snapshot: Snapshot) => snapshot.version % 1000 === 0,
    // tslint:disable-next-line:no-console
    onWarning = console.warn.bind(console),
}: CreateContentBackendOptions): ContentBackend {
    return new Backend(
        contentStore,
        pubSub,
        contentTypes,
        cacheTTL,
        cacheLimit,
        shouldStoreSnapshot,
        onWarning,
    )
}

const { hasOwnProperty } = Object.prototype

/**
 * The cached snapshot and operations.
 */
interface Cache {
    /**
     * The cached snapshot.
     */
    snapshot: Snapshot
    /**
     * The cached operations which can be applied to the cached snapshot.
     */
    operations: Operation[]
    /**
     * The time at which this cache item should expire.
     */
    expireAt: number
}

class Backend implements ContentBackend {
    /**
     * The open operation streams, indexed by `combine(type, id)`.
     */
    private readonly streams: Map<string, OperationStream[]> = new Map()
    /**
     * A set of `combine(type, id)` values indicating which operation streams need updating.
     */
    private readonly streamsToUpdate: Set<string> = new Set()

    /**
     * The cache of snapshots and operations, indexed by `combine(type, id)`.
     */
    private readonly cache: Map<string, Cache> = new Map()
    /**
     * A Set of `combine(type, id)` values indicating which cache items should expire.
     * The insertion orders matches the order in which the items should expire.
     */
    private readonly expiringCacheItems: Set<string> = new Set()

    private triggerStreamsUpdate = noop
    public constructor(
        private readonly contentStore: ContentStore,
        private readonly pubSub: PubSub,
        private readonly contentTypes: { [key: string]: ContentType },
        private readonly cacheTTL: number,
        private readonly cacheLimit: number,
        private readonly shouldStoreSnapshot: (snapshot: Snapshot) => boolean,
        private readonly onWarning: (error: Error) => void,
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
            'Argument "cacheTTL" must be a non-negative integer or undefined.',
        )
        assert(
            Number.isInteger(cacheLimit) && cacheLimit >= 0,
            'Argument "cacheLimit" must be a non-negative integer or undefined.',
        )
        assert(
            typeof shouldStoreSnapshot === 'function',
            'Argument "shouldStoreSnapshot" must be a function or undefined.',
        )
        assert(
            typeof onWarning === 'function',
            'Argument "onWarning" must be a function or undefined.',
        )

        workLoop((triggerStreamsUpdate) => {
            this.triggerStreamsUpdate = triggerStreamsUpdate
            return new StreamUpdater(
                this.streamsToUpdate,
                this.getStreams,
                this.loadOperations,
                triggerStreamsUpdate,
            )
        })
    }

    public async registerSchema(schema: Schema): Promise<void> {
        this.checkSchemaSize(schema)
        const contentType = this.getContentType(schema.type)
        contentType.validateSchema(schema)
        try {
            return await this.contentStore.storeSchema(schema)
        } catch (error) {
            if (isAlreadyExistsError(error)) return
            throw error
        }
    }

    public async getSchema(hash: string): Promise<Schema | null> {
        return await this.contentStore.loadSchema(hash)
    }

    public async getSnapshot(
        type: string,
        id: string,
        version: number,
    ): Promise<Snapshot> {
        return this.loadSnapshot(type, id, version)
    }

    public async submitOperation(operation: Operation): Promise<void> {
        this.checkOperationSize(operation)
        const { type, id, version } = operation
        const key = combine(type, id)
        const contentType = this.getContentType(operation.type)
        await this.ensureSchema(contentType, operation.schema)

        let snapshot = await this.loadSnapshot(type, id, version - 1)
        assert(
            version === snapshot.version + 1,
            'operation.version out of sequence.',
        )
        snapshot = contentType.apply(snapshot, operation)
        this.checkSnapshotSize(snapshot)

        try {
            await this.contentStore.storeOperation(operation)
            this.cacheOperations(key, [operation], contentType)
            this.pubSub.publish(combine('operation', type, id), operation)
            this.storeSnapshotIfNecessary(snapshot)
        } catch (error) {
            if (isAlreadyExistsError(error)) this.updateStreams(key)
            throw error
        }
    }

    public async streamOperations(
        type: string,
        id: string,
        versionStart: number,
        versionEnd: number,
    ): Promise<Duplex> {
        const key = combine(type, id)
        const stream = new OperationStream(type, id, versionStart, versionEnd)

        {
            const streams = this.streams.get(key)
            if (streams) {
                this.streams.set(key, streams.concat(stream))
            } else {
                this.streams.set(key, [stream])
                this.pubSub.subscribe(
                    combine('operation', type, id),
                    this.onOperation,
                )
                this.touch(key)
            }
        }

        stream.on('close', () => {
            const streams = this.streams.get(key)
            /* istanbul ignore if */
            if (!streams) return
            if (streams.length === 1 && streams[0] === stream) {
                this.streams.delete(key)
                this.pubSub.unsubscribe(
                    combine('operation', type, id),
                    this.onOperation,
                )
                this.touch(key)
            } else {
                this.streams.set(
                    key,
                    streams.filter((s) => s !== stream),
                )
            }
        })

        this.updateStreams(key)
        return stream
    }

    private getStreams = (key: string) => {
        return this.streams.get(key)
    }

    private updateStreams(key: string): void {
        this.streamsToUpdate.add(key)
        this.triggerStreamsUpdate()
    }

    private onOperation = (operation: Operation): void => {
        const { type, id, version } = operation
        const key = combine(type, id)
        const streams = this.streams.get(key)
        /* istanbul ignore if */
        if (!streams) return
        for (const stream of streams) {
            if (stream.versionNext === version) {
                stream.pushOperation(operation)
            } else {
                this.updateStreams(key)
            }
        }
    }

    private getContentType(type: string): ContentType {
        if (!hasOwnProperty.call(this.contentTypes, type))
            throw new TypeError(`Unsupported document type: ${type}.`)
        return this.contentTypes[type]
    }

    private async ensureSchema(
        contentType: ContentType,
        schemaHash: SchemaHash,
    ): Promise<void> {
        if (!contentType.hasSchema(schemaHash)) {
            const schema = await this.contentStore.loadSchema(schemaHash)
            if (!schema) throw createNotFoundError('Schema')
            contentType.registerSchema(schema)
        }
    }

    private async storeSnapshotIfNecessary(snapshot: Snapshot): Promise<void> {
        if (!this.shouldStoreSnapshot(snapshot)) return
        try {
            await this.contentStore.storeSnapshot(snapshot)
        } catch (error) {
            if (isAlreadyExistsError(error)) return
            queueMicrotask(() => this.onWarning(error))
        }
    }

    private async loadSnapshot(
        type: string,
        id: string,
        version: number,
    ): Promise<Snapshot> {
        let snapshot: Snapshot
        const contentType = this.getContentType(type)
        const key = combine(type, id)
        const cache = this.cache.get(key)

        // Get a snapshot from the cache.
        if (cache && cache.snapshot.version <= version) {
            snapshot = cache.snapshot
            for (const operation of cache.operations) {
                if (operation.version > version) break
                snapshot = contentType.apply(snapshot, operation)
                this.storeSnapshotIfNecessary(snapshot)
            }
            this.touch(key)
        } else {
            snapshot = createBaseSnapshot(type, id)
        }

        if (snapshot.version === version) return snapshot

        // Get a snapshot from the database.
        if (snapshot.version === 0) {
            snapshot = await this.contentStore.loadSnapshot(type, id, version)
        }

        // Get operations from the database.
        if (snapshot.version < version) {
            const operations = await this.loadOperations(
                type,
                id,
                snapshot.version + 1,
                version + 1,
            )
            for (const operation of operations) {
                snapshot = contentType.apply(snapshot, operation)
                this.storeSnapshotIfNecessary(snapshot)
            }
        }

        // Cache only if we have just loaded the latest snapshot.
        if (snapshot.version < version) this.cacheSnapshot(key, snapshot)

        return snapshot
    }

    private loadOperations = async (
        type: string,
        id: string,
        versionStart: number,
        versionEnd: number,
    ): Promise<Operation[]> => {
        const operations: Operation[] = []
        /* istanbul ignore if */
        if (versionEnd <= versionStart) return operations
        const contentType = this.getContentType(type)
        const key = combine(type, id)
        const cache = this.cache.get(key)
        let versionNext = versionStart

        // Get the base operation.
        if (versionStart === minVersion) {
            operations.push(createBaseOperation(type, id))
            versionNext++
        }

        // Get operations from the cache.
        if (cache && cache.operations.length > 0) {
            const cacheVersionStart = first(cache.operations)!.version
            const cacheVersionEnd = last(cache.operations)!.version + 1

            if (
                versionNext >= cacheVersionStart &&
                versionNext < cacheVersionEnd
            ) {
                const from = versionNext - cacheVersionStart
                const to = Math.min(
                    cache.operations.length,
                    versionEnd - cacheVersionStart,
                )

                for (let i = from; i < to; i++) {
                    operations.push(cache.operations[i])
                }

                versionNext += to - from
                this.touch(key)
            }
        }

        // Get operations from the database.
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
            this.cacheOperations(key, operations, contentType)
        }

        return operations
    }

    private touch(key: string): void {
        this.expiringCacheItems.delete(key)

        // Do not expire the cache for documents for which we have at least one stream open.
        // This is a massive optimization for the common case of editing the document where
        // the client opens a stream to receive document updates and submits new operations too.
        // Submitting new updates is a very common operation which requires a recent snapshot,
        // so having it cached locally helps a lot.
        if (this.streams.has(key)) return

        const cache = this.cache.get(key)
        if (!cache) return

        cache.expireAt = Date.now() + this.cacheTTL
        this.expiringCacheItems.add(key)
        this.scheduleExpireCache()
    }

    private expireCacheHandle: NodeJS.Timeout | undefined
    private expireCache = (): void => {
        const now = Date.now()
        for (const key of this.expiringCacheItems) {
            const cache = this.cache.get(key)
            if (cache && cache.expireAt >= now) break
            this.cache.delete(key)
            this.expiringCacheItems.delete(key)
        }
        if (this.expiringCacheItems.size === 0) this.cancelExpireCache()
    }

    private scheduleExpireCache(): void {
        if (this.expireCacheHandle != null) return
        this.expireCacheHandle = setInterval(this.expireCache, 1000)
        /* istanbul ignore else */
        if (typeof this.expireCacheHandle.unref === 'function')
            this.expireCacheHandle.unref()
    }

    private cancelExpireCache(): void {
        /* istanbul ignore if */
        if (this.expireCacheHandle == null) return
        clearInterval(this.expireCacheHandle)
        this.expireCacheHandle = undefined
    }

    private cacheSnapshot(key: string, snapshot: Snapshot): void {
        if (!this.cache.has(key)) {
            this.cache.set(key, {
                snapshot,
                operations: [],
                expireAt: 0,
            })
            this.touch(key)
        }
    }

    private cacheOperations(
        key: string,
        newOperations: Operation[],
        contentType: ContentType,
    ): void {
        // Get state.
        const cache = this.cache.get(key)
        if (!cache) return
        const { operations } = cache

        // Add new operations.
        if (newOperations.length > 0) {
            let versionNext =
                operations.length > 0
                    ? last(operations)!.version + 1
                    : cache.snapshot.version + 1
            if (
                first(newOperations)!.version <= versionNext &&
                versionNext <= last(newOperations)!.version
            ) {
                for (const operation of newOperations) {
                    if (operation.version === versionNext) {
                        operations.push(operation)
                        versionNext++
                    }
                }
            }
        }

        // Remove old operations.
        const minCacheTime = Date.now() - this.cacheTTL
        const maxCacheLength = this.cacheLimit
        while (operations.length > 0) {
            const operation = first(operations)!
            if (
                operation.meta == null ||
                operation.meta.time == null ||
                operation.meta.time < minCacheTime ||
                operations.length > maxCacheLength
            ) {
                cache.snapshot = contentType.apply(cache.snapshot, operation)
                operations.shift()
            } else break
        }

        this.touch(key)
    }

    private checkSchemaSize(schema: Schema): void {
        if (JSON.stringify(schema).length > maxSchemaSize)
            throw createEntityTooLargeError('Schema')
    }

    private checkOperationSize(operation: Operation): void {
        if (JSON.stringify(operation).length > maxOperationSize)
            throw createEntityTooLargeError('Operation')
    }

    private checkSnapshotSize(snapshot: Snapshot): void {
        if (JSON.stringify(snapshot).length > maxSnapshotSize)
            throw createEntityTooLargeError('Snapshot')
    }
}

class StreamUpdater implements WorkLoop {
    private readonly loadLimit = 100
    public readonly onError = noop
    public readonly retryDelay = exponentialBackOffStrategy({
        minDelay: 1000,
        maxDelay: 10000,
        delayFactor: 1.5,
    })

    public constructor(
        public jobs: Set<string>,
        public getStreams: (job: string) => OperationStream[] | undefined,
        public loadOperations: (
            type: string,
            id: string,
            versionStart: number,
            versionEnd: number,
        ) => Promise<Operation[]>,
        private notify: () => void,
    ) {}

    public async work(): Promise<void> {
        const promises = Array.from(this.jobs).map(this.doJob)
        const results = await Promise.allSettled(promises)
        const hasErrors = results.some(isResultRejected)
        // Throw anything to trigger a retry. This error won't be reported.
        if (hasErrors) throw new Error()
    }

    private doJob = async (job: string): Promise<void> => {
        // Claim the job.
        this.jobs.delete(job)

        // Get the streams to update.
        const maybeStreams = this.getStreams(job)
        /* istanbul ignore if */
        if (!maybeStreams) return
        const streams = maybeStreams.filter(needsUpdate).sort(orderStreams)
        if (streams.length === 0) return

        // Find the first consecutive range of operations awaited by streams.
        const { type, id, versionNext } = first(streams)!
        let { versionEnd } = first(streams)!
        for (let i = 1; i < streams.length; i++) {
            const stream = streams[i]
            if (stream.versionNext <= versionEnd) {
                versionEnd = Math.max(versionEnd, stream.versionEnd)
            }
        }
        versionEnd = Math.min(versionEnd, versionNext + this.loadLimit)

        try {
            // Load operations.
            const operations = await this.loadOperations(
                type,
                id,
                versionNext,
                versionEnd,
            )

            // Update the streams
            for (const stream of streams) {
                if (needsUpdate(stream) && stream.versionNext < versionEnd) {
                    for (const operation of operations) {
                        if (stream.versionNext === operation.version) {
                            stream.pushOperation(operation)
                        }
                    }
                }
            }

            if (
                operations.length > 0 &&
                last(operations)!.version === versionEnd - 1
            ) {
                // All operations which we had requested were loaded,
                // so it's possible that more are still available and
                // we might need to complete the job in the next iteration.
                this.jobs.add(job)
                this.notify()
            }
        } catch (error) {
            // Report the error on the first stream, if it is still open.
            const stream = first(streams)!
            /* istanbul ignore else */
            if (needsUpdate(stream)) stream.emit('error', error)

            // Retry the job later.
            this.jobs.add(job)
            throw error
        }
    }
}

function orderStreams(
    stream1: OperationStream,
    stream2: OperationStream,
): number {
    return (
        stream1.versionNext - stream2.versionNext ||
        stream2.versionEnd - stream1.versionEnd
    )
}

function isResultRejected(
    result: PromiseSettledResult<any>,
): result is PromiseRejectedResult {
    return result.status === 'rejected'
}

function needsUpdate(stream: OperationStream): boolean {
    return !stream.destroyed && stream.versionNext < stream.versionEnd
}
