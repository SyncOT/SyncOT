import { Operation } from './operation'
import { Schema, SchemaHash } from './schema'
import { Snapshot } from './snapshot'

/**
 * An interface for all functionality which varies by content type.
 */
export interface ContentType {
    /**
     * Checks if `schema.data` is valid for the ProseMirror content type.
     * Throws an error, if the schema is not valid.
     * @param schema The schema to validate.
     * @returns The unchanged `schema`.
     */
    validateSchema(schema: Schema): Schema

    /**
     * Registers a schema. Does nothing, if a schema with the same key has been already registered.
     * @param schema A schema to register.
     */
    registerSchema(schema: Schema): void

    /**
     * Indicates, if a schema with the given hash is already registered.
     * @param hash The schema hash to check.
     * @returns True, if a schema with the given hash is already registered, otherwise false.
     */
    hasSchema(hash: SchemaHash): boolean

    /**
     * Applies the operation to the snapshot to produce a new snapshot.
     * @param snapshot The snapshot.
     * @param operation The operation to apply.
     * @returns A snapshot resulting from applying `operation` to `snapshot`.
     */
    apply(snapshot: Snapshot, operation: Operation): Snapshot
}
