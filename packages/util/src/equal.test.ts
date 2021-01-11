import { equal, noop } from '.'

test.each<[any, any, boolean]>([
    [[], {}, false],
    [{}, [], false],
    [new Array(1), new Array(2), false],
    [[1, { a: 1 }], [1, { a: 2 }], false],
    [[1, { a: 1 }], [1, { a: 1 }], true],
    [{}, 5, false],
    [{}, null, false],
    [{ a: 1, b: 2 }, { a: 1 }, false],
    [
        { a: 1, b: 2 },
        Object.create(
            { b: 2 },
            {
                a: { value: 1, enumerable: true },
                c: { value: 3, enumerable: true },
            },
        ),
        false,
    ],
    [{ a: { b: 2, c: 3 }, d: 4 }, { a: { b: 2, c: 5 }, d: 4 }, false],
    [{ a: { b: 2, c: 3 }, d: 4 }, { a: { b: 2, c: 3 }, d: 4 }, true],
    [{ a: { b: 2, c: 3 }, d: 4 }, { a: { c: 3, b: 2 }, d: 4 }, true],
    [5, '5', false],
    [5, 6, false],
    [5, false, false],
    [5, true, false],
    [5, {}, false],
    [5, [], false],
    [5, null, false],
    [5, undefined, false],
    [5, 5, true],
    ['5', '5', true],
    [true, true, true],
    [false, false, true],
    [noop, noop, true],
])('equal(%p, %p) === %p', (value1, value2, result) => {
    expect(equal(value1, value2)).toBe(result)
})
