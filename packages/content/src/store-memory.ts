import { assert, combine } from '@syncot/util'
import { createAlreadyExistsError } from './error'
import { minVersion } from './limits'
import { createBaseOperation, Operation } from './operation'
import { Schema } from './schema'
import { createBaseSnapshot, Snapshot } from './snapshot'
import { ContentStore } from './store'

/**
 * Creates a ContentStore which stores the data in memory.
 */
export function createContentStore(): ContentStore {
    return new MemoryContentStore()
}

class MemoryContentStore implements ContentStore {
    private schemas: Map<string, Schema> = new Map()
    private operations: Map<string, Operation[]> = new Map()
    private operationsByUserAndKey: Map<string, Operation> = new Map()
    private snapshots: Map<string, Snapshot[]> = new Map()

    public async storeSchema(schema: Schema): Promise<void> {
        if (this.schemas.has(schema.hash))
            throw createAlreadyExistsError(
                'Schema',
                schema,
                'hash',
                schema.hash,
            )
        this.schemas.set(schema.hash, schema)
    }

    public async loadSchema(hash: string): Promise<Schema | null> {
        return this.schemas.get(hash) || null
    }

    public async storeOperation(operation: Operation): Promise<void> {
        const { key, type, id, version, meta } = operation
        const user = (meta && meta.user) || ''

        const userAndKey = combine(type, id, user, key)
        if (this.operationsByUserAndKey.has(userAndKey)) {
            throw createAlreadyExistsError(
                'Operation',
                operation,
                'key',
                operation.key,
            )
        }

        const typeAndId = combine(type, id)
        let operations = this.operations.get(typeAndId)
        if (!operations) {
            operations = [createBaseOperation(type, id)]
            this.operations.set(typeAndId, operations)
        }

        assert(
            version > 0,
            'operation.version must be greater than minVersion.',
        )
        if (version < operations.length) {
            throw createAlreadyExistsError(
                'Operation',
                operation,
                'version',
                operations.length - 1,
            )
        }
        assert(
            version === operations.length,
            'Operation.version out of sequence.',
        )

        operations[version] = operation
        this.operationsByUserAndKey.set(userAndKey, operation)
    }

    public async loadOperations(
        type: string,
        id: string,
        versionStart: number,
        versionEnd: number,
    ): Promise<Operation[]> {
        const typeAndId = combine(type, id)
        const operations = this.operations.get(typeAndId)
        return operations
            ? operations.slice(versionStart, versionEnd)
            : versionStart === minVersion && versionEnd > versionStart
            ? [createBaseOperation(type, id)]
            : []
    }

    public async storeSnapshot(snapshot: Snapshot): Promise<void> {
        const { type, id, version } = snapshot
        assert(
            version > minVersion,
            'snapshot.version must be greater than minVersion.',
        )

        const typeAndId = combine(type, id)
        let snapshots = this.snapshots.get(typeAndId)
        if (!snapshots) {
            snapshots = []
            this.snapshots.set(typeAndId, snapshots)
        }

        if (snapshots[version])
            throw createAlreadyExistsError(
                'Snapshot',
                snapshot,
                'version',
                snapshot.version,
            )

        snapshots[version] = snapshot
    }

    public async loadSnapshot(
        type: string,
        id: string,
        version: number,
    ): Promise<Snapshot> {
        const typeAndId = combine(type, id)
        const snapshots = this.snapshots.get(typeAndId)
        if (snapshots) {
            for (let i = Math.min(version, snapshots.length - 1); i > 0; i--) {
                const snapshot = snapshots[i]
                if (snapshot) return snapshot
            }
        }
        return createBaseSnapshot(type, id)
    }
}
