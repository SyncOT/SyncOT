import { SyncOtError } from './error'

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

/**
 * A type which keeps only public properties.
 * See https://github.com/Microsoft/TypeScript/issues/471#issuecomment-381842426
 */
export type Interface<T> = { [P in keyof T]: T[P] }
