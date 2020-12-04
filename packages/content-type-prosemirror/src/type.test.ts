import { Schema } from '@syncot/content'
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
    test('cache: key=5', () => {
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

    test('cache: key=null', () => {
        const proseMirrorSchema1 = contentType.createProseMirrorSchema(schema)
        // Schema cached by hash(schema.data) - all other porperties are ignored.
        const proseMirrorSchema2 = contentType.createProseMirrorSchema({
            ...schema,
            type: 'type-1',
            meta: {},
        })
        expect(proseMirrorSchema2).toBe(proseMirrorSchema1)
    })

    test('cache: key=null then key=5', () => {
        const key = 5
        const proseMirrorSchema1 = contentType.createProseMirrorSchema(schema)
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

    test('cache: key=5 then key=6 with the same data', () => {
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

    test('cache: key=null with different data', () => {
        const proseMirrorSchema1 = contentType.createProseMirrorSchema(schema)
        const proseMirrorSchema2 = contentType.createProseMirrorSchema({
            ...schema,
            data: { ...schema.data, topNode: 'paragraph' },
        })
        expect(proseMirrorSchema2).not.toBe(proseMirrorSchema1)
    })

    test('cache: key=5 then key=6 with different data', () => {
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
