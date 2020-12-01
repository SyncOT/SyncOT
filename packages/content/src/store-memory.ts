import { assert, combine, hash } from '@syncot/util'
import { Operation, OperationKey, Schema } from './content'
import { createAlreadyExistsError } from './error'
import { ContentStore } from './store'

/**
 * Creates a ContentStore which stores the data in memory.
 */
export function createContentStore(): ContentStore {
    return new MemoryContentStore()
}

class MemoryContentStore implements ContentStore {
    private operations: Map<string, Operation[]> = new Map()
    private operationsByKey: Map<OperationKey, Operation> = new Map()
    private schemas: Map<string, Schema> = new Map()
    private schemasByKey: Schema[] = []

    public async registerSchema(schema: Schema): Promise<number> {
        const typeAndHash = combine(schema.type, hash(schema.data))
        const existingSchema = this.schemas.get(typeAndHash)
        if (existingSchema) return existingSchema.key

        const newSchema: Schema = { ...schema, key: this.schemasByKey.length }
        this.schemas.set(typeAndHash, newSchema)
        this.schemasByKey[newSchema.key] = newSchema
        return newSchema.key
    }

    public async getSchema(key: number): Promise<Schema | null> {
        return this.schemasByKey[key] || null
    }

    public async storeOperation(operation: Operation): Promise<void> {
        if (this.operationsByKey.has(operation.key)) {
            throw createAlreadyExistsError(
                'Operation',
                operation,
                'key',
                operation.key,
            )
        }

        const { type, id, version } = operation
        const typeAndId = combine(type, id)

        let operations = this.operations.get(typeAndId)
        if (!operations) {
            operations = new Array(1)
            this.operations.set(typeAndId, operations)
        }

        assert(version > 0, 'Operation.version must be a positive integer.')
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
        this.operationsByKey.set(operation.key, operation)
    }

    public async loadOperation(key: OperationKey): Promise<Operation | null> {
        return this.operationsByKey.get(key) || null
    }

    public async loadOperations(
        type: string,
        id: string,
        versionStart: number,
        versionEnd: number,
    ): Promise<Operation[]> {
        const operations = this.operations.get(combine(type, id))
        return operations ? operations.slice(versionStart, versionEnd) : []
    }

    public async getVersion(type: string, id: string): Promise<number> {
        const operations = this.operations.get(combine(type, id))
        return operations ? operations.length - 1 : 0
    }
}