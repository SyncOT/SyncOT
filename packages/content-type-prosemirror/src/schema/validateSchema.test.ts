import { Schema } from 'prosemirror-model'
import { PlaceholderNames, validateSchema } from '..'

const attrs = {
    attrNull: { default: null },
    attrBoolean: { default: true },
    attrString: { default: 'test' },
    attrNumber: { default: 5 },
    attrObject: { default: { key: 'value' } },
    attrArray: { default: [1, 2, 3] },
    attrRequired: {},
}

test('valid complex schema', () => {
    const schema = new Schema({
        nodes: {
            root: { content: 'p+' },
            p: { content: 'text*' },
            a: { content: 'text*', attrs },
            nodeWithIgnoredProperties: {
                content: 'text*',
                atom: true,
                selectable: true,
                draggable: true,
                code: true,
                defining: true,
                isolating: true,
                toDOM() {
                    return ['a', 0]
                },
                parseDOM: [],
                toDebugString() {
                    return ''
                },
                anotherProperty: 5,
            },
            nodeWithNullProperties: {
                content: 'text*',
                marks: null,
                group: undefined,
            },
            nodeWithAllProperties: {
                content: 'text*',
                marks: 'bold',
                group: 'test-group',
                inline: true,
                attrs: { a: {} },
            },
            text: {},
        },
        marks: {
            bold: {},
            b: { attrs },
            markWithIgnoredProperties: {
                group: 'test',
                inclusive: true,
                spanning: true,
                toDOM() {
                    return ['a', 0]
                },
                parseDOM: [],
                anotherProperty: 6,
            },
            markWithNullProperties: {
                attrs: { b: {} },
                excludes: null,
                group: undefined,
            },
            markWithAllProperties: {
                attrs: { a: {} },
                excludes: '',
                group: 'test-group',
            },
        },
        topNode: 'root',
    })
    validateSchema(schema)
})

test('check if instance of Schema', () => {
    expect(() => validateSchema({} as any)).toThrow(
        expect.objectContaining({
            name: 'TypeError',
            message: '"schema" is not an instance of Schema.',
        }),
    )
})

describe('cycle', () => {
    test('cycle in required position (minimal cycle)', () => {
        expect(() =>
            validateSchema(
                new Schema({
                    nodes: {
                        doc: { content: 'p' },
                        p: { content: 'p' },
                        text: {},
                    },
                }),
            ),
        ).toThrow(
            expect.objectContaining({
                name: 'SyntaxError',
                message:
                    'A cycle of nodes in required positions (see https://prosemirror.net/docs/guide/#schema.content_expressions) (p -> p)',
            }),
        )
    })

    test('cycle in required position (long cycle)', () => {
        expect(() =>
            validateSchema(
                new Schema({
                    nodes: {
                        doc: { content: 'p' },
                        p: { content: 'a' },
                        a: { content: 'b' },
                        b: { content: 'c' },
                        c: { content: 'd' },
                        d: { content: 'e' },
                        e: { content: 'a' },
                        text: {},
                    },
                }),
            ),
        ).toThrow(
            expect.objectContaining({
                name: 'SyntaxError',
                message:
                    'A cycle of nodes in required positions (see https://prosemirror.net/docs/guide/#schema.content_expressions) (a -> b -> c -> d -> e -> a)',
            }),
        )
    })

    test('cycle in required position (not triggered by topNode)', () => {
        expect(() =>
            validateSchema(
                new Schema({
                    nodes: {
                        doc: { content: 'p' },
                        p: { content: 'text*' },
                        a: { content: 'b' },
                        b: { content: 'a' },
                        text: {},
                    },
                }),
            ),
        ).toThrow(
            expect.objectContaining({
                name: 'SyntaxError',
                message:
                    'A cycle of nodes in required positions (see https://prosemirror.net/docs/guide/#schema.content_expressions) (a -> b -> a)',
            }),
        )
    })

    test('cycle in required position (content: a b cycle d e)', () => {
        expect(() =>
            validateSchema(
                new Schema({
                    nodes: {
                        doc: { content: 'p' },
                        p: { content: 'a b cycle d e' },
                        a: { content: 'text*' },
                        b: { content: 'text*' },
                        cycle: { content: 'p' },
                        d: { content: 'text*' },
                        e: { content: 'text*' },
                        text: {},
                    },
                }),
            ),
        ).toThrow(
            expect.objectContaining({
                name: 'SyntaxError',
                message:
                    'A cycle of nodes in required positions (see https://prosemirror.net/docs/guide/#schema.content_expressions) (p -> cycle -> p)',
            }),
        )
    })

    test('cycle in required position (content: text* cycle text*)', () => {
        expect(() =>
            validateSchema(
                new Schema({
                    nodes: {
                        doc: { content: 'p' },
                        p: { content: 'text* cycle text*' },
                        cycle: { content: 'p', inline: true },
                        text: {},
                    },
                }),
            ),
        ).toThrow(
            expect.objectContaining({
                name: 'SyntaxError',
                message:
                    'A cycle of nodes in required positions (see https://prosemirror.net/docs/guide/#schema.content_expressions) (p -> cycle -> p)',
            }),
        )
    })

    test('cycle in required position (content: (cycle | a))', () => {
        expect(() =>
            validateSchema(
                new Schema({
                    nodes: {
                        doc: { content: 'p' },
                        p: { content: 'cycle | a' },
                        a: { content: 'text*' },
                        cycle: { content: 'p' },
                        text: {},
                    },
                }),
            ),
        ).toThrow(
            expect.objectContaining({
                name: 'SyntaxError',
                message:
                    'A cycle of nodes in required positions (see https://prosemirror.net/docs/guide/#schema.content_expressions) (p -> cycle -> p)',
            }),
        )
    })

    test('no cycle in required position (content: (a | cycle))', () => {
        validateSchema(
            new Schema({
                nodes: {
                    doc: { content: 'p' },
                    p: { content: 'a | cycle' },
                    a: { content: 'text*' },
                    cycle: { content: 'p' },
                    text: {},
                },
            }),
        )
    })

    test('cycle in required position (content: (a cycle a)+)', () => {
        expect(() =>
            validateSchema(
                new Schema({
                    nodes: {
                        doc: { content: 'p' },
                        p: { content: '(a cycle a)+' },
                        a: { content: 'text*' },
                        cycle: { content: 'p' },
                        text: {},
                    },
                }),
            ),
        ).toThrow(
            expect.objectContaining({
                name: 'SyntaxError',
                message:
                    'A cycle of nodes in required positions (see https://prosemirror.net/docs/guide/#schema.content_expressions) (p -> cycle -> p)',
            }),
        )
    })

    test('no cycle in required position (content: (a cycle a)*)', () => {
        validateSchema(
            new Schema({
                nodes: {
                    doc: { content: 'p' },
                    p: { content: '(a cycle a)*' },
                    a: { content: 'text*' },
                    cycle: { content: 'p' },
                    text: {},
                },
            }),
        )
    })

    test('cycle in required position (content: (a cycle a))', () => {
        expect(() =>
            validateSchema(
                new Schema({
                    nodes: {
                        doc: { content: 'p' },
                        p: { content: '(a cycle a)+' },
                        a: { content: 'text*' },
                        cycle: { content: 'p' },
                        text: {},
                    },
                }),
            ),
        ).toThrow(
            expect.objectContaining({
                name: 'SyntaxError',
                message:
                    'A cycle of nodes in required positions (see https://prosemirror.net/docs/guide/#schema.content_expressions) (p -> cycle -> p)',
            }),
        )
    })

    test('no cycle in required position (content: (a cycle a)?)', () => {
        validateSchema(
            new Schema({
                nodes: {
                    doc: { content: 'p' },
                    p: { content: '(a cycle a)*' },
                    a: { content: 'text*' },
                    cycle: { content: 'p' },
                    text: {},
                },
            }),
        )
    })

    test('cycle in required position (content: (a cycle a){1,2})', () => {
        expect(() =>
            validateSchema(
                new Schema({
                    nodes: {
                        doc: { content: 'p' },
                        p: { content: '(a cycle a)+' },
                        a: { content: 'text*' },
                        cycle: { content: 'p' },
                        text: {},
                    },
                }),
            ),
        ).toThrow(
            expect.objectContaining({
                name: 'SyntaxError',
                message:
                    'A cycle of nodes in required positions (see https://prosemirror.net/docs/guide/#schema.content_expressions) (p -> cycle -> p)',
            }),
        )
    })

    test('no cycle in required position (content: (a cycle a){0,2})', () => {
        validateSchema(
            new Schema({
                nodes: {
                    doc: { content: 'p' },
                    p: { content: '(a cycle a)*' },
                    a: { content: 'text*' },
                    cycle: { content: 'p' },
                    text: {},
                },
            }),
        )
    })
})

describe('spec', () => {
    test.each<[string, Schema, string | undefined]>([
        [
            'topNode: undefined',
            new Schema({
                nodes: {
                    doc: {},
                    text: {},
                },
            }),
            undefined,
        ],
        [
            'topNode: null',
            new Schema({
                nodes: {
                    doc: {},
                    text: {},
                },
                topNode: null,
            }),
            undefined,
        ],
        [
            'topNode: string',
            new Schema({
                nodes: {
                    doc: {},
                    text: {},
                    top: {},
                },
                topNode: 'top',
            }),
            undefined,
        ],
        [
            'topNode: number',
            new Schema({
                nodes: {
                    doc: {},
                    text: {},
                    '5': {},
                },
                topNode: 5 as any,
            }),
            'spec.topNode',
        ],

        [
            'node content: undefined',
            new Schema({
                nodes: {
                    doc: { content: undefined },
                    text: {},
                },
            }),
            undefined,
        ],
        [
            'node content: null',
            new Schema({
                nodes: {
                    doc: { content: null },
                    text: {},
                },
            }),
            undefined,
        ],
        [
            'node content: string',
            new Schema({
                nodes: {
                    doc: { content: 'text*' },
                    text: {},
                },
            }),
            undefined,
        ],

        [
            'node marks: undefined',
            new Schema({
                nodes: {
                    doc: { marks: undefined },
                    text: {},
                },
                marks: { m: {} },
            }),
            undefined,
        ],
        [
            'node marks: null',
            new Schema({
                nodes: {
                    doc: { marks: null },
                    text: {},
                },
                marks: { m: {} },
            }),
            undefined,
        ],
        [
            'node marks: string',
            new Schema({
                nodes: {
                    doc: { marks: 'm' },
                    text: {},
                },
                marks: { m: {} },
            }),
            undefined,
        ],

        [
            'mark excludes: undefined',
            new Schema({
                nodes: {
                    doc: {},
                    text: {},
                },
                marks: { m: { excludes: undefined } },
            }),
            undefined,
        ],
        [
            'mark excludes: null',
            new Schema({
                nodes: {
                    doc: {},
                    text: {},
                },
                marks: { m: { excludes: null } },
            }),
            undefined,
        ],
        [
            'mark excludes: string',
            new Schema({
                nodes: {
                    doc: {},
                    text: {},
                },
                marks: { m: { excludes: '' } },
            }),
            undefined,
        ],

        [
            'node inline: undefined',
            new Schema({
                nodes: {
                    doc: { inline: undefined },
                    text: {},
                },
            }),
            undefined,
        ],
        [
            'node inline: null',
            new Schema({
                nodes: {
                    doc: { inline: null },
                    text: {},
                },
            }),
            undefined,
        ],
        [
            'node inline: boolean',
            new Schema({
                nodes: {
                    doc: { inline: true },
                    text: {},
                },
            }),
            undefined,
        ],
        [
            'node inline: number',
            new Schema({
                nodes: {
                    doc: { inline: 1 as any },
                    text: {},
                },
            }),
            'spec.nodes.doc.inline',
        ],

        [
            'node group: undefined',
            new Schema({
                nodes: {
                    doc: { group: undefined },
                    text: {},
                },
            }),
            undefined,
        ],
        [
            'mark group: undefined',
            new Schema({
                nodes: {
                    doc: {},
                    text: {},
                },
                marks: {
                    m: { group: undefined },
                },
            }),
            undefined,
        ],
        [
            'node group: null',
            new Schema({
                nodes: {
                    doc: { group: null },
                    text: {},
                },
            }),
            undefined,
        ],
        [
            'mark group: null',
            new Schema({
                nodes: {
                    doc: {},
                    text: {},
                },
                marks: {
                    m: { group: null },
                },
            }),
            undefined,
        ],
        [
            'node group: string',
            new Schema({
                nodes: {
                    doc: { group: 'a' },
                    text: {},
                },
            }),
            undefined,
        ],
        [
            'mark group: string',
            new Schema({
                nodes: {
                    doc: {},
                    text: {},
                },
                marks: {
                    m: { group: 'a' },
                },
            }),
            undefined,
        ],

        [
            'node attrs: undefined',
            new Schema({
                nodes: {
                    doc: { attrs: undefined },
                    text: {},
                },
            }),
            undefined,
        ],
        [
            'mark attrs: undefined',
            new Schema({
                nodes: {
                    doc: {},
                    text: {},
                },
                marks: {
                    m: { attrs: undefined },
                },
            }),
            undefined,
        ],

        [
            'node attrs: null',
            new Schema({
                nodes: {
                    doc: { attrs: null },
                    text: {},
                },
            }),
            undefined,
        ],
        [
            'mark attrs: null',
            new Schema({
                nodes: {
                    doc: {},
                    text: {},
                },
                marks: {
                    m: { attrs: null },
                },
            }),
            undefined,
        ],

        [
            'node attrs: object',
            new Schema({
                nodes: {
                    doc: { attrs: {} },
                    text: {},
                },
            }),
            undefined,
        ],
        [
            'mark attrs: object',
            new Schema({
                nodes: {
                    doc: {},
                    text: {},
                },
                marks: {
                    m: { attrs: {} },
                },
            }),
            undefined,
        ],

        [
            'node attrs: number',
            new Schema({
                nodes: {
                    doc: { attrs: 5 as any },
                    text: {},
                },
            }),
            'spec.nodes.doc.attrs',
        ],
        [
            'mark attrs: number',
            new Schema({
                nodes: {
                    doc: {},
                    text: {},
                },
                marks: {
                    m: { attrs: 5 as any },
                },
            }),
            'spec.marks.m.attrs',
        ],

        [
            'node attrs: enumerable property in prototype',
            new Schema({
                nodes: {
                    doc: { attrs: Object.setPrototypeOf({ a: {} }, { b: {} }) },
                    text: {},
                },
            }),
            'spec.nodes.doc.attrs.b',
        ],
        [
            'mark attrs: enumerable property in prototype',
            new Schema({
                nodes: {
                    doc: {},
                    text: {},
                },
                marks: {
                    m: { attrs: Object.setPrototypeOf({ a: {} }, { b: {} }) },
                },
            }),
            'spec.marks.m.attrs.b',
        ],

        [
            'node attrs[name]: number',
            new Schema({
                nodes: {
                    doc: { attrs: { a: 5 as any } },
                    text: {},
                },
            }),
            'spec.nodes.doc.attrs.a',
        ],
        [
            'mark attrs[name]: number',
            new Schema({
                nodes: {
                    doc: {},
                    text: {},
                },
                marks: {
                    m: { attrs: { a: 5 as any } },
                },
            }),
            'spec.marks.m.attrs.a',
        ],

        [
            'node attrs[name].default: number',
            new Schema({
                nodes: {
                    doc: { attrs: { a: { default: 5 } } },
                    text: {},
                },
            }),
            undefined,
        ],
        [
            'mark attrs[name].default: number',
            new Schema({
                nodes: {
                    doc: {},
                    text: {},
                },
                marks: {
                    m: { attrs: { a: { default: 5 } } },
                },
            }),
            undefined,
        ],

        [
            'node attrs[name].default: string',
            new Schema({
                nodes: {
                    doc: { attrs: { a: { default: 'test' } } },
                    text: {},
                },
            }),
            undefined,
        ],
        [
            'mark attrs[name].default: string',
            new Schema({
                nodes: {
                    doc: {},
                    text: {},
                },
                marks: {
                    m: { attrs: { a: { default: 'test' } } },
                },
            }),
            undefined,
        ],

        [
            'node attrs[name].default: boolean',
            new Schema({
                nodes: {
                    doc: { attrs: { a: { default: true } } },
                    text: {},
                },
            }),
            undefined,
        ],
        [
            'mark attrs[name].default: boolean',
            new Schema({
                nodes: {
                    doc: {},
                    text: {},
                },
                marks: {
                    m: { attrs: { a: { default: true } } },
                },
            }),
            undefined,
        ],

        [
            'node attrs[name].default: object',
            new Schema({
                nodes: {
                    doc: { attrs: { a: { default: {} } } },
                    text: {},
                },
            }),
            undefined,
        ],
        [
            'mark attrs[name].default: object',
            new Schema({
                nodes: {
                    doc: {},
                    text: {},
                },
                marks: {
                    m: { attrs: { a: { default: {} } } },
                },
            }),
            undefined,
        ],

        [
            'node attrs[name].default: null',
            new Schema({
                nodes: {
                    doc: { attrs: { a: { default: null } } },
                    text: {},
                },
            }),
            undefined,
        ],
        [
            'mark attrs[name].default: null',
            new Schema({
                nodes: {
                    doc: {},
                    text: {},
                },
                marks: {
                    m: { attrs: { a: { default: null } } },
                },
            }),
            undefined,
        ],

        [
            'node attrs[name].default: missing',
            new Schema({
                nodes: {
                    doc: { attrs: { a: {} } },
                    text: {},
                },
            }),
            undefined,
        ],
        [
            'mark attrs[name].default: missing',
            new Schema({
                nodes: {
                    doc: {},
                    text: {},
                },
                marks: {
                    m: { attrs: { a: {} } },
                },
            }),
            undefined,
        ],

        [
            'node attrs[name].default: undefined',
            new Schema({
                nodes: {
                    doc: { attrs: { a: { default: undefined } } },
                    text: {},
                },
            }),
            'spec.nodes.doc.attrs.a.default',
        ],
        [
            'mark attrs[name].default: undefined',
            new Schema({
                nodes: {
                    doc: {},
                    text: {},
                },
                marks: {
                    m: { attrs: { a: { default: undefined } } },
                },
            }),
            'spec.marks.m.attrs.a.default',
        ],

        [
            'node attrs[name].default: function',
            new Schema({
                nodes: {
                    doc: { attrs: { a: { default: () => 5 } } },
                    text: {},
                },
            }),
            'spec.nodes.doc.attrs.a.default',
        ],
        [
            'mark attrs[name].default: function',
            new Schema({
                nodes: {
                    doc: {},
                    text: {},
                },
                marks: {
                    m: { attrs: { a: { default: () => 5 } } },
                },
            }),
            'spec.marks.m.attrs.a.default',
        ],

        [
            'node attrs[name].default: enumerable function in prototype',
            new Schema({
                nodes: {
                    doc: {
                        attrs: {
                            a: Object.setPrototypeOf({}, { default: () => 5 }),
                        },
                    },
                    text: {},
                },
            }),
            undefined,
        ],
        [
            'mark attrs[name].default: enumerable function in prototype',
            new Schema({
                nodes: {
                    doc: {},
                    text: {},
                },
                marks: {
                    m: {
                        attrs: {
                            a: Object.setPrototypeOf({}, { default: () => 5 }),
                        },
                    },
                },
            }),
            undefined,
        ],
    ])('%s', (_message, schema, property) => {
        if (property === undefined) validateSchema(schema)
        else
            expect(() => validateSchema(schema)).toThrow(
                expect.objectContaining({
                    name: 'SyncOTError InvalidEntity',
                    message: `Invalid "ProseMirrorSchema.${property}".`,
                    entityName: 'ProseMirrorSchema',
                    entity: { spec: schema.spec },
                    key: property,
                }),
            )
    })
})

describe('placeholders', () => {
    test('no placeholders', () => {
        validateSchema(
            new Schema({
                nodes: { doc: {}, text: {} },
            }),
        )
    })

    describe(PlaceholderNames.mark, () => {
        test('valid', () => {
            validateSchema(
                new Schema({
                    nodes: { doc: {}, text: {} },
                    marks: {
                        [PlaceholderNames.mark]: {
                            attrs: { name: {}, attrs: {} },
                        },
                    },
                }),
            )
        })
        test.each<[string, Schema]>([
            [
                `spec.marks.${PlaceholderNames.mark}.attrs`,
                new Schema({
                    nodes: { doc: {}, text: {} },
                    marks: {
                        [PlaceholderNames.mark]: {},
                    },
                }),
            ],
            [
                `spec.marks.${PlaceholderNames.mark}.attrs.name`,
                new Schema({
                    nodes: { doc: {}, text: {} },
                    marks: {
                        [PlaceholderNames.mark]: {
                            attrs: { attrs: {} },
                        },
                    },
                }),
            ],
            [
                `spec.marks.${PlaceholderNames.mark}.attrs.attrs`,
                new Schema({
                    nodes: { doc: {}, text: {} },
                    marks: {
                        [PlaceholderNames.mark]: {
                            attrs: { name: {} },
                        },
                    },
                }),
            ],
        ])('invalid: %s', (property, schema) => {
            expect(() => validateSchema(schema)).toThrow(
                expect.objectContaining({
                    name: 'SyncOTError InvalidEntity',
                    message: `Invalid "ProseMirrorSchema.${property}".`,
                    entityName: 'ProseMirrorSchema',
                    entity: { spec: schema.spec },
                    key: property,
                }),
            )
        })
    })

    describe.each([
        [PlaceholderNames.blockBranch, false, false],
        [PlaceholderNames.blockLeaf, false, true],
        [PlaceholderNames.inlineBranch, true, false],
        [PlaceholderNames.inlineLeaf, true, true],
    ])('%s', (placeholderName, isInline, isLeaf) => {
        test('valid', () => {
            validateSchema(
                new Schema({
                    nodes: {
                        doc: {},
                        text: {},
                        [placeholderName]: {
                            inline: isInline,
                            content: isLeaf ? '' : 'text*',
                            attrs: { name: {}, attrs: {} },
                        },
                    },
                }),
            )
        })
        test.each<[string, Schema]>([
            [
                `spec.nodes.${placeholderName}.attrs`,
                new Schema({
                    nodes: {
                        doc: {},
                        text: {},
                        [placeholderName]: {
                            inline: isInline,
                            content: isLeaf ? '' : 'text*',
                        },
                    },
                }),
            ],
            [
                `spec.nodes.${placeholderName}.attrs.name`,
                new Schema({
                    nodes: {
                        doc: {},
                        text: {},
                        [placeholderName]: {
                            inline: isInline,
                            content: isLeaf ? '' : 'text*',
                            attrs: { attrs: {} },
                        },
                    },
                }),
            ],
            [
                `spec.nodes.${placeholderName}.attrs.attrs`,
                new Schema({
                    nodes: {
                        doc: {},
                        text: {},
                        [placeholderName]: {
                            inline: isInline,
                            content: isLeaf ? '' : 'text*',
                            attrs: { name: {} },
                        },
                    },
                }),
            ],
            [
                `spec.nodes.${placeholderName}.inline`,
                new Schema({
                    nodes: {
                        doc: {},
                        text: {},
                        [placeholderName]: {
                            inline: !isInline,
                            content: isLeaf ? '' : 'text*',
                            attrs: { name: {}, attrs: {} },
                        },
                    },
                }),
            ],
            [
                `spec.nodes.${placeholderName}.content`,
                new Schema({
                    nodes: {
                        doc: {},
                        text: {},
                        [placeholderName]: {
                            inline: isInline,
                            content: isLeaf ? 'text*' : '',
                            attrs: { name: {}, attrs: {} },
                        },
                    },
                }),
            ],
        ])('invalid: %s', (property, schema) => {
            expect(() => validateSchema(schema)).toThrow(
                expect.objectContaining({
                    name: 'SyncOTError InvalidEntity',
                    message: `Invalid "ProseMirrorSchema.${property}".`,
                    entityName: 'ProseMirrorSchema',
                    entity: { spec: schema.spec },
                    key: property,
                }),
            )
        })
    })
})
