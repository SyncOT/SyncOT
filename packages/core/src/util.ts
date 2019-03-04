import { InvalidEntityError } from '@syncot/error'
import { strict as assert } from 'assert'

/**
 * A simple function which throws an error, when a theoretically unreachable code path is executed anyway.
 * @param _never An optional parameter which can be used by the client code to ensura that a variable
 *   has type `never`.
 */
export function assertUnreachable(_never?: never): never {
    return assert.fail('This should never happen!')
}

/**
 * The type of validation result.
 */
export type ValidationResult = InvalidEntityError | undefined

/**
 * The type of a validator.
 */
export type Validator<T> = (target: T) => ValidationResult

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
export const validate = <T>(validators: Array<Validator<T>>) => (
    target: T,
): ValidationResult => {
    for (let i = 0, l = validators.length; i < l; ++i) {
        const error = validators[i](target)

        if (error) {
            return error
        }
    }

    return
}

/**
 * Keeps only public properties.
 * See https://github.com/Microsoft/TypeScript/issues/471#issuecomment-381842426
 */
export type Interface<T> = { [P in keyof T]: T[P] }
