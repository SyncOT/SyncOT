import { createError } from '@syncot/error'
import { strict as assert } from 'assert'

const assertString = (argumentName: string, argument: string): void =>
    assert.equal(
        typeof argument,
        'string',
        `Argument "${argumentName}" must be a string.`,
    )

export interface InvalidEntityError extends Error {
    entityName: string
    entity: any
    key: string
}

/**
 * Creates a new InvalidEntity error.
 * @param entityName The entity name.
 * @param entity The entity instance.
 * @param key The name of the invalid property. Pass in `null`, if the entire entity is invalid.
 */
export function createInvalidEntityError(
    entityName: string,
    entity: any,
    key: string | null = null,
): InvalidEntityError {
    assertString('name', entityName)
    assert.ok(
        typeof key === 'string' || key === null,
        'Argument "key" must be a string or null.',
    )
    return createError({
        entity,
        entityName,
        key,
        message:
            key === null
                ? `Invalid "${entityName}".`
                : `Invalid "${entityName}.${key}".`,
        name: 'SyncOtError InvalidEntity',
    }) as InvalidEntityError
}

/**
 * Creates a new error informing that a type has not been found.
 * @param typeName Type name.
 */
export function createTypeNotFoundError(typeName: string): TypeNotFoundError {
    assertString('typeName', typeName)
    return createError({
        message: `Type "${typeName}" not found.`,
        name: 'SyncOtError TypeNotFound',
        typeName,
    }) as TypeNotFoundError
}

/**
 * Creates a new error informing that there's been no service to handle a request.
 * @param message The error message.
 */
export function createNoServiceError(message: string): Error {
    assertString('message', message)
    return createError('SyncOtError NoService', message)
}

/**
 * Creates a new error informing that there's no active connection.
 * @param message The error message.
 */
export function createDisconnectedError(message: string): Error {
    assertString('message', message)
    return createError('SyncOtError Disconnected', message)
}

/**
 * Creates a new error informing that an entity has not been initialized.
 * @param message The error message.
 */
export function createNotInitializedError(message: string): Error {
    assertString('message', message)
    return createError('SyncOtError NotInitialized', message)
}

export interface TypeNotFoundError extends Error {
    typeName: string
}

/**
 * Creates a new error informing that an entity has been already initialized.
 * @param message An error message.
 */
export function createAlreadyInitializedError(message: string): Error {
    assertString('message', message)
    return createError('SyncOtError AlreadyInitialized', message)
}

/**
 * Creates a new error informing about an unexpected client id.
 * @param message An error message.
 */
export function createUnexpectedClientIdError(
    message: string = 'Unexpected client id.',
): Error {
    assertString('message', message)
    return createError('SyncOtError UnexpectedClientId', message)
}

/**
 * Creates a new error informing about an unexpected version number.
 * @param message An error message.
 */
export function createUnexpectedVersionNumberError(
    message: string = 'Unexpected version number.',
): Error {
    assertString('message', message)
    return createError('SyncOtError UnexpectedVersionNumber', message)
}

/**
 * Creates a new error informing about an unexpected sequence number.
 * @param message An error message.
 */
export function createUnexpectedSequenceNumberError(
    message: string = 'Unexpected sequence number.',
): Error {
    assertString('message', message)
    return createError('SyncOtError UnexpectedSequenceNumber', message)
}
