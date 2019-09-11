import { Clock, install as installClock, InstalledClock } from 'lolex'
import { createTaskRunner, TaskRunner, whenNextTick } from '.'

let clock: InstalledClock<Clock>
type Result = string
const result = 'test result'
const testError = new Error('test error')
function returnResult(): Result {
    return result
}
function throwTestError(): Result {
    throw testError
}
function resolveResult(): Promise<Result> {
    return Promise.resolve(result)
}
function rejectTestError(): Promise<Result> {
    return Promise.reject(testError)
}
let task: jest.Mock<Result | Promise<Result>>
let runner: TaskRunner<Result>
const minDelay = 1000
const maxDelay = 10000
const delayFactor = 2
const options = {
    delayFactor,
    maxDelay,
    minDelay,
}
const assertionMatcher = (message: string) =>
    expect.objectContaining({
        message,
        name: 'SyncOtError Assert',
    })

const whenDestroy = () =>
    new Promise(resolve => runner.once('destroy', resolve))

const whenDone = () =>
    new Promise((resolve, reject) =>
        runner.once('done', value => {
            try {
                expect(value).toBe(result)
                resolve()
            } catch (error) {
                reject(error)
            }
        }),
    )

const whenError = () =>
    new Promise((resolve, reject) =>
        runner.once('error', error => {
            try {
                expect(error).toBe(testError)
                resolve()
            } catch (error) {
                reject(error)
            }
        }),
    )

beforeEach(() => {
    clock = installClock()
    task = jest.fn(returnResult)
    runner = createTaskRunner(task, options)
})

afterEach(() => {
    expect(clock.countTimers()).toBe(0)
    runner.destroy()
    clock.uninstall()
})

test.each<any>([-1, 5.5, '5', Infinity, NaN])(
    'invalid minDelay === %p',
    invalidMinDelay => {
        expect(() =>
            createTaskRunner(task, {
                maxDelay: 1000,
                minDelay: invalidMinDelay,
            }),
        ).toThrow(
            assertionMatcher(
                'Argument "minDelay" must be a safe integer >= 0.',
            ),
        )
    },
)
test.each<any>([-1, 1, 5.5, '5', Infinity, NaN])(
    'invalid maxDelay === %p, minDelay === 2',
    invalidMaxDelay => {
        expect(() =>
            createTaskRunner(task, {
                maxDelay: invalidMaxDelay,
                minDelay: 2,
            }),
        ).toThrow(
            assertionMatcher(
                'Argument "maxDelay" must be a safe integer >= minDelay.',
            ),
        )
    },
)
test.each<any>([-1, 0.5, '5', Infinity, NaN])(
    'invalid delayFactor === %p',
    invalidDelayFactor => {
        expect(() =>
            createTaskRunner(task, {
                delayFactor: invalidDelayFactor,
            }),
        ).toThrow(
            assertionMatcher(
                'Argument "delayFactor" must be a finite number >= 1 or === 0.',
            ),
        )
    },
)
test.each<any>([null, undefined, 5, true])(
    'invalid task === %p',
    invalidTask => {
        expect(() => createTaskRunner(invalidTask)).toThrow(
            assertionMatcher('Argument "task" must be a function.'),
        )
    },
)

test('destroy twice', async () => {
    runner.destroy()
    runner.destroy()
    await whenDestroy()
})

test('call `run` when destroyed', () => {
    runner.destroy()
    expect(() => runner.run()).toThrow(assertionMatcher('Already destroyed.'))
})

test('call `run` when task is in progress', async () => {
    task.mockReturnValue(resolveResult())
    runner.run()
    expect(task).toHaveBeenCalledTimes(1)
    expect(clock.countTimers()).toBe(0)
    runner.run()
    expect(task).toHaveBeenCalledTimes(1)
    expect(clock.countTimers()).toBe(0)
    await whenDone()
    expect(clock.countTimers()).toBe(0)
})

test('call `run` when task is scheduled', async () => {
    task.mockImplementationOnce(throwTestError)
    runner.run()
    expect(task).toHaveBeenCalledTimes(1)
    expect(clock.countTimers()).toBe(0)
    await whenError()
    expect(clock.countTimers()).toBe(1)

    runner.run()
    expect(task).toHaveBeenCalledTimes(1)
    expect(clock.countTimers()).toBe(1)

    clock.next()
    expect(task).toHaveBeenCalledTimes(2)
    expect(clock.countTimers()).toBe(0)
    await whenDone()
})

test('run a returning task', async () => {
    runner.run()
    await whenDone()
})

test('run a resolving task', async () => {
    task.mockImplementationOnce(resolveResult)
    runner.run()
    await whenDone()
})

test('run a throwing task', async () => {
    task.mockImplementationOnce(throwTestError)
    runner.run()
    await whenError()
    expect(clock.countTimers()).toBe(1)
    clock.reset()
})

test('run a rejecting task', async () => {
    task.mockImplementationOnce(rejectTestError)
    runner.run()
    await whenError()
    expect(clock.countTimers()).toBe(1)
    clock.reset()
})

test('"done" fires before whenNextTick', async () => {
    const onDone = jest.fn()
    runner.on('done', onDone)
    runner.run()
    expect(onDone).toHaveBeenCalledTimes(0)
    await whenNextTick()
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledWith(result)
})

test('cancel a returning task', async () => {
    const onDone = jest.fn()
    runner.on('done', onDone)
    runner.run()
    runner.cancel()
    expect(onDone).toHaveBeenCalledTimes(0)
    await whenNextTick()
    expect(onDone).toHaveBeenCalledTimes(0)
})

test('"error" fires before whenNextTick', async () => {
    task.mockImplementationOnce(throwTestError)
    const onError = jest.fn()
    runner.on('error', onError)
    runner.run()
    expect(onError).toHaveBeenCalledTimes(0)
    await whenNextTick()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(testError)
    expect(clock.countTimers()).toBe(1)
    clock.reset()
})

test('cancel a throwing task', async () => {
    task.mockImplementationOnce(throwTestError)
    const onError = jest.fn()
    runner.on('error', onError)
    runner.run()
    runner.cancel()
    expect(onError).toHaveBeenCalledTimes(0)
    await whenNextTick()
    expect(onError).toHaveBeenCalledTimes(0)
})

test('cancel a scheduled task', async () => {
    task.mockImplementationOnce(throwTestError)
    runner.run()
    await whenError()
    expect(clock.countTimers()).toBe(1)
    runner.cancel()
    expect(clock.countTimers()).toBe(0)
})

test('cancel a scheduled task on destroy', async () => {
    task.mockImplementationOnce(throwTestError)
    runner.run()
    await whenError()
    expect(clock.countTimers()).toBe(1)
    runner.destroy()
    expect(clock.countTimers()).toBe(0)
})

test('retry with a random delay', async () => {
    task.mockImplementationOnce(throwTestError)
    runner.destroy()
    runner = createTaskRunner(task, {
        delayFactor: 0,
        maxDelay: 1010,
        minDelay: 1000,
    })
    runner.run()
    await whenError()
    clock.next()
    await whenDone()
    expect(clock.now).toBeGreaterThanOrEqual(1000)
    expect(clock.now).toBeLessThanOrEqual(1010)
})

test('retry with exponential back-off', async () => {
    let expectedNow = 0
    task.mockImplementation(throwTestError)

    // Test: The first run.
    task.mockClear()
    runner.run()
    await whenError()
    expect(task).toHaveBeenCalledTimes(1)
    expectedNow = +0
    expect(clock.now).toBe(expectedNow)

    task.mockClear()
    clock.next()
    await whenError()
    expect(task).toHaveBeenCalledTimes(1)
    expectedNow += 1000
    expect(clock.now).toBe(expectedNow)

    task.mockClear()
    clock.next()
    await whenError()
    expect(task).toHaveBeenCalledTimes(1)
    expectedNow += 2000
    expect(clock.now).toBe(expectedNow)

    task.mockClear()
    clock.next()
    await whenError()
    expect(task).toHaveBeenCalledTimes(1)
    expectedNow += 4000
    expect(clock.now).toBe(expectedNow)

    task.mockClear()
    clock.next()
    await whenError()
    expect(task).toHaveBeenCalledTimes(1)
    expectedNow += 8000
    expect(clock.now).toBe(expectedNow)

    task.mockClear()
    clock.next()
    await whenError()
    expect(task).toHaveBeenCalledTimes(1)
    expectedNow += 10000
    expect(clock.now).toBe(expectedNow)

    task.mockImplementation(returnResult)
    task.mockClear()
    clock.next()
    await whenDone()
    expect(task).toHaveBeenCalledTimes(1)
    expectedNow += 10000
    expect(clock.now).toBe(expectedNow)

    // Test: Run after success.
    task.mockImplementation(throwTestError)
    expect(clock.countTimers()).toBe(0)

    task.mockClear()
    runner.run()
    await whenError()
    expect(task).toHaveBeenCalledTimes(1)
    expectedNow += 0
    expect(clock.now).toBe(expectedNow)

    task.mockImplementation(returnResult)
    task.mockClear()
    clock.next()
    await whenDone()
    expect(task).toHaveBeenCalledTimes(1)
    expectedNow += 1000
    expect(clock.now).toBe(expectedNow)

    // Test: Run after failure.
    task.mockImplementation(throwTestError)
    expect(clock.countTimers()).toBe(0)

    task.mockClear()
    runner.run()
    await whenError()
    expect(task).toHaveBeenCalledTimes(1)
    expectedNow += 0
    expect(clock.now).toBe(expectedNow)

    task.mockClear()
    clock.next()
    await whenError()
    expect(task).toHaveBeenCalledTimes(1)
    expectedNow += 1000
    expect(clock.now).toBe(expectedNow)

    task.mockClear()
    runner.cancel()
    runner.run()
    await whenError()
    expect(task).toHaveBeenCalledTimes(1)
    expectedNow += 0
    expect(clock.now).toBe(expectedNow)

    task.mockClear()
    clock.next()
    await whenError()
    expect(task).toHaveBeenCalledTimes(1)
    expectedNow += 1000
    expect(clock.now).toBe(expectedNow)

    task.mockImplementation(returnResult)
    task.mockClear()
    clock.next()
    await whenDone()
    expect(task).toHaveBeenCalledTimes(1)
    expectedNow += 2000
    expect(clock.now).toBe(expectedNow)
})
