import { createSchemaHash, Schema as SyncOTSchema } from '@syncot/content'
import { Schema } from 'prosemirror-model'
import { toJSON } from './toJSON'

/**
 * Gets a SyncOT Schema for the given type and ProseMirror Schema.
 *
 * It caches the result per ProseMirror Schema and type.
 */
export function toSyncOTSchema(type: string, schema: Schema): SyncOTSchema {
    // Try to get a cached SyncOTSchema.
    let nestedCachedSchemas = cachedSchemas.get(schema)
    if (!nestedCachedSchemas) {
        nestedCachedSchemas = new Map()
        cachedSchemas.set(schema, nestedCachedSchemas)
    }

    const cachedSchema = nestedCachedSchemas.get(type)
    if (cachedSchema) return cachedSchema

    // Create SyncOTSchema.
    const data = toJSON(schema)
    const hash = createSchemaHash(type, data)
    const meta = null
    const syncOTSchema = { hash, type, data, meta }

    // Cache the new SyncOTSchema.
    nestedCachedSchemas.set(type, syncOTSchema)
    return syncOTSchema
}

const cachedSchemas: WeakMap<Schema, Map<string, SyncOTSchema>> = new WeakMap()
