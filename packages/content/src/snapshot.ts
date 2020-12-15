import { Meta } from './meta'
import { SchemaKey } from './schema'

/**
 * A Snapshot key which must be the same as the key of the corresponding operation.
 */
export type SnapshotKey = string

/**
 * A document snapshot at a specific version.
 */
export interface Snapshot {
    /**
     * A globally unique ID of this snapshot,
     * equal to the key of the operation with the same type, id and version.
     */
    key: SnapshotKey
    /**
     * The document type.
     */
    type: string
    /**
     * The document ID.
     */
    id: string
    /**
     * The document version which the snapshot represents.
     * It must be an integer between 1 (inclusive) and Number.MAX_SAFE_INTEGER (exclusive).
     */
    version: number
    /**
     * The ID of the schema of the document's content at the snapshot's version.
     */
    schema: SchemaKey
    /**
     * The document's content at the snapshot's version.
     */
    data: any
    /**
     * The snapshot's metadata,
     * equal to meta of the operation with the same type, id and version.
     */
    meta: Meta | null
}
