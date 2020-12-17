import {
    assert,
    combine,
    exponentialBackOffStrategy,
    first,
    isOpenWritableStream,
    last,
    noop,
    throwError,
    WorkLoop,
    workLoop,
} from '@syncot/util'
import { Duplex } from 'readable-stream'
import { createNotFoundError, isAlreadyExistsError } from './error'
import { Operation } from './operation'
import { PubSub } from './pubSub'
import { Schema, SchemaKey } from './schema'
import { Snapshot } from './snapshot'
import { ContentStore } from './store'
import { OperationStream } from './stream'
import { ContentType } from './type'
import { maxVersion, minVersion } from './limits'

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
     * The cached snapshot.
     */
    readonly snapshot: Snapshot | null
    /**
     * The cache operations which can be applied to the cached snapshot.
     */
    readonly operations: Operation[]
    /**
     * Active operation streams.
     */
    readonly streams: OperationStream[]
}

class DefaultContent implements Content {
    private readonly state: Map<string, State> = new Map()
    private readonly streamsToUpdate: Set<string> = new Set()
    private triggerStreamsUpdate = noop
    public constructor(
        private readonly contentStore: ContentStore,
        private readonly pubSub: PubSub,
        private readonly contentTypes: { [key: string]: ContentType },
        private readonly cacheTTL: number,
        private readonly cacheLimit: number,
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
        const stateKey = combine(type, id)
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
            this.cacheOperations(stateKey, [operation], contentType)
            this.pubSub.publish(combine('operation', type, id), operation)
        } catch (error) {
            if (isAlreadyExistsError(error)) {
                this.updateStreams(stateKey)
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
                    snapshot: null,
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

        this.updateStreams(stateKey)
        return stream
    }

    private getStreams = (stateKey: string) => {
        const state = this.state.get(stateKey)
        return state && state.streams
    }

    private updateStreams(stateKey: string): void {
        this.streamsToUpdate.add(stateKey)
        this.triggerStreamsUpdate()
    }

    private onOperation = (operation: Operation): void => {
        const { type, id, version } = operation
        const stateKey = combine(type, id)
        const state = this.state.get(stateKey)
        if (!state) return
        for (const stream of state.streams) {
            if (stream.versionNext === version) {
                stream.pushOperation(operation)
            } else {
                this.updateStreams(stateKey)
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
        if (
            state &&
            (state.snapshot === null || state.snapshot.version <= version)
        ) {
            snapshot = state.snapshot
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

    private loadOperations = async (
        type: string,
        id: string,
        versionStart: number,
        versionEnd: number,
    ): Promise<Operation[]> => {
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
            operations.length > 0 ? last(operations)!.version + 1 : versionStart
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

        // Cache the snapshot only if it is newer than what we have already cached.
        if (
            state.operations.length > 0
                ? last(state.operations)!.version < snapshot.version
                : state.snapshot === null ||
                  state.snapshot.version < snapshot.version
        ) {
            this.state.set(stateKey, {
                ...state,
                snapshot,
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
        let { snapshot } = state
        const operations = state.operations.slice(0)

        // Add new operations.
        if (newOperations.length > 0) {
            let versionNext =
                operations.length > 0
                    ? last(operations)!.version + 1
                    : snapshot
                    ? snapshot.version + 1
                    : minVersion
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
                snapshot = contentType.apply(snapshot, operation)
                operations.shift()
            } else break
        }

        // Update state.
        this.state.set(stateKey, {
            ...state,
            snapshot,
            operations,
        })
    }
}

class StreamUpdater implements WorkLoop {
    private readonly loadLimit = 50
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
        if (!maybeStreams || maybeStreams.length === 0) return
        const streams = maybeStreams.slice(0).sort(orderStreams)

        // Find the first consecutive range of operations awaited by streams.
        const { type, id, versionStart } = first(streams)!
        let { versionEnd } = first(streams)!
        for (let i = 1; i < streams.length; i++) {
            const stream = streams[i]
            if (stream.versionNext <= versionEnd) {
                versionEnd = Math.max(versionEnd, stream.versionEnd)
            }
        }
        versionEnd = Math.min(versionEnd, versionStart + this.loadLimit)

        try {
            // Load operations.
            const operations = await this.loadOperations(
                type,
                id,
                versionStart,
                versionEnd,
            )

            // Update the streams
            for (const stream of streams) {
                if (
                    isOpenWritableStream(stream) &&
                    stream.versionNext < versionEnd
                ) {
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
            if (isOpenWritableStream(stream)) stream.emit('error', error)

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
        stream2.versionNext - stream1.versionNext ||
        stream1.versionEnd - stream2.versionEnd
    )
}

function isResultRejected(
    result: PromiseSettledResult<any>,
): result is PromiseRejectedResult {
    return result.status === 'rejected'
}
