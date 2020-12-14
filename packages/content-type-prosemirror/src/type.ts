import {
    ContentType,
    Operation,
    Snapshot,
    Schema,
    SchemaKey,
} from '@syncot/content'
import {
    assert,
    createInvalidEntityError,
    throwError,
    validate,
    Validator,
} from '@syncot/util'
import OrderedMap from 'orderedmap'
import {
    ContentMatch,
    MarkSpec,
    Node,
    NodeSpec,
    NodeType,
    Schema as ProseMirrorSchema,
} from 'prosemirror-model'
import { Step } from 'prosemirror-transform'

/**
 * Creates a ContentType instance supporting ProseMirror.
 */
export function createContentType(): ContentType {
    return new ProseMirrorContentType()
}

export class ProseMirrorContentType implements ContentType {
    private readonly registeredSchemas: Map<
        SchemaKey,
        ProseMirrorSchema
    > = new Map()

    public validateSchema: Validator<Schema> = validate([
        (schema) =>
            typeof schema === 'object' && schema != null
                ? undefined
                : createInvalidEntityError('Schema', schema, null),
        (schema) =>
            typeof schema.data === 'object' && schema.data != null
                ? undefined
                : createInvalidEntityError('Schema', schema, 'data'),
        (schema) =>
            typeof schema.data.topNode === 'string' ||
            schema.data.topNode == null
                ? undefined
                : createInvalidEntityError('Schema', schema, 'data.topNode'),
        (schema) => {
            const { nodes } = schema.data
            if (!Array.isArray(nodes)) {
                return createInvalidEntityError('Schema', schema, 'data.nodes')
            }
            if (nodes.length % 2 !== 0) {
                return createInvalidEntityError(
                    'Schema',
                    schema,
                    'data.nodes.length',
                )
            }
            for (let i = 0; i < nodes.length; i += 2) {
                const nameIndex = i
                const specIndex = i + 1
                const name = nodes[nameIndex]
                const spec = nodes[specIndex]
                if (typeof name !== 'string') {
                    return createInvalidEntityError(
                        'Schema',
                        schema,
                        `data.nodes.${nameIndex}`,
                    )
                }
                if (typeof spec !== 'object' || spec == null) {
                    return createInvalidEntityError(
                        'Schema',
                        schema,
                        `data.nodes.${specIndex}`,
                    )
                }
            }
            return undefined
        },
        (schema) => {
            const { marks } = schema.data
            if (!Array.isArray(marks)) {
                return createInvalidEntityError('Schema', schema, 'data.marks')
            }
            if (marks.length % 2 !== 0) {
                return createInvalidEntityError(
                    'Schema',
                    schema,
                    'data.marks.length',
                )
            }
            for (let i = 0; i < marks.length; i += 2) {
                const nameIndex = i
                const specIndex = i + 1
                const name = marks[nameIndex]
                const spec = marks[specIndex]
                if (typeof name !== 'string') {
                    return createInvalidEntityError(
                        'Schema',
                        schema,
                        `data.marks.${nameIndex}`,
                    )
                }
                if (typeof spec !== 'object' || spec == null) {
                    return createInvalidEntityError(
                        'Schema',
                        schema,
                        `data.marks.${specIndex}`,
                    )
                }
            }
            return undefined
        },
        (schema) => {
            try {
                createProseMirrorSchema(schema)
                return undefined
            } catch (error) {
                return createInvalidEntityError('Schema', schema, 'data', error)
            }
        },
    ])

    public registerSchema(schema: Schema): void {
        if (this.registeredSchemas.has(schema.key)) return
        this.registeredSchemas.set(schema.key, createProseMirrorSchema(schema))
    }

    public apply(snapshot: Snapshot | null, operation: Operation): Snapshot {
        const schema = this.registeredSchemas.get(operation.schema)!
        assert(schema, 'operation.schema is not registered.')

        if (snapshot == null) {
            assert(
                operation.version === 1,
                'operation.version must equal to 1.',
            )
            assert(
                operation.data != null,
                'operation.data must contain the initial content.',
            )
            return {
                key: operation.key,
                type: operation.type,
                id: operation.id,
                version: operation.version,
                schema: operation.schema,
                data: operation.data,
                meta: operation.meta,
            }
        }

        assert(
            operation.type === snapshot.type,
            'operation.type must equal to snapshot.type.',
        )
        assert(
            operation.id === snapshot.id,
            'operation.id must equal to snapshot.id.',
        )
        assert(
            operation.version === snapshot.version + 1,
            'operation.version must equal to snapshot.version + 1.',
        )

        if (operation.schema !== snapshot.schema) {
            assert(operation.data == null, 'operation.data must be null.')
            return {
                key: operation.key,
                type: operation.type,
                id: operation.id,
                version: operation.version,
                schema: operation.schema,
                data: snapshot.data,
                meta: operation.meta,
            }
        }

        assert(operation.data != null, 'operation.data must not be null.')
        let doc = Node.fromJSON(schema, snapshot.data)
        for (const stepJson of operation.data) {
            const step = Step.fromJSON(schema, stepJson)
            const result = step.apply(doc)
            if (result.doc) {
                doc = result.doc
            } else {
                /* istanbul ignore next */
                const message = result.failed || 'Failed to apply a step.'
                throw new Error(message)
            }
        }
        return {
            key: operation.key,
            type: operation.type,
            id: operation.id,
            version: operation.version,
            schema: operation.schema,
            data: doc.toJSON(),
            meta: operation.meta,
        }
    }
}

/**
 * Creates a ProseMirror schema from a SyncOT schema.
 */
export function createProseMirrorSchema(schema: Schema): ProseMirrorSchema {
    // Prepare a schema spec.
    const { nodes: rawNodes, marks: rawMarks, topNode } = schema.data

    let nodes = OrderedMap.from<NodeSpec>()
    for (let i = 0; i < rawNodes.length; i += 2) {
        nodes = nodes.addToEnd(rawNodes[i], rawNodes[i + 1])
    }

    let marks = OrderedMap.from<MarkSpec>()
    for (let i = 0; i < rawMarks.length; i += 2) {
        marks = marks.addToEnd(rawMarks[i], rawMarks[i + 1])
    }

    // Create a schema.
    const proseMirrorSchema = new ProseMirrorSchema({
        nodes,
        marks,
        topNode,
    })

    // Validate the schema.
    throwError(validateProseMirrorSchema(proseMirrorSchema))

    return proseMirrorSchema
}

/**
 * Validates a ProseMirror schema.
 */
function validateProseMirrorSchema(
    schema: ProseMirrorSchema,
): Error | undefined {
    // Check if the required content would cause a stack overflow when filling nodes.
    for (const type of Object.values(schema.nodes)) {
        const cycle = findCycle(type, [])
        if (cycle) {
            const cycleString = cycle
                .map((cycleType) => cycleType.name)
                .join(' -> ')
            return new SyntaxError(
                `A cycle of nodes in required positions (see https://prosemirror.net/docs/guide/#schema.content_expressions) (${cycleString})`,
            )
        }
    }

    return undefined
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
