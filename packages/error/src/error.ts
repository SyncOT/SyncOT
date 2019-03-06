import { strict as assert } from 'assert'

const assertString = (argumentName: string, argument: string): void =>
    assert.equal(
        typeof argument,
        'string',
        `Argument "${argumentName}" must be a string.`,
    )

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
export function createSyncOtError(
    name: string,
    message: string,
    cause?: Error,
): SyncOtError
export function createSyncOtError(message: string, cause?: Error): SyncOtError
export function createSyncOtError(details?: ErrorDetails): SyncOtError
export function createSyncOtError(
    one?: string | ErrorDetails,
    two?: string | Error,
    three?: Error,
): SyncOtError {
    let name: string = ''
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
                'Argument "details.name" must be a string, null or undefined.',
            )
        }

        if (typeof one.message === 'string') {
            message = one.message
        } else {
            assert.ok(
                one.message == null,
                'Argument "details.message" must be a string, null or undefined.',
            )
        }

        if (one.cause instanceof Error) {
            cause = one.cause
        } else {
            assert.ok(
                one.cause == null,
                'Argument "details.cause" must be an Error, null or undefined.',
            )
        }

        assert.ok(
            !('stack' in one),
            'Argument "details.stack" must not be present.',
        )

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
        value: name ? `SyncOtError ${name}` : 'SyncOtError',
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
export function isSyncOtError(error: any): error is SyncOtError {
    return error instanceof Error && /^SyncOtError($| )/.test(error.name)
}

export interface TsonError extends Error {
    name: 'SyncOtError TSON'
}
export function createTsonError(message: string): TsonError {
    assertString('message', message)
    return createSyncOtError('TSON', message) as TsonError
}
export function isTsonError(error: any): error is TsonError {
    return error instanceof Error && error.name === 'SyncOtError TSON'
}

export interface InvalidEntityError extends Error {
    name: 'SyncOtError InvalidEntity'
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
    return createSyncOtError({
        entity,
        entityName,
        key,
        message:
            key === null
                ? `Invalid "${entityName}".`
                : `Invalid "${entityName}.${key}".`,
        name: 'InvalidEntity',
    }) as InvalidEntityError
}
export function isInvalidEntityError(error: any): error is InvalidEntityError {
    return error instanceof Error && error.name === 'SyncOtError InvalidEntity'
}

export interface TypeNotFoundError extends Error {
    name: 'SyncOtError TypeNotFound'
    typeName: string
}
export function createTypeNotFoundError(typeName: string): TypeNotFoundError {
    assertString('typeName', typeName)
    return createSyncOtError({
        message: `Type "${typeName}" not found.`,
        name: 'TypeNotFound',
        typeName,
    }) as TypeNotFoundError
}
export function isTypeNotFoundError(error: any): error is TypeNotFoundError {
    return error instanceof Error && error.name === 'SyncOtError TypeNotFound'
}

export interface NoServiceError extends Error {
    name: 'SyncOtError NoService'
}
export function createNoServiceError(message: string): NoServiceError {
    assertString('message', message)
    return createSyncOtError('NoService', message) as NoServiceError
}
export function isNoServiceError(error: any): error is NoServiceError {
    return error instanceof Error && error.name === 'SyncOtError NoService'
}

export interface DisconnectedError extends Error {
    name: 'SyncOtError Disconnected'
}
export function createDisconnectedError(message: string): DisconnectedError {
    assertString('message', message)
    return createSyncOtError('Disconnected', message) as DisconnectedError
}
export function isDisconnectedError(error: any): error is DisconnectedError {
    return error instanceof Error && error.name === 'SyncOtError Disconnected'
}

export interface NotInitializedError extends Error {
    name: 'SyncOtError NotInitialized'
}
export function createNotInitializedError(
    message: string,
): NotInitializedError {
    assertString('message', message)
    return createSyncOtError('NotInitialized', message) as NotInitializedError
}
export function isNotInitializedError(
    error: any,
): error is NotInitializedError {
    return error instanceof Error && error.name === 'SyncOtError NotInitialized'
}

export interface AlreadyInitializedError extends Error {
    name: 'SyncOtError AlreadyInitialized'
}
export function createAlreadyInitializedError(
    message: string,
): AlreadyInitializedError {
    assertString('message', message)
    return createSyncOtError(
        'AlreadyInitialized',
        message,
    ) as AlreadyInitializedError
}
export function isAlreadyInitializedError(
    error: any,
): error is AlreadyInitializedError {
    return (
        error instanceof Error &&
        error.name === 'SyncOtError AlreadyInitialized'
    )
}

export interface UnexpectedSessionIdError extends Error {
    name: 'SyncOtError UnexpectedSessionId'
}
export function createUnexpectedSessionIdError(
    message: string = 'Unexpected session id.',
): UnexpectedSessionIdError {
    assertString('message', message)
    return createSyncOtError(
        'UnexpectedSessionId',
        message,
    ) as UnexpectedSessionIdError
}
export function isUnexpectedSessionIdError(
    error: any,
): error is UnexpectedSessionIdError {
    return (
        error instanceof Error &&
        error.name === 'SyncOtError UnexpectedSessionId'
    )
}

export interface UnexpectedVersionNumberError extends Error {
    name: 'SyncOtError UnexpectedVersionNumber'
}
export function createUnexpectedVersionNumberError(
    message: string = 'Unexpected version number.',
): UnexpectedVersionNumberError {
    assertString('message', message)
    return createSyncOtError(
        'UnexpectedVersionNumber',
        message,
    ) as UnexpectedVersionNumberError
}
export function isUnexpectedVersionNumberError(
    error: any,
): error is UnexpectedVersionNumberError {
    return (
        error instanceof Error &&
        error.name === 'SyncOtError UnexpectedVersionNumber'
    )
}

export interface UnexpectedSequenceNumberError extends Error {
    name: 'SyncOtError UnexpectedSequenceNumber'
}
export function createUnexpectedSequenceNumberError(
    message: string = 'Unexpected sequence number.',
): UnexpectedSequenceNumberError {
    assertString('message', message)
    return createSyncOtError(
        'UnexpectedSequenceNumber',
        message,
    ) as UnexpectedSequenceNumberError
}
export function isUnexpectedSequenceNumberError(
    error: any,
): error is UnexpectedSequenceNumberError {
    return (
        error instanceof Error &&
        error.name === 'SyncOtError UnexpectedSequenceNumber'
    )
}

export interface SocketClosedError extends Error {
    name: 'SyncOtError SocketClosed'
}
export function createSocketClosedError(
    message: string = 'Socket closed.',
): SocketClosedError {
    assertString('message', message)
    return createSyncOtError('SocketClosed', message) as SocketClosedError
}
export function isSocketClosedError(error: any): error is SocketClosedError {
    return error instanceof Error && error.name === 'SyncOtError SocketClosed'
}

export interface SessionError extends Error {
    cause?: Error
    name: 'SyncOtError Session'
}
export function createSessionError(
    message: string,
    cause?: Error,
): SessionError {
    assertString('message', message)
    return createSyncOtError('Session', message, cause) as SessionError
}
export function isSessionError(error: any): error is SessionError {
    return error instanceof Error && error.name === 'SyncOtError Session'
}
