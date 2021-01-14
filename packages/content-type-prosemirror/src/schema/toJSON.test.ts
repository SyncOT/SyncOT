import { Schema } from 'prosemirror-model'
import { toJSON } from '..'

const attrs = {
    attrNull: { default: null },
    attrBoolean: { default: true },
    attrString: { default: 'test' },
    attrNumber: { default: 5 },
    attrObject: { default: { key: 'value' } },
    attrArray: { default: [1, 2, 3] },
    attrRequired: {},
}

test('validates input', () => {
    const schema = new Schema({
        nodes: {
            doc: { attrs: { a: { default: undefined } } },
            text: {},
        },
    })
    expect(() => toJSON(schema)).toThrow(
        expect.objectContaining({
            name: 'SyncOTError InvalidEntity',
            message: `Invalid "ProseMirrorSchema.spec.nodes.doc.attrs.a.default".`,
            entityName: 'ProseMirrorSchema',
            entity: schema,
            key: 'spec.nodes.doc.attrs.a.default',
        }),
    )
})

test('complex schema', () => {
    const schema = new Schema({
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
    expect(toJSON(schema)).toEqual({
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
})

test('default top node', () => {
    const schema = new Schema({
        nodes: {
            doc: { content: 'text*' },
            text: {},
        },
    })
    expect(toJSON(schema)).toEqual({
        nodes: ['doc', { content: 'text*' }, 'text', {}],
        marks: [],
    })
})
