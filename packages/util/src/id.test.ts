import { idEqual, isId } from '.'

describe('isId', () => {
    test.each<[any, boolean]>([
        ['abc', true],
        [0, true],
        [new ArrayBuffer(0), false],
        [new SharedArrayBuffer(0), false],
        [Buffer.allocUnsafe(1), true],
        [new DataView(new ArrayBuffer(0)), false],
        [false, false],
        [true, false],
        [null, false],
        [undefined, false],
    ])('%s', (userId, expectedResult) => {
        expect(isId(userId)).toBe(expectedResult)
    })
})

describe('idEqual', () => {
    test.each<[any, any, boolean]>([
        [5, '5', false],
        ['5', 5, false],
        [Buffer.from([0]), 0, false],
        [0, Buffer.from([0]), false],
        [Buffer.allocUnsafe(0), Buffer.allocUnsafe(0), true],
        [Buffer.from('qwerty'), Buffer.from('qwerty'), true],
        [Buffer.from('qwerty'), Buffer.from('qwerty!'), false],
        [Buffer.from('qwerty?'), Buffer.from('qwerty'), false],
        [Buffer.from('qwerty?'), Buffer.from('qwerty!'), false],
        ['abc', 'abc', true],
        ['abce', 'abcd', false],
        [5, 5, true],
        [5, 6, false],
        [null, null, false],
        [null, undefined, false],
        [undefined, null, false],
        [undefined, undefined, false],
        [null, '', false],
        [null, 0, false],
        [0, '', false],
        [0, null, false],
        ['', 0, false],
        ['', null, false],
    ])('(%p === %p) is %p', (userId1, userId2, expectedResult) => {
        expect(idEqual(userId1, userId2)).toBe(expectedResult)
    })
})
