import { equalShape } from '@syncot/content-type-prosemirror/src/schema/util'
import { Schema } from 'prosemirror-model'

const schema = new Schema({
    nodes: {
        doc: { content: 'block+' },
        text: { group: 'inline', inline: true },
        image: { group: 'inline', inline: true },
        // `ins` and `del` are declared this way only for testing.
        ins: { group: 'inline', inline: true, content: 'inline*' },
        del: { group: 'inline', inline: true, content: 'inline*' },
        hr: { group: 'block' },
        video: { group: 'block' },
        heading: { group: 'block', content: 'text*' },
        paragraph: { group: 'block', content: 'inline*' },
        section: { group: 'block', content: 'block+' },
    },
    marks: {
        strong: {},
    },
})

describe('equalShape', () => {
    describe('false', () => {
        test('different isInline', () => {
            expect(equalShape(schema.text('a'), schema.node('hr'))).toBe(false)
        })
        test('different isLeaf', () => {
            expect(equalShape(schema.text('ab'), schema.node('ins'))).toBe(
                false,
            )
        })
        test('different nodeSize', () => {
            expect(equalShape(schema.text('ab'), schema.text('abc'))).toBe(
                false,
            )
        })
        test('different childCount', () => {
            expect(
                equalShape(
                    schema.node('paragraph', undefined, schema.text('ab')),
                    schema.node('paragraph', undefined, [
                        schema.text('a'),
                        schema.text('b', [schema.mark('strong')]),
                    ]),
                ),
            ).toBe(false)
        })
        test('different shape in a child node', () => {
            expect(
                equalShape(
                    schema.node(
                        'doc',
                        undefined,
                        schema.node('paragraph', undefined, schema.text('ab')),
                    ),
                    schema.node(
                        'doc',
                        undefined,
                        schema.node('paragraph', undefined, [
                            schema.text('a'),
                            schema.text('b', [schema.mark('strong')]),
                        ]),
                    ),
                ),
            ).toBe(false)
        })
    })

    describe('true', () => {
        test('different inline leaf nodes', () => {
            expect(equalShape(schema.text('a'), schema.node('image'))).toBe(
                true,
            )
        })
        test('different inline branch nodes', () => {
            expect(
                equalShape(
                    schema.node('ins', undefined, [schema.text('abc')]),
                    schema.node('del', undefined, [schema.text('abc')]),
                ),
            ).toBe(true)
        })
        test('different block leaf nodes', () => {
            expect(equalShape(schema.node('hr'), schema.node('video'))).toBe(
                true,
            )
        })
        test('different block branch nodes', () => {
            expect(
                equalShape(
                    schema.node('paragraph', undefined, [schema.text('abc')]),
                    schema.node('heading', undefined, [schema.text('abc')]),
                ),
            ).toBe(true)
        })
    })
})
