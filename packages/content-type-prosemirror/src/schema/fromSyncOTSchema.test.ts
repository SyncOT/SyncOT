import { createSchemaHash, Schema as SyncOTSchema } from '@syncot/content'
import { fromSyncOTSchema, toJSON } from '..'

test('creates a schema', () => {
    const type = 'test-type'
    const data = {
        topNode: 'root',
        nodes: ['root', { attrs: { a: { default: 5 } } }, 'text', {}],
        marks: ['m', { attrs: { b: { default: 'TEST' } } }],
    }
    const meta = null
    const hash = createSchemaHash(type, data)
    const syncOTSchema: SyncOTSchema = { hash, type, data, meta }
    const schema = fromSyncOTSchema(syncOTSchema)
    expect(toJSON(schema)).toEqual(data)
})

test('validates output', () => {
    const type = 'test-type'
    const data = {
        nodes: ['doc', { attrs: { a: { default: undefined } } }, 'text', {}],
        marks: ['m', { attrs: { b: { default: 'TEST' } } }],
    }
    const meta = null
    const hash = createSchemaHash(type, data)
    const syncOTSchema: SyncOTSchema = { hash, type, data, meta }
    expect(() => fromSyncOTSchema(syncOTSchema)).toThrow(
        expect.objectContaining({
            name: 'SyncOTError InvalidEntity',
            message: `Invalid "ProseMirrorSchema.spec.nodes.doc.attrs.a.default".`,
            entityName: 'ProseMirrorSchema',
            entity: expect.toBeObject(),
            key: 'spec.nodes.doc.attrs.a.default',
        }),
    )
})
