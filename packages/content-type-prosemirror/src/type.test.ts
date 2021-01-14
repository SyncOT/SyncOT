import {
    ContentType,
    createBaseSnapshot,
    createSchemaHash,
    Operation,
    Schema,
    Snapshot,
} from '@syncot/content'
import { Fragment, Slice } from 'prosemirror-model'
import { ReplaceStep } from 'prosemirror-transform'
import { createContentType } from '.'
import { fromSyncOTSchema } from '.'

let contentType: ContentType
const schemaType = 'type-0'
const schemaData = {
    nodes: [
        'doc',
        { content: 'paragraph+' },
        'paragraph',
        { content: 'text*' },
        'text',
        {},
    ],
    marks: ['strong', {}, 'em', {}],
    topNode: 'doc',
}
const schema: Schema = {
    hash: createSchemaHash(schemaType, schemaData),
    type: 'type-0',
    data: schemaData,
    meta: null,
}
const proseMirrorSchema = fromSyncOTSchema(schema)

beforeEach(() => {
    contentType = createContentType()
})

describe('validateSchema', () => {
    test.each<[string, any, string | null | undefined, Error | undefined]>([
        ['schema: valid', schema, undefined, undefined],
        ['schema: invalid (null)', null, null, undefined],
        ['schema: invalid (function)', () => undefined, null, undefined],
        [
            'schema.data: invalid (null)',
            { ...schema, data: null },
            'data',
            undefined,
        ],
        [
            'schema.data: invalid (function)',
            { ...schema, data: () => undefined },
            'data',
            undefined,
        ],
        [
            'schema.data: invalid (createProseMirrorSchema throws)',
            { ...schema, data: { ...schema.data, topNode: 'root' } },
            'data',
            new RangeError("Schema is missing its top node type ('root')"),
        ],

        [
            'schema.data.topNode: valid (null)',
            { ...schema, data: { ...schema.data, topNode: null } },
            undefined,
            undefined,
        ],
        [
            'schema.data.topNode: valid (undefined)',
            { ...schema, data: { ...schema.data, topNode: undefined } },
            undefined,
            undefined,
        ],
        [
            'schema.data.topNode: valid (string)',
            {
                ...schema,
                data: {
                    nodes: ['root'].concat(schema.data.nodes.slice(1)),
                    marks: schema.data.marks,
                    topNode: 'root',
                },
            },
            undefined,
            undefined,
        ],
        [
            'schema.data.topNode: invalid (number)',
            { ...schema, data: { ...schema.data, topNode: 5 } },
            'data.topNode',
            undefined,
        ],

        [
            'schema.data.nodes: invalid (object)',
            { ...schema, data: { ...schema.data, nodes: {} } },
            'data.nodes',
            undefined,
        ],
        [
            'schema.data.nodes: invalid (wrong length)',
            {
                ...schema,
                data: {
                    ...schema.data,
                    nodes: schema.data.nodes.concat('blockquote'),
                },
            },
            'data.nodes.length',
            undefined,
        ],
        [
            'schema.data.nodes.0: invalid (null)',
            {
                ...schema,
                data: {
                    ...schema.data,
                    nodes: [null, {}].concat(schema.data.nodes),
                },
            },
            'data.nodes.0',
            undefined,
        ],
        [
            'schema.data.nodes.1: invalid (null)',
            {
                ...schema,
                data: {
                    ...schema.data,
                    nodes: ['blockquote', null].concat(schema.data.nodes),
                },
            },
            'data.nodes.1',
            undefined,
        ],
        [
            'schema.data.nodes.1: invalid (undefined)',
            {
                ...schema,
                data: {
                    ...schema.data,
                    nodes: ['blockquote', undefined].concat(schema.data.nodes),
                },
            },
            'data.nodes.1',
            undefined,
        ],

        [
            'schema.data.marks: invalid (object)',
            { ...schema, data: { ...schema.data, marks: {} } },
            'data.marks',
            undefined,
        ],
        [
            'schema.data.marks: invalid (wrong length)',
            {
                ...schema,
                data: {
                    ...schema.data,
                    marks: schema.data.marks.concat('underline'),
                },
            },
            'data.marks.length',
            undefined,
        ],
        [
            'schema.data.marks.0: invalid (null)',
            {
                ...schema,
                data: {
                    ...schema.data,
                    marks: [null, {}].concat(schema.data.marks),
                },
            },
            'data.marks.0',
            undefined,
        ],
        [
            'schema.data.marks.1: invalid (null)',
            {
                ...schema,
                data: {
                    ...schema.data,
                    marks: ['underline', null].concat(schema.data.marks),
                },
            },
            'data.marks.1',
            undefined,
        ],
        [
            'schema.data.marks.1: invalid (undefined)',
            {
                ...schema,
                data: {
                    ...schema.data,
                    marks: ['underline', undefined].concat(schema.data.marks),
                },
            },
            'data.marks.1',
            undefined,
        ],
    ])('%s', (_, data, invalidProperty, cause) => {
        const result = contentType.validateSchema(data)
        if (invalidProperty === undefined) {
            expect(result).toBeUndefined()
        } else {
            expect(result).toEqual(
                expect.objectContaining({
                    entity: data,
                    entityName: 'Schema',
                    key: invalidProperty,
                    message:
                        (invalidProperty === null
                            ? 'Invalid "Schema".'
                            : `Invalid "Schema.${invalidProperty}".`) +
                        (cause ? ` => ${cause.name}: ${cause.message}` : ''),
                    name: 'SyncOTError InvalidEntity',
                    cause,
                }),
            )
        }
    })
})

describe('registerSchema', () => {
    test('register it', () => {
        expect(contentType.hasSchema(schema.hash)).toBe(false)
        contentType.registerSchema(schema)
        expect(contentType.hasSchema(schema.hash)).toBe(true)
        contentType.registerSchema(schema)
        expect(contentType.hasSchema(schema.hash)).toBe(true)
    })
})

describe('apply', () => {
    const snapshot: Snapshot = {
        type: 'type-0',
        id: 'id-1',
        version: 1,
        schema: schema.hash,
        data: fromSyncOTSchema(schema).topNodeType.createAndFill()!.toJSON(),
        meta: null,
    }

    const operation: Operation = {
        key: 'key-1',
        type: 'type-0',
        id: 'id-1',
        version: 2,
        schema: schema.hash,
        data: null,
        meta: null,
    }

    describe('basic validation', () => {
        test('wrong operation.type', () => {
            const snapshot1 = {
                ...snapshot,
                type: 'different-type',
            }
            contentType.registerSchema(schema)
            expect(() => contentType.apply(snapshot1, operation)).toThrow(
                expect.objectContaining({
                    name: 'SyncOTError Assert',
                    message: 'operation.type must equal to snapshot.type.',
                }),
            )
        })

        test('wrong operation.id', () => {
            const snapshot1 = {
                ...snapshot,
                id: 'different-id',
            }
            contentType.registerSchema(schema)
            expect(() => contentType.apply(snapshot1, operation)).toThrow(
                expect.objectContaining({
                    name: 'SyncOTError Assert',
                    message: 'operation.id must equal to snapshot.id.',
                }),
            )
        })

        test('wrong operation.version', () => {
            const snapshot2 = {
                ...snapshot,
                version: 2,
            }
            contentType.registerSchema(schema)
            expect(() => contentType.apply(snapshot2, operation)).toThrow(
                expect.objectContaining({
                    name: 'SyncOTError Assert',
                    message:
                        'operation.version must equal to snapshot.version + 1.',
                }),
            )
        })

        test('schema not registered', () => {
            const snapshot1 = {
                ...snapshot,
                schema: 'different-schema',
            }
            expect(() => contentType.apply(snapshot1, operation)).toThrow(
                expect.objectContaining({
                    name: 'SyncOTError Assert',
                    message: 'operation.schema is not registered.',
                }),
            )
        })
    })

    describe('base snapshot', () => {
        test('success', () => {
            contentType.registerSchema(schema)
            const operation1 = {
                ...operation,
                version: 1,
                data: proseMirrorSchema.topNodeType.createAndFill()!.toJSON(),
            }
            const snapshot1 = contentType.apply(
                createBaseSnapshot(operation1.type, operation1.id),
                operation1,
            )
            expect(snapshot1).toStrictEqual({
                type: operation1.type,
                id: operation1.id,
                version: operation1.version,
                schema: operation1.schema,
                data: operation1.data,
                meta: operation1.meta,
            })
        })
    })

    describe('operation and snapshot with different schemas', () => {
        test('wrong operation.data', () => {
            const snapshot1 = {
                ...snapshot,
                schema: 'different-schema',
            }
            const operation2 = {
                ...operation,
                data: {},
            }
            contentType.registerSchema(schema)
            expect(() => contentType.apply(snapshot1, operation2)).toThrow(
                expect.objectContaining({
                    name: 'SyncOTError Assert',
                    message: 'operation.data must be null.',
                }),
            )
        })

        test('success', () => {
            const snapshot1 = {
                ...snapshot,
                schema: 'different-schema',
            }
            contentType.registerSchema(schema)
            const snapshot2 = contentType.apply(snapshot1, operation)
            expect(snapshot2).toStrictEqual({
                type: operation.type,
                id: operation.id,
                version: operation.version,
                schema: operation.schema,
                data: snapshot1.data,
                meta: operation.meta,
            })

            // Apply the same operation again to excercise the internal cache.
            const snapshot2copy1 = contentType.apply(snapshot1, operation)
            expect(snapshot2copy1).toStrictEqual(snapshot2)
            expect(snapshot2copy1).not.toBe(snapshot2)

            // Make sure .data caches the object on first access.
            const snapshot2copy2 = contentType.apply(snapshot1, operation)
            expect(snapshot2copy2.data).toBe(snapshot2copy2.data)
        })
    })

    describe('operation and snapshot with the same schema', () => {
        test('wrong operation.data', () => {
            contentType.registerSchema(schema)
            expect(() => contentType.apply(snapshot, operation)).toThrow(
                expect.objectContaining({
                    name: 'TypeError',
                    message: "Cannot read property 'length' of null",
                }),
            )
        })

        test('success', () => {
            contentType.registerSchema(schema)
            const steps = [
                new ReplaceStep(
                    1,
                    1,
                    new Slice(
                        Fragment.from(proseMirrorSchema.text('abc')),
                        0,
                        0,
                    ),
                ),
                new ReplaceStep(
                    4,
                    4,
                    new Slice(
                        Fragment.from(proseMirrorSchema.text('123')),
                        0,
                        0,
                    ),
                ),
            ]
            const operation2 = {
                ...operation,
                data: steps.map((step) => step.toJSON()),
            }
            const snapshot2 = contentType.apply(snapshot, operation2)
            expect(snapshot2).toStrictEqual({
                type: operation.type,
                id: operation.id,
                version: operation.version,
                schema: operation.schema,
                data: {
                    type: 'doc',
                    content: [
                        {
                            type: 'paragraph',
                            content: [
                                {
                                    type: 'text',
                                    text: 'abc123',
                                },
                            ],
                        },
                    ],
                },
                meta: operation.meta,
            })

            // Apply the same operation again to excercise the internal cache.
            const snapshot2copy1 = contentType.apply(snapshot, operation2)
            expect(snapshot2copy1).toStrictEqual(snapshot2)
            expect(snapshot2copy1).not.toBe(snapshot2)

            // Make sure .data caches the object on first access.
            const snapshot2copy2 = contentType.apply(snapshot, operation2)
            expect(snapshot2copy2.data).toBe(snapshot2copy2.data)
        })

        test('step.apply throws', () => {
            contentType.registerSchema(schema)
            const steps = [
                new ReplaceStep(
                    3,
                    3,
                    new Slice(
                        Fragment.from(proseMirrorSchema.text('abc')),
                        0,
                        0,
                    ),
                ),
            ]
            const operation2 = {
                ...operation,
                data: steps.map((step) => step.toJSON()),
            }
            expect(() => contentType.apply(snapshot, operation2)).toThrow(
                expect.objectContaining({
                    name: 'RangeError',
                    message: 'Position 3 out of range',
                }),
            )
        })

        test('step.apply fails', () => {
            contentType.registerSchema(schema)
            const steps = [
                new ReplaceStep(
                    1,
                    1,
                    new Slice(
                        Fragment.from(proseMirrorSchema.text('abc')),
                        0,
                        0,
                    ),
                ),
                new ReplaceStep(
                    1,
                    4,
                    new Slice(
                        Fragment.from(proseMirrorSchema.text('123')),
                        0,
                        0,
                    ),
                    true,
                ),
            ]
            const operation2 = {
                ...operation,
                data: steps.map((step) => step.toJSON()),
            }
            expect(() => contentType.apply(snapshot, operation2)).toThrow(
                expect.objectContaining({
                    name: 'Error',
                    message: 'Structure replace would overwrite content',
                }),
            )
        })
    })
})
