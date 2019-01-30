import { EventEmitter } from 'events'
import { StrictEventEmitter } from 'strict-event-emitter-types'
import { SyncOtError } from './error'

/**
 * A simple function which throws an error, if a theoretically unreachable code path is executed anyway.
 */
export function assertUnreachable(_never: never): never {
    throw new Error('This should never happen!')
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

/**
 * Keeps only public properties.
 * See https://github.com/Microsoft/TypeScript/issues/471#issuecomment-381842426
 */
export type Interface<T> = { [P in keyof T]: T[P] }

/**
 * A strongly typed nodejs `EventEmitter`.
 */
export type NodeEventEmitter<Events> = new () => StrictEventEmitter<
    EventEmitter,
    Events
>
