import { createInvalidEntityError, hash } from '@syncot/util'
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
 * Throws an error if the specified schema is invalid.
 * Returns the specified schema unchanged.
 */
export function validateSchema(schema: Schema): Schema {
    if (typeof schema !== 'object' || schema == null)
        throw createInvalidEntityError('Schema', schema, null)

    if (typeof schema.type !== 'string')
        throw createInvalidEntityError('Schema', schema, 'type')

    if (!schema.hasOwnProperty('data'))
        throw createInvalidEntityError('Schema', schema, 'data')

    if (schema.hash !== createSchemaHash(schema.type, schema.data))
        throw createInvalidEntityError('Schema', schema, 'hash')

    if (typeof schema.meta !== 'object')
        throw createInvalidEntityError('Schema', schema, 'meta')

    if (schema.meta != null) {
        if (schema.meta.user != null && typeof schema.meta.user !== 'string')
            throw createInvalidEntityError('Schema', schema, 'meta.user')

        if (schema.meta.time != null && typeof schema.meta.time !== 'number')
            throw createInvalidEntityError('Schema', schema, 'meta.time')

        if (
            schema.meta.session != null &&
            typeof schema.meta.session !== 'string'
        )
            throw createInvalidEntityError('Schema', schema, 'meta.session')
    }

    return schema
}
