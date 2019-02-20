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

export function createNoServiceError(message: string): Error {
    assertString('message', message)
    return createError('SyncOtError NoService', message)
}

/**
 * A list of all possible error codes.
 */
export enum ErrorCodes {
    /**
     * An action failed because there is no active connection.
     */
    Disconnected = 'Disconnected',
    /**
     * A type implementation necessary to process an operation or snapshot has not been found.
     */
    TypeNotFound = 'TypeNotFound',
    /**
     * A service is not initialized.
     */
    NotInitialized = 'NotInitialized',
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
