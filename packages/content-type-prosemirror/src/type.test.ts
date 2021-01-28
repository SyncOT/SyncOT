import {
    ContentType,
    createBaseSnapshot,
    Operation,
    Snapshot,
} from '@syncot/content'
import { CustomError } from '@syncot/util'
import { Fragment, Schema as ProseMirrorSchema, Slice } from 'prosemirror-model'
import { ReplaceStep } from 'prosemirror-transform'
import { createContentType, PLACEHOLDERS, toSyncOTSchema } from '.'

let contentType: ContentType
const type = 'type-0'

beforeEach(() => {
    contentType = createContentType()
})

describe('validateSchema', () => {
    const schema = toSyncOTSchema(
        type,
        new ProseMirrorSchema({
            nodes: {
                doc: { content: 'paragraph+' },
                text: {},
                paragraph: { content: 'text*' },
                image: { inline: true },
            },
            marks: {
                strong: {},
                em: {},
            },
        }),
    )
    test.each<
        [string, any, string | null | undefined, CustomError | undefined]
    >([
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
            'schema.data: invalid (fromSyncOTSchema throws a ProseMirror error)',
            { ...schema, data: { ...schema.data, topNode: 'root' } },
            'data',
            new RangeError("Schema is missing its top node type ('root')"),
        ],
        [
            'schema.data: invalid (fromSyncOTSchema throws a validateSchema error)',
            {
                ...schema,
                data: {
                    ...schema.data,
                    nodes: [
                        ...schema.data.nodes,
                        'blockqoute',
                        { attrs: { a: { default: undefined } } },
                    ],
                },
            },
            'data',
            {
                name: 'SyncOTError InvalidEntity',
                message:
                    'Invalid "ProseMirrorSchema.spec.nodes.blockqoute.attrs.a.default".',
                entityName: 'ProseMirrorSchema',
                entity: expect.objectContaining({ spec: expect.toBeObject() }),
                key: 'spec.nodes.blockqoute.attrs.a.default',
            },
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
        if (invalidProperty === undefined) {
            contentType.validateSchema(data)
        } else {
            expect(() => contentType.validateSchema(data)).toThrow(
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
                    cause:
                        cause != null ? expect.objectContaining(cause) : cause,
                }),
            )
        }
    })
})

describe('registerSchema', () => {
    test('success', () => {
        const schema = toSyncOTSchema(
            type,
            new ProseMirrorSchema({
                nodes: {
                    doc: {},
                    text: {},
                },
            }),
        )
        expect(contentType.hasSchema(schema.hash)).toBe(false)
        contentType.registerSchema(schema)
        expect(contentType.hasSchema(schema.hash)).toBe(true)
        contentType.registerSchema(schema)
        expect(contentType.hasSchema(schema.hash)).toBe(true)
    })
})

describe('apply', () => {
    describe('basic validation', () => {
        const schema = toSyncOTSchema(
            type,
            new ProseMirrorSchema({
                nodes: { doc: {}, text: {} },
            }),
        )
        const snapshot: Snapshot = {
            type: 'type-0',
            id: 'id-1',
            version: 1,
            schema: schema.hash,
            data: {
                type: 'doc',
            },
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

        test('invalid operation.type', () => {
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

        test('invalid operation.id', () => {
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

        test('invalid operation.version', () => {
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

        test('invalid operation.schema (not registered)', () => {
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
            const schema = toSyncOTSchema(
                type,
                new ProseMirrorSchema({
                    nodes: { doc: { content: 'text*' }, text: {} },
                }),
            )
            contentType.registerSchema(schema)
            const snapshot0 = createBaseSnapshot('type-0', 'id-1')
            const operation1 = {
                key: 'key-1',
                type: 'type-0',
                id: 'id-1',
                version: 1,
                schema: schema.hash,
                data: {
                    type: 'doc',
                    content: [
                        {
                            type: 'text',
                            text: 'TEST',
                        },
                    ],
                },
                meta: null,
            }
            const snapshot1 = contentType.apply(snapshot0, operation1)
            expect(snapshot1).toStrictEqual({
                type: operation1.type,
                id: operation1.id,
                version: operation1.version,
                schema: operation1.schema,
                data: operation1.data,
                meta: operation1.meta,
            })
        })

        test('invalid operation.data (null)', () => {
            const schema = toSyncOTSchema(
                type,
                new ProseMirrorSchema({
                    nodes: { doc: {}, text: {} },
                }),
            )
            contentType.registerSchema(schema)
            const snapshot0 = createBaseSnapshot('type-0', 'id-1')
            const operation1: Operation = {
                key: 'key-1',
                type: 'type-0',
                id: 'id-1',
                version: 1,
                schema: schema.hash,
                data: null,
                meta: null,
            }
            expect(() => contentType.apply(snapshot0, operation1)).toThrow(
                'Invalid input for Node.fromJSON',
            )
        })

        test('invalid operation.data (check)', () => {
            const schema = toSyncOTSchema(
                type,
                new ProseMirrorSchema({
                    nodes: {
                        doc: { content: 'text*' },
                        text: {},
                        image: { inline: true },
                    },
                }),
            )
            contentType.registerSchema(schema)
            const snapshot0 = createBaseSnapshot('type-0', 'id-1')
            const operation1: Operation = {
                key: 'key-1',
                type: 'type-0',
                id: 'id-1',
                version: 1,
                schema: schema.hash,
                data: {
                    type: 'doc',
                    content: [
                        {
                            type: 'text',
                            text: 'TEST',
                        },
                        {
                            type: 'image',
                        },
                    ],
                },
                meta: null,
            }
            expect(() => contentType.apply(snapshot0, operation1)).toThrow(
                'Invalid content for node doc: <"TEST", image>',
            )
        })
    })

    describe('operation and snapshot with different schemas', () => {
        test('success', () => {
            const proseMirrorSchema1 = new ProseMirrorSchema({
                nodes: {
                    doc: { content: 'block+' },
                    text: { group: 'inline' },
                    h: { group: 'block', content: 'inline*' },
                    p: { group: 'block', content: 'inline*' },
                },
            })
            const schema1 = toSyncOTSchema(type, proseMirrorSchema1)
            contentType.registerSchema(schema1)

            const proseMirrorSchema2 = new ProseMirrorSchema({
                nodes: {
                    doc: { content: 'block+' },
                    text: { group: 'inline' },
                    h: { group: 'block', content: 'inline*' },
                    [PLACEHOLDERS.blockBranch.name]: {
                        ...PLACEHOLDERS.blockBranch.spec,
                        group: 'block',
                    },
                    [PLACEHOLDERS.blockLeaf.name]: {
                        ...PLACEHOLDERS.blockLeaf.spec,
                        group: 'block',
                    },
                    [PLACEHOLDERS.inlineBranch.name]: {
                        ...PLACEHOLDERS.inlineBranch.spec,
                        group: 'inline',
                    },
                    [PLACEHOLDERS.inlineLeaf.name]: {
                        ...PLACEHOLDERS.inlineLeaf.spec,
                        group: 'inline',
                    },
                },
            })
            const schema2 = toSyncOTSchema(type, proseMirrorSchema2)
            contentType.registerSchema(schema2)

            const snapshot1: Snapshot = {
                type: 'type-0',
                id: 'id-1',
                version: 1,
                schema: schema1.hash,
                data: {
                    type: 'doc',
                    content: [
                        {
                            type: 'p',
                            content: [
                                {
                                    type: 'text',
                                    text: 'TEST',
                                },
                            ],
                        },
                    ],
                },
                meta: null,
            }
            const operation2: Operation = {
                key: 'key-1',
                type: 'type-0',
                id: 'id-1',
                version: 2,
                schema: schema2.hash,
                data: {
                    type: 'doc',
                    content: [
                        {
                            type: PLACEHOLDERS.blockBranch.name,
                            content: [
                                {
                                    type: 'text',
                                    text: 'TEST',
                                },
                            ],
                            attrs: {
                                name: 'p',
                                attrs: {},
                            },
                        },
                    ],
                },
                meta: null,
            }
            const snapshot2 = contentType.apply(snapshot1, operation2)
            expect(snapshot2).toEqual({
                type: operation2.type,
                id: operation2.id,
                version: operation2.version,
                schema: operation2.schema,
                data: operation2.data,
                meta: operation2.meta,
            })

            // Apply the same operation again to excercise the internal cache.
            const snapshot2copy1 = contentType.apply(snapshot1, operation2)
            expect(snapshot2copy1).toStrictEqual(snapshot2)
            expect(snapshot2copy1).not.toBe(snapshot2)

            // Make sure .data caches the object on first access.
            const snapshot2copy2 = contentType.apply(snapshot1, operation2)
            expect(snapshot2copy2.data).toBe(snapshot2copy2.data)
        })

        test('invalid operation.data (null)', () => {
            const schema1 = toSyncOTSchema(
                type,
                new ProseMirrorSchema({
                    nodes: {
                        doc: { content: 'text*' },
                        text: { group: 'inline' },
                        image: { group: 'inline', inline: true },
                    },
                }),
            )
            contentType.registerSchema(schema1)
            const snapshot1: Snapshot = {
                type: 'type-0',
                id: 'id-1',
                version: 1,
                schema: schema1.hash,
                data: {
                    type: 'doc',
                },
                meta: null,
            }

            const schema2 = toSyncOTSchema(
                type,
                new ProseMirrorSchema({
                    nodes: {
                        doc: { content: 'inline*' },
                        text: { group: 'inline' },
                        image: { group: 'inline', inline: true },
                    },
                }),
            )
            contentType.registerSchema(schema2)
            const operation2: Operation = {
                key: 'key-1',
                type: 'type-0',
                id: 'id-1',
                version: 2,
                schema: schema1.hash,
                data: null,
                meta: null,
            }
            expect(() => contentType.apply(snapshot1, operation2)).toThrow(
                "Cannot read property 'length' of null",
            )
        })

        test('invalid operation.data (check)', () => {
            const proseMirrorSchema1 = new ProseMirrorSchema({
                nodes: {
                    doc: { content: 'block+' },
                    text: { group: 'inline' },
                    image: { inline: true },
                    h: { group: 'block', content: 'inline*' },
                    p: { group: 'block', content: 'inline*' },
                },
            })
            const schema1 = toSyncOTSchema(type, proseMirrorSchema1)
            contentType.registerSchema(schema1)

            const proseMirrorSchema2 = new ProseMirrorSchema({
                nodes: {
                    doc: { content: 'block+' },
                    text: { group: 'inline' },
                    image: { inline: true },
                    h: { group: 'block', content: 'inline*' },
                    p: { group: 'block', content: 'text*' },
                },
            })
            const schema2 = toSyncOTSchema(type, proseMirrorSchema2)
            contentType.registerSchema(schema2)

            const snapshot1: Snapshot = {
                type: 'type-0',
                id: 'id-1',
                version: 1,
                schema: schema1.hash,
                data: {
                    type: 'doc',
                    content: [
                        {
                            type: 'p',
                            content: [
                                {
                                    type: 'text',
                                    text: 'A',
                                },
                            ],
                        },
                    ],
                },
                meta: null,
            }
            const operation2: Operation = {
                key: 'key-1',
                type: 'type-0',
                id: 'id-1',
                version: 2,
                schema: schema2.hash,
                data: {
                    type: 'doc',
                    content: [
                        {
                            type: 'p',
                            content: [
                                {
                                    type: 'image',
                                },
                            ],
                        },
                    ],
                },
                meta: null,
            }
            expect(() => contentType.apply(snapshot1, operation2)).toThrow(
                'Invalid content for node p: <image>',
            )
        })

        test('invalid operation.data (equalShape)', () => {
            const proseMirrorSchema1 = new ProseMirrorSchema({
                nodes: {
                    doc: { content: 'block+' },
                    text: { group: 'inline' },
                    image: { inline: true },
                    h: { group: 'block', content: 'inline*' },
                    p: { group: 'block', content: 'inline*' },
                },
            })
            const schema1 = toSyncOTSchema(type, proseMirrorSchema1)
            contentType.registerSchema(schema1)

            const proseMirrorSchema2 = new ProseMirrorSchema({
                nodes: {
                    doc: { content: 'block+' },
                    text: { group: 'inline' },
                    image: { inline: true },
                    h: { group: 'block', content: 'inline*' },
                    p: { group: 'block', content: 'text*' },
                },
            })
            const schema2 = toSyncOTSchema(type, proseMirrorSchema2)
            contentType.registerSchema(schema2)

            const snapshot1: Snapshot = {
                type: 'type-0',
                id: 'id-1',
                version: 1,
                schema: schema1.hash,
                data: {
                    type: 'doc',
                    content: [
                        {
                            type: 'p',
                            content: [
                                {
                                    type: 'text',
                                    text: 'A',
                                },
                            ],
                        },
                    ],
                },
                meta: null,
            }
            const operation2: Operation = {
                key: 'key-1',
                type: 'type-0',
                id: 'id-1',
                version: 2,
                schema: schema2.hash,
                data: {
                    type: 'doc',
                    content: [
                        {
                            type: 'p',
                            content: [
                                {
                                    type: 'text',
                                    text: 'AB',
                                },
                            ],
                        },
                    ],
                },
                meta: null,
            }
            expect(() => contentType.apply(snapshot1, operation2)).toThrow(
                'The content "shape" must not change when changing the document schema.',
            )
        })
    })

    describe('operation and snapshot with the same schema', () => {
        test('success', () => {
            const proseMirrorSchema = new ProseMirrorSchema({
                nodes: {
                    doc: { content: 'text*' },
                    text: {},
                },
            })
            const schema = toSyncOTSchema(type, proseMirrorSchema)
            contentType.registerSchema(schema)
            const snapshot1: Snapshot = {
                type: 'type-0',
                id: 'id-1',
                version: 1,
                schema: schema.hash,
                data: {
                    type: 'doc',
                    content: [
                        {
                            type: 'text',
                            text: 'HelloWorld',
                        },
                    ],
                },
                meta: null,
            }

            const steps = [
                new ReplaceStep(
                    5,
                    5,
                    new Slice(
                        Fragment.from(proseMirrorSchema.text('-abc')),
                        0,
                        0,
                    ),
                ),
                new ReplaceStep(
                    9,
                    9,
                    new Slice(
                        Fragment.from(proseMirrorSchema.text('123-')),
                        0,
                        0,
                    ),
                ),
            ]
            const operation2: Operation = {
                key: 'key-1',
                type: 'type-0',
                id: 'id-1',
                version: 2,
                schema: schema.hash,
                data: steps.map((step) => step.toJSON()),
                meta: null,
            }
            const snapshot2 = contentType.apply(snapshot1, operation2)
            expect(snapshot2).toStrictEqual({
                type: operation2.type,
                id: operation2.id,
                version: operation2.version,
                schema: operation2.schema,
                data: {
                    type: 'doc',
                    content: [
                        {
                            type: 'text',
                            text: 'Hello-abc123-World',
                        },
                    ],
                },
                meta: operation2.meta,
            })

            // Apply the same operation again to excercise the internal cache.
            const snapshot2copy1 = contentType.apply(snapshot1, operation2)
            expect(snapshot2copy1).toStrictEqual(snapshot2)
            expect(snapshot2copy1).not.toBe(snapshot2)

            // Make sure .data caches the object on first access.
            const snapshot2copy2 = contentType.apply(snapshot1, operation2)
            expect(snapshot2copy2.data).toBe(snapshot2copy2.data)
        })

        test('invalid operation.data (null)', () => {
            const schema = toSyncOTSchema(
                type,
                new ProseMirrorSchema({
                    nodes: {
                        doc: {},
                        text: {},
                    },
                }),
            )
            contentType.registerSchema(schema)
            const snapshot1: Snapshot = {
                type: 'type-0',
                id: 'id-1',
                version: 1,
                schema: schema.hash,
                data: { type: 'doc' },
                meta: null,
            }
            const operation2: Operation = {
                key: 'key-1',
                type: 'type-0',
                id: 'id-1',
                version: 2,
                schema: schema.hash,
                data: null,
                meta: null,
            }
            expect(() => contentType.apply(snapshot1, operation2)).toThrow(
                "Cannot read property 'length' of null",
            )
        })

        test('invalid operation.data (check)', () => {
            const proseMirrorSchema = new ProseMirrorSchema({
                nodes: {
                    doc: { content: 'text*' },
                    text: {},
                    image: { inline: true },
                },
            })
            const schema = toSyncOTSchema(type, proseMirrorSchema)
            contentType.registerSchema(schema)
            const snapshot1: Snapshot = {
                type: 'type-0',
                id: 'id-1',
                version: 1,
                schema: schema.hash,
                data: {
                    type: 'doc',
                    content: [
                        {
                            type: 'text',
                            text: 'HelloWorld',
                        },
                    ],
                },
                meta: null,
            }
            const steps = [
                new ReplaceStep(
                    5,
                    5,
                    new Slice(
                        Fragment.from(proseMirrorSchema.node('image')),
                        0,
                        0,
                    ),
                ),
            ]
            const operation2: Operation = {
                key: 'key-1',
                type: 'type-0',
                id: 'id-1',
                version: 2,
                schema: schema.hash,
                data: steps.map((step) => step.toJSON()),
                meta: null,
            }
            expect(() => contentType.apply(snapshot1, operation2)).toThrow(
                'Invalid content for node doc',
            )
        })

        test('invalid operation.data (step.apply throws)', () => {
            const proseMirrorSchema = new ProseMirrorSchema({
                nodes: {
                    doc: { content: 'text*' },
                    text: {},
                },
            })
            const schema = toSyncOTSchema(type, proseMirrorSchema)
            contentType.registerSchema(schema)
            const snapshot1: Snapshot = {
                type: 'type-0',
                id: 'id-1',
                version: 1,
                schema: schema.hash,
                data: {
                    type: 'doc',
                    content: [
                        {
                            type: 'text',
                            text: 'HelloWorld',
                        },
                    ],
                },
                meta: null,
            }
            const steps = [
                new ReplaceStep(
                    11,
                    11,
                    new Slice(
                        Fragment.from(proseMirrorSchema.text('abc')),
                        0,
                        0,
                    ),
                ),
            ]
            const operation2: Operation = {
                key: 'key-1',
                type: 'type-0',
                id: 'id-1',
                version: 2,
                schema: schema.hash,
                data: steps.map((step) => step.toJSON()),
                meta: null,
            }
            expect(() => contentType.apply(snapshot1, operation2)).toThrow(
                'Position 11 out of range',
            )
        })

        test('invalid operation.data (step.apply fails)', () => {
            const proseMirrorSchema = new ProseMirrorSchema({
                nodes: {
                    doc: { content: 'text*' },
                    text: {},
                },
            })
            const schema = toSyncOTSchema(type, proseMirrorSchema)
            contentType.registerSchema(schema)
            const snapshot1: Snapshot = {
                type: 'type-0',
                id: 'id-1',
                version: 1,
                schema: schema.hash,
                data: {
                    type: 'doc',
                    content: [
                        {
                            type: 'text',
                            text: 'HelloWorld',
                        },
                    ],
                },
                meta: null,
            }
            const steps = [
                new ReplaceStep(
                    0,
                    1,
                    new Slice(
                        Fragment.from(proseMirrorSchema.text('abc')),
                        0,
                        0,
                    ),
                    true,
                ),
            ]
            const operation2: Operation = {
                key: 'key-1',
                type: 'type-0',
                id: 'id-1',
                version: 2,
                schema: schema.hash,
                data: steps.map((step) => step.toJSON()),
                meta: null,
            }

            expect(() => contentType.apply(snapshot1, operation2)).toThrow(
                'Structure replace would overwrite content',
            )
        })
    })
})
