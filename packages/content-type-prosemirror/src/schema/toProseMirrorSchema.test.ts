import { createSchemaHash, Schema } from '@syncot/content'
import { NodeSpec } from 'prosemirror-model'
import { toProseMirrorSchema } from '@syncot/content-type-prosemirror/src'

const type = 'test-type'

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
