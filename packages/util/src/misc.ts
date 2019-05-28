export function noop() {
    // Do nothing.
}

/**
 * Returns a Promise that resolves on `process.nextTick`.
 */
export function whenNextTick() {
    return new Promise(resolve => process.nextTick(resolve))
}
