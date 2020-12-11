import { BackOffStrategy } from './backOff'
import { delay, noop } from './util'

/**
 * A WorkLoop performs work in an iterative fasion.
 */
export interface WorkLoop {
    /**
     * Performs some work in an iteration of the WorkLoop.
     * Defaults to do nothing.
     * @param notify A function which notifies that there's more work to do.
     * @returns If it returns a Promise,
     *   the WorkLoop waits until it is fulfilled before starting the next iteration.
     */
    work?(notify: () => void): void | Promise<void>
    /**
     * Releases the resources claimed by the WorkLoop.
     * Defaults to do nothing.
     * @param notify A function which notifies that there's more work to do.
     */
    destroy?(notify: () => void): void
    /**
     * Informs whether all works has been completed or more should be expected in the future.
     * Defaults to a function which always returns `false`.
     * @returns `true`, if all work has been completed and the WorkLoop should be terminated, otherwise `false`.
     */
    isDone?(): boolean
    /**
     * Reports an error.
     * Defaults to a function which throws the error.
     * @param error The error to report.
     */
    onError?(error: Error): void
    /**
     * Returns the max number of milliseconds to wait before retrying a failed iteration of the WorkLoop.
     * Defaults to no maximum delay.
     */
    retryDelay?: BackOffStrategy
}

/**
 * Manages a WorkLoop obtained by calling `create`.
 *
 * It works as follows:
 *
 * 1. Call `isDone`. If it returns `true`, call `destroy` and exit.
 * 2. Call `work` and wait until it's complete.
 * 3. If `work` succeeds,
 *   - reset `retryAttempt` back to 0,
 *   - wait until notified and resume at step 1.
 * 4. If `work` fails,
 *   - call `onError` to report the error,
 *   - get `maxDelay` by calling `retryDelay(retryAttemp)`,
 *   - increment `retryAttempt`,
 *   - wait for at most `maxDelay` or until notified and resume at step 1.
 *
 * @param create Returns an instance of WorkLoop to manage - usually a new instance.
 *   This function is always called synchronously by `workLoop`.
 *   The functions of the returned `WorkLoop` instance are always called asynchronously.
 *   It gets a `notify` function which can be called at any time
 *   to notify the loop that there is more work to do.
 *   The same `notify` function is passed to `WorkLoop#work` and `WorkLoop#destroy`.
 * @returns A Promise which resolves once the loop completes.
 */
export async function workLoop<T extends WorkLoop>(
    create: (notify: () => void) => T,
): Promise<void> {
    let retryAttempt = 0
    let change: Promise<void>
    let triggerChange = noop
    const notify = () => triggerChange()
    const instance = create(notify)
    try {
        await Promise.resolve()
        while (!(instance.isDone && instance.isDone())) {
            change = new Promise((resolve) => (triggerChange = resolve))
            try {
                if (instance.work) await instance.work(notify)
                await change
                retryAttempt = 0
            } catch (error) {
                if (instance.onError)
                    queueMicrotask(instance.onError.bind(instance, error))
                else throw error
                if (instance.retryDelay)
                    await Promise.race([
                        change,
                        delay(instance.retryDelay(retryAttempt++)),
                    ])
                else await change
            }
        }
    } finally {
        if (instance.destroy) instance.destroy(notify)
    }
}
