/**
 * The names of the placeholder node and mark types which should be defined in a ProseMirror Schema.
 * They are used by `changeSchema` to represent content which is not valid in a new schema.
 */
export enum PlaceholderNames {
    /**
     * A block node with content.
     */
    blockBranch = 'placeholderBlockBranch',
    /**
     * A block node without content.
     */
    blockLeaf = 'placeholderBlockLeaf',
    /**
     * An inline node with content.
     */
    inlineBranch = 'placeholderInlineBranch',
    /**
     * An inline node without content.
     */
    inlineLeaf = 'placeholderInlineLeaf',
    /**
     * A mark.
     */
    mark = 'placeholderMark',
}
