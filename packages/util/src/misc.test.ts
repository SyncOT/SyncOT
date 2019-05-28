import { noop, whenNextTick } from '.'

test('noop', () => {
    expect(noop).toBeFunction()
    expect(noop()).toBeUndefined()
})

test('whenNextTick', async () => {
    await expect(whenNextTick()).resolves.toBeUndefined()
    const promise = Promise.resolve()
    const nextTick = whenNextTick()
    const onPromise = jest.fn()
    const onNextTick = jest.fn()
    promise.then(onPromise)
    nextTick.then(onNextTick)
    await Promise.all([promise, nextTick])
    expect(onPromise).toHaveBeenCalledBefore(onNextTick)
})
