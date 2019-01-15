import { SyncOtError } from './error'

/**
 * Throws an error with the specified message.
 * Call this function in the sections of code which should be unreachable.
 */
export function never(message?: string): never {
    throw new Error(message || 'Should never happen')
}

/**
 * The type of validation result.
 */
export type ValidationResult<E extends Error = SyncOtError> = E | undefined

/**
 * The type of a validator.
 */
export type Validator<T, E extends Error = SyncOtError> = (
    target: T,
) => ValidationResult<E>

/**
 * Throws the specified `error`, if defined.
 */
export function throwError(error: Error | undefined) {
    if (error) {
        throw error
    }
}

/**
 * Validates `target` using the specified `validators` and
 * returns the first encountered `Error`, or `undefined`.
 */
export const validate = <T, E extends Error = SyncOtError>(
    validators: Array<Validator<T, E>>,
) => (target: T): ValidationResult<E> => {
    for (let i = 0, l = validators.length; i < l; ++i) {
        const error = validators[i](target)

        if (error) {
            return error
        }
    }

    return
}
