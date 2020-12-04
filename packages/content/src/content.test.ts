import {
    createOperationKey,
    operationKeyUser,
    Operation,
    Schema,
    validateOperation,
    validateSchema,
} from '.'

describe('OperationKey', () => {
    test.each([
        '',
        '!',
        '~',
        'abc',
        'abc~def~',
        'abc!def!',
        '!~123456!~',
        '!!123456!!',
    ])('createOperationKey(%s)', (userId) => {
        const key1 = createOperationKey(userId)
        const key2 = createOperationKey(userId)
        expect(key1).toBeString()
        expect(key2).toBeString()
        expect(key1).not.toBe(key2)
        expect(operationKeyUser(key1)).toBe(userId)
        expect(operationKeyUser(key2)).toBe(userId)
    })
})

describe('validateOperation', () => {
    const operation: Operation = {
        key: '',
        type: '',
        id: '',
        version: 1,
        schema: 0,
        data: null,
        meta: null,
    }
    test.each<[any, string | null | undefined]>([
        [operation, undefined],
        [{ ...operation, version: 2 }, undefined],
        [{ ...operation, version: Number.MAX_SAFE_INTEGER - 1 }, undefined],
        [{ ...operation, schema: 5 }, undefined],
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
        [{ ...operation, schema: 0.5 }, 'schema'],
        [(({ data, ...o }) => o)(operation), 'data'],
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

describe('validateSchema', () => {
    const schema: Schema = {
        key: 0,
        type: '',
        data: null,
        meta: null,
    }
    test.each<[any, string | null | undefined]>([
        [schema, undefined],
        [{ ...schema, key: 5 }, undefined],
        [{ ...schema, key: -5 }, undefined],
        [{ ...schema, key: null }, undefined],
        [{ ...schema, key: undefined }, undefined],
        [{ ...schema, type: 'a-type' }, undefined],
        [{ ...schema, data: 5 }, undefined],
        [{ ...schema, data: {} }, undefined],
        [{ ...schema, meta: {} }, undefined],
        [{ ...schema, meta: { time: 123 } }, undefined],
        [{ ...schema, meta: { user: 'abc' } }, undefined],
        [{ ...schema, meta: { session: 'xyz' } }, undefined],
        [
            { ...schema, meta: { user: null, time: 123, session: 'xyz' } },
            undefined,
        ],
        [
            { ...schema, meta: { user: 'abc', time: null, session: 'xyz' } },
            undefined,
        ],
        [
            { ...schema, meta: { user: 'abc', time: 123, session: null } },
            undefined,
        ],
        [
            {
                ...schema,
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
        [{ ...schema, key: 0.5 }, 'key'],
        [{ ...schema, key: '1' }, 'key'],
        [{ ...schema, key: Number.MAX_SAFE_INTEGER + 2 }, 'key'],
        [{ ...schema, key: Number.MIN_SAFE_INTEGER - 2 }, 'key'],
        [{ ...schema, type: null }, 'type'],
        [(({ data, ...o }) => o)(schema), 'data'],
        [{ ...schema, meta: undefined }, 'meta'],
        [{ ...schema, meta: 5 }, 'meta'],
        [{ ...schema, meta: { user: 5 } }, 'meta.user'],
        [{ ...schema, meta: { time: '5' } }, 'meta.time'],
        [{ ...schema, meta: { session: 5 } }, 'meta.session'],
    ])('Test #%#', (data, invalidProperty) => {
        const result = validateSchema(data)
        if (invalidProperty === undefined) {
            expect(result).toBeUndefined()
        } else {
            expect(result).toEqual(
                expect.objectContaining({
                    entity: data,
                    entityName: 'Schema',
                    key: invalidProperty,
                    message:
                        invalidProperty === null
                            ? 'Invalid "Schema".'
                            : `Invalid "Schema.${invalidProperty}".`,
                    name: 'SyncOTError InvalidEntity',
                }),
            )
        }
    })
})
