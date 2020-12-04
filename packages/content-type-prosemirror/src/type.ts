import { ContentType, Schema } from '@syncot/content'
import {
    createInvalidEntityError,
    hash,
    throwError,
    validate,
    Validator,
} from '@syncot/util'
import OrderedMap from 'orderedmap'
import {
    ContentMatch,
    MarkSpec,
    NodeSpec,
    NodeType,
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
        throwError(this.validateProseMirrorSchema(proseMirrorSchema))

        if (key != null) this.schemaCacheByKey.set(key, proseMirrorSchema)
        this.schemaCacheByHash.set(dataHash, proseMirrorSchema)
        return proseMirrorSchema
    }

    /**
     * Validates a ProseMirror schema.
     * @param schema The schema to validate.
     * @returns An error, if validation fails, otherwise undefined.
     */
    private validateProseMirrorSchema(
        schema: ProseMirrorSchema,
    ): Error | undefined {
        // Check if the required content would cause a stack overflow when filling nodes.
        for (const type of Object.values(schema.nodes)) {
            const cycle = findCycle(type, [])
            if (cycle) {
                const cycleString = cycle
                    .map((cycleType) => cycleType.name)
                    .join(' -> ')
                return new SyntaxError(
                    `A cycle of nodes in required positions (see https://prosemirror.net/docs/guide/#schema.content_expressions) (${cycleString})`,
                )
            }
        }

        return undefined
    }
}

/**
 * Looks for cycles created by following ContentMatch -> defaultType -> ContentMatch references.
 * @param type The NodeType at which to start searching.
 * @param seenTypes A list of node types which have been already visited.
 * @returns A list of node types creating a cycle, or `undefined`, if no cycles were detected.
 */
function findCycle(
    type: NodeType,
    seenTypes: NodeType[],
): NodeType[] | undefined {
    const index = seenTypes.indexOf(type)
    const seenTypesExtended = seenTypes.concat(type)
    if (index >= 0) return seenTypesExtended.slice(index)

    let match: ContentMatch | null | undefined = type.contentMatch
    while (match && !match.validEnd && match.defaultType) {
        const cycle = findCycle(match.defaultType, seenTypesExtended)
        if (cycle) return cycle
        match = match.matchType(match.defaultType)
    }

    return undefined
}
