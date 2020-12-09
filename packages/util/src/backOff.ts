import { assert } from './error'

/**
 * Returns the number of milliseconds to wait before the specified retry attempt.
 * @param retryAttempt The 0-based retry attempt number.
 * @returns The number of milliseconds to wait.
 */
export type BackOffStrategy = (retryAttempt: number) => number

/**
 * The options expected by the `exponentialBackOffStrategy` function.
 */
export interface ExponentialBackOffStrategyOptions {
    /**
     * The minimum delay in milliseconds, defaults to 1000.
     */
    minDelay?: number
    /**
     * The maximum delay in milliseconds, defaults to 10000.
     */
    maxDelay?: number
    /**
     * The delay factor, defaults to 1.5.
     */
    delayFactor?: number
}

/**
 * Creates a function which implements the exponential back-off strategy with fixed configuration.
 * @param options Options for configuring the strategy.
 * @returns A function which implement the exponential back-off strategy.
 */
export function exponentialBackOffStrategy(
    options?: ExponentialBackOffStrategyOptions,
): BackOffStrategy {
    const { minDelay = 1000, maxDelay = 10000, delayFactor = 1.5 } =
        options || {}
    assert(
        Number.isSafeInteger(minDelay) && minDelay >= 0,
        '"minDelay" must be a safe integer >= 0.',
    )
    assert(
        Number.isSafeInteger(maxDelay) && maxDelay >= minDelay,
        '"maxDelay" must be a safe integer >= minDelay.',
    )
    assert(
        Number.isFinite(delayFactor),
        '"delayFactor" must be a finite number.',
    )
    return (retryAttempt: number) => {
        assert(
            Number.isSafeInteger(retryAttempt),
            '"retryAttempt" must be a safe integer.',
        )
        return Math.max(
            minDelay,
            Math.min(
                maxDelay,
                Math.floor(minDelay * Math.pow(delayFactor, retryAttempt)),
            ),
        )
    }
}
