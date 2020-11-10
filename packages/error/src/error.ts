/**
 * Extends Error with:
 * - the optional `cause` property which indicates the cause of this error,
 * - any additional custom properties to provide more details about the error.
 */
export interface CustomError extends Error {
    cause?: CustomError
    [key: string]: any
}

/**
 * Determines if `data` is an Error.
 */
export function isError(data: any): data is Error {
    return (
        data !== null &&
        typeof data === 'object' &&
        typeof data.name === 'string' &&
        typeof data.message === 'string'
    )
}

/**
 * Determines if `data` is a CustomError.
 */
export function isCustomError(data: any): data is CustomError {
    return (
        isError(data as any) &&
        (data.cause == null || isCustomError(data.cause))
    )
}

/**
 * Converts `error` to a JSON object.
 */
export function toJSON(error: CustomError): CustomError {
    if (!isError(error)) {
        return {
            name: 'TypeError',
            message: 'Invalid "error" object.',
            error,
        }
    }
    const result = {
        ...error,
        name: error.name,
        message: error.message,
    }
    if (error.cause != null) {
        result.cause = toJSON(error.cause)
    }
    return result
}

/**
 * Converts `error` to a CustomError instance created using the Error constructor.
 */
export function fromJSON(error: CustomError): CustomError {
    if (!isError(error)) {
        return createError({
            name: 'TypeError',
            message: 'Invalid "error" object.',
            error,
        })
    }
    const result = createError({
        ...error,
        name: error.name,
        message: error.message,
        cause: undefined,
    })
    if (error.cause != null) {
        result.cause = fromJSON(error.cause)
    }
    return result
}

/**
 * Creates a new Error instance with the specified properties.
 * Additionally, `cause.message` is automatically appended to the new error's `message`.
 */
export function createError(data: Partial<CustomError> = {}): CustomError {
    assert(
        data != null && typeof data === 'object',
        'Argument "data" must be an object.',
    )
    assert(
        typeof data.name === 'string' || data.name === undefined,
        'Argument "data.name" must be a string or undefined.',
    )
    assert(
        typeof data.message === 'string' || data.message === undefined,
        'Argument "data.message" must be a string or undefined.',
    )
    assert(
        isError(data.cause) || data.cause === undefined,
        'Argument "data.cause" must be an Error or undefined.',
    )

    const name = data.name
    const cause = data.cause
    const message = data.message
        ? cause
            ? `${data.message} => ${cause}`
            : data.message
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

    for (const key in data) {
        if (data.hasOwnProperty(key) && key !== 'name' && key !== 'message') {
            error[key] = data[key]
        }
    }

    return error
}

/**
 * A SyncOtError is a CustomError with the `name` matching the regex /^SyncOtError($| )/.
 */
export type SyncOtError = CustomError
export function isSyncOtError(error: any): error is SyncOtError {
    return isCustomError(error) && /^SyncOtError($| )/.test(error.name)
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
    return isCustomError(error) && error.name === 'SyncOtError TSON'
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
        message:
            key === null
                ? `Invalid "${entityName}".`
                : `Invalid "${entityName}.${key}".`,
        name: 'SyncOtError InvalidEntity',
    }) as InvalidEntityError
}
export function isInvalidEntityError(error: any): error is InvalidEntityError {
    return isCustomError(error) && error.name === 'SyncOtError InvalidEntity'
}

export interface TypeNotFoundError extends Error {
    name: 'SyncOtError TypeNotFound'
    typeName: string
}
export function createTypeNotFoundError(typeName: string): TypeNotFoundError {
    assert(
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
    return isCustomError(error) && error.name === 'SyncOtError TypeNotFound'
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
    return isCustomError(error) && error.name === 'SyncOtError NoService'
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
    return isCustomError(error) && error.name === 'SyncOtError Disconnected'
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
    return isCustomError(error) && error.name === 'SyncOtError NotInitialized'
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
        isCustomError(error) && error.name === 'SyncOtError AlreadyInitialized'
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
        isCustomError(error) && error.name === 'SyncOtError UnexpectedSessionId'
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
        isCustomError(error) &&
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
        isCustomError(error) &&
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
    return isCustomError(error) && error.name === 'SyncOtError Session'
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
    return isCustomError(error) && error.name === 'SyncOtError Presence'
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
    return isCustomError(error) && error.name === 'SyncOtError Auth'
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
    return isCustomError(error) && error.name === 'SyncOtError DuplicateId'
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
    return isCustomError(error) && error.name === 'SyncOtError InvalidStream'
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
    return isCustomError(error) && error.name === 'SyncOtError Socket'
}

export interface CompositeError extends Error {
    errors: Error[]
    name: 'SyncOtError Composite'
}
export function createCompositeError(
    message?: string,
    errors: Error[] = [],
): CompositeError {
    return createError({
        errors,
        message,
        name: 'SyncOtError Composite',
    }) as CompositeError
}
export function isCompositeError(error: any): error is CompositeError {
    return isCustomError(error) && error.name === 'SyncOtError Composite'
}

export interface AssertError extends Error {
    name: 'SyncOtError Assert'
}
export function createAssertError(message?: string): AssertError {
    return createError({
        message,
        name: 'SyncOtError Assert',
    }) as AssertError
}
export function isAssertError(error: any): error is AssertError {
    return isCustomError(error) && error.name === 'SyncOtError Assert'
}

export interface PingError extends Error {
    cause?: Error
    name: 'SyncOtError Ping'
}
export function createPingError(message?: string, cause?: Error): PingError {
    return createError({
        cause,
        message,
        name: 'SyncOtError Ping',
    }) as PingError
}
export function isPingError(error: any): error is PingError {
    return isCustomError(error) && error.name === 'SyncOtError Ping'
}

function assert(value: any, message?: string): void {
    if (!value) {
        throw createAssertError(message)
    }
}
