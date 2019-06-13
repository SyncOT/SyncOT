import { Clock, install as installClock, InstalledClock } from 'lolex'
import { randomInteger } from '.'
import { assert, delay, generateId, noop, whenNextTick } from '.'

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
    let clock: InstalledClock<Clock>

    beforeEach(() => {
        clock = installClock()
    })

    afterEach(() => {
        clock.uninstall()
    })

    test.each([undefined, 0, 1, 2, 1000])('timeout=%p', async timeout => {
        const promise = delay(timeout)
        expect(clock.countTimers()).toBe(1)
        clock.next()
        expect(clock.now).toBe(timeout || 0)
        await expect(promise).resolves.toBeUndefined()
    })
})

describe('randomInteger', () => {
    test('min invalid', () => {
        expect(() => randomInteger(1.5, 5)).toThrow(
            expect.objectContaining({
                message: 'Argument "minInclusive" must be a safe integer.',
                name: 'SyncOtError Assert',
            }),
        )
    })
    test('max invalid', () => {
        expect(() => randomInteger(1, 5.5)).toThrow(
            expect.objectContaining({
                message: 'Argument "maxExclusive" must be a safe integer.',
                name: 'SyncOtError Assert',
            }),
        )
    })
    test('invalid range', () => {
        expect(() => randomInteger(11, 10)).toThrow(
            expect.objectContaining({
                message:
                    'Argument "minInclusive" must be less or equal to argument "maxExclusive".',
                name: 'SyncOtError Assert',
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
    ])('collapsed range (%d)', range => {
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

describe('generateId', () => {
    let clock: InstalledClock<Clock>

    beforeEach(() => {
        clock = installClock()
    })

    afterEach(() => {
        clock.uninstall()
    })

    test('generate some IDs', () => {
        let time: number = NaN
        let random: number = NaN
        let counter: number = NaN
        let expectedCounter: number = 0

        const nextId = () => {
            const id = generateId()
            const idBuffer = Buffer.from(id, 'base64')
            time = idBuffer.readUIntBE(0, 4)
            random = idBuffer.readUIntBE(4, 5)
            counter = idBuffer.readUIntBE(9, 3)
            /* tslint:disable-next-line:no-bitwise */
            expectedCounter = (expectedCounter + 1) & 0x00ffffff
        }

        nextId()
        const expectedRandom = random
        expectedCounter = counter
        expect(time).toBe(0)
        expect(random).toBe(expectedRandom)
        expect(counter).toBe(expectedCounter)

        nextId()
        expect(time).toBe(0)
        expect(random).toBe(expectedRandom)
        expect(counter).toBe(expectedCounter)

        nextId()
        expect(time).toBe(0)
        expect(random).toBe(expectedRandom)
        expect(counter).toBe(expectedCounter)

        clock.tick(1)
        nextId()
        expect(time).toBe(0)
        expect(random).toBe(expectedRandom)
        expect(counter).toBe(expectedCounter)

        clock.tick(998)
        nextId()
        expect(time).toBe(0)
        expect(random).toBe(expectedRandom)
        expect(counter).toBe(expectedCounter)

        clock.tick(1)
        nextId()
        expect(time).toBe(1)
        expect(random).toBe(expectedRandom)
        expect(counter).toBe(expectedCounter)

        clock.tick(0xfffffffe * 1000)
        nextId()
        expect(time).toBe(0xffffffff)
        expect(random).toBe(expectedRandom)
        expect(counter).toBe(expectedCounter)

        clock.tick(1000)
        nextId()
        expect(time).toBe(0)
        expect(random).toBe(expectedRandom)
        expect(counter).toBe(expectedCounter)

        clock.tick(1000)
        nextId()
        expect(time).toBe(1)
        expect(random).toBe(expectedRandom)
        expect(counter).toBe(expectedCounter)

        clock.tick(2000)
        nextId()
        expect(time).toBe(3)
        expect(random).toBe(expectedRandom)
        expect(counter).toBe(expectedCounter)
    })
})

describe('assert', () => {
    const message = 'Test message'

    test.each([true, 1, {}, noop, [], 'false'])(
        'do not throw on: value === %p',
        value => {
            assert(value, message)
        },
    )

    test.each([false, 0, null, undefined, ''])(
        'throw on: value === %p',
        value => {
            expect(() => assert(value, message)).toThrow(
                expect.objectContaining({
                    message,
                    name: 'SyncOtError Assert',
                }),
            )
        },
    )

    test('do not throw without a message', () => {
        assert(true)
    })

    test('throw without a message', () => {
        expect(() => assert(false)).toThrow(
            expect.objectContaining({
                message: '',
                name: 'SyncOtError Assert',
            }),
        )
    })
})
