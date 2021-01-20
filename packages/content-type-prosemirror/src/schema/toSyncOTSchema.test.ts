import { createSchemaHash } from '@syncot/content'
import { Schema } from 'prosemirror-model'
import { toJSON, toSyncOTSchema } from '..'

const type = 'test-type'

test('create a schema', () => {
    const schema = new Schema({
        nodes: {
            doc: { content: 'text*' },
            text: {},
        },
        marks: {
            m: {},
        },
    })
    const syncOTSchema = toSyncOTSchema(type, schema)
    expect(syncOTSchema.type).toBe(type)
    expect(syncOTSchema.meta).toBe(null)
    expect(syncOTSchema.data).toEqual(toJSON(schema))
    expect(syncOTSchema.hash).toBe(
        createSchemaHash(syncOTSchema.type, syncOTSchema.data),
    )
})

test('validates input', () => {
    const schema = new Schema({
        nodes: {
            doc: { attrs: { a: { default: undefined } } },
            text: {},
        },
    })
    expect(() => toSyncOTSchema(type, schema)).toThrow(
        expect.objectContaining({
            name: 'SyncOTError InvalidEntity',
            message: `Invalid "ProseMirrorSchema.spec.nodes.doc.attrs.a.default".`,
            entityName: 'ProseMirrorSchema',
            entity: { spec: schema.spec },
            key: 'spec.nodes.doc.attrs.a.default',
        }),
    )
})
