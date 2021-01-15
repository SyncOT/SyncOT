import { Node } from 'prosemirror-model'

/**
 * Determines if the specifed nodes have the same shape by
 * recursively checking if they have the same:
 * - childCount
 * - nodeSize
 * - isInline property
 * - isLeft property
 */
export function equalShape(node1: Node, node2: Node): boolean {
    if (node1.childCount !== node2.childCount) return false
    if (node1.nodeSize !== node2.nodeSize) return false
    if (node1.isInline !== node2.isInline) return false
    if (node1.isLeaf !== node2.isLeaf) return false
    for (let i = 0; i < node1.childCount; i++) {
        if (!equalShape(node1.content.child(i), node2.content.child(i)))
            return false
    }
    return true
}
