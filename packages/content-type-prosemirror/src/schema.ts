import { createSchemaHash, Schema } from '@syncot/content'
import { assert, equal, throwError } from '@syncot/util'
import OrderedMap from 'orderedmap'
import {
    ContentMatch,
    MarkSpec,
    NodeSpec,
    NodeType,
    Schema as ProseMirrorSchema,
} from 'prosemirror-model'

const nodeSpecKeys = ['content', 'marks', 'group', 'inline', 'attrs']
const markSpecKeys = ['attrs', 'excludes', 'group']
const cachedSchemas: WeakMap<
    ProseMirrorSchema,
    Map<string, Schema>
> = new WeakMap()
/**
 * Gets a SyncOT Schema for the given type and ProseMirror Schema.
 *
 * It caches the result per ProseMirror Schema and type.
 */
export function fromProseMirrorSchema(
    type: string,
    proseMirrorSchema: ProseMirrorSchema,
): Schema {
    // Try to get a cached Schema.
    let nestedCachedSchemas = cachedSchemas.get(proseMirrorSchema)
    if (!nestedCachedSchemas) {
        nestedCachedSchemas = new Map()
        cachedSchemas.set(proseMirrorSchema, nestedCachedSchemas)
    }

    const cachedSchema = nestedCachedSchemas.get(type)
    if (cachedSchema) return cachedSchema

    // Create Schema.data.
    const topNode = proseMirrorSchema.topNodeType.name

    const nodesMap = proseMirrorSchema.spec.nodes as OrderedMap<NodeSpec>
    const nodes: (string | NodeSpec)[] = []
    nodesMap.forEach((nodeName, nodeSpec) => {
        nodes.push(nodeName, pickNotNull(nodeSpec, nodeSpecKeys))
    })

    const marksMap = proseMirrorSchema.spec.marks as OrderedMap<MarkSpec>
    const marks: any[] = []
    marksMap.forEach((markName, markSpec) => {
        marks.push(markName, pickNotNull(markSpec, markSpecKeys))
    })

    // Create Schema.
    const data = { nodes, marks, topNode }
    const hash = createSchemaHash(type, data)
    const meta = null
    const schema = { hash, type, data, meta }

    // Ensure schema can be serialized.
    const serializedSchema = JSON.stringify(schema)
    const parsedSchema = JSON.parse(serializedSchema)
    assert(equal(schema, parsedSchema), 'The schema cannot be serialized.')

    // Cache the new Schema.
    nestedCachedSchemas.set(type, schema)
    return schema
}

function pickNotNull<O extends { [key: string]: any }, K extends keyof O>(
    object: O,
    keys: K[],
): Pick<O, K> {
    const result = {} as Pick<O, K>
    for (const key of keys) {
        if (object[key] != null) {
            result[key] = object[key]
        }
    }
    return result
}

/**
 * Creates a ProseMirror Schema from a SyncOT Schema.
 */
export function toProseMirrorSchema(schema: Schema): ProseMirrorSchema {
    // Prepare a schema spec.
    const { nodes: rawNodes, marks: rawMarks, topNode } = schema.data

    let nodes = OrderedMap.from<NodeSpec>()
    for (let i = 0; i < rawNodes.length; i += 2) {
        nodes = nodes.addToEnd(rawNodes[i], rawNodes[i + 1])
    }

    let marks = OrderedMap.from<MarkSpec>()
    for (let i = 0; i < rawMarks.length; i += 2) {
        marks = marks.addToEnd(rawMarks[i], rawMarks[i + 1])
    }

    // Create a schema.
    const proseMirrorSchema = new ProseMirrorSchema({
        nodes,
        marks,
        topNode,
    })

    // Validate the schema.
    throwError(validateProseMirrorSchema(proseMirrorSchema))

    return proseMirrorSchema
}

/**
 * Validates a ProseMirror schema.
 */
function validateProseMirrorSchema(
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
