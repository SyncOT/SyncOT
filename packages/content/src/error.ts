import { assert, createError, isCustomError } from '@syncot/util'

export interface AlreadyExistsError extends Error {
    name: 'SyncOTError AlreadyExists'
    entityName: string
    entity: any
    key: string | null
    value: any
}
/**
 * Creates a new AlreadyExistsError.
 * @param entityName The entity name.
 * @param entity The entity instance.
 * @param key The name of the property which caused the conflict.
 * @param value The value of the `key` property which caused the conflict.
 */
export function createAlreadyExistsError(
    entityName: string,
    entity: any,
    key: string | null = null,
    value: any = null,
): AlreadyExistsError {
    assert(
        typeof entityName === 'string',
        'Argument "entityName" must be a string.',
    )
    assert(
        typeof key === 'string' || key === null,
        'Argument "key" must be a string or null.',
    )
    return createError({
        entity,
        entityName,
        key,
        value,
        message: `"${entityName}" already exists.`,
        name: 'SyncOTError AlreadyExists',
    }) as AlreadyExistsError
}
export function isAlreadyExistsError(error: any): error is AlreadyExistsError {
    return isCustomError(error) && error.name === 'SyncOTError AlreadyExists'
}

export interface NotFoundError extends Error {
    name: 'SyncOTError NotFound'
    entityName: string
}
export function createNotFoundError(entityName: string): NotFoundError {
    assert(
        typeof entityName === 'string',
        'Argument "entityName" must be a string.',
    )
    return createError({
        entityName,
        message: `"${entityName}" not found.`,
        name: 'SyncOTError NotFound',
    }) as NotFoundError
}
export function isNotFoundError(error: any): error is NotFoundError {
    return isCustomError(error) && error.name === 'SyncOTError NotFound'
}

export interface SchemaConflictError extends Error {
    name: 'SyncOTError SchemaConflict'
}
export function createSchemaConflictError(
    message: string,
): SchemaConflictError {
    return createError({
        message,
        name: 'SyncOTError SchemaConflict',
    }) as SchemaConflictError
}
export function isSchemaConflictError(
    error: any,
): error is SchemaConflictError {
    return isCustomError(error) && error.name === 'SyncOTError SchemaConflict'
}
