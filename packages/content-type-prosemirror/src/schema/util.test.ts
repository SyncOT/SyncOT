import { equalShape } from '@syncot/content-type-prosemirror/src/schema/util'
import { Schema } from 'prosemirror-model'

const schema = new Schema({
    nodes: {
        doc: { content: 'inline*' },
        text: { group: 'inline', inline: true },
        leaf1: { group: 'inline', inline: true },
        leaf2: { group: 'inline', inline: true },
        branch1: { group: 'inline', inline: true, content: 'inline*' },
        branch2: { group: 'inline', inline: true, content: 'inline*' },
        blockLeaf1: { inline: false },
        blockLeaf2: { inline: false },
        blockBranch1: { inline: false, content: 'inline*' },
        blockBranch2: { inline: false, content: 'inline*' },
    },
    marks: {
        mark: {},
    },
})

describe('equalShape', () => {
    test.each([
        [
            'different nodeSize property',
            false,
            schema.text('ab'),
            schema.text('abc'),
        ],
        [
            'different isLeaf property',
            false,
            schema.node('leaf1'),
            schema.node('branch1'),
        ],
        [
            'different isText property',
            false,
            schema.text('a'),
            schema.node('leaf1'),
        ],
        [
            'different shape in a child node',
            false,
            schema.node(
                'doc',
                undefined,
                schema.node('branch1', undefined, schema.node('leaf1')),
            ),
            schema.node(
                'doc',
                undefined,
                schema.node('branch1', undefined, schema.text('a')),
            ),
        ],
        [
            'different amount of text in child nodes at the start',
            false,
            schema.node('doc', undefined, [
                schema.text('abc'),
                schema.text('defg', [schema.mark('mark')]),
            ]),
            schema.node('doc', undefined, [
                schema.text('abc'),
                schema.node('leaf1'),
                schema.text('efg', [schema.mark('mark')]),
            ]),
        ],
        [
            'different amount of text in child nodes at the end',
            false,
            schema.node('doc', undefined, [
                schema.node('leaf2'),
                schema.text('abc'),
                schema.text('defg', [schema.mark('mark')]),
            ]),
            schema.node('doc', undefined, [
                schema.node('leaf1'),
                schema.text('abcd'),
                schema.text('efg', [schema.mark('mark')]),
                schema.text('h'),
            ]),
        ],
        [
            'equal amount of text in child nodes',
            true,
            schema.node('doc', undefined, [
                schema.text('abc'),
                schema.text('defg', [schema.mark('mark')]),
                schema.node('leaf1'),
                schema.text('more', [schema.mark('mark')]),
                schema.text(' text'),
            ]),
            schema.node('doc', undefined, [
                schema.text('abcd', [schema.mark('mark')]),
                schema.text('efg'),
                schema.node('leaf2'),
                schema.text('more text'),
            ]),
        ],
        [
            'different text nodes',
            true,
            schema.text('abc'),
            schema.text('def', [schema.mark('mark')]),
        ],
        [
            'different inline leaf nodes',
            true,
            schema.node('leaf1'),
            schema.node('leaf2'),
        ],
        [
            'different block leaf nodes',
            true,
            schema.node('blockLeaf1'),
            schema.node('blockLeaf2'),
        ],
        [
            'different inline and block leaf nodes',
            true,
            schema.node('leaf1'),
            schema.node('blockLeaf2'),
        ],
        [
            'different branch nodes',
            true,
            schema.node('branch1', undefined, schema.text('abc')),
            schema.node('branch2', undefined, schema.text('def')),
        ],
        [
            'different block branch nodes',
            true,
            schema.node('blockBranch1', undefined, schema.text('abc')),
            schema.node('blockBranch2', undefined, schema.text('def')),
        ],
        [
            'different inline and block branch nodes',
            true,
            schema.node('branch1', undefined, schema.text('abc')),
            schema.node('blockBranch2', undefined, schema.text('def')),
        ],
    ])('%s (equal: %s)', (_, result, node1, node2) => {
        expect(equalShape(node1, node2)).toBe(result)
        expect(equalShape(node2, node1)).toBe(result)
    })
})
