import { install as installClock, InstalledClock } from '@sinonjs/fake-timers'
import { noop, whenNextTick, workLoop } from '.'

const error = new Error('test error')

describe('create', () => {
    test('called synchronously', () => {
        const create = jest.fn(() => ({}))
        workLoop(create)
        expect(create).toHaveBeenCalledTimes(1)
        expect(create).toHaveBeenCalledWith(expect.toBeFunction())
    })
})

describe('destroy', () => {
    test('called asynchronously', async () => {
        let notify = noop
        const isDone = () => true
        const destroy = jest.fn()
        const instance = { destroy, isDone }
        workLoop((notifyArgument) => {
            notify = notifyArgument
            return instance
        })
        expect(destroy).toHaveBeenCalledTimes(0)
        await whenNextTick()
        expect(destroy).toHaveBeenCalledTimes(1)
        expect(destroy).toHaveBeenCalledWith(notify)
        expect(destroy.mock.instances[0]).toBe(instance)
    })

    test('is optinal', async () => {
        const isDone = () => true
        const instnce = { isDone }
        await workLoop(() => instnce)
    })

    test('called at the end', async () => {
        let notify = noop
        const isDone = jest.fn(() => false)
        const destroy = jest.fn()
        const instance = { destroy, isDone }
        workLoop((notifyArgument) => {
            notify = notifyArgument
            return instance
        })
        expect(destroy).toHaveBeenCalledTimes(0)

        notify()
        await whenNextTick()
        expect(destroy).toHaveBeenCalledTimes(0)

        notify()
        await whenNextTick()
        expect(destroy).toHaveBeenCalledTimes(0)

        isDone.mockReturnValueOnce(true)
        notify()
        await whenNextTick()
        expect(destroy).toHaveBeenCalledTimes(1)
    })

    test('called after thrown errors in work when there is not onError', async () => {
        const destroy = jest.fn()
        const work = () => {
            throw error
        }
        const instance = { work, destroy }
        await expect(workLoop(() => instance)).rejects.toBe(error)
        expect(destroy).toHaveBeenCalledTimes(1)
    })

    test('called after rejected errors in work when there is not onError', async () => {
        const destroy = jest.fn()
        const work = () => Promise.reject(error)
        const instance = { work, destroy }
        await expect(workLoop(() => instance)).rejects.toBe(error)
        expect(destroy).toHaveBeenCalledTimes(1)
    })

    test('called after errors thrown by isDone', async () => {
        const destroy = jest.fn()
        const isDone = () => {
            throw error
        }
        const instance = { isDone, destroy }
        await expect(workLoop(() => instance)).rejects.toBe(error)
        expect(destroy).toHaveBeenCalledTimes(1)
    })

    test('called after errors thrown by retryDelay', async () => {
        const destroy = jest.fn()
        const work = () => {
            throw new Error('a different error')
        }
        const onError = noop
        const retryDelay = () => {
            throw error
        }
        const instance = { retryDelay, destroy, onError, work }
        await expect(workLoop(() => instance)).rejects.toBe(error)
        expect(destroy).toHaveBeenCalledTimes(1)
    })
})

describe('isDone', () => {
    test('called asnchronously', async () => {
        const isDone = jest.fn(() => true)
        const instance = { isDone }
        workLoop(() => instance)
        expect(isDone).toHaveBeenCalledTimes(0)
        await whenNextTick()
        expect(isDone).toHaveBeenCalledTimes(1)
        expect(isDone.mock.instances[0]).toBe(instance)
    })

    test('called until it returns true', async () => {
        let notify = noop
        const onFulfilled = jest.fn()
        const isDone = jest.fn(() => false)
        const instance = { isDone }
        workLoop((notifyArgument) => {
            notify = notifyArgument
            return instance
        }).finally(onFulfilled)

        await whenNextTick()
        expect(isDone).toHaveBeenCalledTimes(1)
        expect(onFulfilled).not.toHaveBeenCalled()

        // notify() - the loop doesn't run again until notify
        await whenNextTick()
        expect(isDone).toHaveBeenCalledTimes(1)
        expect(onFulfilled).not.toHaveBeenCalled()

        notify()
        await whenNextTick()
        expect(isDone).toHaveBeenCalledTimes(2)
        expect(onFulfilled).not.toHaveBeenCalled()

        notify()
        await whenNextTick()
        expect(isDone).toHaveBeenCalledTimes(3)
        expect(onFulfilled).not.toHaveBeenCalled()

        // notify() - the loop doesn't run again until notify
        await whenNextTick()
        expect(isDone).toHaveBeenCalledTimes(3)
        expect(onFulfilled).not.toHaveBeenCalled()

        notify()
        await whenNextTick()
        expect(isDone).toHaveBeenCalledTimes(4)
        expect(onFulfilled).not.toHaveBeenCalled()

        isDone.mockReturnValueOnce(true)
        notify()
        await whenNextTick()
        expect(isDone).toHaveBeenCalledTimes(5)
        expect(onFulfilled).toHaveBeenCalled()
    })

    test('keeps the loop running forever, if undefined', async () => {
        let notify = noop
        const onFulfilled = jest.fn()
        const isDone = jest.fn(() => false)
        const work = jest.fn()
        const instance = { isDone, work }
        workLoop((notifyArgument) => {
            notify = notifyArgument
            return instance
        }).finally(onFulfilled)

        await whenNextTick()
        expect(work).toHaveBeenCalledTimes(1)
        expect(onFulfilled).not.toHaveBeenCalled()

        notify()
        await whenNextTick()
        expect(work).toHaveBeenCalledTimes(2)
        expect(onFulfilled).not.toHaveBeenCalled()

        notify()
        await whenNextTick()
        expect(work).toHaveBeenCalledTimes(3)
        expect(onFulfilled).not.toHaveBeenCalled()

        notify()
        await whenNextTick()
        expect(work).toHaveBeenCalledTimes(4)
        expect(onFulfilled).not.toHaveBeenCalled()
    })
})

describe('work', () => {
    test('called asynchronously', async () => {
        let notify = noop
        const work = jest.fn()
        const instance = { work }
        workLoop((notifyArgument) => {
            notify = notifyArgument
            return instance
        })
        expect(work).toHaveBeenCalledTimes(0)
        await whenNextTick()
        expect(work).toHaveBeenCalledTimes(1)
        expect(work).toHaveBeenCalledWith(notify)
        expect(work.mock.instances[0]).toBe(instance)
    })

    test('is optional', async () => {
        let notify = noop
        let called = false
        const isDone = () => {
            if (called) return true
            called = true
            queueMicrotask(notify)
            return false
        }
        const instance = { isDone }
        await workLoop((notifyArgument) => {
            notify = notifyArgument
            return instance
        })
    })

    test('returns', async () => {
        let notify = noop
        const work = jest.fn(() => undefined)
        const instance = { work }
        workLoop((notifyArgument) => {
            notify = notifyArgument
            return instance
        })
        expect(work).toHaveBeenCalledTimes(0)

        await whenNextTick()
        expect(work).toHaveBeenCalledTimes(1)

        notify()
        await whenNextTick()
        expect(work).toHaveBeenCalledTimes(2)

        notify()
        await whenNextTick()
        expect(work).toHaveBeenCalledTimes(3)
    })

    test('resolves', async () => {
        let resolvePromise = noop
        const promise = new Promise<void>(
            (resolve) => (resolvePromise = resolve),
        )
        let notify = noop
        const work = jest.fn(() => promise)
        const instance = { work }
        workLoop((notifyArgument) => {
            notify = notifyArgument
            return instance
        })
        expect(work).toHaveBeenCalledTimes(0)

        await whenNextTick()
        expect(work).toHaveBeenCalledTimes(1)

        // "work" not called again because the promise it returned has not been fulfilled.
        notify()
        await whenNextTick()
        expect(work).toHaveBeenCalledTimes(1)

        resolvePromise()
        await whenNextTick()
        expect(work).toHaveBeenCalledTimes(2)
    })

    test('throws', async () => {
        const onError = jest.fn()
        let notify = noop
        const work = jest.fn(() => {
            throw error
        })
        const instance = { work, onError }
        workLoop((notifyArgument) => {
            notify = notifyArgument
            return instance
        })
        expect(work).toHaveBeenCalledTimes(0)

        await whenNextTick()
        expect(work).toHaveBeenCalledTimes(1)
        expect(onError).toHaveBeenCalledTimes(1)
        expect(onError).toHaveBeenNthCalledWith(1, error)

        notify()
        await whenNextTick()
        expect(work).toHaveBeenCalledTimes(2)
        expect(onError).toHaveBeenCalledTimes(2)
        expect(onError).toHaveBeenNthCalledWith(2, error)

        notify()
        await whenNextTick()
        expect(work).toHaveBeenCalledTimes(3)
        expect(onError).toHaveBeenCalledTimes(3)
        expect(onError).toHaveBeenNthCalledWith(3, error)
    })

    test('rejects', async () => {
        let rejectPromise = (_error: Error): void => undefined
        const promise = new Promise<void>(
            (_resolve, reject) => (rejectPromise = reject),
        )
        let notify = noop
        const onError = jest.fn()
        const work = jest.fn((): void | Promise<void> => undefined)
        work.mockImplementationOnce(() => promise)
        const instance = { work, onError }
        workLoop((notifyArgument) => {
            notify = notifyArgument
            return instance
        })
        expect(work).toHaveBeenCalledTimes(0)

        await whenNextTick()
        expect(work).toHaveBeenCalledTimes(1)
        expect(onError).toHaveBeenCalledTimes(0)

        // "work" not called again because the promise it returned has not been fulfilled.
        notify()
        await whenNextTick()
        expect(work).toHaveBeenCalledTimes(1)
        expect(onError).toHaveBeenCalledTimes(0)

        rejectPromise(error)
        await whenNextTick()
        expect(work).toHaveBeenCalledTimes(2)
        expect(onError).toHaveBeenCalledTimes(1)
        expect(onError).toHaveBeenNthCalledWith(1, error)
    })
})

describe('onError', () => {
    test('reports thrown errors', async () => {
        const onError = jest.fn()
        const work = () => {
            throw error
        }
        const instance = { work, onError }
        workLoop(() => instance)
        expect(onError).toHaveBeenCalledTimes(0)
        await whenNextTick()
        expect(onError).toHaveBeenCalledTimes(1)
        expect(onError).toHaveBeenCalledWith(error)
    })

    test('reports rejected errors', async () => {
        const onError = jest.fn()
        const work = () => Promise.reject(error)
        const instance = { work, onError }
        workLoop(() => instance)
        expect(onError).toHaveBeenCalledTimes(0)
        await whenNextTick()
        expect(onError).toHaveBeenCalledTimes(1)
        expect(onError).toHaveBeenCalledWith(error)
    })

    test('if omitted, the loop ends on thrown error', async () => {
        const work = () => {
            throw error
        }
        const instance = { work }
        await expect(workLoop(() => instance)).rejects.toBe(error)
    })

    test('if omitted, the loop ends on rejected error', async () => {
        const work = () => Promise.reject(error)
        const instance = { work }
        await expect(workLoop(() => instance)).rejects.toBe(error)
    })
})

describe('retryDelay', () => {
    let clock: InstalledClock

    beforeEach(() => {
        clock = installClock()
    })

    afterEach(() => {
        clock.uninstall()
    })

    test('called asynchronously', async () => {
        let notify = noop
        let now = 0
        const onError = noop
        const work = jest.fn<void, []>(() => {
            throw error
        })
        const retryDelay = jest.fn((retryAttempt) => 1 + retryAttempt * 2)
        const instance = { retryDelay, work, onError }
        workLoop((notifyArgument) => {
            notify = notifyArgument
            return instance
        })
        expect(retryDelay).toHaveBeenCalledTimes(0)

        expect(clock.now).toBe(now)
        await whenNextTick()
        expect(retryDelay).toHaveBeenCalledTimes(1)
        expect(retryDelay).toHaveBeenNthCalledWith(1, 0)
        expect(retryDelay.mock.instances[0]).toBe(instance)

        // notify() not needed now because the timer will fire the next iteration.
        expect(clock.countTimers()).toBe(1)
        clock.next()
        expect(clock.now).toBe((now += 1))
        await whenNextTick()
        expect(retryDelay).toHaveBeenCalledTimes(2)
        expect(retryDelay).toHaveBeenNthCalledWith(2, 1)

        // notify() not needed now because the timer will fire the next iteration.
        expect(clock.countTimers()).toBe(1)
        clock.next()
        expect(clock.now).toBe((now += 3))
        await whenNextTick()
        expect(retryDelay).toHaveBeenCalledTimes(3)
        expect(retryDelay).toHaveBeenNthCalledWith(3, 2)

        // notify() not needed now because the timer will fire the next iteration.
        expect(clock.countTimers()).toBe(1)
        clock.next()
        expect(clock.now).toBe((now += 5))
        await whenNextTick()
        expect(retryDelay).toHaveBeenCalledTimes(4)
        expect(retryDelay).toHaveBeenNthCalledWith(4, 3)

        // work() will succeed once.
        work.mockImplementationOnce(() => undefined)

        // notify() not needed now because the timer will fire the next iteration.
        expect(clock.countTimers()).toBe(1)
        clock.next()
        expect(clock.now).toBe((now += 7))
        await whenNextTick()
        expect(retryDelay).toHaveBeenCalledTimes(4)

        // notify() needed now because there's no timer.
        expect(clock.countTimers()).toBe(0)
        notify()
        await whenNextTick()
        expect(retryDelay).toHaveBeenCalledTimes(5)
        expect(retryDelay).toHaveBeenNthCalledWith(5, 0)

        // notify() not needed now because the timer will fire the next iteration.
        expect(clock.countTimers()).toBe(1)
        clock.next()
        expect(clock.now).toBe((now += 1))
        await whenNextTick()
        expect(retryDelay).toHaveBeenCalledTimes(6)
        expect(retryDelay).toHaveBeenNthCalledWith(6, 1)

        // notify() can still trigger the next operation, regardless of the timer.
        expect(clock.countTimers()).toBe(1)
        notify()
        expect(clock.now).toBe((now += 0))
        await whenNextTick()
        expect(retryDelay).toHaveBeenCalledTimes(7)
        expect(retryDelay).toHaveBeenNthCalledWith(7, 2)

        // The old timer has not fired yet. Triggering it will not cause a new iteration.
        expect(clock.countTimers()).toBe(2)
        clock.next()
        expect(clock.now).toBe((now += 3))
        await whenNextTick()
        expect(retryDelay).toHaveBeenCalledTimes(7)

        // Now trigger the new timer, which was set for 5 milliseconds.
        // Note that 3 milliseconds have already elapsed.
        expect(clock.countTimers()).toBe(1)
        clock.next()
        expect(clock.now).toBe((now += 5 - 3))
        await whenNextTick()
        expect(retryDelay).toHaveBeenCalledTimes(8)
        expect(retryDelay).toHaveBeenNthCalledWith(8, 3)
    })

    test('if omitted, there is no max delay', async () => {
        let notify = noop
        const onError = noop
        const work = jest.fn<void, []>(() => {
            throw error
        })
        const instance = { work, onError }
        workLoop((notifyArgument) => {
            notify = notifyArgument
            return instance
        })

        await whenNextTick()
        expect(work).toHaveBeenCalledTimes(1)
        expect(clock.countTimers()).toBe(0)

        notify()
        await whenNextTick()
        expect(work).toHaveBeenCalledTimes(2)
        expect(clock.countTimers()).toBe(0)

        await whenNextTick()
        expect(work).toHaveBeenCalledTimes(2)
        expect(clock.countTimers()).toBe(0)

        await whenNextTick()
        expect(work).toHaveBeenCalledTimes(2)
        expect(clock.countTimers()).toBe(0)
    })
})
