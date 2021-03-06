import { createInvalidEntityError } from '@syncot/util'
import OrderedMap from 'orderedmap'
import {
    AttributeSpec,
    ContentMatch,
    MarkSpec,
    NodeSpec,
    NodeType,
    Schema,
} from 'prosemirror-model'
import { PLACEHOLDERS } from './placeholders'

/**
 * Checks if the specified ProseMirror Schema is compatible with SyncOT.
 * Throws validation errors.
 * Returns the validated schema.
 */
export function validateSchema(schema: Schema): Schema {
    if (!(schema instanceof Schema)) {
        throw new TypeError('"schema" is not an instance of Schema.')
    }

    // Check if the required content would cause a stack overflow when filling nodes.
    for (const type of Object.values(schema.nodes)) {
        const cycle = findCycle(type, [])
        if (cycle) {
            const cycleString = cycle
                .map((cycleType) => cycleType.name)
                .join(' -> ')
            // Throw an error similar to that which ProseMirror throws when a node with
            // a required attribute is in a required position.
            throw new SyntaxError(
                `A cycle of nodes in required positions (see https://prosemirror.net/docs/guide/#schema.content_expressions) (${cycleString})`,
            )
        }
    }

    // Validate the spec.
    validateTopNode(schema.spec.topNode, schema)
    const nodes = schema.spec.nodes as OrderedMap<NodeSpec>
    nodes.forEach((name, spec) => {
        const key = `spec.nodes.${name}`
        validateAttrs(spec.attrs, schema, key)
        validateContent(spec.content, schema, key)
        validateGroup(spec.group, schema, key)
        validateInline(spec.inline, schema, key)
        validateMarks(spec.marks, schema, key)
    })
    const marksMap = schema.spec.marks as OrderedMap<MarkSpec>
    marksMap.forEach((name, spec) => {
        const key = `spec.marks.${name}`
        validateAttrs(spec.attrs, schema, key)
        validateExcludes(spec.excludes, schema, key)
        validateGroup(spec.group, schema, key)
    })

    // Validate the placeholders.
    validatePlaceholders(schema)

    return schema
}

/**
 * Looks for cycles created by following ContentMatch -> defaultType -> ContentMatch references.
 * @param type The NodeType at which to start searching.
 * @param seenTypes A list of node types which have been already visited.
 * @returns A list of node types creating a cycle, or `undefined`, if no cycles were detected.
 */
function findCycle(
    type: NodeType,
    seenTypes: NodeType[],
): NodeType[] | undefined {
    const index = seenTypes.indexOf(type)
    const seenTypesExtended = seenTypes.concat(type)
    if (index >= 0) return seenTypesExtended.slice(index)

    let match: ContentMatch | null | undefined = type.contentMatch
    while (match && !match.validEnd && match.defaultType) {
        const cycle = findCycle(match.defaultType, seenTypesExtended)
        if (cycle) return cycle
        match = match.matchType(match.defaultType)
    }

    return undefined
}

function validateTopNode(
    topNode: string | null | undefined,
    schema: Schema,
): void {
    if (typeof topNode !== 'string' && topNode != null)
        throw createInvalidEntityError(
            'ProseMirrorSchema',
            { spec: schema.spec },
            `spec.topNode`,
        )
}

function validateAttrs(
    attrs: { [key: string]: AttributeSpec } | null | undefined,
    schema: Schema,
    key: string,
): void {
    if (typeof attrs !== 'object' && attrs != null) {
        throw createInvalidEntityError(
            'ProseMirrorSchema',
            { spec: schema.spec },
            `${key}.attrs`,
        )
    }
    // tslint:disable-next-line:forin
    for (const name in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, name))
            throw createInvalidEntityError(
                'ProseMirrorSchema',
                { spec: schema.spec },
                `${key}.attrs.${name}`,
            )

        const attr = attrs[name]
        if (attr == null || typeof attr !== 'object')
            throw createInvalidEntityError(
                'ProseMirrorSchema',
                { spec: schema.spec },
                `${key}.attrs.${name}`,
            )

        if (Object.prototype.hasOwnProperty.call(attr, 'default')) {
            const type = typeof attr.default
            if (
                type !== 'string' &&
                type !== 'number' &&
                type !== 'boolean' &&
                type !== 'object'
            ) {
                throw createInvalidEntityError(
                    'ProseMirrorSchema',
                    { spec: schema.spec },
                    `${key}.attrs.${name}.default`,
                )
            }
        }
    }
}

function validateContent(
    content: string | null | undefined,
    schema: Schema,
    key: string,
): void {
    /* istanbul ignore if */
    if (typeof content !== 'string' && content != null)
        throw createInvalidEntityError(
            'ProseMirrorSchema',
            { spec: schema.spec },
            `${key}.content`,
        )
}

function validateGroup(
    group: string | null | undefined,
    schema: Schema,
    key: string,
): void {
    /* istanbul ignore if */
    if (typeof group !== 'string' && group != null)
        throw createInvalidEntityError(
            'ProseMirrorSchema',
            { spec: schema.spec },
            `${key}.group`,
        )
}

function validateInline(
    inline: boolean | null | undefined,
    schema: Schema,
    key: string,
): void {
    if (typeof inline !== 'boolean' && inline != null)
        throw createInvalidEntityError(
            'ProseMirrorSchema',
            { spec: schema.spec },
            `${key}.inline`,
        )
}

function validateMarks(
    marks: string | null | undefined,
    schema: Schema,
    key: string,
): void {
    /* istanbul ignore if */
    if (typeof marks !== 'string' && marks != null)
        throw createInvalidEntityError(
            'ProseMirrorSchema',
            { spec: schema.spec },
            `${key}.marks`,
        )
}

function validateExcludes(
    excludes: string | null | undefined,
    schema: Schema,
    key: string,
): void {
    /* istanbul ignore if */
    if (typeof excludes !== 'string' && excludes != null)
        throw createInvalidEntityError(
            'ProseMirrorSchema',
            { spec: schema.spec },
            `${key}.excludes`,
        )
}

function validatePlaceholders(schema: Schema): void {
    validatePlaceholderMark(schema, PLACEHOLDERS.mark)
    validatePlaceholderNode(schema, PLACEHOLDERS.blockBranch)
    validatePlaceholderNode(schema, PLACEHOLDERS.blockLeaf)
    validatePlaceholderNode(schema, PLACEHOLDERS.inlineBranch)
    validatePlaceholderNode(schema, PLACEHOLDERS.inlineLeaf)
}

function validatePlaceholderMark(
    schema: Schema,
    placeholder: { name: string; spec: MarkSpec },
): void {
    const { name, spec } = placeholder
    const type = schema.marks[name]
    if (type == null) return
    const key = `spec.marks.${name}`

    validatePlaceholderAttrs(type.spec.attrs, schema, `${key}.attrs`)

    if (type.spec.excludes !== spec.excludes)
        throw createInvalidEntityError(
            'ProseMirrorSchema',
            { spec: schema.spec },
            `${key}.excludes`,
        )
}

function validatePlaceholderNode(
    schema: Schema,
    placeholder: { name: string; spec: NodeSpec },
): void {
    const { name, spec } = placeholder
    const type = schema.nodes[name]
    if (type == null) return
    const key = `spec.nodes.${name}`

    validatePlaceholderAttrs(type.spec.attrs, schema, `${key}.attrs`)

    if (type.spec.inline !== spec.inline)
        throw createInvalidEntityError(
            'ProseMirrorSchema',
            { spec: schema.spec },
            `${key}.inline`,
        )
    if (type.spec.content !== spec.content)
        throw createInvalidEntityError(
            'ProseMirrorSchema',
            { spec: schema.spec },
            `${key}.content`,
        )

    if (type.spec.marks !== spec.marks)
        throw createInvalidEntityError(
            'ProseMirrorSchema',
            { spec: schema.spec },
            `${key}.marks`,
        )
}

function validatePlaceholderAttrs(
    attrs: { [key: string]: AttributeSpec } | null | undefined,
    schema: Schema,
    key: string,
): void {
    if (!attrs)
        throw createInvalidEntityError(
            'ProseMirrorSchema',
            { spec: schema.spec },
            key,
        )
    if (!attrs.name)
        throw createInvalidEntityError(
            'ProseMirrorSchema',
            { spec: schema.spec },
            `${key}.name`,
        )
    if (!attrs.attrs)
        throw createInvalidEntityError(
            'ProseMirrorSchema',
            { spec: schema.spec },
            `${key}.attrs`,
        )
    const names = Object.keys(attrs)
    if (names.length !== 2) {
        for (const name of names) {
            if (name !== 'name' && name !== 'attrs') {
                throw createInvalidEntityError(
                    'ProseMirrorSchema',
                    { spec: schema.spec },
                    `${key}.${name}`,
                )
            }
        }
    }
}
