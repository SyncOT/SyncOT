import { createSchemaHash, Schema } from '@syncot/content'
import { assert, equal } from '@syncot/util'
import OrderedMap from 'orderedmap'
import {
    MarkSpec,
    NodeSpec,
    Schema as ProseMirrorSchema,
} from 'prosemirror-model'

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

const nodeSpecKeys = ['content', 'marks', 'group', 'inline', 'attrs']
const markSpecKeys = ['attrs', 'excludes', 'group']
const cachedSchemas: WeakMap<
    ProseMirrorSchema,
    Map<string, Schema>
> = new WeakMap()

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
