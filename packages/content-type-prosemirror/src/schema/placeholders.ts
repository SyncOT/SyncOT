import { MarkSpec, NodeSpec } from 'prosemirror-model'

interface PlaceholderNode {
    readonly name: string
    readonly spec: NodeSpec
}

interface PlaceholderMark {
    readonly name: string
    readonly spec: MarkSpec
}

const empty = Object.freeze({})
const attrs = Object.freeze({
    name: empty,
    attrs: empty,
})

/**
 * The placeholder names and base specs for use in ProseMirror Schema.
 *
 * The specs can be extended as needed, for example by adding `toDOM`, `parseDOM`, `atom=true`, etc,
 * however, the existing properties must not be changed.
 *
 * The placeholders should be allowed in all places where the nodes and marks that they
 * can replace are allowed. This is easiest to achieve by keeping those nodes/marks and placeholders
 * in the same groups, and always using the group names instead of the node/mark names
 * in `content` and `mark` expressions in ProseMirror Schema specs.
 */
export const PLACEHOLDERS = Object.freeze({
    /**
     * A block node with content.
     */
    blockBranch: Object.freeze<PlaceholderNode>({
        name: 'placeholderBlockBranch',
        spec: Object.freeze({
            attrs,
            inline: false,
            content:
                '(placeholderInlineBranch | placeholderInlineLeaf | text)*',
            marks: '_',
        }),
    }),
    /**
     * A block node without content.
     */
    blockLeaf: Object.freeze<PlaceholderNode>({
        name: 'placeholderBlockLeaf',
        spec: Object.freeze({
            attrs,
            inline: false,
            content: '',
            marks: '_',
        }),
    }),
    /**
     * An inline node with content.
     */
    inlineBranch: Object.freeze<PlaceholderNode>({
        name: 'placeholderInlineBranch',
        spec: Object.freeze({
            attrs,
            inline: true,
            content:
                '(placeholderInlineBranch | placeholderInlineLeaf | text)*',
            marks: '_',
        }),
    }),
    /**
     * An inline node without content.
     */
    inlineLeaf: Object.freeze<PlaceholderNode>({
        name: 'placeholderInlineLeaf',
        spec: Object.freeze({
            attrs,
            inline: true,
            content: '',
            marks: '_',
        }),
    }),
    /**
     * A mark.
     */
    mark: Object.freeze<PlaceholderMark>({
        name: 'placeholderMark',
        spec: {
            attrs,
            excludes: '',
        },
    }),
})
