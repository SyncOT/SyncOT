import { createSchemaHash } from '@syncot/content'
import { Schema as ProseMirrorSchema } from 'prosemirror-model'
import { fromProseMirrorSchema } from '..'

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
        const schema2 = fromProseMirrorSchema(type + '-2', proseMirrorSchema)
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
