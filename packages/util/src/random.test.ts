import { randomInteger } from '.'

describe('randomInteger', () => {
    test('min invalid', () => {
        expect(() => randomInteger(1.5, 5)).toThrow(
            expect.objectContaining({
                message: 'Argument "minInclusive" must be a safe integer.',
                name: 'AssertionError',
            }),
        )
    })
    test('max invalid', () => {
        expect(() => randomInteger(1, 5.5)).toThrow(
            expect.objectContaining({
                message: 'Argument "maxExclusive" must be a safe integer.',
                name: 'AssertionError',
            }),
        )
    })
    test('invalid range', () => {
        expect(() => randomInteger(11, 10)).toThrow(
            expect.objectContaining({
                message:
                    'Argument "minInclusive" must be less or equal to argument "maxExclusive".',
                name: 'AssertionError',
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
