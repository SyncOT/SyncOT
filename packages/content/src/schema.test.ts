import { createSchemaKey, Schema, validateSchema } from '.'

describe('SchemaKey', () => {
    test('is a string', () => {
        const key = createSchemaKey('type-1', { a: 5, b: 6, c: [1, 2, 3] })
        expect(key).toBeString()
    })
    test('the same key for the same input type and data', () => {
        const key1 = createSchemaKey('type-1', { a: 5, b: 6, c: [1, 2, 3] })
        const key2 = createSchemaKey('type-1', { b: 6, a: 5, c: [1, 2, 3] })
        expect(key1).toBe(key2)
    })

    test('different keys for different types', () => {
        const key1 = createSchemaKey('type-1', { a: 5, b: 6, c: [1, 2, 3] })
        const key2 = createSchemaKey('type-2', { b: 6, a: 5, c: [1, 2, 3] })
        expect(key1).not.toBe(key2)
    })

    test('different keys for different data', () => {
        const key1 = createSchemaKey('type-1', { a: 5, b: 6, c: [1, 2, 3] })
        const key2 = createSchemaKey('type-1', { b: 6, a: 5, c: [1, 2, 3, 4] })
        expect(key1).not.toBe(key2)
    })

    test('different keys for different data', () => {
        const key1 = createSchemaKey('type-1', '')
        const key2 = createSchemaKey('type-1', null)
        expect(key1).not.toBe(key2)
    })
})

describe('validateSchema', () => {
    const schema: Schema = {
        key: createSchemaKey('', null),
        type: '',
        data: null,
        meta: null,
    }
    test.each<[any, string | null | undefined]>([
        [schema, undefined],
        [
            { ...schema, key: createSchemaKey('a-type', null), type: 'a-type' },
            undefined,
        ],
        [{ ...schema, key: createSchemaKey('', 5), data: 5 }, undefined],
        [{ ...schema, key: createSchemaKey('', {}), data: {} }, undefined],
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
        [{ ...schema, key: 'invalid-key' }, 'key'],
        [{ ...schema, key: 5 }, 'key'],
        [{ ...schema, key: null }, 'key'],
        [{ ...schema, key: undefined }, 'key'],
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
