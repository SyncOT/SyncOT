// These tests verify certain assumptions about ProseMirror
// which the ProseMirror-SyncOT integration is based on.
import { Schema } from 'prosemirror-model'

describe('content rules support nesting', () => {
    test.each<[object, string | undefined]>([
        [
            {
                type: 'doc',
                content: [{ type: 'a' }, { type: 'b' }],
            },
            undefined,
        ],
        [
            {
                type: 'doc',
                content: [{ type: 'a' }, { type: 'c' }],
            },
            undefined,
        ],
        [
            {
                type: 'doc',
                content: [{ type: 'd' }, { type: 'f' }, { type: 'f' }],
            },
            undefined,
        ],
        [
            {
                type: 'doc',
                content: [{ type: 'e' }, { type: 'f' }, { type: 'f' }],
            },
            undefined,
        ],
        [
            {
                type: 'doc',
                content: [{ type: 'a' }, { type: 'd' }],
            },
            'Invalid content for node doc: <a, d>',
        ],
        [
            {
                type: 'doc',
                content: [{ type: 'e' }, { type: 'f' }],
            },
            'Invalid content for node doc: <e, f>',
        ],
        [
            {
                type: 'doc',
                content: [
                    { type: 'e' },
                    { type: 'f' },
                    { type: 'f' },
                    { type: 'f' },
                ],
            },
            'Invalid content for node doc: <e, f, f, f>',
        ],
        [
            {
                type: 'doc',
                content: [{ type: 'a' }, { type: 'b' }, { type: 'c' }],
            },
            'Invalid content for node doc: <a, b, c>',
        ],
    ])('%#', (json, message) => {
        const schema = new Schema({
            nodes: {
                doc: { content: '(a (b | c)) | ((d | e) f{2})' },
                text: {},
                a: {},
                b: {},
                c: {},
                d: {},
                e: {},
                f: {},
            },
        })
        const doc = schema.nodeFromJSON(json)
        if (message != null) {
            expect(() => doc.check()).toThrow(message)
        } else {
            doc.check()
        }
        expect(doc.toJSON()).toEqual(json)
    })
})

test('fromJSON adds default attribute values and removes extraneous attributes', () => {
    const schema = new Schema({
        nodes: {
            doc: { content: 'n*', marks: 'm' },
            n: { attrs: { a: { default: 5 } } },
            text: {},
        },
        marks: {
            m: { attrs: { b: { default: 6 } } },
        },
    })

    const json = {
        type: 'doc',
        content: [
            {
                type: 'n',
                attrs: {
                    c: 7,
                },
                marks: [
                    {
                        type: 'm',
                        attrs: {
                            c: 7,
                        },
                    },
                ],
            },
        ],
    }
    const doc = schema.nodeFromJSON(json)
    doc.check()
    expect(doc.toJSON()).toEqual({
        type: 'doc',
        content: [
            {
                type: 'n',
                attrs: {
                    a: 5,
                },
                marks: [
                    {
                        type: 'm',
                        attrs: {
                            b: 6,
                        },
                    },
                ],
            },
        ],
    })
})

test('new Schema fails on undeclared nodes in a content expression', () => {
    expect(
        () =>
            new Schema({
                nodes: {
                    doc: { content: 'a' },
                    text: {},
                },
            }),
    ).toThrow("No node type or group 'a' found (in content expression 'a')")
})

test('new Schema fails on undeclared marks in a marks expression', () => {
    expect(
        () =>
            new Schema({
                nodes: {
                    doc: { content: 'text*', marks: 'a' },
                    text: {},
                },
            }),
    ).toThrow("Unknown mark type: 'a'")
})

test('fromJSON fails on undeclared nodes', () => {
    const schema = new Schema({
        nodes: {
            doc: { content: 'text*' },
            text: {},
        },
    })
    const json = {
        type: 'doc',
        content: [
            {
                type: 'a',
            },
        ],
    }
    expect(() => schema.nodeFromJSON(json)).toThrow('Unknown node type: a')
})

test('fromJSON fails on undeclared marks', () => {
    const schema = new Schema({
        nodes: {
            doc: { content: 'text*' },
            text: {},
        },
    })
    const json = {
        type: 'doc',
        content: [
            {
                type: 'text',
                text: 'Hello',
                marks: [{ type: 'a' }],
            },
        ],
    }
    expect(() => schema.nodeFromJSON(json)).toThrow(
        'There is no mark type a in this schema',
    )
})

test('fromJSON fails on node attributes without values', () => {
    const schema = new Schema({
        nodes: {
            doc: { content: 'n*' },
            text: {},
            n: { attrs: { a: {} } },
        },
    })
    const json = {
        type: 'doc',
        content: [
            {
                type: 'n',
            },
        ],
    }
    expect(() => schema.nodeFromJSON(json)).toThrow(
        'No value supplied for attribute a',
    )
})

test('fromJSON fails on mark attributes without values', () => {
    const schema = new Schema({
        nodes: {
            doc: { content: 'text*', marks: 'm' },
            text: {},
        },
        marks: {
            m: { attrs: { a: {} } },
        },
    })
    const json = {
        type: 'doc',
        content: [
            {
                type: 'text',
                text: 'TEST',
                marks: [
                    {
                        type: 'm',
                    },
                ],
            },
        ],
    }
    expect(() => schema.nodeFromJSON(json)).toThrow(
        'No value supplied for attribute a',
    )
})

test('fromJSON allows invalid content - must use check', () => {
    const schema = new Schema({
        nodes: {
            doc: { content: 'a b' },
            text: {},
            a: {},
            b: {},
        },
    })
    const json = {
        type: 'doc',
        content: [
            {
                type: 'a',
            },
        ],
    }
    const doc = schema.nodeFromJSON(json)
    expect(() => doc.check()).toThrow('Invalid content for node doc: <a>')
})

test('fromJSON allows invalid marks - must use check', () => {
    const schema = new Schema({
        nodes: {
            doc: { content: 'text*', marks: 'a' },
            text: {},
        },
        marks: {
            a: {},
            b: {},
        },
    })
    const json = {
        type: 'doc',
        content: [
            {
                type: 'text',
                text: 'Hello',
                marks: [{ type: 'b' }],
            },
        ],
    }
    const doc = schema.nodeFromJSON(json)
    expect(() => doc.check()).toThrow(
        'Invalid content for node doc: <b("Hello")>',
    )
})

// ProseMirror bug: https://github.com/ProseMirror/prosemirror/issues/1116
describe('fromJSON allows marks violating "excludes" - check does not verify it either', () => {
    const schema = new Schema({
        nodes: {
            doc: { content: 'text*', marks: '_' },
            text: {},
        },
        marks: {
            m: { attrs: { a: {} }, excludes: '_' },
            n: { attrs: { b: {} } },
            o: { attrs: { c: {} }, excludes: 'o' },
            p: { attrs: { d: {} }, excludes: '' },
        },
    })
    test.each<[object, string | undefined]>([
        [
            {
                type: 'doc',
                content: [
                    {
                        type: 'text',
                        text: 'Hello',
                        marks: [
                            { type: 'n', attrs: { b: 2 } },
                            { type: 'o', attrs: { c: 3 } },
                            { type: 'p', attrs: { d: 4 } },
                            { type: 'p', attrs: { d: 5 } },
                        ],
                    },
                ],
            },
            undefined,
        ],
        [
            {
                type: 'doc',
                content: [
                    {
                        type: 'text',
                        text: 'Hello',
                        marks: [
                            { type: 'm', attrs: { a: 1 } },
                            { type: 'm', attrs: { a: 2 } },
                        ],
                    },
                ],
            },
            undefined,
        ],
        [
            {
                type: 'doc',
                content: [
                    {
                        type: 'text',
                        text: 'Hello',
                        marks: [
                            { type: 'o', attrs: { c: 1 } },
                            { type: 'o', attrs: { c: 2 } },
                        ],
                    },
                ],
            },
            undefined,
        ],
    ])('%#', (json, message) => {
        const doc = schema.nodeFromJSON(json)
        if (message != null) {
            expect(() => doc.check()).toThrow(message)
        } else {
            doc.check()
        }
        expect(doc.toJSON()).toEqual(json)
    })
})
