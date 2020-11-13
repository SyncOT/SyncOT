import { assert } from './error'

/**
 * The type of validation result.
 */
export type ValidationResult = Error | undefined

/**
 * The type of a validator.
 */
export type Validator<T> = (target: T) => ValidationResult

/**
 * Throws the specified `error`, if defined.
 */
export function throwError(error: Error | undefined): void {
    if (error) {
        throw error
    }
}

/**
 * Validates `target` using the specified `validators` and
 * returns the first encountered `Error`, or `undefined`.
 */
export const validate = <T>(validators: Validator<T>[]) => (
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

/**
 * A function which does nothing.
 */
export function noop(): void {
    // Do nothing.
}

/**
 * Returns a Promise that resolves on `process.nextTick`.
 */
export function whenNextTick() {
    return new Promise((resolve) => process.nextTick(resolve))
}

/**
 * Returns a Promise that resolves after the specified minimum number of milliseconds.
 */
export function delay(minDelayMilliseconds: number = 0) {
    return new Promise((resolve) => setTimeout(resolve, minDelayMilliseconds))
}

/**
 * Returns a promise which resolves when `emitter` emits `event`.
 */
export const whenEvent = (event: string) => (emitter: {
    once: (event: string, callback: () => void) => void
}) => new Promise<void>((resolve) => emitter.once(event, resolve))
/**
 * Returns a promise which resolves when `emitter` emits `"data"`.
 */
export const whenData = whenEvent('data')
/**
 * Returns a promise which resolves when `emitter` emits `"close"`.
 */
export const whenClose = whenEvent('close')
/**
 * Returns a promise which resolves when `emitter` emits `"error"`.
 */
export const whenError = whenEvent('error')

/**
 * Returns a random integer in the specified range.
 */
export function randomInteger(
    minInclusive: number,
    maxExclusive: number,
): number {
    assert(
        Number.isSafeInteger(minInclusive),
        'Argument "minInclusive" must be a safe integer.',
    )
    assert(
        Number.isSafeInteger(maxExclusive),
        'Argument "maxExclusive" must be a safe integer.',
    )
    assert(
        minInclusive <= maxExclusive,
        'Argument "minInclusive" must be less or equal to argument "maxExclusive".',
    )

    return Math.floor(
        minInclusive + Math.random() * (maxExclusive - minInclusive),
    )
}
