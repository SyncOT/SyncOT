import { Operation, OperationKey } from './content'
import { createAlreadyExistsError } from './error'
import { ContentStore } from './store'

/**
 * Creates a ContentStore which stores the data in memory.
 */
export function createContentStore(): ContentStore {
    return new MemoryContentStore()
}

class MemoryContentStore implements ContentStore {
    private operations: Map<string, Map<string, Operation[]>> = new Map()
    private operationsByKey: Map<OperationKey, Operation> = new Map()

    public async storeOperation(operation: Operation): Promise<void> {
        if (this.operationsByKey.has(operation.key)) {
            throw createAlreadyExistsError('Operation', operation, 'key')
        }

        const { type, id, version } = operation

        let operationsForType = this.operations.get(type)
        if (operationsForType == null) {
            operationsForType = new Map()
            this.operations.set(type, operationsForType)
        }

        let operationsForId = operationsForType.get(id)
        if (operationsForId == null) {
            operationsForId = new Array(1)
            operationsForType.set(id, operationsForId)
        }

        if (operationsForId[version]) {
            throw createAlreadyExistsError('Operation', operation, 'version')
        }

        operationsForId[version] = operation
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
        const operationsForType = this.operations.get(type)
        if (!operationsForType) {
            return []
        }

        const operationsForId = operationsForType.get(id)
        if (!operationsForId) {
            return []
        }

        return operationsForId.slice(versionStart, versionEnd)
    }

    public async getVersion(type: string, id: string): Promise<number> {
        const operationsForType = this.operations.get(type)
        if (!operationsForType) {
            return 0
        }

        const operationsForId = operationsForType.get(id)
        if (!operationsForId) {
            return 0
        }

        return operationsForId.length - 1
    }
}
