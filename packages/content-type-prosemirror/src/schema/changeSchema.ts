import { assert } from '@syncot/util'
import {
    Fragment,
    Mark,
    MarkType,
    Node,
    NodeType,
    Schema,
} from 'prosemirror-model'
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
 * 5. All nodes and marks within a placeholder node are recursively converted to placeholders.
 * 6. If any content marks violate the new schema constraints,
 *    they are removed.
 * 7. Returns null, if thus processed content is not valid according to the new `schema`.
 * 8. Returns a new node with the specified `schema` and content from the specified `node`.
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
    const newNode = convertNode(node, validateSchema(schema), undefined)
    assert(
        newNode == null || equalShape(node, newNode),
        'changeSchema produced a node of a different shape.',
    )
    return newNode
}

function getPlaceholderName(
    type: NodeType,
    parent: NodeType | undefined,
): string {
    if (type.isLeaf) {
        if (parent) {
            if (parent.inlineContent) {
                return PLACEHOLDERS.inlineLeaf.name
            } else {
                return PLACEHOLDERS.blockLeaf.name
            }
        } else {
            if (type.isInline) {
                return PLACEHOLDERS.inlineLeaf.name
            } else {
                return PLACEHOLDERS.blockLeaf.name
            }
        }
    } else {
        if (parent) {
            if (parent.inlineContent) {
                return PLACEHOLDERS.inlineBranch.name
            } else {
                return PLACEHOLDERS.blockBranch.name
            }
        } else {
            if (type.isInline) {
                return PLACEHOLDERS.inlineBranch.name
            } else {
                return PLACEHOLDERS.blockBranch.name
            }
        }
    }
}

function forcePlaceholder(parent: NodeType | undefined): boolean {
    return (
        !!parent &&
        (parent.name === PLACEHOLDERS.blockBranch.name ||
            parent.name === PLACEHOLDERS.inlineBranch.name)
    )
}

function isPlaceholderNode(type: NodeType): boolean {
    switch (type.name) {
        case PLACEHOLDERS.blockBranch.name:
        case PLACEHOLDERS.blockLeaf.name:
        case PLACEHOLDERS.inlineBranch.name:
        case PLACEHOLDERS.inlineLeaf.name:
            return true
        default:
            return false
    }
}

function isPlaceholderMark(type: MarkType): boolean {
    return type.name === PLACEHOLDERS.mark.name
}

function convertNode(
    node: Node,
    schema: Schema,
    parent: NodeType | undefined,
): Node | null {
    const { attrs, content, isText, marks, text, type } = node
    const { name } = type

    // Convert a text node.
    if (isText) return schema.text(text!, convertMarks(marks, schema, parent))

    // Try to convert a placeholder to the original node.
    try {
        if (isPlaceholderNode(type) && !forcePlaceholder(parent)) {
            const newType = schema.nodes[attrs.name]
            if (
                newType.isLeaf === type.isLeaf &&
                newType.isText === type.isText
            ) {
                return newType.createChecked(
                    attrs.attrs,
                    convertContent(content, schema, newType),
                    convertMarks(marks, schema, parent),
                )
            }
        }
    } catch (_error) {
        // Do nothing.
    }

    // Try to keep the same node type.
    try {
        if (isPlaceholderNode(type) || !forcePlaceholder(parent)) {
            const newName = isPlaceholderNode(type)
                ? getPlaceholderName(type, parent)
                : name
            const newType = schema.nodes[newName]
            if (newType.isLeaf === type.isLeaf) {
                return newType.createChecked(
                    attrs,
                    convertContent(content, schema, newType),
                    convertMarks(marks, schema, parent),
                )
            }
        }
    } catch (_error) {
        // Do nothing.
    }

    // Try to replace the node with a placeholder.
    try {
        if (!isPlaceholderNode(type)) {
            const newName = getPlaceholderName(type, parent)
            const newType = schema.nodes[newName]
            return newType.createChecked(
                { name, attrs },
                convertContent(content, schema, newType),
                convertMarks(marks, schema, parent),
            )
        }
    } catch (_error) {
        // Do nothing.
    }

    return null
}

function convertContent(
    content: Fragment,
    schema: Schema,
    parent: NodeType | undefined,
): Node[] {
    const newContent = new Array(content.childCount)
    content.forEach((node, _offset, index) => {
        newContent[index] = convertNode(node, schema, parent)
    })
    return newContent
}

function convertMarks(
    marks: Mark[],
    schema: Schema,
    parent: NodeType | undefined,
): Mark[] {
    let newMarks = Mark.none
    for (const mark of marks) {
        const newMark = convertMark(mark, schema, parent)
        if (newMark) newMarks = newMark.addToSet(newMarks)
    }
    return newMarks
}

function allowMark(mark: MarkType, parent: NodeType | undefined): boolean {
    return !parent || parent.allowsMarkType(mark)
}

function convertMark(
    mark: Mark,
    schema: Schema,
    parent: NodeType | undefined,
): Mark | null {
    const { type, attrs } = mark
    const { name } = type
    const placeholderName = PLACEHOLDERS.mark.name

    // Try to convert a placeholder to the original mark.
    try {
        if (isPlaceholderMark(type) && !forcePlaceholder(parent)) {
            const newType = schema.marks[attrs.name]
            if (allowMark(newType, parent)) {
                return newType.create(attrs.attrs)
            }
        }
    } catch (_error) {
        // Do nothing.
    }

    // Try to keep the same mark type.
    try {
        if (isPlaceholderMark(type) || !forcePlaceholder(parent)) {
            const newType = schema.marks[name]
            if (allowMark(newType, parent)) {
                return newType.create(attrs)
            }
        }
    } catch (_error) {
        // Do nothing.
    }

    // Try to replace the mark with a placeholder.
    try {
        if (!isPlaceholderMark(type)) {
            const newType = schema.marks[placeholderName]
            if (allowMark(newType, parent)) {
                return newType.create({ name, attrs })
            }
        }
    } catch (_error) {
        // Do nothing.
    }

    return null
}
