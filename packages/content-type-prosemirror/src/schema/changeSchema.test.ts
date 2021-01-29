import { Schema } from 'prosemirror-model'
import { changeSchema, PLACEHOLDERS } from '..'

test('validates the schema', () => {
    const schema = new Schema({
        nodes: {
            doc: {},
            text: {},
        },
    })
    const node = schema.text('test')
    const newSchema = new Schema({
        nodes: {
            doc: { attrs: { a: { default: undefined } } },
            text: {},
        },
    })
    expect(() => changeSchema(node, newSchema)).toThrow(
        expect.objectContaining({
            name: 'SyncOTError InvalidEntity',
            message: `Invalid "ProseMirrorSchema.spec.nodes.doc.attrs.a.default".`,
            entityName: 'ProseMirrorSchema',
            entity: { spec: newSchema.spec },
            key: 'spec.nodes.doc.attrs.a.default',
        }),
    )
})

test('works recursively', () => {
    const schema = new Schema({
        nodes: {
            doc: { content: 'p+' },
            text: {},
            p: {
                content: 'text*',
                marks: 'm n',
                attrs: { a: { default: 1 }, b: { default: 2 } },
            },
        },
        marks: {
            m: {},
            n: {
                attrs: {
                    c: { default: 3 },
                    d: { default: 4 },
                },
            },
        },
    })
    const node = schema.node('doc', undefined, [
        schema.node('p', undefined, [
            schema.text('Hello'),
            schema.text('World', [schema.mark('m')]),
        ]),
        schema.node('p', { a: 100, b: 200 }, [
            schema.text('one'),
            schema.text('two', [schema.mark('n', { d: 400 })]),
        ]),
    ])
    const newSchema = new Schema({
        nodes: {
            doc: { content: 'p+' },
            text: {},
            p: {
                content: 'text*',
                marks: 'm n',
                attrs: { a: { default: 1 }, b: { default: 2 } },
            },
        },
        marks: {
            m: {},
            n: {
                attrs: {
                    c: { default: 3 },
                    d: { default: 4 },
                },
            },
        },
    })
    const newNode = changeSchema(node, newSchema)!
    expect(newNode).not.toBeNull()
    newNode.check()
    expect(newNode.type.schema).toBe(newSchema)
    expect(newNode.toJSON()).toEqual({
        type: 'doc',
        content: [
            {
                type: 'p',
                attrs: {
                    a: 1,
                    b: 2,
                },
                content: [
                    {
                        type: 'text',
                        text: 'Hello',
                    },
                    {
                        type: 'text',
                        text: 'World',
                        marks: [
                            {
                                type: 'm',
                            },
                        ],
                    },
                ],
            },
            {
                type: 'p',
                attrs: {
                    a: 100,
                    b: 200,
                },
                content: [
                    {
                        type: 'text',
                        text: 'one',
                    },
                    {
                        type: 'text',
                        text: 'two',
                        marks: [
                            {
                                type: 'n',
                                attrs: {
                                    c: 3,
                                    d: 400,
                                },
                            },
                        ],
                    },
                ],
            },
        ],
    })
})

describe('convertNode', () => {
    describe('text', () => {
        test('without marks', () => {
            const schema = new Schema({
                nodes: { doc: {}, text: {} },
            })
            const node = schema.text('TEST')
            const newSchema = new Schema({
                nodes: { doc: {}, text: {} },
            })
            const newNode = changeSchema(node, newSchema)!
            expect(newNode).not.toBeNull()
            newNode.check()
            expect(newNode.type.schema).toBe(newSchema)
            expect(newNode.toJSON()).toEqual({
                type: 'text',
                text: 'TEST',
            })
        })
        test('with marks', () => {
            const schema = new Schema({
                nodes: { doc: {}, text: {} },
                marks: { a: {}, b: {} },
            })
            const node = schema.text('TEST', [
                schema.mark('a'),
                schema.mark('b'),
            ])
            const newSchema = new Schema({
                nodes: { doc: {}, text: {} },
                marks: { a: {}, b: {} },
            })
            const newNode = changeSchema(node, newSchema)!
            expect(newNode).not.toBeNull()
            newNode.check()
            expect(newNode.type.schema).toBe(newSchema)
            expect(newNode.toJSON()).toEqual({
                type: 'text',
                text: 'TEST',
                marks: [{ type: 'a' }, { type: 'b' }],
            })
        })
    })

    describe('the same name', () => {
        test('succeed on the same isInline and isLeaf', () => {
            const schema = new Schema({
                nodes: {
                    doc: {},
                    text: {},
                    p: {
                        attrs: { a: {}, b: {} },
                        content: 'text*',
                        marks: 'a b',
                    },
                },
                marks: {
                    a: {},
                    b: {},
                    c: {},
                },
            })
            const node = schema.node(
                'p',
                { a: 1, b: 2 },
                schema.text('TEST', [schema.mark('a'), schema.mark('b')]),
                [schema.mark('c')],
            )
            const newSchema = new Schema({
                nodes: {
                    doc: {},
                    text: {},
                    p: {
                        attrs: { b: {}, c: { default: 3 } },
                        content: 'text*',
                        marks: 'b',
                    },
                },
                marks: {
                    a: {},
                    b: {},
                    c: {},
                },
            })
            const newNode = changeSchema(node, newSchema)!
            expect(newNode).not.toBeNull()
            newNode.check()
            expect(newNode.type.schema).toBe(newSchema)
            expect(newNode.toJSON()).toEqual({
                type: 'p',
                attrs: {
                    b: 2,
                    c: 3,
                },
                content: [
                    {
                        type: 'text',
                        text: 'TEST',
                        marks: [{ type: 'b' }],
                    },
                ],
                marks: [{ type: 'c' }],
            })
        })
        test('the same isInline and different isLeaf', () => {
            const schema = new Schema({
                nodes: {
                    doc: {},
                    text: {},
                    p: { content: 'text*' },
                },
            })
            const node = schema.node('p', undefined, schema.text('TEST'))
            const newSchema = new Schema({
                nodes: {
                    doc: {},
                    text: {},
                    p: {},
                },
            })
            const newNode = changeSchema(node, newSchema)!
            expect(newNode).toBeNull()
        })
        test('the same isLeaf and different isInline (top level node)', () => {
            const schema = new Schema({
                nodes: {
                    doc: {},
                    text: {},
                    p: { content: 'text*' },
                },
            })
            const node = schema.node('p', undefined, schema.text('TEST'))
            const newSchema = new Schema({
                nodes: {
                    doc: {},
                    text: {},
                    p: { content: 'text*', inline: true },
                },
            })
            const newNode = changeSchema(node, newSchema)!
            expect(newNode).not.toBeNull()
            newNode.check()
            expect(newNode.type.schema).toBe(newSchema)
            expect(newNode.toJSON()).toEqual({
                type: 'p',
                content: [
                    {
                        type: 'text',
                        text: 'TEST',
                    },
                ],
            })
        })
        test('the same isLeaf and different isInline (nested node)', () => {
            const schema = new Schema({
                nodes: {
                    doc: { content: 'p*' },
                    text: {},
                    p: { content: 'text*' },
                },
            })
            const node = schema.node(
                'doc',
                undefined,
                schema.node('p', undefined, schema.text('TEST')),
            )
            const newSchema = new Schema({
                nodes: {
                    doc: { content: 'p*' },
                    text: {},
                    p: { content: 'text*', inline: true },
                },
            })
            const newNode = changeSchema(node, newSchema)!
            expect(newNode).not.toBeNull()
            newNode.check()
            expect(newNode.type.schema).toBe(newSchema)
            expect(newNode.toJSON()).toEqual({
                type: 'doc',
                content: [
                    {
                        type: 'p',
                        content: [
                            {
                                type: 'text',
                                text: 'TEST',
                            },
                        ],
                    },
                ],
            })
        })
    })

    describe('update existing placeholder', () => {
        test.each([
            PLACEHOLDERS.blockLeaf.name,
            PLACEHOLDERS.blockBranch.name,
            PLACEHOLDERS.inlineLeaf.name,
            PLACEHOLDERS.inlineBranch.name,
        ])('top level %s to itself', (name) => {
            const schema = new Schema({
                nodes: {
                    doc: {},
                    text: {},
                    [PLACEHOLDERS.blockLeaf.name]: PLACEHOLDERS.blockLeaf.spec,
                    [PLACEHOLDERS.blockBranch.name]:
                        PLACEHOLDERS.blockBranch.spec,
                    [PLACEHOLDERS.inlineLeaf.name]:
                        PLACEHOLDERS.inlineLeaf.spec,
                    [PLACEHOLDERS.inlineBranch.name]:
                        PLACEHOLDERS.inlineBranch.spec,
                },
                marks: {
                    [PLACEHOLDERS.mark.name]: PLACEHOLDERS.mark.spec,
                },
            })
            const node = schema.node(name, {
                name: 'n',
                attrs: { a: 1 },
            })
            const newSchema = new Schema({
                nodes: {
                    doc: {},
                    text: {},
                    [PLACEHOLDERS.blockLeaf.name]: PLACEHOLDERS.blockLeaf.spec,
                    [PLACEHOLDERS.blockBranch.name]:
                        PLACEHOLDERS.blockBranch.spec,
                    [PLACEHOLDERS.inlineLeaf.name]:
                        PLACEHOLDERS.inlineLeaf.spec,
                    [PLACEHOLDERS.inlineBranch.name]:
                        PLACEHOLDERS.inlineBranch.spec,
                },
                marks: {
                    [PLACEHOLDERS.mark.name]: PLACEHOLDERS.mark.spec,
                },
            })
            const newNode = changeSchema(node, newSchema)!
            expect(newNode).not.toBeNull()
            expect(newNode.type.schema).toBe(newSchema)
            expect(newNode.toJSON()).toEqual({
                type: name,
                attrs: {
                    name: 'n',
                    attrs: { a: 1 },
                },
            })
        })

        test.each([
            [PLACEHOLDERS.blockLeaf.name, PLACEHOLDERS.inlineLeaf.name],
            [PLACEHOLDERS.inlineLeaf.name, PLACEHOLDERS.blockLeaf.name],
            [PLACEHOLDERS.blockBranch.name, PLACEHOLDERS.inlineBranch.name],
            [PLACEHOLDERS.inlineBranch.name, PLACEHOLDERS.blockBranch.name],
        ])('nested %s to %s', (from, to) => {
            const schema = new Schema({
                nodes: {
                    doc: { content: `${from}*` },
                    text: {},
                    [PLACEHOLDERS.blockLeaf.name]: PLACEHOLDERS.blockLeaf.spec,
                    [PLACEHOLDERS.blockBranch.name]:
                        PLACEHOLDERS.blockBranch.spec,
                    [PLACEHOLDERS.inlineLeaf.name]:
                        PLACEHOLDERS.inlineLeaf.spec,
                    [PLACEHOLDERS.inlineBranch.name]:
                        PLACEHOLDERS.inlineBranch.spec,
                },
                marks: {
                    [PLACEHOLDERS.mark.name]: PLACEHOLDERS.mark.spec,
                },
            })
            const node = schema.node(
                'doc',
                undefined,
                schema.node(from, {
                    name: 'n',
                    attrs: { a: 1 },
                }),
            )
            const newSchema = new Schema({
                nodes: {
                    doc: { content: `${to}*` },
                    text: {},
                    [PLACEHOLDERS.blockLeaf.name]: PLACEHOLDERS.blockLeaf.spec,
                    [PLACEHOLDERS.blockBranch.name]:
                        PLACEHOLDERS.blockBranch.spec,
                    [PLACEHOLDERS.inlineLeaf.name]:
                        PLACEHOLDERS.inlineLeaf.spec,
                    [PLACEHOLDERS.inlineBranch.name]:
                        PLACEHOLDERS.inlineBranch.spec,
                },
                marks: {
                    [PLACEHOLDERS.mark.name]: PLACEHOLDERS.mark.spec,
                },
            })
            const newNode = changeSchema(node, newSchema)!
            expect(newNode).not.toBeNull()
            expect(newNode.type.schema).toBe(newSchema)
            expect(newNode.toJSON()).toEqual({
                type: 'doc',
                content: [
                    {
                        type: to,
                        attrs: {
                            name: 'n',
                            attrs: { a: 1 },
                        },
                    },
                ],
            })
        })
    })

    describe('replace a placeholder with a normal node', () => {
        test('do not replace a placeholder containing a text node', () => {
            const schema = new Schema({
                nodes: {
                    doc: {},
                    text: {},
                    [PLACEHOLDERS.inlineLeaf.name]: {
                        inline: true,
                        attrs: {
                            name: {},
                            attrs: {},
                        },
                    },
                },
            })
            const node = schema.node(PLACEHOLDERS.inlineLeaf.name, {
                name: 'text',
                attrs: {},
            })
            const newSchema = new Schema({
                nodes: {
                    doc: {},
                    text: {},
                },
            })
            const newNode = changeSchema(node, newSchema)!
            expect(newNode).toBeNull()
        })

        test('replace if isInline is different (top level node)', () => {
            const schema = new Schema({
                nodes: {
                    doc: {},
                    text: {},
                    [PLACEHOLDERS.inlineLeaf.name]: {
                        inline: true,
                        attrs: {
                            name: {},
                            attrs: {},
                        },
                    },
                },
            })
            const node = schema.node(PLACEHOLDERS.inlineLeaf.name, {
                name: 'replaced',
                attrs: {},
            })
            const newSchema = new Schema({
                nodes: {
                    doc: {},
                    text: {},
                    replaced: {
                        inline: false,
                    },
                },
            })
            const newNode = changeSchema(node, newSchema)!
            expect(newNode).not.toBeNull()
            newNode.check()
            expect(newNode.type.schema).toBe(newSchema)
            expect(newNode.toJSON()).toEqual({
                type: 'replaced',
            })
        })

        test('replace if isInline is different (nested node)', () => {
            const schema = new Schema({
                nodes: {
                    doc: { content: 'content*' },
                    text: {},
                    [PLACEHOLDERS.inlineLeaf.name]: {
                        group: 'content',
                        inline: true,
                        attrs: {
                            name: {},
                            attrs: {},
                        },
                    },
                },
            })
            const node = schema.node(
                'doc',
                undefined,
                schema.node(PLACEHOLDERS.inlineLeaf.name, {
                    name: 'replaced',
                    attrs: {},
                }),
            )
            const newSchema = new Schema({
                nodes: {
                    doc: { content: 'content*' },
                    text: {},
                    replaced: {
                        group: 'content',
                        inline: false,
                    },
                },
            })
            const newNode = changeSchema(node, newSchema)!
            expect(newNode).not.toBeNull()
            newNode.check()
            expect(newNode.type.schema).toBe(newSchema)
            expect(newNode.toJSON()).toEqual({
                type: 'doc',
                content: [
                    {
                        type: 'replaced',
                    },
                ],
            })
        })

        test('do not replace if isLeaf is different', () => {
            const schema = new Schema({
                nodes: {
                    doc: {},
                    text: {},
                    [PLACEHOLDERS.inlineLeaf.name]: {
                        inline: true,
                        attrs: {
                            name: {},
                            attrs: {},
                        },
                    },
                },
            })
            const node = schema.node(PLACEHOLDERS.inlineLeaf.name, {
                name: 'replaced',
                attrs: {},
            })
            const newSchema = new Schema({
                nodes: {
                    doc: {},
                    text: {},
                    replaced: {
                        inline: true,
                        content: 'text*',
                    },
                },
            })
            const newNode = changeSchema(node, newSchema)!
            expect(newNode).toBeNull()
        })

        test.each([
            [PLACEHOLDERS.inlineLeaf.name, true],
            [PLACEHOLDERS.blockLeaf.name, false],
        ])('replace %s', (placeholderName, isInline) => {
            const schema = new Schema({
                nodes: {
                    doc: {},
                    text: {},
                    [placeholderName]: {
                        inline: isInline,
                        attrs: {
                            name: {},
                            attrs: {},
                        },
                    },
                },
            })
            const node = schema.node(placeholderName, {
                name: 'replaced',
                attrs: {
                    a: 1,
                    b: 2,
                },
            })
            const newSchema = new Schema({
                nodes: {
                    doc: {},
                    text: {},
                    replaced: {
                        inline: isInline,
                        attrs: {
                            b: {},
                            c: { default: 3 },
                        },
                    },
                },
            })
            const newNode = changeSchema(node, newSchema)!
            expect(newNode).not.toBeNull()
            newNode.check()
            expect(newNode.type.schema).toBe(newSchema)
            expect(newNode.toJSON()).toEqual({
                type: 'replaced',
                attrs: {
                    b: 2,
                    c: 3,
                },
            })
        })

        test.each([
            [PLACEHOLDERS.inlineBranch.name, true],
            [PLACEHOLDERS.blockBranch.name, false],
        ])('replace %s', (placeholderName, isInline) => {
            const schema = new Schema({
                nodes: {
                    doc: {},
                    text: {},
                    [placeholderName]: {
                        inline: isInline,
                        content: 'text*',
                        attrs: {
                            name: {},
                            attrs: {},
                        },
                        marks: 'a b',
                    },
                },
                marks: {
                    a: {},
                    b: {},
                },
            })
            const node = schema.node(
                placeholderName,
                {
                    name: 'replaced',
                    attrs: {
                        a: 1,
                        b: 2,
                    },
                },
                schema.text('TEST', [schema.mark('a'), schema.mark('b')]),
            )
            const newSchema = new Schema({
                nodes: {
                    doc: {},
                    text: {},
                    replaced: {
                        inline: isInline,
                        content: 'text*',
                        attrs: {
                            b: {},
                            c: { default: 3 },
                        },
                        marks: 'b',
                    },
                },
                marks: {
                    a: {},
                    b: {},
                },
            })
            const newNode = changeSchema(node, newSchema)!
            expect(newNode).not.toBeNull()
            newNode.check()
            expect(newNode.type.schema).toBe(newSchema)
            expect(newNode.toJSON()).toEqual({
                type: 'replaced',
                attrs: {
                    b: 2,
                    c: 3,
                },
                content: [
                    {
                        type: 'text',
                        text: 'TEST',
                        marks: [{ type: 'b' }],
                    },
                ],
            })
        })
    })

    describe('replace a normal node with a placeholder', () => {
        test.each([
            PLACEHOLDERS.blockBranch.name,
            PLACEHOLDERS.blockLeaf.name,
            PLACEHOLDERS.inlineBranch.name,
            PLACEHOLDERS.inlineLeaf.name,
        ])('do not replace invalid %s with itself', (placeholderName) => {
            const schema = new Schema({
                nodes: {
                    doc: {},
                    text: {},
                    [PLACEHOLDERS.blockBranch.name]: {
                        inline: false,
                        content: 'text*',
                        attrs: { a: { default: 5 } },
                    },
                    [PLACEHOLDERS.blockLeaf.name]: {
                        inline: false,
                        content: '',
                        attrs: { a: { default: 5 } },
                    },
                    [PLACEHOLDERS.inlineBranch.name]: {
                        inline: true,
                        content: 'text*',
                        attrs: { a: { default: 5 } },
                    },
                    [PLACEHOLDERS.inlineLeaf.name]: {
                        inline: true,
                        content: '',
                        attrs: { a: { default: 5 } },
                    },
                },
            })
            // `node` is invalid in the new schema because it has a placeholder's name
            // but it's missing its attributes.
            const node = schema.node(placeholderName)
            const newSchema = new Schema({
                nodes: {
                    doc: {},
                    text: {},
                    [PLACEHOLDERS.blockBranch.name]:
                        PLACEHOLDERS.blockBranch.spec,
                    [PLACEHOLDERS.blockLeaf.name]: PLACEHOLDERS.blockLeaf.spec,
                    [PLACEHOLDERS.inlineBranch.name]:
                        PLACEHOLDERS.inlineBranch.spec,
                    [PLACEHOLDERS.inlineLeaf.name]:
                        PLACEHOLDERS.inlineLeaf.spec,
                },
                marks: {
                    [PLACEHOLDERS.mark.name]: PLACEHOLDERS.mark.spec,
                },
            })
            const newNode = changeSchema(node, newSchema)!
            expect(newNode).toBeNull()
        })

        test.each([
            [PLACEHOLDERS.inlineLeaf.name, PLACEHOLDERS.inlineLeaf],
            [PLACEHOLDERS.blockLeaf.name, PLACEHOLDERS.blockLeaf],
        ])('replace %s', (_, { name, spec }) => {
            const schema = new Schema({
                nodes: {
                    doc: {},
                    text: {},
                    replaced: {
                        inline: spec.inline,
                        attrs: {
                            a: {},
                            b: {},
                        },
                    },
                },
                marks: {
                    a: {},
                    b: {},
                },
            })
            const node = schema.node('replaced', { a: 1, b: 2 }, undefined, [
                schema.mark('a'),
                schema.mark('b'),
            ])
            const newSchema = new Schema({
                nodes: {
                    doc: {},
                    text: {},
                    [name]: spec,
                },
                marks: {
                    [PLACEHOLDERS.mark.name]: PLACEHOLDERS.mark.spec,
                    b: {},
                },
            })
            const newNode = changeSchema(node, newSchema)!
            expect(newNode).not.toBeNull()
            newNode.check()
            expect(newNode.type.schema).toBe(newSchema)
            expect(newNode.toJSON()).toEqual({
                type: name,
                attrs: {
                    name: 'replaced',
                    attrs: {
                        a: 1,
                        b: 2,
                    },
                },
                marks: [
                    {
                        type: PLACEHOLDERS.mark.name,
                        attrs: {
                            name: 'a',
                            attrs: {},
                        },
                    },
                    { type: 'b' },
                ],
            })
        })

        test.each([
            [PLACEHOLDERS.inlineBranch.name, PLACEHOLDERS.inlineBranch],
            [PLACEHOLDERS.blockBranch.name, PLACEHOLDERS.blockBranch],
        ])('replace %s', (_, { name, spec }) => {
            const schema = new Schema({
                nodes: {
                    doc: {},
                    text: {},
                    replaced: {
                        inline: spec.inline,
                        content: 'text*',
                        attrs: {
                            a: {},
                            b: {},
                        },
                        marks: 'c d',
                    },
                },
                marks: {
                    a: {},
                    b: {},
                    c: {},
                    d: {},
                },
            })
            const node = schema.node(
                'replaced',
                { a: 1, b: 2 },
                schema.text('TEST', [schema.mark('c'), schema.mark('d')]),
                [schema.mark('a'), schema.mark('b')],
            )
            const newSchema = new Schema({
                nodes: {
                    doc: {},
                    text: {},
                    [PLACEHOLDERS.inlineBranch.name]:
                        PLACEHOLDERS.inlineBranch.spec,
                    [PLACEHOLDERS.inlineLeaf.name]:
                        PLACEHOLDERS.inlineLeaf.spec,
                    [PLACEHOLDERS.blockBranch.name]:
                        PLACEHOLDERS.blockBranch.spec,
                    [PLACEHOLDERS.blockLeaf.name]: PLACEHOLDERS.blockLeaf.spec,
                },
                marks: {
                    [PLACEHOLDERS.mark.name]: PLACEHOLDERS.mark.spec,
                    b: {},
                    c: {},
                    d: {},
                },
            })
            const newNode = changeSchema(node, newSchema)!
            expect(newNode).not.toBeNull()
            newNode.check()
            expect(newNode.type.schema).toBe(newSchema)
            expect(newNode.toJSON()).toEqual({
                type: name,
                attrs: {
                    name: 'replaced',
                    attrs: {
                        a: 1,
                        b: 2,
                    },
                },
                content: [
                    {
                        type: 'text',
                        text: 'TEST',
                        marks: [
                            {
                                type: PLACEHOLDERS.mark.name,
                                attrs: {
                                    name: 'c',
                                    attrs: {},
                                },
                            },
                            {
                                type: PLACEHOLDERS.mark.name,
                                attrs: {
                                    name: 'd',
                                    attrs: {},
                                },
                            },
                        ],
                    },
                ],
                marks: [
                    {
                        type: PLACEHOLDERS.mark.name,
                        attrs: {
                            name: 'a',
                            attrs: {},
                        },
                    },
                    { type: 'b' },
                ],
            })
        })
    })

    describe('ensure placeholders contain only placeholders', () => {
        test.each([true, false])(
            'replace nested nodes and marks (container is inline: %s)',
            (inline) => {
                const createSchema = (requiredAttrs: boolean) =>
                    new Schema({
                        nodes: {
                            doc: {
                                content: 'container*',
                            },
                            text: {},
                            [PLACEHOLDERS.blockBranch.name]: {
                                ...PLACEHOLDERS.blockBranch.spec,
                                group: inline ? undefined : 'container',
                            },
                            [PLACEHOLDERS.blockLeaf.name]: {
                                ...PLACEHOLDERS.blockLeaf.spec,
                            },
                            [PLACEHOLDERS.inlineBranch.name]: {
                                ...PLACEHOLDERS.inlineBranch.spec,
                                group: inline ? 'container' : undefined,
                            },
                            [PLACEHOLDERS.inlineLeaf.name]: {
                                ...PLACEHOLDERS.inlineLeaf.spec,
                            },
                            inlineContent: {
                                group: 'container',
                                content: 'inline*',
                                marks: '_',
                                inline,
                                attrs: requiredAttrs ? { a: {} } : {},
                            },
                            blockContent: {
                                group: 'container',
                                content: 'block*',
                                marks: '_',
                                inline,
                                attrs: requiredAttrs ? { a: {} } : {},
                            },
                            inlineBranch: {
                                group: 'inline',
                                content: 'text*',
                                inline: true,
                            },
                            inlineLeaf: {
                                group: 'inline',
                                content: null,
                                inline: true,
                            },
                            blockBranch: {
                                group: 'block',
                                content: 'text*',
                                inline: false,
                            },
                            blockLeaf: {
                                group: 'block',
                                content: null,
                                inline: false,
                            },
                        },
                        marks: {
                            [PLACEHOLDERS.mark.name]: PLACEHOLDERS.mark.spec,
                            mark: {},
                        },
                    })
                const schema = createSchema(false)
                const node = schema.node('doc', undefined, [
                    schema.node('inlineContent', undefined, [
                        schema.node(
                            'inlineBranch',
                            undefined,
                            [schema.text('inline content')],
                            [schema.mark('mark')],
                        ),
                        schema.node('inlineLeaf', undefined, undefined, [
                            schema.mark('mark'),
                        ]),
                    ]),
                    schema.node('blockContent', undefined, [
                        schema.node(
                            'blockBranch',
                            undefined,
                            [schema.text('block content')],
                            [schema.mark('mark')],
                        ),
                        schema.node('blockLeaf', undefined, undefined, [
                            schema.mark('mark'),
                        ]),
                    ]),
                ])
                const newSchema = createSchema(true)
                const newNode = changeSchema(node, newSchema)!
                expect(newNode).not.toBeNull()
                newNode.check()
                expect(newNode.type.schema).toBe(newSchema)
                expect(newNode.toJSON()).toEqual({
                    type: 'doc',
                    content: [
                        {
                            type: inline
                                ? PLACEHOLDERS.inlineBranch.name
                                : PLACEHOLDERS.blockBranch.name,
                            attrs: {
                                name: 'inlineContent',
                                attrs: {},
                            },
                            content: [
                                {
                                    type: PLACEHOLDERS.inlineBranch.name,
                                    attrs: {
                                        name: 'inlineBranch',
                                        attrs: {},
                                    },
                                    marks: [
                                        {
                                            type: PLACEHOLDERS.mark.name,
                                            attrs: {
                                                name: 'mark',
                                                attrs: {},
                                            },
                                        },
                                    ],
                                    content: [
                                        {
                                            type: 'text',
                                            text: 'inline content',
                                        },
                                    ],
                                },
                                {
                                    type: PLACEHOLDERS.inlineLeaf.name,
                                    attrs: {
                                        name: 'inlineLeaf',
                                        attrs: {},
                                    },
                                    marks: [
                                        {
                                            type: PLACEHOLDERS.mark.name,
                                            attrs: {
                                                name: 'mark',
                                                attrs: {},
                                            },
                                        },
                                    ],
                                },
                            ],
                        },
                        {
                            type: inline
                                ? PLACEHOLDERS.inlineBranch.name
                                : PLACEHOLDERS.blockBranch.name,
                            attrs: {
                                name: 'blockContent',
                                attrs: {},
                            },
                            content: [
                                {
                                    type: PLACEHOLDERS.inlineBranch.name,
                                    attrs: {
                                        name: 'blockBranch',
                                        attrs: {},
                                    },
                                    marks: [
                                        {
                                            type: PLACEHOLDERS.mark.name,
                                            attrs: {
                                                name: 'mark',
                                                attrs: {},
                                            },
                                        },
                                    ],
                                    content: [
                                        {
                                            type: 'text',
                                            text: 'block content',
                                        },
                                    ],
                                },
                                {
                                    type: PLACEHOLDERS.inlineLeaf.name,
                                    attrs: {
                                        name: 'blockLeaf',
                                        attrs: {},
                                    },
                                    marks: [
                                        {
                                            type: PLACEHOLDERS.mark.name,
                                            attrs: {
                                                name: 'mark',
                                                attrs: {},
                                            },
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                })

                // Check that we can restore the original content.
                expect(changeSchema(newNode, schema)!.toJSON()).toEqual(
                    node.toJSON(),
                )
            },
        )
    })
})

describe('convertMarks', () => {
    test('respect excludes', () => {
        const schema = new Schema({
            nodes: {
                doc: {},
                text: {},
            },
            marks: {
                a: {},
                b: {},
                c: {},
            },
        })
        const node = schema.text('TEST', [
            schema.mark('a'),
            schema.mark('b'),
            schema.mark('c'),
        ])
        const newSchema = new Schema({
            nodes: {
                doc: {},
                text: {},
            },
            marks: {
                a: {},
                b: { excludes: 'a' },
                c: {},
            },
        })
        const newNode = changeSchema(node, newSchema)!
        expect(newNode).not.toBeNull()
        newNode.check()
        expect(newNode.type.schema).toBe(newSchema)
        expect(newNode.toJSON()).toEqual({
            type: 'text',
            text: 'TEST',
            marks: [{ type: 'b' }, { type: 'c' }],
        })
        expect(newNode.marks[0].type.schema).toBe(newSchema)
        expect(newNode.marks[1].type.schema).toBe(newSchema)
    })

    test('replace a placeholder with a normal mark', () => {
        const schema = new Schema({
            nodes: {
                doc: {},
                text: {},
            },
            marks: {
                [PLACEHOLDERS.mark.name]: {
                    attrs: {
                        name: {},
                        attrs: {},
                    },
                },
            },
        })
        const node = schema.text('TEST', [
            schema.mark(PLACEHOLDERS.mark.name, {
                name: 'replaced',
                attrs: {
                    a: 1,
                    b: 2,
                },
            }),
        ])
        const newSchema = new Schema({
            nodes: {
                doc: {},
                text: {},
            },
            marks: {
                replaced: {
                    attrs: {
                        b: {},
                        c: { default: 3 },
                    },
                },
            },
        })
        const newNode = changeSchema(node, newSchema)!
        expect(newNode).not.toBeNull()
        newNode.check()
        expect(newNode.type.schema).toBe(newSchema)
        expect(newNode.toJSON()).toEqual({
            type: 'text',
            text: 'TEST',
            marks: [{ type: 'replaced', attrs: { b: 2, c: 3 } }],
        })
        expect(newNode.marks[0].type.schema).toBe(newSchema)
    })

    test('do not replace a placeholder with a normal mark, if not allowed in the parent node', () => {
        const schema = new Schema({
            nodes: {
                doc: {
                    content: 'text*',
                    marks: PLACEHOLDERS.mark.name,
                },
                text: {},
            },
            marks: {
                [PLACEHOLDERS.mark.name]: PLACEHOLDERS.mark.spec,
            },
        })
        const node = schema.node(
            'doc',
            undefined,
            schema.text('TEST', [
                schema.mark(PLACEHOLDERS.mark.name, {
                    name: 'replaced',
                    attrs: {
                        a: 1,
                        b: 2,
                    },
                }),
            ]),
        )
        const newSchema = new Schema({
            nodes: {
                doc: {
                    content: 'text*',
                    marks: PLACEHOLDERS.mark.name,
                },
                text: {},
            },
            marks: {
                [PLACEHOLDERS.mark.name]: PLACEHOLDERS.mark.spec,
                replaced: {
                    attrs: {
                        b: {},
                        c: { default: 3 },
                    },
                },
            },
        })
        const newNode = changeSchema(node, newSchema)!
        expect(newNode).not.toBeNull()
        newNode.check()
        expect(newNode.type.schema).toBe(newSchema)
        expect(newNode.toJSON()).toEqual({
            type: 'doc',
            content: [
                {
                    type: 'text',
                    text: 'TEST',
                    marks: [
                        {
                            type: PLACEHOLDERS.mark.name,
                            attrs: { name: 'replaced', attrs: { a: 1, b: 2 } },
                        },
                    ],
                },
            ],
        })
    })

    test('replace with the same name', () => {
        const schema = new Schema({
            nodes: {
                doc: {},
                text: {},
            },
            marks: {
                m: {},
                n: { attrs: { a: {}, b: {} } },
            },
        })
        const node = schema.text('TEST', [
            schema.mark('m'),
            schema.mark('n', { a: 1, b: 2 }),
        ])
        const newSchema = new Schema({
            nodes: {
                doc: {},
                text: {},
            },
            marks: {
                m: {},
                n: { attrs: { b: {}, c: { default: 3 } } },
            },
        })
        const newNode = changeSchema(node, newSchema)!
        expect(newNode).not.toBeNull()
        newNode.check()
        expect(newNode.type.schema).toBe(newSchema)
        expect(newNode.toJSON()).toEqual({
            type: 'text',
            text: 'TEST',
            marks: [{ type: 'm' }, { type: 'n', attrs: { b: 2, c: 3 } }],
        })
        expect(newNode.marks[0].type.schema).toBe(newSchema)
        expect(newNode.marks[1].type.schema).toBe(newSchema)
    })

    test('replace a normal mark with a placeholder', () => {
        const schema = new Schema({
            nodes: {
                doc: {},
                text: {},
            },
            marks: {
                replaced: {
                    attrs: {
                        a: {},
                        b: {},
                    },
                },
            },
        })
        const node = schema.text('TEST', [
            schema.mark('replaced', {
                a: 1,
                b: 2,
            }),
        ])
        const newSchema = new Schema({
            nodes: {
                doc: {},
                text: {},
            },
            marks: {
                [PLACEHOLDERS.mark.name]: PLACEHOLDERS.mark.spec,
            },
        })
        const newNode = changeSchema(node, newSchema)!
        expect(newNode).not.toBeNull()
        newNode.check()
        expect(newNode.type.schema).toBe(newSchema)
        expect(newNode.toJSON()).toEqual({
            type: 'text',
            text: 'TEST',
            marks: [
                {
                    type: PLACEHOLDERS.mark.name,
                    attrs: { name: 'replaced', attrs: { a: 1, b: 2 } },
                },
            ],
        })
        expect(newNode.marks[0].type.schema).toBe(newSchema)
    })

    test('do not replace an invalid placeholder', () => {
        const schema = new Schema({
            nodes: {
                doc: {},
                text: {},
            },
            marks: {
                [PLACEHOLDERS.mark.name]: {},
            },
        })
        // The mark is invalid in the new schema because it has a placeholder's name
        // but it's missing its attributes.
        const node = schema.text('TEST', [schema.mark(PLACEHOLDERS.mark.name)])
        const newSchema = new Schema({
            nodes: {
                doc: {},
                text: {},
            },
            marks: {
                [PLACEHOLDERS.mark.name]: PLACEHOLDERS.mark.spec,
            },
        })
        const newNode = changeSchema(node, newSchema)!
        expect(newNode).not.toBeNull()
        newNode.check()
        expect(newNode.type.schema).toBe(newSchema)
        expect(newNode.toJSON()).toEqual({
            type: 'text',
            text: 'TEST',
        })
    })
})
