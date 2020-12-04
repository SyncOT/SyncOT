import { Schema } from '@syncot/content'
import { NodeSpec } from 'prosemirror-model'
import { createContentType } from '.'
import { ProseMirrorContentType } from './type'

let contentType: ProseMirrorContentType
const schema: Schema = {
    key: null,
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

describe('createProseMirrorSchema', () => {
    describe('cache', () => {
        test('key=5', () => {
            const key = 5
            const proseMirrorSchema1 = contentType.createProseMirrorSchema({
                ...schema,
                key,
            })
            // Schema cached by schema.key - all other porperties are ignored.
            const proseMirrorSchema2 = contentType.createProseMirrorSchema({
                key,
                type: 'type-1',
                data: null,
                meta: {},
            })
            expect(proseMirrorSchema2).toBe(proseMirrorSchema1)
        })

        test('key=null', () => {
            const proseMirrorSchema1 = contentType.createProseMirrorSchema(
                schema,
            )
            // Schema cached by hash(schema.data) - all other porperties are ignored.
            const proseMirrorSchema2 = contentType.createProseMirrorSchema({
                ...schema,
                type: 'type-1',
                meta: {},
            })
            expect(proseMirrorSchema2).toBe(proseMirrorSchema1)
        })

        test('key=null then key=5', () => {
            const key = 5
            const proseMirrorSchema1 = contentType.createProseMirrorSchema(
                schema,
            )
            // Schema cached by hash(schema.data) - all other porperties are ignored.
            const proseMirrorSchema2 = contentType.createProseMirrorSchema({
                ...schema,
                key,
                type: 'type-1',
            })
            // Schema cached by schema.key - all other porperties are ignored.
            const proseMirrorSchema3 = contentType.createProseMirrorSchema({
                ...schema,
                key,
                data: null,
                type: 'type-2',
            })
            expect(proseMirrorSchema2).toBe(proseMirrorSchema1)
            expect(proseMirrorSchema3).toBe(proseMirrorSchema1)
        })

        test('key=5 then key=6 with the same data', () => {
            const key = 5
            const proseMirrorSchema1 = contentType.createProseMirrorSchema({
                ...schema,
                key,
            })
            // Schema cached by hash(schema.data) - all other porperties are ignored.
            const proseMirrorSchema2 = contentType.createProseMirrorSchema({
                ...schema,
                key: key + 1,
                type: 'type-1',
                meta: {},
            })
            expect(proseMirrorSchema2).toBe(proseMirrorSchema1)
        })

        test('key=null with different data', () => {
            const proseMirrorSchema1 = contentType.createProseMirrorSchema(
                schema,
            )
            const proseMirrorSchema2 = contentType.createProseMirrorSchema({
                ...schema,
                data: { ...schema.data, topNode: 'paragraph' },
            })
            expect(proseMirrorSchema2).not.toBe(proseMirrorSchema1)
        })

        test('key=5 then key=6 with different data', () => {
            const key = 5
            const proseMirrorSchema1 = contentType.createProseMirrorSchema({
                ...schema,
                key,
            })
            const proseMirrorSchema2 = contentType.createProseMirrorSchema({
                ...schema,
                key: key + 1,
                data: { ...schema.data, topNode: 'paragraph' },
            })
            expect(proseMirrorSchema2).not.toBe(proseMirrorSchema1)
        })
    })

    describe('validation', () => {
        function createSchema({
            nodes = {},
            marks = {},
            topNode,
        }: {
            nodes?: Record<string, NodeSpec>
            marks?: Record<string, NodeSpec>
            topNode?: string
        }): Schema {
            return {
                key: null,
                type: '',
                data: {
                    nodes: Object.keys(nodes).flatMap((name) => [
                        name,
                        nodes[name],
                    ]),
                    marks: Object.keys(marks).flatMap((name) => [
                        name,
                        marks[name],
                    ]),
                    topNode,
                },
                meta: null,
            }
        }

        test('validation: "topNode" missing in "nodes"', () => {
            expect(() =>
                contentType.createProseMirrorSchema(
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

        test('validation: a node from "content" missing in "nodes"', () => {
            expect(() =>
                contentType.createProseMirrorSchema(
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

        test('validation: "text" in required position', () => {
            expect(() =>
                contentType.createProseMirrorSchema(
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

        test('validation: node with required attributes in required position', () => {
            expect(() =>
                contentType.createProseMirrorSchema(
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

        test('validation: cycle in required position (minimal cycle)', () => {
            expect(() =>
                contentType.createProseMirrorSchema(
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

        test('validation: cycle in required position (long cycle)', () => {
            expect(() =>
                contentType.createProseMirrorSchema(
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

        test('validation: cycle in required position (not triggered by topNode)', () => {
            expect(() =>
                contentType.createProseMirrorSchema(
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

        test('validation: cycle in required position (content: a b cycle d e)', () => {
            expect(() =>
                contentType.createProseMirrorSchema(
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

        test('validation: cycle in required position (content: text* cycle text*)', () => {
            expect(() =>
                contentType.createProseMirrorSchema(
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

        test('validation: cycle in required position (content: (cycle | a))', () => {
            expect(() =>
                contentType.createProseMirrorSchema(
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

        test('validation: no cycle in required position (content: (a | cycle))', () => {
            contentType.createProseMirrorSchema(
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

        test('validation: cycle in required position (content: (a cycle a)+)', () => {
            expect(() =>
                contentType.createProseMirrorSchema(
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

        test('validation: no cycle in required position (content: (a cycle a)*)', () => {
            contentType.createProseMirrorSchema(
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

        test('validation: cycle in required position (content: (a cycle a))', () => {
            expect(() =>
                contentType.createProseMirrorSchema(
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

        test('validation: no cycle in required position (content: (a cycle a)?)', () => {
            contentType.createProseMirrorSchema(
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

        test('validation: cycle in required position (content: (a cycle a){1,2})', () => {
            expect(() =>
                contentType.createProseMirrorSchema(
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

        test('validation: no cycle in required position (content: (a cycle a){0,2})', () => {
            contentType.createProseMirrorSchema(
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
})
