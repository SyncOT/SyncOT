import { Schema } from '@syncot/content'
import { throwError } from '@syncot/util'
import OrderedMap from 'orderedmap'
import {
    ContentMatch,
    MarkSpec,
    NodeSpec,
    NodeType,
    Schema as ProseMirrorSchema,
} from 'prosemirror-model'

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
