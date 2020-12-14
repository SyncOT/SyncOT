import { createSchemaKey, Operation, Schema, Snapshot } from '@syncot/content'
import { Fragment, NodeSpec, Slice } from 'prosemirror-model'
import { ReplaceStep } from 'prosemirror-transform'
import { createContentType } from '.'
import { createProseMirrorSchema, ProseMirrorContentType } from './type'

let contentType: ProseMirrorContentType
const schema: Schema = {
    key: '',
    type: 'type-0',
    data: {
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
    },
    meta: null,
}
schema.key = createSchemaKey(schema.type, schema.data)
const proseMirrorSchema = createProseMirrorSchema(schema)

beforeEach(() => {
    contentType = createContentType() as ProseMirrorContentType
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
    const operation: Operation = {
        key: 'key-1',
        type: 'type-0',
        id: 'id-1',
        version: 1,
        schema: schema.key,
        data: proseMirrorSchema.topNodeType.createAndFill()!.toJSON(),
        meta: null,
    }

    test('apply when not registered', () => {
        expect(() => contentType.apply(null, operation)).toThrow(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: 'operation.schema is not registered.',
            }),
        )
    })

    test('apply when registered', () => {
        contentType.registerSchema(schema)
        contentType.apply(null, operation)
    })

    test('apply when registered twice', () => {
        contentType.registerSchema(schema)
        contentType.registerSchema(schema)
        contentType.apply(null, operation)
    })
})

describe('apply', () => {
    const snapshot: Snapshot = {
        key: 'key-1',
        type: 'type-0',
        id: 'id-1',
        version: 1,
        schema: schema.key,
        data: createProseMirrorSchema(schema)
            .topNodeType.createAndFill()!
            .toJSON(),
        meta: null,
    }

    const operation: Operation = {
        key: 'key-1',
        type: 'type-0',
        id: 'id-1',
        version: 2,
        schema: schema.key,
        data: null,
        meta: null,
    }

    describe('no snapshot', () => {
        test('schema not registered', () => {
            expect(() => contentType.apply(null, operation)).toThrow(
                expect.objectContaining({
                    name: 'SyncOTError Assert',
                    message: 'operation.schema is not registered.',
                }),
            )
        })

        test('wrong operation.version', () => {
            contentType.registerSchema(schema)
            expect(() => contentType.apply(null, operation)).toThrow(
                expect.objectContaining({
                    name: 'SyncOTError Assert',
                    message: 'operation.version must equal to 1.',
                }),
            )
        })

        test('wrong operation.version', () => {
            contentType.registerSchema(schema)
            expect(() =>
                contentType.apply(null, { ...operation, version: 1 }),
            ).toThrow(
                expect.objectContaining({
                    name: 'SyncOTError Assert',
                    message: 'operation.data must contain the initial content.',
                }),
            )
        })

        test('success', () => {
            contentType.registerSchema(schema)
            const operation1 = {
                ...operation,
                version: 1,
                data: proseMirrorSchema.topNodeType.createAndFill()!.toJSON(),
            }
            const snapshot1 = contentType.apply(null, operation1)
            expect(snapshot1).toStrictEqual(operation1)
        })
    })

    describe('operation and snapshot with different schemas', () => {
        test('schema not registered', () => {
            const snapshot1 = { ...snapshot, schema: 'different-schema' }
            expect(() => contentType.apply(snapshot1, operation)).toThrow(
                expect.objectContaining({
                    name: 'SyncOTError Assert',
                    message: 'operation.schema is not registered.',
                }),
            )
        })

        test('wrong operation.type', () => {
            const snapshot1 = {
                ...snapshot,
                schema: 'different-schema',
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
                schema: 'different-schema',
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
                schema: 'different-schema',
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
                ...operation,
                data: snapshot1.data,
            })
        })
    })

    describe('operation and snapshot with the same schema', () => {
        test('schema not registered', () => {
            expect(() => contentType.apply(snapshot, operation)).toThrow(
                expect.objectContaining({
                    name: 'SyncOTError Assert',
                    message: 'operation.schema is not registered.',
                }),
            )
        })

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

        test('wrong operation.data', () => {
            const snapshot1 = {
                ...snapshot,
            }
            const operation2 = {
                ...operation,
            }
            contentType.registerSchema(schema)
            expect(() => contentType.apply(snapshot1, operation2)).toThrow(
                expect.objectContaining({
                    name: 'SyncOTError Assert',
                    message: 'operation.data must not be null.',
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
                ...operation,
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
            })
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

describe('createProseMirrorSchema', () => {
    function createSchema({
        nodes = {},
        marks = {},
        topNode,
    }: {
        nodes?: Record<string, NodeSpec>
        marks?: Record<string, NodeSpec>
        topNode?: string
    }): Schema {
        const type = 'test-type'
        const data = {
            nodes: Object.keys(nodes).flatMap((name) => [name, nodes[name]]),
            marks: Object.keys(marks).flatMap((name) => [name, marks[name]]),
            topNode,
        }
        const key = createSchemaKey(type, data)
        return {
            key,
            type,
            data,
            meta: null,
        }
    }

    test('"topNode" missing in "nodes"', () => {
        expect(() =>
            createProseMirrorSchema(
                createSchema({
                    nodes: {
                        doc: { content: 'text*' },
                        text: {},
                    },
                    topNode: 'invalid',
                }),
            ),
        ).toThrow(
            expect.objectContaining({
                name: 'RangeError',
                message: "Schema is missing its top node type ('invalid')",
            }),
        )
    })

    test('a node from "content" missing in "nodes"', () => {
        expect(() =>
            createProseMirrorSchema(
                createSchema({
                    nodes: {
                        doc: { content: 'invalid' },
                        text: {},
                    },
                }),
            ),
        ).toThrow(
            expect.objectContaining({
                name: 'SyntaxError',
                message:
                    "No node type or group 'invalid' found (in content expression 'invalid')",
            }),
        )
    })

    test('"text" in required position', () => {
        expect(() =>
            createProseMirrorSchema(
                createSchema({
                    nodes: {
                        doc: { content: 'text' },
                        text: {},
                    },
                }),
            ),
        ).toThrow(
            expect.objectContaining({
                name: 'SyntaxError',
                message:
                    "Only non-generatable nodes (text) in a required position (see https://prosemirror.net/docs/guide/#generatable) (in content expression 'text')",
            }),
        )
    })

    test('node with required attributes in required position', () => {
        expect(() =>
            createProseMirrorSchema(
                createSchema({
                    nodes: {
                        doc: { content: 'p+' },
                        p: {
                            content: 'text*',
                            attrs: {
                                a: {},
                            },
                        },
                        text: {},
                    },
                }),
            ),
        ).toThrow(
            expect.objectContaining({
                name: 'SyntaxError',
                message:
                    "Only non-generatable nodes (p) in a required position (see https://prosemirror.net/docs/guide/#generatable) (in content expression 'p+')",
            }),
        )
    })

    test('cycle in required position (minimal cycle)', () => {
        expect(() =>
            createProseMirrorSchema(
                createSchema({
                    nodes: {
                        doc: { content: 'p' },
                        p: { content: 'p' },
                        text: {},
                    },
                }),
            ),
        ).toThrow(
            expect.objectContaining({
                name: 'SyntaxError',
                message:
                    'A cycle of nodes in required positions (see https://prosemirror.net/docs/guide/#schema.content_expressions) (p -> p)',
            }),
        )
    })

    test('cycle in required position (long cycle)', () => {
        expect(() =>
            createProseMirrorSchema(
                createSchema({
                    nodes: {
                        doc: { content: 'p' },
                        p: { content: 'a' },
                        a: { content: 'b' },
                        b: { content: 'c' },
                        c: { content: 'd' },
                        d: { content: 'e' },
                        e: { content: 'a' },
                        text: {},
                    },
                }),
            ),
        ).toThrow(
            expect.objectContaining({
                name: 'SyntaxError',
                message:
                    'A cycle of nodes in required positions (see https://prosemirror.net/docs/guide/#schema.content_expressions) (a -> b -> c -> d -> e -> a)',
            }),
        )
    })

    test('cycle in required position (not triggered by topNode)', () => {
        expect(() =>
            createProseMirrorSchema(
                createSchema({
                    nodes: {
                        doc: { content: 'p' },
                        p: { content: 'text*' },
                        a: { content: 'b' },
                        b: { content: 'a' },
                        text: {},
                    },
                }),
            ),
        ).toThrow(
            expect.objectContaining({
                name: 'SyntaxError',
                message:
                    'A cycle of nodes in required positions (see https://prosemirror.net/docs/guide/#schema.content_expressions) (a -> b -> a)',
            }),
        )
    })

    test('cycle in required position (content: a b cycle d e)', () => {
        expect(() =>
            createProseMirrorSchema(
                createSchema({
                    nodes: {
                        doc: { content: 'p' },
                        p: { content: 'a b cycle d e' },
                        a: { content: 'text*' },
                        b: { content: 'text*' },
                        cycle: { content: 'p' },
                        d: { content: 'text*' },
                        e: { content: 'text*' },
                        text: {},
                    },
                }),
            ),
        ).toThrow(
            expect.objectContaining({
                name: 'SyntaxError',
                message:
                    'A cycle of nodes in required positions (see https://prosemirror.net/docs/guide/#schema.content_expressions) (p -> cycle -> p)',
            }),
        )
    })

    test('cycle in required position (content: text* cycle text*)', () => {
        expect(() =>
            createProseMirrorSchema(
                createSchema({
                    nodes: {
                        doc: { content: 'p' },
                        p: { content: 'text* cycle text*' },
                        cycle: { content: 'p', inline: true },
                        text: {},
                    },
                }),
            ),
        ).toThrow(
            expect.objectContaining({
                name: 'SyntaxError',
                message:
                    'A cycle of nodes in required positions (see https://prosemirror.net/docs/guide/#schema.content_expressions) (p -> cycle -> p)',
            }),
        )
    })

    test('cycle in required position (content: (cycle | a))', () => {
        expect(() =>
            createProseMirrorSchema(
                createSchema({
                    nodes: {
                        doc: { content: 'p' },
                        p: { content: 'cycle | a' },
                        a: { content: 'text*' },
                        cycle: { content: 'p' },
                        text: {},
                    },
                }),
            ),
        ).toThrow(
            expect.objectContaining({
                name: 'SyntaxError',
                message:
                    'A cycle of nodes in required positions (see https://prosemirror.net/docs/guide/#schema.content_expressions) (p -> cycle -> p)',
            }),
        )
    })

    test('no cycle in required position (content: (a | cycle))', () => {
        createProseMirrorSchema(
            createSchema({
                nodes: {
                    doc: { content: 'p' },
                    p: { content: 'a | cycle' },
                    a: { content: 'text*' },
                    cycle: { content: 'p' },
                    text: {},
                },
            }),
        )
    })

    test('cycle in required position (content: (a cycle a)+)', () => {
        expect(() =>
            createProseMirrorSchema(
                createSchema({
                    nodes: {
                        doc: { content: 'p' },
                        p: { content: '(a cycle a)+' },
                        a: { content: 'text*' },
                        cycle: { content: 'p' },
                        text: {},
                    },
                }),
            ),
        ).toThrow(
            expect.objectContaining({
                name: 'SyntaxError',
                message:
                    'A cycle of nodes in required positions (see https://prosemirror.net/docs/guide/#schema.content_expressions) (p -> cycle -> p)',
            }),
        )
    })

    test('no cycle in required position (content: (a cycle a)*)', () => {
        createProseMirrorSchema(
            createSchema({
                nodes: {
                    doc: { content: 'p' },
                    p: { content: '(a cycle a)*' },
                    a: { content: 'text*' },
                    cycle: { content: 'p' },
                    text: {},
                },
            }),
        )
    })

    test('cycle in required position (content: (a cycle a))', () => {
        expect(() =>
            createProseMirrorSchema(
                createSchema({
                    nodes: {
                        doc: { content: 'p' },
                        p: { content: '(a cycle a)+' },
                        a: { content: 'text*' },
                        cycle: { content: 'p' },
                        text: {},
                    },
                }),
            ),
        ).toThrow(
            expect.objectContaining({
                name: 'SyntaxError',
                message:
                    'A cycle of nodes in required positions (see https://prosemirror.net/docs/guide/#schema.content_expressions) (p -> cycle -> p)',
            }),
        )
    })

    test('no cycle in required position (content: (a cycle a)?)', () => {
        createProseMirrorSchema(
            createSchema({
                nodes: {
                    doc: { content: 'p' },
                    p: { content: '(a cycle a)*' },
                    a: { content: 'text*' },
                    cycle: { content: 'p' },
                    text: {},
                },
            }),
        )
    })

    test('cycle in required position (content: (a cycle a){1,2})', () => {
        expect(() =>
            createProseMirrorSchema(
                createSchema({
                    nodes: {
                        doc: { content: 'p' },
                        p: { content: '(a cycle a)+' },
                        a: { content: 'text*' },
                        cycle: { content: 'p' },
                        text: {},
                    },
                }),
            ),
        ).toThrow(
            expect.objectContaining({
                name: 'SyntaxError',
                message:
                    'A cycle of nodes in required positions (see https://prosemirror.net/docs/guide/#schema.content_expressions) (p -> cycle -> p)',
            }),
        )
    })

    test('no cycle in required position (content: (a cycle a){0,2})', () => {
        createProseMirrorSchema(
            createSchema({
                nodes: {
                    doc: { content: 'p' },
                    p: { content: '(a cycle a)*' },
                    a: { content: 'text*' },
                    cycle: { content: 'p' },
                    text: {},
                },
            }),
        )
    })
})
