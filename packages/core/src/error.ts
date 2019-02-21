import { createError } from '@syncot/error'
import { strict as assert } from 'assert'
import { JsonValue } from './json'

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
 * A list of all possible error codes.
 */
export enum ErrorCodes {
    /**
     * A service can't be initialized because it has been initialized already.
     */
    AlreadyInitialized = 'AlreadyInitialized',
    /**
     * An operation has an unexpected clientId value.
     */
    UnexpectedClientId = 'UnexpectedClientId',
    /**
     * An operation has an unexpected version number.
     */
    UnexpectedVersionNumber = 'UnexpectedVersionNumber',
    /**
     * An operation has an unexpected sequence number.
     */
    UnexpectedSequenceNumber = 'UnexpectedSequenceNumber',
}

export class SyncOtError extends Error {
    public code: ErrorCodes
    public details: JsonValue

    constructor(code: ErrorCodes, message?: string, details: JsonValue = null) {
        super(message)
        this.code = code
        this.details = details
    }
}
