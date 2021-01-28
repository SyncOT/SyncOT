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

/**
 * Combines the `parts` into a single string,
 * so that the original `parts` can be recovered using the `separate` function.
 *
 * Notes on the algorithm:
 *
 * - `!` and `~` characters in `parts` are replaced by `!!` and `!~` respectively.
 * - The parts are joined using the `~` character.
 *
 * @param parts The strings to combine.
 * @returns A single string encoding the input strings.
 */
export function combine(...parts: string[]): string {
    return parts.map(combineEscape).join('~')
}

/**
 * Reverses the action of the `combine` function.
 * @param value A value produced by the `combine` function.
 * @returns A list of arguments passed to the `combine` function, which produced the `value`.
 */
export function separate(value: string): string[] {
    const result = []
    const regex = /(?:![!~]|[^~])*/y
    let match
    // tslint:disable-next-line:no-conditional-assignment
    while ((match = regex.exec(value))) {
        result.push(separateUnescape(match[0]))
        regex.lastIndex++
    }
    return result
}

function combineEscape(value: string): string {
    return value.replace(/[!~]/g, '!$&')
}

function separateUnescape(value: string): string {
    return value.replace(/!(.)/g, '$1')
}

/**
 * Returns the first array element.
 */
export function first<T>(array: T[]): T | undefined {
    return array[0]
}

/**
 * Returns the last array element.
 */
export function last<T>(array: T[]): T | undefined {
    return array[array.length - 1]
}
