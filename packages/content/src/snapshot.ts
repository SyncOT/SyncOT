import { minVersion } from './limits'
import { Meta } from './meta'
import { SchemaHash } from './schema'

/**
 * A document snapshot at a specific version.
 *
 * Note that a snapshot at version `minVersion` exists implicitly for each document and is never stored.
 */
export interface Snapshot {
    /**
     * The document type.
     */
    readonly type: string
    /**
     * The document ID.
     */
    readonly id: string
    /**
     * The document version which the snapshot represents.
     * It must be an integer between minVersion and maxVersion inclusive.
     */
    readonly version: number
    /**
     * The ID of the schema of the document's content at the snapshot's version.
     * If `version` is `minVersion`, `schema` is an empty string.
     */
    readonly schema: SchemaHash
    /**
     * The document's content at the snapshot's version.
     * If `version` is `minVersion`, `data` is null.
     */
    readonly data: any
    /**
     * The snapshot's metadata,
     * equal to meta of the operation with the same type, id and version.
     * If `version` is `minVersion`, `meta` is null.
     */
    readonly meta: Meta | null
}

/**
 * Creates a snapshot at version `minVersion` with the specified type and id.
 * @param type The document type.
 * @param id The document id.
 * @returns A new snapshot.
 */
export function createBaseSnapshot(type: string, id: string): Snapshot {
    return {
        type,
        id,
        version: minVersion,
        schema: '',
        data: null,
        meta: null,
    }
}
