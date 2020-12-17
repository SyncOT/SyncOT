import { EventEmitter } from 'events'
import { install as installClock, InstalledClock } from '@sinonjs/fake-timers'
import {
    createInvalidEntityError,
    delay,
    first,
    last,
    noop,
    randomInteger,
    throwError,
    validate,
    Validator,
    whenClose,
    whenData,
    whenError,
    whenEvent,
    whenNextTick,
} from '.'
import { combine, separate } from './util'

describe('throwError', () => {
    const error = createInvalidEntityError('test error', null)

    test('throws the specified error', () => {
        expect(() => throwError(error)).toThrowError(error)
    })
    test('does not throw an error, if undefined', () => {
        expect(() => throwError(undefined)).not.toThrowError()
    })
})

describe('validate', () => {
    const numberError = createInvalidEntityError('number error', null)
    const positiveError = createInvalidEntityError('positive error', null)

    const numberValidator: Validator<any> = (target: any) =>
        typeof target === 'number' ? undefined : numberError
    const positiveValidator: Validator<any> = (target: any) =>
        target > 0 ? undefined : positiveError

    test('success', () => {
        expect(validate([numberValidator, positiveValidator])(5)).toBe(
            undefined,
        )
    })
    test('first validator fails', () => {
        expect(validate([numberValidator, positiveValidator])('5')).toBe(
            numberError,
        )
    })
    test('second validator fails', () => {
        expect(validate([numberValidator, positiveValidator])(-5)).toBe(
            positiveError,
        )
    })
})

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

describe('delay', () => {
    let clock: InstalledClock

    beforeEach(() => {
        clock = installClock()
    })

    afterEach(() => {
        clock.uninstall()
    })

    test.each([undefined, 0, 1, 2, 1000])('timeout=%p', async (timeout) => {
        const promise = delay(timeout)
        expect(clock.countTimers()).toBe(1)
        clock.next()
        expect(clock.now).toBe(timeout || 0)
        await expect(promise).resolves.toBeUndefined()
    })
})

test('whenEvent', async () => {
    const emitter = new EventEmitter()
    process.nextTick(() => emitter.emit('custom'))
    await whenEvent('custom')(emitter)
})

test('whenData', async () => {
    const emitter = new EventEmitter()
    process.nextTick(() => emitter.emit('data'))
    await whenData(emitter)
})

test('whenClose', async () => {
    const emitter = new EventEmitter()
    process.nextTick(() => emitter.emit('close'))
    await whenClose(emitter)
})

test('whenError', async () => {
    const emitter = new EventEmitter()
    process.nextTick(() => emitter.emit('error'))
    await whenError(emitter)
})

describe('randomInteger', () => {
    test('min invalid', () => {
        expect(() => randomInteger(1.5, 5)).toThrow(
            expect.objectContaining({
                message: 'Argument "minInclusive" must be a safe integer.',
                name: 'SyncOTError Assert',
            }),
        )
    })
    test('max invalid', () => {
        expect(() => randomInteger(1, 5.5)).toThrow(
            expect.objectContaining({
                message: 'Argument "maxExclusive" must be a safe integer.',
                name: 'SyncOTError Assert',
            }),
        )
    })
    test('invalid range', () => {
        expect(() => randomInteger(11, 10)).toThrow(
            expect.objectContaining({
                message:
                    'Argument "minInclusive" must be less or equal to argument "maxExclusive".',
                name: 'SyncOTError Assert',
            }),
        )
    })
    test.each([
        Number.MIN_SAFE_INTEGER,
        Number.MAX_SAFE_INTEGER,
        0,
        1,
        -1,
        113,
        -113,
    ])('collapsed range (%d)', (range) => {
        expect(randomInteger(range, range)).toBe(range)
    })
    test.each([
        [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
        [-1113, -9],
        [-10, -9],
        [-2, 1],
        [-113, 113],
        [-1, 2],
        [9, 10],
        [9, 1113],
    ])('%d <= randomInteger < %d', (min, max) => {
        for (let i = 0; i < 1000; ++i) {
            const result = randomInteger(min, max)

            // Avoid calling expect if the result is ok in order to improve performance.
            if (!(min <= result && result < max)) {
                expect(result).toBeGreaterThanOrEqual(min)
                expect(result).toBeLessThan(max)
            }
        }
    })
})

describe('combine & separate', () => {
    // A special case for an empty array input.
    test('[] = ""', () => {
        expect(combine()).toBe('')
    })
    // combine -> separate -> combine
    test.each([
        [[''], ''],
        [['', ''], '~'],
        [['', '', ''], '~~'],
        [['a'], 'a'],
        [['abc'], 'abc'],
        [['abc', 'def', 'ghi'], 'abc~def~ghi'],
        [['', 'abc', 'def', ''], '~abc~def~'],
        [['~'], '!~'],
        [['~~'], '!~!~'],
        [['', '~~'], '~!~!~'],
        [['~~', '', '~~'], '!~!~~~!~!~'],
        [['!'], '!!'],
        [['!!'], '!!!!'],
        [['!!', '', '!'], '!!!!~~!!'],
        [['!~!', '~', '', '!'], '!!!~!!~!~~~!!'],
        [['a!', 'b~', 'c', '!d', '~e', ''], 'a!!~b!~~c~!!d~!~e~'],
    ])('%p = %p', (parts, combined) => {
        expect(combine(...parts)).toBe(combined)
        expect(separate(combined)).toStrictEqual(parts)
    })
    // separate(unnecessary escape chars in input) -> combine -> separate
    test.each([
        ['!a', ['a']],
        ['123!!!abc', ['123!abc']],
        ['~!$!~', ['', '$~']],
    ])('%p = %p', (combined, parts) => {
        expect(separate(combined)).toStrictEqual(parts)
        expect(combine(...parts)).not.toBe(combined)
        expect(separate(combine(...parts))).toStrictEqual(parts)
    })
})

describe('first', () => {
    test.each<[any[], any]>([
        [[], undefined],
        [[null], null],
        [[1, 2, 3], 1],
        [[3, 2, 1], 3],
        [['1', '2', '3'], '1'],
        ((a) => [[a, 1, 2, 3], a])({}) as [any[], any],
    ])('first(%p) === %p', (array, result) => {
        expect(first(array)).toBe(result)
    })
})

describe('last', () => {
    test.each<[any[], any]>([
        [[], undefined],
        [[null], null],
        [[1, 2, 3], 3],
        [[3, 2, 1], 1],
        [['1', '2', '3'], '3'],
        ((a) => [[1, 2, 3, a], a])({}) as [any[], any],
    ])('last(%p) === %p', (array, result) => {
        expect(last(array)).toBe(result)
    })
})
