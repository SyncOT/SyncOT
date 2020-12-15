import { Operation } from './operation'
import { Schema } from './schema'
import { Snapshot } from './snapshot'

/**
 * The interface for storing document content and schemas.
 */
export interface ContentStore {
    /**
     * Stores the given schema, if it does not exist yet, otherwise does nothing.
     * @param schema The schema to store.
     */
    storeSchema(schema: Schema): Promise<void>

    /**
     * Loads a Schema by key.
     * @param key The schema key.
     * @returns An existing Schema with the given `key`, or `null`, if not found.
     */
    loadSchema(key: string): Promise<Schema | null>

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
}
