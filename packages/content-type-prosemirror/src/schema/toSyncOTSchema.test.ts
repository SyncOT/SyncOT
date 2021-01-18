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

describe('caching', () => {
    const proseMirrorSchema = new Schema({
        nodes: {
            doc: { content: 'text*' },
            text: {},
        },
    })
    test('the same editor schema and the same type', () => {
        const schema1 = toSyncOTSchema(type, proseMirrorSchema)
        const schema2 = toSyncOTSchema(type, proseMirrorSchema)
        expect(schema2).toBe(schema1)
    })
    test('the same editor schema and different type', () => {
        const schema1 = toSyncOTSchema(type, proseMirrorSchema)
        const schema2 = toSyncOTSchema(type + '-2', proseMirrorSchema)
        expect(schema2).not.toBe(schema1)
    })
    test('different editor schema and the same type', () => {
        const editorSchema1 = new Schema({
            nodes: {
                doc: { content: 'text*' },
                text: {},
            },
        })
        const editorSchema2 = new Schema({
            nodes: {
                doc: { content: 'text*' },
                text: {},
            },
        })
        const schema1 = toSyncOTSchema(type, editorSchema1)
        const schema2 = toSyncOTSchema(type + '-2', editorSchema2)
        expect(schema2).not.toBe(schema1)
    })
    test('different editor schema and different type', () => {
        const editorSchema1 = new Schema({
            nodes: {
                doc: { content: 'text*' },
                text: {},
            },
        })
        const editorSchema2 = new Schema({
            nodes: {
                doc: { content: 'text*' },
                text: {},
            },
        })
        const schema1 = toSyncOTSchema(type, editorSchema1)
        const schema2 = toSyncOTSchema(type + '-2', editorSchema2)
        expect(schema2).not.toBe(schema1)
    })
})
