import { delay } from '@syncot/util'
import { globalEventLoop } from '.'

const eventLoop = globalEventLoop()

function blockEventLoop(): void {
    while (eventLoop.cycleDuration <= eventLoop.cycleTargetDuration) {
        // Block the event loop for a while.
    }
}

beforeEach(async () => {
    eventLoop.cycleTargetDuration = 10
    await delay(0)
})

test('invalid cycleTargetDuration - a fraction', () => {
    expect(() => (eventLoop.cycleTargetDuration = 122.5)).toThrow(
        expect.objectContaining({
            message: 'cycleTargetDuration must be a 32 bit integer.',
            name: 'TypeError',
        }),
    )
})

test('invalid cycleTargetDuration - too small', () => {
    expect(() => (eventLoop.cycleTargetDuration = 9)).toThrow(
        expect.objectContaining({
            message: 'cycleTargetDuration must be >= 10.',
            name: 'RangeError',
        }),
    )
})

test('execute a task synchronously', () => {
    eventLoop.cycleTargetDuration = 10000
    const task = jest.fn()
    expect(eventLoop.execute(task)).toBe(true)
    expect(task).toHaveBeenCalledTimes(1)
})

test('schedule a task for the next cycle', async () => {
    let resolve: jest.Mock
    const promise = new Promise(r => (resolve = jest.fn(r)))
    blockEventLoop()
    expect(eventLoop.execute(resolve!)).toBe(false)
    expect(resolve!).toHaveBeenCalledTimes(0)
    await promise
    expect(resolve!).toHaveBeenCalledTimes(1)
})

test('execute tasks after setting `cycleTargetDuration`', async () => {
    const task1 = jest.fn()
    const task2 = jest.fn()
    blockEventLoop()
    expect(eventLoop.execute(task1)).toBe(false)
    expect(eventLoop.execute(task2)).toBe(false)
    expect(task1).toHaveBeenCalledTimes(0)
    expect(task2).toHaveBeenCalledTimes(0)
    eventLoop.cycleTargetDuration = 1000000000
    await delay(0)
    expect(task1).toHaveBeenCalledTimes(1)
    expect(task2).toHaveBeenCalledTimes(1)
    expect(task1).toHaveBeenCalledBefore(task2)
})

test('run 2 scheduled tasks - no rescheduling', async () => {
    const task1 = jest.fn()
    const task2 = jest.fn()
    blockEventLoop()
    expect(eventLoop.execute(task1)).toBe(false)
    expect(eventLoop.execute(task2)).toBe(false)
    expect(task1).toHaveBeenCalledTimes(0)
    expect(task2).toHaveBeenCalledTimes(0)
    await delay(0)
    expect(task1).toHaveBeenCalledTimes(1)
    expect(task2).toHaveBeenCalledTimes(1)
})

test('run 2 scheduled tasks - reschedule the second task', async () => {
    const task1 = jest.fn(blockEventLoop)
    const task2 = jest.fn()
    blockEventLoop()
    expect(eventLoop.execute(task1)).toBe(false)
    expect(eventLoop.execute(task2)).toBe(false)
    expect(task1).toHaveBeenCalledTimes(0)
    expect(task2).toHaveBeenCalledTimes(0)
    await delay(0)
    expect(task1).toHaveBeenCalledTimes(1)
    expect(task2).toHaveBeenCalledTimes(0)
    await delay(0)
    expect(task1).toHaveBeenCalledTimes(1)
    expect(task2).toHaveBeenCalledTimes(1)
})

test('nothing scheduled', async () => {
    blockEventLoop()
    await delay(0)
})

test('execute tasks in the correct order', async () => {
    blockEventLoop()
    const task4 = jest.fn()
    const task3 = jest.fn()
    const task2 = jest.fn()
    const task1 = jest.fn(() => eventLoop.execute(task3))
    eventLoop.execute(task1)
    eventLoop.execute(task2)
    expect(task1).not.toHaveBeenCalled()
    await delay(0)
    expect(task1).toHaveBeenCalledTimes(1)
    expect(task2).toHaveBeenCalledTimes(1)
    expect(task3).toHaveBeenCalledTimes(1)
    expect(task1).toHaveBeenCalledBefore(task2)
    expect(task2).toHaveBeenCalledBefore(task3)
    eventLoop.execute(task4)
    expect(task4).toHaveBeenCalledTimes(1)
})
