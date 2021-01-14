import { Fragment, Mark, Node, Schema } from 'prosemirror-model'
import { PlaceholderNames } from './placeholderNames'
import { validateSchema } from './validateSchema'

/**
 * Changes the schema of `node` to `schema` using the following algorithm.
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
 * 6. If thus processed content is not valid according to the new `schema`, an error is thrown.
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
 * - MUST define the `toDOM` and `parseDOM` properties as appropriate.
 * - MUST be allowed to appear in all the places where the nodes they may replace are allowed.
 *   Consider adding the node placeholders to the groups containing nodes they may replace and
 *   always using those group names in content expressions instead of the node names.
 * - MUST allow all content allowed by the nodes they may replace.
 *   Consider adding all nodes to groups called "block" and "inline" as appropriate and
 *   setting the placeholders' "content" to "block*" or "inline*" respectively.
 * - SHOULD allow all marks allowed by the nodes they may replace.
 *   Consider setting the placeholder's "marks" to "_" (allow all).
 * - SHOULD support "name", "attrs" and "marks" attributes,
 *   which the plugin will populate with the corresponding node data.
 * - SHOULD have the "atom" property set to true.
 *
 * The mark placeholder:
 * - MUST be called "placeholderMark".
 * - MUST define the `toDOM` and `parseDOM` properties as appropriate.
 * - SHOULD be valid in all nodes where the marks it replaces are valid.
 *   If you need to allow specific marks in some nodes,
 *   consider adding them to groups along with the placeholder mark and
 *   always specifying allowed marks using group names instead of mark names.
 * - SHOULD support "name" and "attrs" attributes,
 *   which the plugin will populate with the corresponding mark data.
 * - SHOULD have the "excludes" property set to an empty string (does not exclude any marks).
 *
 * @param node A node whose content should be migrated to the new schema.
 * @param schema The schema for the new node.
 * @returns A new node with the specified `schema` and content from the specified `node`.
 */
export function changeSchema<
    OldNodes extends string,
    OldMarks extends string,
    NewNodes extends string,
    NewMarks extends string
>(
    node: Node<Schema<OldNodes, OldMarks>>,
    schema: Schema<NewNodes, NewMarks>,
): Node<Schema<NewNodes, NewMarks>> {
    return convertNode(node, validateSchema(schema), null)
}

function convertNode(node: Node, schema: Schema, parent: Node | null): Node {
    // TODO handle placeholders
    const newType = schema.nodes[node.type.name]
    const newContent = convertFragment(node.content, schema, node)
    const newMarks = convertMarks(node.marks, schema, parent)
    const newNode = newType.createChecked(node.attrs, newContent, newMarks)
    return newNode
}

function convertFragment(
    fragment: Fragment,
    schema: Schema,
    parent: Node,
): Fragment {
    const newFragmentArray = new Array(fragment.childCount)
    fragment.forEach((node, _offset, index) => {
        newFragmentArray[index] = convertNode(node, schema, parent)
    })
    return Fragment.fromArray(newFragmentArray)
}

function convertMarks(
    marks: Mark[],
    schema: Schema,
    parent: Node | null,
): Mark[] {
    let newMarks = Mark.none
    for (const mark of marks) {
        const newMark = convertMark(mark, schema)
        if (newMark && (!parent || parent.type.allowsMarkType(newMark.type)))
            newMarks = newMark.addToSet(newMarks)
    }
    return newMarks
}

function convertMark(mark: Mark, schema: Schema): Mark | null {
    try {
        if (mark.type.name === PlaceholderNames.mark) {
            return schema.marks[mark.attrs.name].create(mark.attrs.attrs)
        }
    } catch (_error) {
        // Do nothing.
    }
    try {
        return schema.marks[mark.type.name].create(mark.attrs)
    } catch (_error) {
        // Do nothing.
    }
    try {
        if (mark.type.name !== PlaceholderNames.mark) {
            return schema.marks[PlaceholderNames.mark].create({
                name: mark.type.name,
                attrs: mark.attrs,
            })
        }
    } catch (_error) {
        // Do nothing.
    }
    return null
}
