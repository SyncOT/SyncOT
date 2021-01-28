import { createSchemaHash, Schema, validateSchema } from '.'

describe('SchemaHash', () => {
    test('is a string', () => {
        const hash = createSchemaHash('type-1', { a: 5, b: 6, c: [1, 2, 3] })
        expect(hash).toBeString()
    })
    test('the same hash for the same input type and data', () => {
        const hash1 = createSchemaHash('type-1', { a: 5, b: 6, c: [1, 2, 3] })
        const hash2 = createSchemaHash('type-1', { b: 6, a: 5, c: [1, 2, 3] })
        expect(hash1).toBe(hash2)
    })

    test('different hashes for different types', () => {
        const hash1 = createSchemaHash('type-1', { a: 5, b: 6, c: [1, 2, 3] })
        const hash2 = createSchemaHash('type-2', { b: 6, a: 5, c: [1, 2, 3] })
        expect(hash1).not.toBe(hash2)
    })

    test('different hashes for different data', () => {
        const hash1 = createSchemaHash('type-1', { a: 5, b: 6, c: [1, 2, 3] })
        const hash2 = createSchemaHash('type-1', {
            b: 6,
            a: 5,
            c: [1, 2, 3, 4],
        })
        expect(hash1).not.toBe(hash2)
    })

    test('different hashes for different data', () => {
        const hash1 = createSchemaHash('type-1', '')
        const hash2 = createSchemaHash('type-1', null)
        expect(hash1).not.toBe(hash2)
    })
})

describe('validateSchema', () => {
    const schema: Schema = {
        hash: createSchemaHash('', null),
        type: '',
        data: null,
        meta: null,
    }
    test.each<[any, string | null | undefined]>([
        [schema, undefined],
        [
            {
                ...schema,
                hash: createSchemaHash('a-type', null),
                type: 'a-type',
            },
            undefined,
        ],
        [{ ...schema, hash: createSchemaHash('', 5), data: 5 }, undefined],
        [{ ...schema, hash: createSchemaHash('', {}), data: {} }, undefined],
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
        [{ ...schema, hash: 'invalid-hash' }, 'hash'],
        [{ ...schema, hash: 5 }, 'hash'],
        [{ ...schema, hash: null }, 'hash'],
        [{ ...schema, hash: undefined }, 'hash'],
        [{ ...schema, type: null }, 'type'],
        [(({ data, ...o }) => o)(schema), 'data'],
        [{ ...schema, meta: undefined }, 'meta'],
        [{ ...schema, meta: 5 }, 'meta'],
        [{ ...schema, meta: { user: 5 } }, 'meta.user'],
        [{ ...schema, meta: { time: '5' } }, 'meta.time'],
        [{ ...schema, meta: { session: 5 } }, 'meta.session'],
    ])('Test #%#', (data, invalidProperty) => {
        if (invalidProperty === undefined) {
            expect(validateSchema(data)).toBe(data)
        } else {
            expect(() => validateSchema(data)).toThrow(
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
