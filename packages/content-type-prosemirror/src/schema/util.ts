import { Node } from 'prosemirror-model'

/**
 * Determines if the specifed nodes have the same shape by
 * recursively checking if they have the same:
 * - nodeSize property
 * - isLeaf property
 * - isText property
 * Consecutive text nodes are coalesced.
 */
export function equalShape(node1: Node, node2: Node): boolean {
    if (node1.isLeaf !== node2.isLeaf) return false
    if (node1.isText !== node2.isText) return false
    if (node1.nodeSize !== node2.nodeSize) return false
    let index1 = 0
    let index2 = 0
    while (index1 < node1.childCount && index2 < node2.childCount) {
        // Get the total lenght of consecutive text nodes in node1.
        let textLength1 = 0
        while (
            index1 < node1.childCount &&
            node1.content.child(index1).isText
        ) {
            textLength1 += node1.content.child(index1).nodeSize
            index1++
        }

        // Get the total lenght of consecutive text nodes in node2.
        let textLength2 = 0
        while (
            index2 < node2.childCount &&
            node2.content.child(index2).isText
        ) {
            textLength2 += node2.content.child(index2).nodeSize
            index2++
        }

        // Check that node1 and node2 contain the same amount of text.
        if (textLength1 !== textLength2) return false

        // If no text was found, compare the shapes recursively.
        if (textLength1 === 0) {
            if (
                !equalShape(
                    node1.content.child(index1),
                    node2.content.child(index2),
                )
            )
                return false
            index1++
            index2++
        }
    }
    return index1 === node1.childCount && index2 === node2.childCount
}
