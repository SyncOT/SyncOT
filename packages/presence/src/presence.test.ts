import { Presence, validatePresence } from '.'

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
        [{ ...presence, sessionId: '' }, undefined],
        [{ ...presence, sessionId: 0 }, undefined],
        [null, null],
        [() => undefined, null],
        [{ ...presence, sessionId: null }, 'sessionId'],
        [{ ...presence, userId: null }, 'userId'],
        [{ ...presence, locationId: null }, 'locationId'],
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
