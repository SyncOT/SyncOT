import { fromJSON, toJSON } from '..'

test('creates a schema', () => {
    const json = {
        topNode: 'root',
        nodes: ['root', { attrs: { a: { default: 5 } } }, 'text', {}],
        marks: ['m', { attrs: { b: { default: 'TEST' } } }],
    }
    const schema = fromJSON(json)
    expect(toJSON(schema)).toEqual(json)
})

test('validates output', () => {
    const json = {
        nodes: ['doc', { attrs: { a: { default: undefined } } }, 'text', {}],
        marks: ['m', { attrs: { b: { default: 'TEST' } } }],
    }
    expect(() => fromJSON(json)).toThrow(
        expect.objectContaining({
            name: 'SyncOTError InvalidEntity',
            message: `Invalid "ProseMirrorSchema.spec.nodes.doc.attrs.a.default".`,
            entityName: 'ProseMirrorSchema',
            entity: expect.toBeObject(),
            key: 'spec.nodes.doc.attrs.a.default',
        }),
    )
})
