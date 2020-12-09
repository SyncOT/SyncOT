import { exponentialBackOffStrategy } from '.'

describe('exponentialBackOffStrategy', () => {
    test.each<
        [
            number | undefined,
            number | undefined,
            number | undefined,
            number,
            number,
        ]
    >([
        [undefined, undefined, undefined, -2, 1000],
        [undefined, undefined, undefined, -1, 1000],
        [undefined, undefined, undefined, 0, 1000],
        [undefined, undefined, undefined, 1, 1000 * 1.5],
        [undefined, undefined, undefined, 2, 1000 * 1.5 * 1.5],
        [undefined, undefined, undefined, 33, 10000],

        [5, 100, 2, -2, 5],
        [5, 100, 2, -1, 5],
        [5, 100, 2, 0, 5],
        [5, 100, 2, 1, 5 * 2],
        [5, 100, 2, 2, 5 * 2 * 2],
        [5, 100, 2, 33, 100],

        [5, 100, 1.5, -2, 5],
        [5, 100, 1.5, -1, 5],
        [5, 100, 1.5, 0, 5],
        [5, 100, 1.5, 1, Math.floor(5 * 1.5)],
        [5, 100, 1.5, 2, Math.floor(5 * 1.5 * 1.5)],
        [5, 100, 1.5, 33, 100],
    ])(
        'minDelay=%p, maxDelay=%p, delayFactor=%p, retryAttempt=%p, result=%p',
        (minDelay, maxDelay, delayFactor, retryAttempt, result) => {
            expect(
                exponentialBackOffStrategy({
                    minDelay,
                    maxDelay,
                    delayFactor,
                })(retryAttempt),
            ).toBe(result)
        },
    )

    test.each<[number, number]>([
        [-2, 1000],
        [-1, 1000],
        [0, 1000],
        [1, 1000 * 1.5],
        [2, 1000 * 1.5 * 1.5],
        [33, 10000],
    ])('no options, retryAttempt=%p, result=%p', (retryAttempt, result) => {
        expect(exponentialBackOffStrategy()(retryAttempt)).toBe(result)
    })

    test('invalid minDelay: NaN', () => {
        expect(() => exponentialBackOffStrategy({ minDelay: NaN })).toThrow(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: '"minDelay" must be a safe integer >= 0.',
            }),
        )
    })
    test('invalid minDelay: -1', () => {
        expect(() => exponentialBackOffStrategy({ minDelay: -1 })).toThrow(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: '"minDelay" must be a safe integer >= 0.',
            }),
        )
    })

    test('invalid maxDelay: NaN', () => {
        expect(() => exponentialBackOffStrategy({ maxDelay: NaN })).toThrow(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: '"maxDelay" must be a safe integer >= minDelay.',
            }),
        )
    })
    test('invalid maxDelay: -1', () => {
        expect(() => exponentialBackOffStrategy({ maxDelay: -1 })).toThrow(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: '"maxDelay" must be a safe integer >= minDelay.',
            }),
        )
    })

    test('invalid delayFactor: NaN', () => {
        expect(() => exponentialBackOffStrategy({ delayFactor: NaN })).toThrow(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: '"delayFactor" must be a finite number.',
            }),
        )
    })

    test('invalid retryAttempt: NaN', () => {
        expect(() => exponentialBackOffStrategy()(0.5)).toThrow(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: '"retryAttempt" must be a safe integer.',
            }),
        )
    })
})
