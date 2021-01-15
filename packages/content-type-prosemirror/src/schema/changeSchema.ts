import { assert } from '@syncot/util'
import { Fragment, Mark, Node, NodeType, Schema } from 'prosemirror-model'
import { equalShape } from './util'
import { PlaceholderNames } from './placeholderNames'
import { validateSchema } from './validateSchema'

/**
 * Changes the schema of `node` to `schema`. It guarantees to keep the "shape" of the content,
 * meaning that all nodes from `node` are represented in the output with the original nodeSize,
 * isLeaf and isInline/isBlock properties.
 *
 * It uses the following algorithm:
 *
 * 1. If new node or mark attributes with default values are added to the `schema` relative to `node.type.schema`,
 *    those attributes are added with the default values to the appropriate content nodes and marks.
 * 2. If existing node or mark attributes are removed from the `schema` relative to `node.type.schema`,
 *    those attributes are removed from the appropriate content nodes and marks.
 * 3. If the `node` contains node or mark placeholders (see below) AND
 *    the new `schema` contains the declarations for the nodes or marks they replaced, THEN
 *    those nodes or marks are restored and the placeholders are removed.
 * 4. If the new `schema` contains node and mark placeholders (see below) AND
 *    node or mark attributes required by the new schema are missing in `node` OR
 *    node or mark declarations are missing in the new schema but exist in the `node.type.schema`, THEN
 *    the appropriate nodes and marks are replaced with the placeholders.
 * 5. If any content marks violate the new schema constraints,
 *    they are removed.
 * 6. Returns null, if thus processed content is not valid according to the new `schema`.
 * 7. Returns a new node with the specified `schema` and content from the specified `node`.
 *
 * The node and mark placeholders mentioned above make it possible to remove node and mark
 * schema declarations while preserving all information in the content and maintaining backwards compatibility.
 * Additionally, if the previously removed schema declarations are restored, the previous content is also restored.
 * Up to 4 node placeholders and 1 mark placeholder can be declared in `schema`.
 *
 * The node placeholders:
 * - MUST have one of the following names:
 *   - "placeholderBlockBranch" - a block node with content
 *   - "placeholderBlockLeaf" - a block node without content
 *   - "placeholderInlineBranch" - an inline node with content
 *   - "placeholderInlineLeft" - an inline node without content
 * - MUST support "name" and "attrs" attributes,
 *   which the plugin will populate with the corresponding node data.
 * - MUST define the `toDOM` and `parseDOM` properties as appropriate.
 * - MUST be allowed to appear in all the places where the nodes they may replace are allowed.
 *   Consider adding the node placeholders to the groups containing nodes they may replace and
 *   always using those group names in content expressions instead of the node names.
 * - MUST allow all content allowed by the nodes they may replace.
 *   Consider adding all nodes to groups called "block" and "inline" as appropriate and
 *   setting the placeholders' "content" to "block*" or "inline*" respectively.
 * - SHOULD allow all marks allowed by the nodes they may replace.
 *   Consider setting the placeholder's "marks" to "_" (allow all).
 * - SHOULD have the "atom" property set to true.
 *
 * The mark placeholder:
 * - MUST be called "placeholderMark".
 * - MUST support "name" and "attrs" attributes,
 *   which the plugin will populate with the corresponding mark data.
 * - MUST define the `toDOM` and `parseDOM` properties as appropriate.
 * - SHOULD be valid in all nodes where the marks it replaces are valid.
 *   If you need to allow specific marks in some nodes,
 *   consider adding them to groups along with the placeholder mark and
 *   always specifying allowed marks using group names instead of mark names.
 * - SHOULD have the "excludes" property set to an empty string (does not exclude any marks).
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

function getPlaceholderName(type: NodeType): PlaceholderNames {
    if (type.isInline) {
        return type.isLeaf
            ? PlaceholderNames.inlineLeaf
            : PlaceholderNames.inlineBranch
    } else {
        return type.isLeaf
            ? PlaceholderNames.blockLeaf
            : PlaceholderNames.blockBranch
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

    // Try to convert a placeholder to the original node.
    try {
        if (name === placeholderName) {
            const type = schema.nodes[attrs.name]
            if (getPlaceholderName(type) === placeholderName) {
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
        if (name === PlaceholderNames.mark) {
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
        if (name !== PlaceholderNames.mark) {
            const type = schema.marks[PlaceholderNames.mark]
            return type.create({ name, attrs })
        }
    } catch (_error) {
        // Do nothing.
    }

    return null
}
