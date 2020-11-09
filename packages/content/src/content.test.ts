import {
    createOperationKey,
    getOperationKeyUser,
    isOperationKey,
    Operation,
    validateOperation,
} from '.'

describe('createOperationKey', () => {
    test('userId = 5', () => {
        expect(() => createOperationKey(5 as any)).toThrow(
            expect.objectContaining({
                message: 'Argument "userId" must be a string.',
                name: 'SyncOTError Assert',
            }),
        )
    })
    test.each(['', 'test-user-id', 'test:user:id'])(`userId = %p`, (userId) => {
        const key = createOperationKey(userId)
        const index = key.indexOf(':')
        const keyId = key.slice(0, index)
        const keyUserId = key.slice(index + 1)
        expect(Buffer.from(keyId, 'base64').toString('base64')).toBe(keyId)
        expect(keyUserId).toBe(userId)
        expect(isOperationKey(key)).toBeTrue()
        expect(getOperationKeyUser(key)).toBe(keyUserId)
    })
})

describe('isOperationKey', () => {
    test.each([
        // invalid data type
        [5, false],
        [{}, false],
        [true, false],
        [false, false],
        // invalid without ":"
        ['', false],
        ['abc', false],
        // anything after ":" is good
        [':', true],
        [':abc@', true],
        [':abc@:def":', true],
        // invalid prefix length
        ['0:abc', false],
        ['01:abc', false],
        ['012:abc', false],
        ['01234:abc', false],
        ['012345:abc', false],
        ['0123456:abc', false],
        // invalid characters in prefix
        ['012@:abc', false],
        ['012*:abc', false],
        ['012-:abc', false],
        ['012_:abc', false],
        // invalid use of "=" in prefix
        ['=123:abc', false],
        ['0=23:abc', false],
        ['01=3:abc', false],
        ['====:abc', false],
        ['0===:abc', false],
        ['0123=:abc', false],
        ['0123==:abc', false],
        ['0123===:abc', false],
        ['0123====:abc', false],
        // valid base64
        [':abc', true],
        ['0123:abc', true],
        ['012=:abc', true],
        ['01==:abc', true],
        ['01234567:abc', true],
        ['0123456=:abc', true],
        ['012345==:abc', true],
        [
            '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+/00==:abc',
            true,
        ],
    ])('key = %p', (key, result) => {
        expect(isOperationKey(key)).toBe(result)
    })
})

describe('getOperationKeyUser', () => {
    test.each([5 as any, {}, true, false, '', '0123', '0123;abc'])(
        'key = %p',
        (key) => {
            expect(() => getOperationKeyUser(key)).toThrow(
                expect.objectContaining({
                    message: 'Invalid operation key.',
                    name: 'SyncOTError Assert',
                }),
            )
        },
    )

    test.each([
        ':',
        ':a',
        ':abc',
        ':abc@:def=',
        '0123:',
        '0123:a',
        '0123:abc',
        '0123:abc@:def=',
        // Not a valid key but getOperationKeyUser does not perform full validation.
        '0:abc@:def=',
    ])('key = %p', (key) => {
        expect(getOperationKeyUser(key)).toBe(key.slice(key.indexOf(':') + 1))
    })
})

describe('validateOperation', () => {
    const operation: Operation = {
        key: ':',
        type: '',
        id: '',
        version: 1,
        schema: '',
        data: null,
        meta: null,
    }
    test.each<[any, string | null | undefined]>([
        [operation, undefined],
        [{ ...operation, version: 2 }, undefined],
        [{ ...operation, version: Number.MAX_SAFE_INTEGER - 1 }, undefined],
        [{ ...operation, data: 5 }, undefined],
        [{ ...operation, data: {} }, undefined],
        [{ ...operation, meta: {} }, undefined],
        [{ ...operation, meta: { time: 123 } }, undefined],
        [{ ...operation, meta: { user: 'abc' } }, undefined],
        [{ ...operation, meta: { session: 'xyz' } }, undefined],
        [
            { ...operation, meta: { user: null, time: 123, session: 'xyz' } },
            undefined,
        ],
        [
            { ...operation, meta: { user: 'abc', time: null, session: 'xyz' } },
            undefined,
        ],
        [
            { ...operation, meta: { user: 'abc', time: 123, session: null } },
            undefined,
        ],
        [
            {
                ...operation,
                meta: {
                    user: 'abc',
                    time: 123,
                    session: 'xyz',
                    other: 'value',
                },
            },
            undefined,
        ],
        [null, null],
        [() => undefined, null],
        [{ ...operation, key: null }, 'key'],
        [{ ...operation, key: '' }, 'key'],
        [{ ...operation, key: '01=:abc' }, 'key'],
        [{ ...operation, type: null }, 'type'],
        [{ ...operation, id: null }, 'id'],
        [{ ...operation, version: null }, 'version'],
        [{ ...operation, version: -1 }, 'version'],
        [{ ...operation, version: 0 }, 'version'],
        [{ ...operation, version: 5.5 }, 'version'],
        [{ ...operation, version: Number.MAX_SAFE_INTEGER }, 'version'],
        [{ ...operation, version: Infinity }, 'version'],
        [{ ...operation, version: NaN }, 'version'],
        [{ ...operation, schema: null }, 'schema'],
        [{ ...operation, meta: undefined }, 'meta'],
        [{ ...operation, meta: 5 }, 'meta'],
        [{ ...operation, meta: { user: 5 } }, 'meta.user'],
        [{ ...operation, meta: { time: '5' } }, 'meta.time'],
        [{ ...operation, meta: { session: 5 } }, 'meta.session'],
    ])('Test #%#', (data, invalidProperty) => {
        const result = validateOperation(data)
        if (invalidProperty === undefined) {
            expect(result).toBeUndefined()
        } else {
            expect(result).toEqual(
                expect.objectContaining({
                    entity: data,
                    entityName: 'Operation',
                    key: invalidProperty,
                    message:
                        invalidProperty === null
                            ? 'Invalid "Operation".'
                            : `Invalid "Operation.${invalidProperty}".`,
                    name: 'SyncOTError InvalidEntity',
                }),
            )
        }
    })
})
