import { toArrayBuffer } from '@syncot/util'
import { isLocationId, locationIdEqual } from '.'

describe('isLocationId', () => {
    test.each<[any, boolean]>([
        ['abc', true],
        [0, true],
        [new ArrayBuffer(0), true],
        [new SharedArrayBuffer(0), false],
        [Buffer.allocUnsafe(1), false],
        [new DataView(new ArrayBuffer(0)), false],
        [false, false],
        [true, false],
        [null, true],
        [undefined, false],
    ])('%s', (locationId, expectedResult) => {
        expect(isLocationId(locationId)).toBe(expectedResult)
    })
})

describe('locationIdEqual', () => {
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
        [null, null, true],
        [null, undefined, false],
        [undefined, null, false],
        [undefined, undefined, false],
        [null, '', false],
        [null, 0, false],
        [0, '', false],
        [0, null, false],
        ['', 0, false],
        ['', null, false],
    ])('(%p === %p) is %p', (locationId1, locationId2, expectedResult) => {
        expect(locationIdEqual(locationId1, locationId2)).toBe(expectedResult)
    })
})
