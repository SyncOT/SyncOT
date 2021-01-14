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

/**
 * Checks if the specified ProseMirror Schema is compatible with SyncOT.
 * Throws validation errors.
 * Returns the validated schema.
 */
export function validateSchema(schema: Schema): Schema {
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
            schema,
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
            schema,
            `${key}.attrs`,
        )
    }
    // tslint:disable-next-line:forin
    for (const name in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, name))
            throw createInvalidEntityError(
                'ProseMirrorSchema',
                schema,
                `${key}.attrs.${name}`,
            )

        const attr = attrs[name]
        if (attr == null || typeof attr !== 'object')
            throw createInvalidEntityError(
                'ProseMirrorSchema',
                schema,
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
                    schema,
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
            schema,
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
            schema,
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
            schema,
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
            schema,
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
            schema,
            `${key}.excludes`,
        )
}
