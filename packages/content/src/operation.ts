import { createInvalidEntityError } from '@syncot/util'
import { Meta } from './meta'
import { SchemaHash } from './schema'
import { maxVersion, minVersion } from './limits'

/**
 * An operation which can be applied to a document.
 *
 * Note that an operation at version `minVersion` exists implicitly for each document and is never stored.
 */
export interface Operation {
    /**
     * A client-assigned identity of the Operation which must be unique per `type`, `id` and `meta.user`.
     * It allows each Operation to have a unique and persistent identity from the moment it is created by the client,
     * which makes it possible to safely submit the same operation multiple times
     * while guarateeing that it will be persisted at most once.
     * If `version` is `minVersion`, `key` is an empty string.
     */
    readonly key: string
    /**
     * The document type.
     */
    readonly type: string
    /**
     * The document ID.
     */
    readonly id: string
    /**
     * The document version created by this operation.
     * It must be an integer between minVersion and maxVersion inclusive.
     */
    readonly version: number
    /**
     * The ID of the schema of the content at the version created by this operation.
     * If `version` is `minVersion`, `schema` is an empty string.
     */
    readonly schema: SchemaHash
    /**
     * The action to apply to the document's content at `operation.version - 1` version
     * in order to produce the document's content at `operation.version` version.
     * If `version` is `minVersion`, `data` is null.
     */
    readonly data: any
    /**
     * The operation's metadata.
     * If `version` is `minVersion`, `meta` is null.
     */
    readonly meta: Meta | null
}

/**
 * Throws an error if the specified operation is invalid.
 * Returns the specified operation unchanged.
 */
export function validateOperation(operation: Operation): Operation {
    if (typeof operation !== 'object' || operation == null)
        throw createInvalidEntityError('Operation', operation, null)

    if (typeof operation.key !== 'string')
        throw createInvalidEntityError('Operation', operation, 'key')

    if (typeof operation.type !== 'string')
        throw createInvalidEntityError('Operation', operation, 'type')

    if (typeof operation.id !== 'string')
        throw createInvalidEntityError('Operation', operation, 'id')

    if (
        !Number.isInteger(operation.version) ||
        operation.version < minVersion ||
        operation.version > maxVersion
    )
        throw createInvalidEntityError('Operation', operation, 'version')

    if (typeof operation.schema !== 'string')
        throw createInvalidEntityError('Operation', operation, 'schema')

    if (!operation.hasOwnProperty('data'))
        throw createInvalidEntityError('Operation', operation, 'data')

    if (typeof operation.meta !== 'object')
        throw createInvalidEntityError('Operation', operation, 'meta')

    if (operation.meta != null) {
        if (
            operation.meta.user != null &&
            typeof operation.meta.user !== 'string'
        )
            throw createInvalidEntityError('Operation', operation, 'meta.user')

        if (
            operation.meta.time != null &&
            typeof operation.meta.time !== 'number'
        )
            throw createInvalidEntityError('Operation', operation, 'meta.time')

        if (
            operation.meta.session != null &&
            typeof operation.meta.session !== 'string'
        )
            throw createInvalidEntityError(
                'Operation',
                operation,
                'meta.session',
            )
    }

    return operation
}

/**
 * Creates an operation at version `minVersion` with the specified type and id.
 * @param type The document type.
 * @param id The document id.
 * @returns A new operation.
 */
export function createBaseOperation(type: string, id: string): Operation {
    return {
        key: '',
        type,
        id,
        version: minVersion,
        schema: '',
        data: null,
        meta: null,
    }
}
