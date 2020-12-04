import { ContentType, Schema } from '@syncot/content'
import {
    createInvalidEntityError,
    hash,
    validate,
    Validator,
} from '@syncot/util'
import OrderedMap from 'orderedmap'
import {
    MarkSpec,
    NodeSpec,
    Schema as ProseMirrorSchema,
} from 'prosemirror-model'

/**
 * Creates a ContentType instance supporting ProseMirror.
 */
export function createContentType(): ContentType {
    return new ProseMirrorContentType()
}

export class ProseMirrorContentType implements ContentType {
    private readonly schemaCacheByKey: Map<
        number,
        ProseMirrorSchema
    > = new Map()
    private readonly schemaCacheByHash: Map<
        string,
        ProseMirrorSchema
    > = new Map()

    public validateSchema: Validator<Schema> = validate([
        (schema) =>
            typeof schema === 'object' && schema != null
                ? undefined
                : createInvalidEntityError('Schema', schema, null),
        (schema) =>
            typeof schema.data === 'object' && schema.data != null
                ? undefined
                : createInvalidEntityError('Schema', schema, 'data'),
        (schema) =>
            typeof schema.data.topNode === 'string' ||
            schema.data.topNode == null
                ? undefined
                : createInvalidEntityError('Schema', schema, 'data.topNode'),
        (schema) => {
            const { nodes } = schema.data
            if (!Array.isArray(nodes)) {
                return createInvalidEntityError('Schema', schema, 'data.nodes')
            }
            if (nodes.length % 2 !== 0) {
                return createInvalidEntityError(
                    'Schema',
                    schema,
                    'data.nodes.length',
                )
            }
            for (let i = 0; i < nodes.length; i += 2) {
                const nameIndex = i
                const specIndex = i + 1
                const name = nodes[nameIndex]
                const spec = nodes[specIndex]
                if (typeof name !== 'string') {
                    return createInvalidEntityError(
                        'Schema',
                        schema,
                        `data.nodes.${nameIndex}`,
                    )
                }
                if (typeof spec !== 'object' || spec == null) {
                    return createInvalidEntityError(
                        'Schema',
                        schema,
                        `data.nodes.${specIndex}`,
                    )
                }
            }
            return undefined
        },
        (schema) => {
            const { marks } = schema.data
            if (!Array.isArray(marks)) {
                return createInvalidEntityError('Schema', schema, 'data.marks')
            }
            if (marks.length % 2 !== 0) {
                return createInvalidEntityError(
                    'Schema',
                    schema,
                    'data.marks.length',
                )
            }
            for (let i = 0; i < marks.length; i += 2) {
                const nameIndex = i
                const specIndex = i + 1
                const name = marks[nameIndex]
                const spec = marks[specIndex]
                if (typeof name !== 'string') {
                    return createInvalidEntityError(
                        'Schema',
                        schema,
                        `data.marks.${nameIndex}`,
                    )
                }
                if (typeof spec !== 'object' || spec == null) {
                    return createInvalidEntityError(
                        'Schema',
                        schema,
                        `data.marks.${specIndex}`,
                    )
                }
            }
            return undefined
        },
        (schema) => {
            try {
                this.createProseMirrorSchema(schema)
                return undefined
            } catch (error) {
                return createInvalidEntityError('Schema', schema, 'data', error)
            }
        },
    ])

    /**
     * Creates a ProseMirror Schema from a SyncOT Schema.
     */
    public createProseMirrorSchema({ key, data }: Schema): ProseMirrorSchema {
        const proseMirrorSchemaForKey =
            key != null ? this.schemaCacheByKey.get(key) : undefined
        if (proseMirrorSchemaForKey) return proseMirrorSchemaForKey

        const dataHash = hash(data)
        const proseMirrorSchemaForHash = this.schemaCacheByHash.get(dataHash)
        if (proseMirrorSchemaForHash) {
            if (key != null)
                this.schemaCacheByKey.set(key, proseMirrorSchemaForHash)
            return proseMirrorSchemaForHash
        }

        const { nodes: rawNodes, marks: rawMarks, topNode } = data

        let nodes = OrderedMap.from<NodeSpec>()
        for (let i = 0; i < rawNodes.length; i += 2) {
            nodes = nodes.addToEnd(rawNodes[i], rawNodes[i + 1])
        }

        let marks = OrderedMap.from<MarkSpec>()
        for (let i = 0; i < rawMarks.length; i += 2) {
            marks = marks.addToEnd(rawMarks[i], rawMarks[i + 1])
        }

        const proseMirrorSchema = new ProseMirrorSchema({
            nodes,
            marks,
            topNode,
        })

        // TODO ensure that the required content does not cause a stack overflow and test it thoroughly

        if (key != null) this.schemaCacheByKey.set(key, proseMirrorSchema)
        this.schemaCacheByHash.set(dataHash, proseMirrorSchema)
        return proseMirrorSchema
    }
}
