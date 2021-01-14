import OrderedMap from 'orderedmap'
import { MarkSpec, NodeSpec, Schema } from 'prosemirror-model'
import { validateSchema } from './validateSchema'

/**
 * Creates a ProseMirror Schema from its JSON object representation.
 */
export function fromJSON(json: any): Schema {
    // Prepare a schema spec.
    const { nodes: rawNodes, marks: rawMarks, topNode } = json

    let nodes = OrderedMap.from<NodeSpec>()
    for (let i = 0; i < rawNodes.length; i += 2) {
        nodes = nodes.addToEnd(rawNodes[i], rawNodes[i + 1])
    }

    let marks = OrderedMap.from<MarkSpec>()
    for (let i = 0; i < rawMarks.length; i += 2) {
        marks = marks.addToEnd(rawMarks[i], rawMarks[i + 1])
    }

    // Create a schema.
    return validateSchema(
        new Schema({
            nodes,
            marks,
            topNode,
        }),
    )
}
