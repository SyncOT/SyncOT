import { strict as assert } from 'assert'

export interface ErrorDetails {
    name?: string
    message?: string
    cause?: Error
    [key: string]: any
}

export interface CustomError extends Error {
    cause?: Error
    [key: string]: any
}

/**
 * Creates a new Error instance with the specified properties.
 * Additionally, `cause.message` is automatically appended to the new error's `message`.
 */
export function createError(details: ErrorDetails = {}): CustomError {
    assert.ok(
        details != null && typeof details === 'object',
        'Argument "details" must be an object.',
    )
    assert.ok(
        typeof details.name === 'string' || details.name === undefined,
        'Argument "details.name" must be a string or undefined.',
    )
    assert.ok(
        typeof details.message === 'string' || details.message === undefined,
        'Argument "details.message" must be a string or undefined.',
    )
    assert.ok(
        details.cause instanceof Error || details.cause === undefined,
        'Argument "details.cause" must be an Error or undefined.',
    )
    assert.ok(
        !('stack' in details),
        'Argument "details.stack" must not be present.',
    )

    const name = details.name
    const cause = details.cause
    const message = details.message
        ? cause
            ? `${details.message} => ${cause}`
            : details.message
        : cause
        ? `=> ${cause}`
        : ''
    const error = new Error(message) as CustomError

    if (name !== undefined) {
        Object.defineProperty(error, 'name', {
            configurable: true,
            value: name,
            writable: true,
        })
    }

    for (const key in details) {
        if (
            details.hasOwnProperty(key) &&
            key !== 'name' &&
            key !== 'message'
        ) {
            error[key] = details[key]
        }
    }

    return error
}

/**
 * A SyncOtError is a CustomError with the `name` matching the regex /^SyncOtError($| )/.
 */
export type SyncOtError = CustomError
export function isSyncOtError(error: any): error is SyncOtError {
    return error instanceof Error && /^SyncOtError($| )/.test(error.name)
}

export interface TsonError extends Error {
    name: 'SyncOtError TSON'
}
export function createTsonError(message?: string): TsonError {
    return createError({
        message,
        name: 'SyncOtError TSON',
    }) as TsonError
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
    assert.ok(
        typeof entityName === 'string',
        'Argument "entityName" must be a string.',
    )
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
export function isInvalidEntityError(error: any): error is InvalidEntityError {
    return error instanceof Error && error.name === 'SyncOtError InvalidEntity'
}

export interface TypeNotFoundError extends Error {
    name: 'SyncOtError TypeNotFound'
    typeName: string
}
export function createTypeNotFoundError(typeName: string): TypeNotFoundError {
    assert.ok(
        typeof typeName === 'string',
        'Argument "typeName" must be a string.',
    )
    return createError({
        message: `Type "${typeName}" not found.`,
        name: 'SyncOtError TypeNotFound',
        typeName,
    }) as TypeNotFoundError
}
export function isTypeNotFoundError(error: any): error is TypeNotFoundError {
    return error instanceof Error && error.name === 'SyncOtError TypeNotFound'
}

export interface NoServiceError extends Error {
    name: 'SyncOtError NoService'
}
export function createNoServiceError(message?: string): NoServiceError {
    return createError({
        message,
        name: 'SyncOtError NoService',
    }) as NoServiceError
}
export function isNoServiceError(error: any): error is NoServiceError {
    return error instanceof Error && error.name === 'SyncOtError NoService'
}

export interface DisconnectedError extends Error {
    name: 'SyncOtError Disconnected'
}
export function createDisconnectedError(message?: string): DisconnectedError {
    return createError({
        message,
        name: 'SyncOtError Disconnected',
    }) as DisconnectedError
}
export function isDisconnectedError(error: any): error is DisconnectedError {
    return error instanceof Error && error.name === 'SyncOtError Disconnected'
}

export interface NotInitializedError extends Error {
    name: 'SyncOtError NotInitialized'
}
export function createNotInitializedError(
    message?: string,
): NotInitializedError {
    return createError({
        message,
        name: 'SyncOtError NotInitialized',
    }) as NotInitializedError
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
    message?: string,
): AlreadyInitializedError {
    return createError({
        message,
        name: 'SyncOtError AlreadyInitialized',
    }) as AlreadyInitializedError
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
    message?: string,
): UnexpectedSessionIdError {
    return createError({
        message,
        name: 'SyncOtError UnexpectedSessionId',
    }) as UnexpectedSessionIdError
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
    message?: string,
): UnexpectedVersionNumberError {
    return createError({
        message,
        name: 'SyncOtError UnexpectedVersionNumber',
    }) as UnexpectedVersionNumberError
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
    message?: string,
): UnexpectedSequenceNumberError {
    return createError({
        message,
        name: 'SyncOtError UnexpectedSequenceNumber',
    }) as UnexpectedSequenceNumberError
}
export function isUnexpectedSequenceNumberError(
    error: any,
): error is UnexpectedSequenceNumberError {
    return (
        error instanceof Error &&
        error.name === 'SyncOtError UnexpectedSequenceNumber'
    )
}

export interface SessionError extends Error {
    cause?: Error
    name: 'SyncOtError Session'
}
export function createSessionError(
    message?: string,
    cause?: Error,
): SessionError {
    return createError({
        cause,
        message,
        name: 'SyncOtError Session',
    }) as SessionError
}
export function isSessionError(error: any): error is SessionError {
    return error instanceof Error && error.name === 'SyncOtError Session'
}

export interface PresenceError extends Error {
    cause?: Error
    name: 'SyncOtError Presence'
}
export function createPresenceError(
    message?: string,
    cause?: Error,
): PresenceError {
    return createError({
        cause,
        message,
        name: 'SyncOtError Presence',
    }) as PresenceError
}
export function isPresenceError(error: any): error is PresenceError {
    return error instanceof Error && error.name === 'SyncOtError Presence'
}

export interface AuthError extends Error {
    cause?: Error
    name: 'SyncOtError Auth'
}
export function createAuthError(message?: string, cause?: Error): AuthError {
    return createError({
        cause,
        message,
        name: 'SyncOtError Auth',
    }) as AuthError
}
export function isAuthError(error: any): error is AuthError {
    return error instanceof Error && error.name === 'SyncOtError Auth'
}

export interface DuplicateIdError extends Error {
    name: 'SyncOtError DuplicateId'
}
export function createDuplicateIdError(message?: string): DuplicateIdError {
    return createError({
        message,
        name: 'SyncOtError DuplicateId',
    }) as DuplicateIdError
}
export function isDuplicateIdError(error: any): error is DuplicateIdError {
    return error instanceof Error && error.name === 'SyncOtError DuplicateId'
}

export interface InvalidStreamError extends Error {
    name: 'SyncOtError InvalidStream'
}
export function createInvalidStreamError(message?: string): InvalidStreamError {
    return createError({
        message,
        name: 'SyncOtError InvalidStream',
    }) as InvalidStreamError
}
export function isInvalidStreamError(error: any): error is InvalidStreamError {
    return error instanceof Error && error.name === 'SyncOtError InvalidStream'
}

export interface SocketError extends Error {
    cause?: Error
    name: 'SyncOtError Socket'
}
export function createSocketError(
    message?: string,
    cause?: Error,
): SocketError {
    return createError({
        cause,
        message,
        name: 'SyncOtError Socket',
    }) as SocketError
}
export function isSocketError(error: any): error is SocketError {
    return error instanceof Error && error.name === 'SyncOtError Socket'
}
