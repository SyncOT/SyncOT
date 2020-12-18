import { Operation } from './operation'
import { Schema, SchemaKey } from './schema'
import { Snapshot } from './snapshot'

/**
 * An interface for all functionality which varies by content type.
 */
export interface ContentType {
    /**
     * Checks if `schema.data` is valid for the ProseMirror content type.
     * @param schema The schema to validate.
     * @returns An Error, if `schema` is invalid, otherwise `undefined`.
     */
    validateSchema(schema: Schema): Error | undefined

    /**
     * Registers a schema. Does nothing, if a schema with the same key has been already registered.
     * @param schema A schema to register.
     */
    registerSchema(schema: Schema): void

    /**
     * Indicates, if a schema with the given key is already registered.
     * @param key The schema key to check.
     * @returns True, if a schema with the given key is already registered, otherwise false.
     */
    hasSchema(key: SchemaKey): boolean

    /**
     * Applies the operation to the snapshot to produce a new snapshot.
     * @param snapshot The snapshot.
     * @param operation The operation to apply.
     * @returns A snapshot resulting from applying `operation` to `snapshot`.
     */
    apply(snapshot: Snapshot, operation: Operation): Snapshot
}
