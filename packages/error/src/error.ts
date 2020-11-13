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
 * A SyncOTError is a CustomError with the `name` matching the regex /^SyncOTError($| )/.
 */
export type SyncOTError = CustomError
export function isSyncOTError(error: any): error is SyncOTError {
    return isCustomError(error) && /^SyncOTError($| )/.test(error.name)
}

export interface InvalidEntityError extends Error {
    name: 'SyncOTError InvalidEntity'
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
        name: 'SyncOTError InvalidEntity',
    }) as InvalidEntityError
}
export function isInvalidEntityError(error: any): error is InvalidEntityError {
    return isCustomError(error) && error.name === 'SyncOTError InvalidEntity'
}

export interface PresenceError extends Error {
    cause?: Error
    name: 'SyncOTError Presence'
}
export function createPresenceError(
    message?: string,
    cause?: Error,
): PresenceError {
    return createError({
        cause,
        message,
        name: 'SyncOTError Presence',
    }) as PresenceError
}
export function isPresenceError(error: any): error is PresenceError {
    return isCustomError(error) && error.name === 'SyncOTError Presence'
}

export interface AuthError extends Error {
    cause?: Error
    name: 'SyncOTError Auth'
}
export function createAuthError(message?: string, cause?: Error): AuthError {
    return createError({
        cause,
        message,
        name: 'SyncOTError Auth',
    }) as AuthError
}
export function isAuthError(error: any): error is AuthError {
    return isCustomError(error) && error.name === 'SyncOTError Auth'
}

export interface DuplicateIdError extends Error {
    name: 'SyncOTError DuplicateId'
}
export function createDuplicateIdError(message?: string): DuplicateIdError {
    return createError({
        message,
        name: 'SyncOTError DuplicateId',
    }) as DuplicateIdError
}
export function isDuplicateIdError(error: any): error is DuplicateIdError {
    return isCustomError(error) && error.name === 'SyncOTError DuplicateId'
}

export interface InvalidStreamError extends Error {
    name: 'SyncOTError InvalidStream'
}
export function createInvalidStreamError(message?: string): InvalidStreamError {
    return createError({
        message,
        name: 'SyncOTError InvalidStream',
    }) as InvalidStreamError
}
export function isInvalidStreamError(error: any): error is InvalidStreamError {
    return isCustomError(error) && error.name === 'SyncOTError InvalidStream'
}

export interface SocketError extends Error {
    cause?: Error
    name: 'SyncOTError Socket'
}
export function createSocketError(
    message?: string,
    cause?: Error,
): SocketError {
    return createError({
        cause,
        message,
        name: 'SyncOTError Socket',
    }) as SocketError
}
export function isSocketError(error: any): error is SocketError {
    return isCustomError(error) && error.name === 'SyncOTError Socket'
}

export interface CompositeError extends Error {
    errors: Error[]
    name: 'SyncOTError Composite'
}
export function createCompositeError(
    message?: string,
    errors: Error[] = [],
): CompositeError {
    return createError({
        errors,
        message,
        name: 'SyncOTError Composite',
    }) as CompositeError
}
export function isCompositeError(error: any): error is CompositeError {
    return isCustomError(error) && error.name === 'SyncOTError Composite'
}

export interface AssertError extends Error {
    name: 'SyncOTError Assert'
}
export function createAssertError(message?: string): AssertError {
    return createError({
        message,
        name: 'SyncOTError Assert',
    }) as AssertError
}
export function isAssertError(error: any): error is AssertError {
    return isCustomError(error) && error.name === 'SyncOTError Assert'
}

export interface PingError extends Error {
    cause?: Error
    name: 'SyncOTError Ping'
}
export function createPingError(message?: string, cause?: Error): PingError {
    return createError({
        cause,
        message,
        name: 'SyncOTError Ping',
    }) as PingError
}
export function isPingError(error: any): error is PingError {
    return isCustomError(error) && error.name === 'SyncOTError Ping'
}

function assert(value: any, message?: string): void {
    if (!value) {
        throw createAssertError(message)
    }
}
