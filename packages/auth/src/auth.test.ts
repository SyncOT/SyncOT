import { toArrayBuffer } from '@syncot/util'
import { isValidUserId } from '.'
import { userIdEqual } from './auth'

describe('isValidUserId', () => {
    test.each<[any, boolean]>([
        ['abc', true],
        [0, true],
        [new ArrayBuffer(0), true],
        [new SharedArrayBuffer(0), false],
        [Buffer.allocUnsafe(1), false],
        [new DataView(new ArrayBuffer(0)), false],
        [false, false],
        [true, false],
    ])('%s', (userId, expectedResult) => {
        expect(isValidUserId(userId)).toBe(expectedResult)
    })
})

describe('userIdEqual', () => {
    test.each<[any, any, boolean]>([
        [5, '5', false],
        ['5', 5, false],
        [new ArrayBuffer(1), 0, false],
        [0, new ArrayBuffer(1), false],
        [Buffer.allocUnsafe(0), Buffer.allocUnsafe(0), false],
        ['abc', 'abc', true],
        ['abce', 'abcd', false],
        [5, 5, true],
        [5, 6, false],
        [
            toArrayBuffer(Buffer.from([1, 2, 3])),
            toArrayBuffer(Buffer.from([1, 2, 3])),
            true,
        ],
        [
            toArrayBuffer(Buffer.from([1, 2, 3, 5])),
            toArrayBuffer(Buffer.from([1, 2, 3, 4])),
            false,
        ],
    ])('(%p === %p) is %p', (userId1, userId2, expectedResult) => {
        expect(userIdEqual(userId1, userId2)).toBe(expectedResult)
    })
})
