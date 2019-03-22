import { toArrayBuffer } from '@syncot/util'
import { isSessionId, sessionIdEqual } from '.'

describe('isSessionId', () => {
    test.each<[any, boolean]>([
        ['abc', false],
        [0, false],
        [new ArrayBuffer(0), true],
        [new SharedArrayBuffer(0), false],
        [Buffer.allocUnsafe(1), false],
        [new DataView(new ArrayBuffer(0)), false],
        [false, false],
        [true, false],
    ])('%s', (sessionId, expectedResult) => {
        expect(isSessionId(sessionId)).toBe(expectedResult)
    })
})

describe('sessionIdEqual', () => {
    test.each<[any, any, boolean]>([
        [5, '5', false],
        ['5', 5, false],
        [new ArrayBuffer(1), 0, false],
        [0, new ArrayBuffer(1), false],
        [Buffer.allocUnsafe(0), Buffer.allocUnsafe(0), false],
        ['abc', 'abc', false],
        ['abce', 'abcd', false],
        [5, 5, false],
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
    ])('(%p === %p) is %p', (sessionId1, sessionId2, expectedResult) => {
        expect(sessionIdEqual(sessionId1, sessionId2)).toBe(expectedResult)
    })
})
