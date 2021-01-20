import { createSchemaHash, Schema as SyncOTSchema } from '@syncot/content'
import { Schema } from 'prosemirror-model'
import { toJSON } from './toJSON'

/**
 * Gets a SyncOT Schema for the given type and ProseMirror Schema.
 */
export function toSyncOTSchema(type: string, schema: Schema): SyncOTSchema {
    const data = toJSON(schema)
    const hash = createSchemaHash(type, data)
    const meta = null
    return { hash, type, data, meta }
}
