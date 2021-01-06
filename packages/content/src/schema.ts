import {
    createInvalidEntityError,
    hash,
    validate,
    Validator,
} from '@syncot/util'
import { Meta } from './meta'

/**
 * A hash of `Schema.type` and `Schema.data`.
 */
export type SchemaHash = string

/**
 * Creates a SchemaHash from the given `Schema.type` and `Schema.data`.
 * @param type A `Schema.type`.
 * @param data A `Schema.data`.
 * @returns A `Schema.hash`.
 */
export function createSchemaHash(type: string, data: any): SchemaHash {
    return hash([type, data])
}

/**
 * Represents the content schema, which defines the valid shape of Operation.data and Snapshot.data.
 */
export interface Schema {
    /**
     * A hash of the type and data fields.
     */
    readonly hash: SchemaHash
    /**
     * The document type.
     */
    readonly type: string
    /**
     * The schema definition.
     */
    readonly data: any
    /**
     * The schema's metadata.
     */
    readonly meta: Meta | null
}

/**
 * Validates the specified schema.
 * @returns The first encountered error, if found, otherwise undefined.
 */
export const validateSchema: Validator<Schema> = validate([
    (schema) =>
        typeof schema === 'object' && schema != null
            ? undefined
            : createInvalidEntityError('Schema', schema, null),
    (schema) =>
        typeof schema.type === 'string'
            ? undefined
            : createInvalidEntityError('Schema', schema, 'type'),
    (schema) =>
        schema.hasOwnProperty('data')
            ? undefined
            : createInvalidEntityError('Schema', schema, 'data'),
    (schema) =>
        schema.hash === createSchemaHash(schema.type, schema.data)
            ? undefined
            : createInvalidEntityError('Schema', schema, 'hash'),
    (schema) =>
        typeof schema.meta === 'object'
            ? undefined
            : createInvalidEntityError('Schema', schema, 'meta'),
    (schema) =>
        schema.meta == null ||
        schema.meta.user == null ||
        typeof schema.meta.user === 'string'
            ? undefined
            : createInvalidEntityError('Schema', schema, 'meta.user'),
    (schema) =>
        schema.meta == null ||
        schema.meta.time == null ||
        typeof schema.meta.time === 'number'
            ? undefined
            : createInvalidEntityError('Schema', schema, 'meta.time'),
    (schema) =>
        schema.meta == null ||
        schema.meta.session == null ||
        typeof schema.meta.session === 'string'
            ? undefined
            : createInvalidEntityError('Schema', schema, 'meta.session'),
])
