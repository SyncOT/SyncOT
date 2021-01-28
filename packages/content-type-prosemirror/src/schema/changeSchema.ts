import { assert } from '@syncot/util'
import { Fragment, Mark, Node, NodeType, Schema } from 'prosemirror-model'
import { equalShape } from './util'
import { PLACEHOLDERS } from './placeholders'
import { validateSchema } from './validateSchema'

/**
 * Recursively changes the schema of `node` to `schema`. It guarantees to keep the "shape" of the content,
 * meaning that all nodes from `node` are represented in the output with the original nodeSize,
 * isLeaf and isInline/isBlock properties.
 *
 * It uses placeholders, if defined in `schema`, in order to convert nodes and marks to appropriate placeholders,
 * if they cannot keep their original names due to schema incompatibilities. It makes it possible to remove node and
 * mark schema declarations while preserving all information in the content and maintaining backwards compatibility.
 * Additionally, if the previously removed schema declarations are restored, the previous content is also restored.
 *
 * It uses the following algorithm:
 *
 * 1. If new node or mark attributes with default values are added to the `schema` relative to `node.type.schema`,
 *    those attributes are added with the default values to the appropriate content nodes and marks.
 * 2. If existing node or mark attributes are removed from the `schema` relative to `node.type.schema`,
 *    those attributes are removed from the appropriate content nodes and marks.
 * 3. If some nodes and marks represented by placeholders are valid in the `schema`,
 *    the placeholders are replaced by the nodes and marks they represent.
 * 4. If compatible node and mark declarations exist in `schema`,
 *    the nodes and marks are converted to the corresponding nodes and marks from `schema`.
 * 4. If some nodes and marks are not valid in `schema`,
 *    they are replaced by appropriate node and mark placeholders.
 * 5. If any content marks violate the new schema constraints,
 *    they are removed.
 * 6. Returns null, if thus processed content is not valid according to the new `schema`.
 * 7. Returns a new node with the specified `schema` and content from the specified `node`.
 *
 * @param node A node whose content should be migrated to the new schema.
 * @param schema The schema for the new node.
 * @returns A new node with the specified `schema` and content from the specified `node`,
 *   or null, if the `node` is not compatible with `schema`.
 */
export function changeSchema<
    OldNodes extends string,
    OldMarks extends string,
    NewNodes extends string,
    NewMarks extends string
>(
    node: Node<Schema<OldNodes, OldMarks>>,
    schema: Schema<NewNodes, NewMarks>,
): Node<Schema<NewNodes, NewMarks>> | null {
    const newNode = convertNode(node, validateSchema(schema))
    assert(
        newNode == null || equalShape(node, newNode),
        'changeSchema produced a node of a different shape.',
    )
    return newNode
}

function getPlaceholderName(type: NodeType): string {
    if (type.isInline) {
        return type.isLeaf
            ? PLACEHOLDERS.inlineLeaf.name
            : PLACEHOLDERS.inlineBranch.name
    } else {
        return type.isLeaf
            ? PLACEHOLDERS.blockLeaf.name
            : PLACEHOLDERS.blockBranch.name
    }
}

function convertNode(node: Node, schema: Schema): Node | null {
    const {
        type: { name },
        attrs,
    } = node
    const placeholderName = getPlaceholderName(node.type)
    const newContent = convertContent(node.content, schema)
    const newMarks = convertMarks(node.marks, schema)

    // Convert a text node.
    if (node.isText) {
        return schema.text(node.text!, newMarks)
    }

    // Try to convert a placeholder to the original node.
    try {
        if (name === placeholderName) {
            const type = schema.nodes[attrs.name]
            if (getPlaceholderName(type) === placeholderName && !type.isText) {
                return type.createChecked(
                    attrs.attrs,
                    fixContentMarks(newContent, type),
                    newMarks,
                )
            }
        }
    } catch (_error) {
        // Do nothing.
    }

    // Try to keep the same node type.
    try {
        const type = schema.nodes[name]
        if (getPlaceholderName(type) === placeholderName) {
            return type.createChecked(
                attrs,
                fixContentMarks(newContent, type),
                newMarks,
            )
        }
    } catch (_error) {
        // Do nothing.
    }

    // Try to replace the node with a placeholder.
    try {
        if (name !== placeholderName) {
            const type = schema.nodes[placeholderName]
            return type.createChecked(
                { name, attrs },
                fixContentMarks(newContent, type),
                newMarks,
            )
        }
    } catch (_error) {
        // Do nothing.
    }

    return null
}

function convertContent(content: Fragment, schema: Schema): Node[] {
    const newContent = new Array(content.childCount)
    content.forEach((node, _offset, index) => {
        newContent[index] = convertNode(node, schema)
    })
    return newContent
}

function fixContentMarks(content: Node[], parentType: NodeType): Node[] {
    return content.map((node) => node.mark(parentType.allowedMarks(node.marks)))
}

function convertMarks(marks: Mark[], schema: Schema): Mark[] {
    let newMarks = Mark.none
    for (const mark of marks) {
        const newMark = convertMark(mark, schema)
        if (newMark) newMarks = newMark.addToSet(newMarks)
    }
    return newMarks
}

function convertMark(mark: Mark, schema: Schema): Mark | null {
    const {
        type: { name },
        attrs,
    } = mark

    // Try to convert a placeholder to the original mark.
    try {
        if (name === PLACEHOLDERS.mark.name) {
            const type = schema.marks[attrs.name]
            return type.create(attrs.attrs)
        }
    } catch (_error) {
        // Do nothing.
    }

    // Try to keep the same mark type.
    try {
        const type = schema.marks[name]
        return type.create(attrs)
    } catch (_error) {
        // Do nothing.
    }

    // Try to replace the mark with a placeholder.
    try {
        if (name !== PLACEHOLDERS.mark.name) {
            const type = schema.marks[PLACEHOLDERS.mark.name]
            return type.create({ name, attrs })
        }
    } catch (_error) {
        // Do nothing.
    }

    return null
}
