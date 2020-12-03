/**
 * Throws an `AssertError` if `value` is falsy.
 */
export function assert(value: any, message?: string): void {
    if (!value) {
        throw createAssertError(message)
    }
}

/**
 * A simple function which throws an error, when a theoretically unreachable code path is executed anyway.
 * @param _never An optional parameter which can be used by the client code to ensura that a variable
 *   has type `never`.
 */
export function assertUnreachable(_never?: never): never {
    throw createAssertError('This should never happen!')
}

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
    cause?: Error
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
    cause?: Error,
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
        cause,
    }) as InvalidEntityError
}
export function isInvalidEntityError(error: any): error is InvalidEntityError {
    return isCustomError(error) && error.name === 'SyncOTError InvalidEntity'
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
