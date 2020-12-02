import { hash, noop } from '.'
import { replacer } from './hash'

describe('replacer', () => {
    test.each([undefined, noop, Symbol()])('%p => undefined', (input) => {
        expect(JSON.stringify(input, replacer)).toBe(undefined)
    })
    test.each<[any, any]>([
        [null, null],
        [false, false],
        [true, true],
        ['', ''],
        ['abc', 'abc'],
        [0, 0],
        [5, 5],
        [5.5, 5.5],
        [{}, ['O']],
        [
            { abc: 123, def: { ghi: true, jkl: false, mno: [1, 2, 3] } },
            [
                'O',
                'abc',
                123,
                'def',
                ['O', 'ghi', true, 'jkl', false, 'mno', ['A', 1, 2, 3]],
            ],
        ],
        [
            { def: { jkl: false, ghi: true, mno: [3, 2, 1] }, abc: 123 },
            [
                'O',
                'abc',
                123,
                'def',
                ['O', 'ghi', true, 'jkl', false, 'mno', ['A', 3, 2, 1]],
            ],
        ],
        [[], ['A']],
        [
            ['A', 'B', 'C'],
            ['A', 'A', 'B', 'C'],
        ],
        [
            [{ xyz: true }, { abc: true }],
            ['A', ['O', 'xyz', true], ['O', 'abc', true]],
        ],
        [
            {
                g: false,
                f: Symbol(),
                e: noop,
                d: undefined,
                c: 'ok',
                b: 1,
                a: true,
            },
            ['O', 'a', true, 'b', 1, 'c', 'ok', 'g', false],
        ],
        [
            [true, 1, 'ok', undefined, noop, Symbol(), false],
            ['A', true, 1, 'ok', null, null, null, false],
        ],
    ])('%p => %p', (input, output) => {
        expect(JSON.parse(JSON.stringify(input, replacer))).toStrictEqual(
            output,
        )
    })
})

describe('hash', () => {
    test.each<[any, any]>([
        [undefined, undefined],
        [undefined, noop],
        [undefined, Symbol()],
        ['test', 'test'],
        [1.5, 1.5],
        [true, true],
        [
            { a: 1, b: 2 },
            { a: 1, b: 2 },
        ],
        [
            { a: true, b: true, c: true, d: { x: 1 } },
            { c: true, b: true, a: true, d: { x: 1 } },
        ],
        [
            [1, 2.5, true, { b: 2, a: 1 }, [true, false]],
            [1, 2.5, true, { a: 1, b: 2 }, [true, false]],
        ],
    ])('hash(%p) === hash(%p)', (value1, value2) => {
        expect(hash(value1)).toBe(hash(value2))
    })

    test.each<[any, any]>([
        [undefined, ''],
        [
            { a: true, b: true, c: true, d: { x: 1 } },
            { c: true, b: true, a: true, d: { x: 2 } },
        ],
        [
            [1, 2.5, true, { b: 2, a: 1 }],
            [1, 2.5, true, { a: 1, b: 2, c: 3 }],
        ],
        [
            [1, 2, 3],
            [1, 2, 4],
        ],
        [
            [1, 2, 3],
            [1, 2, 3, 4],
        ],
        [
            [1, 2],
            [2, 1],
        ],
        [
            [1, 2, [true]],
            [1, 2, [false]],
        ],
    ])('hash(%p) !== hash(%p)', (value1, value2) => {
        expect(hash(value1)).not.toBe(hash(value2))
    })
})
