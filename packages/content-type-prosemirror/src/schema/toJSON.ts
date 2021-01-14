import OrderedMap from 'orderedmap'
import { MarkSpec, NodeSpec, Schema } from 'prosemirror-model'
import { validateSchema } from './validateSchema'

/**
 * Gets a JSON object representation of the specified ProseMirror Schema.
 */
export function toJSON(schema: Schema): any {
    validateSchema(schema)
    const topNode = schema.spec.topNode

    const nodesMap = schema.spec.nodes as OrderedMap<NodeSpec>
    const nodes: (string | NodeSpec)[] = []
    nodesMap.forEach((nodeName, nodeSpec) => {
        nodes.push(nodeName, prepareNodeSpec(nodeSpec))
    })

    const marksMap = schema.spec.marks as OrderedMap<MarkSpec>
    const marks: any[] = []
    marksMap.forEach((markName, markSpec) => {
        marks.push(markName, prepareMarkSpec(markSpec))
    })

    return { nodes, marks, topNode }
}

function prepareNodeSpec(
    spec: NodeSpec,
): Pick<NodeSpec, 'attrs' | 'content' | 'group' | 'inline' | 'marks'> {
    const newSpec = Object.create(null)
    if (typeof spec.attrs === 'object' && spec.attrs) newSpec.attrs = spec.attrs
    if (typeof spec.content === 'string') newSpec.content = spec.content
    if (typeof spec.group === 'string') newSpec.group = spec.group
    if (typeof spec.inline === 'boolean') newSpec.inline = spec.inline
    if (typeof spec.marks === 'string') newSpec.marks = spec.marks
    return newSpec
}

function prepareMarkSpec(
    spec: MarkSpec,
): Pick<MarkSpec, 'attrs' | 'excludes' | 'group'> {
    const newSpec = Object.create(null)
    if (typeof spec.attrs === 'object' && spec.attrs) newSpec.attrs = spec.attrs
    if (typeof spec.excludes === 'string') newSpec.excludes = spec.excludes
    if (typeof spec.group === 'string') newSpec.group = spec.group
    return newSpec
}
