import { Presence, validatePresence } from '.'

describe('validatePresence', () => {
    const presence: Presence = {
        data: null,
        lastModified: 0,
        locationId: '',
        sessionId: '',
        userId: '',
    }
    test.each<[any, string | null | undefined]>([
        [presence, undefined],
        [{ ...presence, userId: '' }, undefined],
        [{ ...presence, locationId: '' }, undefined],
        [{ ...presence, sessionId: '' }, undefined],
        [null, null],
        [() => undefined, null],
        [{ ...presence, sessionId: 0 }, 'sessionId'],
        [{ ...presence, sessionId: null }, 'sessionId'],
        [{ ...presence, userId: 0 }, 'userId'],
        [{ ...presence, userId: null }, 'userId'],
        [{ ...presence, locationId: 0 }, 'locationId'],
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
        if (invalidProperty === undefined) {
            expect(validatePresence(data)).toBe(data)
        } else {
            expect(() => validatePresence(data)).toThrow(
                expect.objectContaining({
                    entity: data,
                    entityName: 'Presence',
                    key: invalidProperty,
                    message:
                        invalidProperty === null
                            ? 'Invalid "Presence".'
                            : `Invalid "Presence.${invalidProperty}".`,
                    name: 'SyncOTError InvalidEntity',
                }),
            )
        }
    })
})
