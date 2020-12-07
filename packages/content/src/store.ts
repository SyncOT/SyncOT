import { Operation, Schema, Snapshot } from './content'

/**
 * The interface for storing document content.
 */
export interface ContentStore {
    /**
     * Registers the given schema.
     *
     * If a schema with the same `type` and `data` already exists,
     * its `key` is returned and no new schema is registered.
     * Otherwise a new schema is registered and its `key` is returned.
     *
     * @param schema The schema to register.
     * @returns The `key` of an existing schema with the same `type` and `data`, or
     *  the `key` of a newly registered schema.
     */
    registerSchema(schema: Schema): Promise<number>

    /**
     * Gets a Schema by key.
     * @param key The schema key.
     * @returns An existing Schema with the given `key`, or `null`, if not found.
     */
    getSchema(key: number): Promise<Schema | null>

    /**
     * Stores the specified operation.
     * @param operation The operation to store.
     */
    storeOperation(operation: Operation): Promise<void>

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
     * Stores the specified snapshot.
     * If a snapshot with the given key already exists,
     * the function does nothing and returns successfully.
     * @param snapshot The snapshot to store.
     */
    storeSnapshot(snapshot: Snapshot): Promise<void>

    /**
     * Loads a snapshot by type and ID,
     * with the version equal to or lower than the specified version.
     * @param type A document type.
     * @param id A document ID.
     * @param version A document version.
     * @returns A Snapshot, or `null`, if not found.
     */
    loadSnapshot(
        type: string,
        id: string,
        version: number,
    ): Promise<Snapshot | null>

    /**
     * Gets the version number of the specified document.
     * @param type Document type.
     * @param id Document ID.
     * @returns The version number.
     */
    getVersion(type: string, id: string): Promise<number>
}
