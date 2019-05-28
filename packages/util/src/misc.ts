export function noop() {
    // Do nothing.
}

/**
 * Returns a Promise that resolves on `process.nextTick`.
 */
export function whenNextTick() {
    return new Promise(resolve => process.nextTick(resolve))
}

/**
 * Returns a Promise that resolves after the specified minimum number of milliseconds.
 */
export function delay(minDelayMilliseconds: number = 0) {
    return new Promise(resolve => setTimeout(resolve, minDelayMilliseconds))
}
