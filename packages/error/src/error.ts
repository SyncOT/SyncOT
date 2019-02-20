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
