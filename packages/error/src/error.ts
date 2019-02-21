import { strict as assert } from 'assert'

export interface ErrorDetails {
    name?: string
    message?: string
    cause?: Error
    [key: string]: any
}

export interface SyncOtError extends Error {
    cause?: Error
    [key: string]: any
}

export function createError(
    name: string,
    message: string,
    cause?: Error,
): SyncOtError
export function createError(message: string, cause?: Error): SyncOtError
export function createError(details?: ErrorDetails): SyncOtError
export function createError(
    one?: string | ErrorDetails,
    two?: string | Error,
    three?: Error,
): SyncOtError {
    let name: string = 'Error'
    let message: string = ''
    let cause: Error | null | undefined = null
    let info: { [key: string]: any } | null = null

    if (
        typeof one === 'string' &&
        typeof two === 'string' &&
        (three instanceof Error || three == null)
    ) {
        name = one
        message = two
        cause = three
    } else if (
        typeof one === 'string' &&
        (two instanceof Error || two == null)
    ) {
        message = one
        cause = two
    } else if (one == null) {
        // Using all default values.
    } else if (typeof one === 'object') {
        if (typeof one.name === 'string') {
            name = one.name
        } else {
            assert.ok(
                one.name == null,
                '"details.name" must be a string, null or undefined.',
            )
        }

        if (typeof one.message === 'string') {
            message = one.message
        } else {
            assert.ok(
                one.message == null,
                '"details.message" must be a string, null or undefined.',
            )
        }

        if (one.cause instanceof Error) {
            cause = one.cause
        } else {
            assert.ok(
                one.cause == null,
                '"details.cause" must be an Error, null or undefined.',
            )
        }

        assert.ok(!('stack' in one), '"details.stack" must not be present.')

        info = one
    } else {
        assert.fail('Invalid arguments.')
    }

    if (cause) {
        message += ` => ${cause}`
    }

    const error = new Error(message) as SyncOtError
    Object.defineProperty(error, 'name', {
        configurable: true,
        value: name,
        writable: true,
    })

    if (cause) {
        error.cause = cause
    }

    if (info) {
        for (const key in info) {
            if (
                info.hasOwnProperty(key) &&
                key !== 'name' &&
                key !== 'message' &&
                key !== 'cause'
            ) {
                error[key] = info[key]
            }
        }
    }

    return error
}

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
