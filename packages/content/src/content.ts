import { Duplex } from 'readable-stream'
import {
    combine,
    createId,
    createInvalidEntityError,
    EmitterInterface,
    separate,
    SyncOTEmitter,
    validate,
    Validator,
} from '@syncot/util'

/**
 * A globally unique value suitable as an operation's primary key.
 *
 * All `OperationKey`s are generated on the client-side
 * and verified on the server-side. This way each operation has
 * a unique and persistent identity from the moment it is created by the client,
 * which makes it possible to safely submit the same operation multiple times
 * while guarateeing that it will be persisted at most once.
 *
 * The `userId` is included in the `OperationKey` to prevent malicious users from performing
 * key collision attacks targeting other users. There is a tiny non-zero chance that
 * the keys generated by the same user can collide, however, in practice a collision
 * would be likely to happen only if someone purposefully tried to cause it.
 */
export type OperationKey = string

/**
 * Creates a new OperationKey for the userId.
 */
export function createOperationKey(userId: string): OperationKey {
    return combine(userId, createId())
}

/**
 * Extracts a user ID from the given operation key.
 */
export function operationKeyUser(key: OperationKey): string {
    return separate(key)[0]
}

/**
 * The type of metadata which can be attached to content entities.
 */
export interface Meta {
    /**
     * The ID of the user who created the entity.
     */
    user?: string | null
    /**
     * The timestamp at which the entity was created.
     */
    time?: number | null
    /**
     * The ID of the session which the entity was created in.
     */
    session?: string | null
    [key: string]: any
}

/**
 * An operation which can be applied to a document.
 */
export interface Operation {
    /**
     * A globally unique ID of this operation.
     */
    key: OperationKey
    /**
     * The document type.
     */
    type: string
    /**
     * The document ID.
     */
    id: string
    /**
     * The document version created by this operation.
     * It must be an integer between 1 (inclusive) and Number.MAX_SAFE_INTEGER (exclusive).
     */
    version: number
    /**
     * The ID of the schema of the content at the version created by this operation.
     */
    schema: number
    /**
     * The action to apply to the document's content at `operation.version - 1` version
     * in order to produce the document's content at `operation.version` version.
     */
    data: any
    /**
     * The operation's metadata.
     */
    meta: Meta | null
}

/**
 * Validates the specified operation.
 * @returns The first encountered error, if found, otherwise undefined.
 */
export const validateOperation: Validator<Operation> = validate([
    (operation) =>
        typeof operation === 'object' && operation != null
            ? undefined
            : createInvalidEntityError('Operation', operation, null),
    (operation) =>
        typeof operation.key === 'string'
            ? undefined
            : createInvalidEntityError('Operation', operation, 'key'),
    (operation) =>
        typeof operation.type === 'string'
            ? undefined
            : createInvalidEntityError('Operation', operation, 'type'),
    (operation) =>
        typeof operation.id === 'string'
            ? undefined
            : createInvalidEntityError('Operation', operation, 'id'),
    (operation) =>
        Number.isInteger(operation.version) &&
        operation.version > 0 &&
        operation.version < Number.MAX_SAFE_INTEGER
            ? undefined
            : createInvalidEntityError('Operation', operation, 'version'),
    (operation) =>
        Number.isInteger(operation.schema)
            ? undefined
            : createInvalidEntityError('Operation', operation, 'schema'),
    (operation) =>
        operation.hasOwnProperty('data')
            ? undefined
            : createInvalidEntityError('Operation', operation, 'data'),
    (operation) =>
        typeof operation.meta === 'object'
            ? undefined
            : createInvalidEntityError('Operation', operation, 'meta'),
    (operation) =>
        operation.meta == null ||
        operation.meta.user == null ||
        typeof operation.meta.user === 'string'
            ? undefined
            : createInvalidEntityError('Operation', operation, 'meta.user'),
    (operation) =>
        operation.meta == null ||
        operation.meta.time == null ||
        typeof operation.meta.time === 'number'
            ? undefined
            : createInvalidEntityError('Operation', operation, 'meta.time'),
    (operation) =>
        operation.meta == null ||
        operation.meta.session == null ||
        typeof operation.meta.session === 'string'
            ? undefined
            : createInvalidEntityError('Operation', operation, 'meta.session'),
])

/**
 * A document snapshot at a specific version.
 */
export interface Snapshot {
    /**
     * A globally unique ID of this snapshot.
     */
    key: string
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
     * It must be an integer between 0 (inclusive) and Number.MAX_SAFE_INTEGER (exclusive).
     */
    version: number
    /**
     * The ID of the schema of the document's content at the snapshot's version.
     */
    schema: number
    /**
     * The document's content at the snapshot's version.
     */
    data: any
    /**
     * The snapshot's metadata.
     */
    meta: Meta | null
}

/**
 * Represents the content schema, which defines the valid shape of Operation.data and Snapshot.data.
 */
export interface Schema {
    /**
     * A globally unique ID of this schema, which is a non-negative integer.
     */
    key: number
    /**
     * The document type.
     */
    type: string
    /**
     * The schema definition.
     */
    data: any
    /**
     * The schema's metadata.
     */
    meta: Meta | null
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
        Number.isInteger(schema.key) &&
        schema.key >= 0 &&
        schema.key <= Number.MAX_SAFE_INTEGER
            ? undefined
            : createInvalidEntityError('Schema', schema, 'key'),
    (schema) =>
        typeof schema.type === 'string'
            ? undefined
            : createInvalidEntityError('Schema', schema, 'type'),
    (schema) =>
        schema.hasOwnProperty('data')
            ? undefined
            : createInvalidEntityError('Schema', schema, 'data'),
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

/**
 * The names of the requests supported by the content service.
 */
export const requestNames = new Set([
    'registerSchema',
    'getSchema',
    'getSnapshot',
    'submitOperation',
    'streamOperations',
])

/**
 * Events emitted by `ContentService`.
 */
export interface ContentServiceEvents {
    error: Error
}

/**
 * Events emitted by `ContentClient`.
 */
export interface ContentClientEvents {
    error: Error
    active: void
    inactive: void
}

/**
 * The base interface for `ContentService` and `ContentClient`.
 */
export interface ContentBase {
    /**
     * Registers the given schema.
     *
     * If a schema with the same `type` and `data` already exists,
     * its `key` is returned and no new schema is registered.
     * Otherwise a new schema is registered and its `key` is returned.
     *
     * @param schema The schema to register.
     * @returns The `key` of an existing schema with the same `type` and `data`, or
     *  the `key` of a newly registered schema.
     */
    registerSchema(schema: Schema): Promise<number>

    /**
     * Gets a Schema by key.
     * @param key The schema key.
     * @returns An existing Schema with the given `key`, or `null`, if not found.
     */
    getSchema(key: number): Promise<Schema | null>

    /**
     * Gets a snapshot of a document at a given version.
     *
     * @param type The document type.
     * @param id The document ID.
     * @param version The document version. Defaults to the latest version.
     * @returns A snapshot matching the params.
     */
    getSnapshot(
        type: string,
        id: string,
        version?: number | null | undefined,
    ): Promise<Snapshot>

    /**
     * Submits the operation to update a document.
     *
     * The `data` and `version` properties may be updated before the operation is recorded,
     * if the operation is rebased internally on top of other operation recorded earlier.
     * The `meta.time` property is always updated to the server time at which the operation
     * is recorded.
     * The `meta.user` property is always updated to match the ID of the user who sumbitted
     * the operation.
     *
     * @param operation The operation to submit.
     */
    submitOperation(operation: Operation): Promise<void>

    /**
     * Streams the specified operations.
     * @param type The document type.
     * @param id The document ID.
     * @param versionStart The version number of first operation to include. Defaults to 1.
     * @param versionEnd The version number of the first operation to exclude. Defaults to Number.MAX_SAFE_INTEGER.
     * @returns A stream of Operation objects.
     */
    streamOperations(
        type: string,
        id: string,
        versionStart?: number | null | undefined,
        versionEnd?: number | null | undefined,
    ): Promise<Duplex>
}

/**
 * The `ContentService` interface.
 *
 * @emits error When an error occurs.
 */
export interface ContentService
    extends ContentBase,
        EmitterInterface<SyncOTEmitter<ContentServiceEvents>> {}

/**
 * The `ContentClient` interface.
 *
 * @emits error When an error occurs.
 * @emits active When the service becomes able to communicate with the ContentService.
 * @emits inactive When the service stops being able to communicate with the ContentService.
 */
export interface ContentClient
    extends ContentBase,
        EmitterInterface<SyncOTEmitter<ContentClientEvents>> {
    /**
     * Indicates if the ContentClient is able to communicate with the ContentService.
     */
    readonly active: boolean
    /**
     * The read-only `sessionId` from the AuthClient, exposed here for convenience.
     * It is `undefined` if, and only if, `active` is `false`.
     */
    readonly sessionId: string | undefined
    /**
     * The read-only `userId` from the AuthClient, exposed here for convenience.
     * It is `undefined` if, and only if, `active` is `false`.
     */
    readonly userId: string | undefined
}
