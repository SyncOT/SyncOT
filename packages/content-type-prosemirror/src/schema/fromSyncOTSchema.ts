import { Schema as SyncOTSchema } from '@syncot/content'
import { Schema } from 'prosemirror-model'
import { fromJSON } from './fromJSON'

/**
 * Creates a ProseMirror Schema from a SyncOT Schema.
 */
export function fromSyncOTSchema(syncOTSchema: SyncOTSchema): Schema {
    return fromJSON(syncOTSchema.data)
}
