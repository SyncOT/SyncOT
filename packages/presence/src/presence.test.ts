import { toArrayBuffer } from '@syncot/util'
import { isLocationId, locationIdEqual, Presence, validatePresence } from '.'

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
        [null, false],
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
    ])('(%p === %p) is %p', (locationId1, locationId2, expectedResult) => {
        expect(locationIdEqual(locationId1, locationId2)).toBe(expectedResult)
    })
})

describe('validatePresence', () => {
    const presence: Presence = {
        data: null,
        lastModified: 0,
        locationId: new ArrayBuffer(0),
        sessionId: new ArrayBuffer(0),
        userId: new ArrayBuffer(0),
    }
    test.each<[any, string | null | undefined]>([
        [presence, undefined],
        [{ ...presence, userId: '' }, undefined],
        [{ ...presence, userId: 0 }, undefined],
        [{ ...presence, locationId: '' }, undefined],
        [{ ...presence, locationId: 0 }, undefined],
        [null, null],
        [() => undefined, null],
        [{ ...presence, sessionId: '' }, 'sessionId'],
        [{ ...presence, userId: null }, 'userId'],
        [{ ...presence, locationId: null }, 'locationId'],
        [{ ...presence, locationId: false }, 'locationId'],
        [
            {
                lastModified: presence.lastModified,
                locationId: presence.locationId,
                sessionId: presence.sessionId,
                userId: presence.userId,
            },
            'data',
        ],
        [{ ...presence, lastModified: NaN }, 'lastModified'],
        [{ ...presence, lastModified: Infinity }, 'lastModified'],
        [{ ...presence, lastModified: -Infinity }, 'lastModified'],
        [{ ...presence, lastModified: '0' }, 'lastModified'],
    ])('Test #%#', (data, invalidProperty) => {
        const result = validatePresence(data)
        if (invalidProperty === undefined) {
            expect(result).toBeUndefined()
        } else {
            expect(result).toEqual(
                expect.objectContaining({
                    entity: data,
                    entityName: 'Presence',
                    key: invalidProperty,
                    message:
                        invalidProperty === null
                            ? 'Invalid "Presence".'
                            : `Invalid "Presence.${invalidProperty}".`,
                    name: 'SyncOtError InvalidEntity',
                }),
            )
        }
    })
})
