import { createSchemaHash, Schema } from '@syncot/content'
import { NodeSpec, Schema as ProseMirrorSchema } from 'prosemirror-model'
import { fromProseMirrorSchema, toProseMirrorSchema } from '.'

const type = 'test-type'
const attrs = {
    attrNull: { default: null },
    attrBoolean: { default: true },
    attrString: { default: 'test' },
    attrNumber: { default: 5 },
    attrObject: { default: { key: 'value' } },
    attrArray: { default: [1, 2, 3] },
    attrRequired: {},
}

describe('fromProseMirrorSchema', () => {
    test('create a schema', () => {
        const proseMirrorSchema = new ProseMirrorSchema({
            nodes: {
                root: { content: 'p+' },
                p: { content: 'text*' },
                a: { content: 'text*', attrs },
                nodeWithIgnoredProperties: {
                    content: 'text*',
                    atom: true,
                    selectable: true,
                    draggable: true,
                    code: true,
                    defining: true,
                    isolating: true,
                    toDOM() {
                        return ['a', 0]
                    },
                    parseDOM: [],
                    toDebugString() {
                        return ''
                    },
                    anotherProperty: 5,
                },
                nodeWithNullProperties: {
                    content: 'text*',
                    marks: null,
                    group: undefined,
                },
                nodeWithAllProperties: {
                    content: 'text*',
                    marks: 'bold',
                    group: 'test-group',
                    inline: true,
                    attrs: { a: {} },
                },
                text: {},
            },
            marks: {
                bold: {},
                b: { attrs },
                markWithIgnoredProperties: {
                    group: 'test',
                    inclusive: true,
                    spanning: true,
                    toDOM() {
                        return ['a', 0]
                    },
                    parseDOM: [],
                    anotherProperty: 6,
                },
                markWithNullProperties: {
                    attrs: { b: {} },
                    excludes: null,
                    group: undefined,
                },
                markWithAllProperties: {
                    attrs: { a: {} },
                    excludes: '',
                    group: 'test-group',
                },
            },
            topNode: 'root',
        })
        const schema = fromProseMirrorSchema(type, proseMirrorSchema)
        expect(schema.type).toBe(type)
        expect(schema.meta).toBe(null)
        expect(schema.data).toStrictEqual({
            nodes: [
                'root',
                { content: 'p+' },
                'p',
                { content: 'text*' },
                'a',
                { content: 'text*', attrs },
                'nodeWithIgnoredProperties',
                { content: 'text*' },
                'nodeWithNullProperties',
                { content: 'text*' },
                'nodeWithAllProperties',
                {
                    content: 'text*',
                    marks: 'bold',
                    group: 'test-group',
                    inline: true,
                    attrs: { a: {} },
                },
                'text',
                {},
            ],
            marks: [
                'bold',
                {},
                'b',
                { attrs },
                'markWithIgnoredProperties',
                { group: 'test' },
                'markWithNullProperties',
                { attrs: { b: {} } },
                'markWithAllProperties',
                { attrs: { a: {} }, excludes: '', group: 'test-group' },
            ],
            topNode: 'root',
        })
        expect(schema.hash).toBe(createSchemaHash(schema.type, schema.data))
    })

    test('default top node', () => {
        const proseMirrorSchema = new ProseMirrorSchema({
            nodes: {
                doc: { content: 'text*' },
                text: {},
            },
        })
        const schema = fromProseMirrorSchema(type, proseMirrorSchema)
        expect(schema.type).toBe(type)
        expect(schema.meta).toBe(null)
        expect(schema.data).toStrictEqual({
            nodes: ['doc', { content: 'text*' }, 'text', {}],
            marks: [],
            topNode: 'doc',
        })
        expect(schema.hash).toBe(createSchemaHash(schema.type, schema.data))
    })

    describe.each(['node', 'mark'])('invalid %s attribute', (entity) => {
        test.each([undefined, () => 5, Symbol('test')])(
            'invalid default value: %p',
            (defaultValue) => {
                const proseMirrorSchema = new ProseMirrorSchema({
                    nodes: {
                        doc: { content: 'p+' },
                        p: { content: 'text*' },
                        a: {
                            content: 'text*',
                            attrs: {
                                ...attrs,
                                attrInvalid: {
                                    default:
                                        entity === 'node' ? defaultValue : null,
                                },
                            },
                        },
                        text: {},
                    },
                    marks: {
                        bold: {},
                        b: {
                            attrs: {
                                ...attrs,
                                attrInvalid: {
                                    default:
                                        entity === 'mark' ? defaultValue : null,
                                },
                            },
                        },
                    },
                })
                expect(() =>
                    fromProseMirrorSchema(type, proseMirrorSchema),
                ).toThrow(
                    expect.objectContaining({
                        name: 'SyncOTError Assert',
                        message: 'The schema cannot be serialized.',
                    }),
                )
            },
        )
    })

    describe('caching', () => {
        const proseMirrorSchema = new ProseMirrorSchema({
            nodes: {
                doc: { content: 'text*' },
                text: {},
            },
        })
        test('the same editor schema and the same type', () => {
            const schema1 = fromProseMirrorSchema(type, proseMirrorSchema)
            const schema2 = fromProseMirrorSchema(type, proseMirrorSchema)
            expect(schema2).toBe(schema1)
        })
        test('the same editor schema and different type', () => {
            const schema1 = fromProseMirrorSchema(type, proseMirrorSchema)
            const schema2 = fromProseMirrorSchema(
                type + '-2',
                proseMirrorSchema,
            )
            expect(schema2).not.toBe(schema1)
        })
        test('different editor schema and the same type', () => {
            const editorSchema1 = new ProseMirrorSchema({
                nodes: {
                    doc: { content: 'text*' },
                    text: {},
                },
            })
            const editorSchema2 = new ProseMirrorSchema({
                nodes: {
                    doc: { content: 'text*' },
                    text: {},
                },
            })
            const schema1 = fromProseMirrorSchema(type, editorSchema1)
            const schema2 = fromProseMirrorSchema(type + '-2', editorSchema2)
            expect(schema2).not.toBe(schema1)
        })
        test('different editor schema and different type', () => {
            const editorSchema1 = new ProseMirrorSchema({
                nodes: {
                    doc: { content: 'text*' },
                    text: {},
                },
            })
            const editorSchema2 = new ProseMirrorSchema({
                nodes: {
                    doc: { content: 'text*' },
                    text: {},
                },
            })
            const schema1 = fromProseMirrorSchema(type, editorSchema1)
            const schema2 = fromProseMirrorSchema(type + '-2', editorSchema2)
            expect(schema2).not.toBe(schema1)
        })
    })
})

describe('toProseMirrorSchema', () => {
    function createSchema({
        nodes = {},
        marks = {},
        topNode,
    }: {
        nodes?: Record<string, NodeSpec>
        marks?: Record<string, NodeSpec>
        topNode?: string
    }): Schema {
        const data = {
            nodes: Object.keys(nodes).flatMap((name) => [name, nodes[name]]),
            marks: Object.keys(marks).flatMap((name) => [name, marks[name]]),
            topNode,
        }
        const hash = createSchemaHash(type, data)
        return {
            hash,
            type,
            data,
            meta: null,
        }
    }

    test('"topNode" missing in "nodes"', () => {
        expect(() =>
            toProseMirrorSchema(
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
            toProseMirrorSchema(
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
            toProseMirrorSchema(
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
            toProseMirrorSchema(
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
            toProseMirrorSchema(
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
            toProseMirrorSchema(
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
            toProseMirrorSchema(
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
            toProseMirrorSchema(
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
            toProseMirrorSchema(
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
            toProseMirrorSchema(
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
        toProseMirrorSchema(
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
            toProseMirrorSchema(
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
        toProseMirrorSchema(
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
            toProseMirrorSchema(
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
        toProseMirrorSchema(
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
            toProseMirrorSchema(
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
        toProseMirrorSchema(
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
