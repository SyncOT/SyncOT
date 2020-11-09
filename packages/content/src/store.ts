import { Operation, OperationKey } from './content'

/**
 * The interface for storing document content.
 */
export interface ContentStore {
    /**
     * Stores the specified operation.
     * @param operation The operation to store.
     */
    storeOperation(operation: Operation): Promise<void>

    /**
     * Loads a single operation by key.
     * @param key The key of the operation to load.
     * @returns A Promise which resolves to the requested operation, or `null`, if not found.
     */
    loadOperation(key: OperationKey): Promise<Operation | null>

    /**
     * Loads operations matching the params.
     * @param type Document type.
     * @param id Document ID.
     * @param versionStart The version of the first operation to load.
     * @param versionEnd The version of the first operation to omit.
     * @returns A list of operations.
     */
    loadOperations(
        type: string,
        id: string,
        versionStart: number,
        versionEnd: number,
    ): Promise<Operation[]>

    /**
     * Gets the version number of the specified document.
     * @param type Document type.
     * @param id Document ID.
     * @returns The version number.
     */
    getVersion(type: string, id: string): Promise<number>
}
