import {
    ContentType,
    Operation,
    Snapshot,
    Schema,
    SchemaHash,
    minVersion,
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
    private readonly schemas: Map<SchemaHash, ProseMirrorSchema> = new Map()
    private readonly nodes: WeakMap<Snapshot, Node> = new WeakMap()
    private readonly steps: WeakMap<Operation, Step[]> = new WeakMap()

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
        if (this.schemas.has(schema.hash)) return
        this.schemas.set(schema.hash, createProseMirrorSchema(schema))
    }

    public hasSchema(hash: SchemaHash): boolean {
        return this.schemas.has(hash)
    }

    public apply(snapshot: Snapshot, operation: Operation): Snapshot {
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
        const schema = this.schemas.get(operation.schema)!
        assert(schema, 'operation.schema is not registered.')

        if (snapshot.version === minVersion) {
            const node = this.getNode(operation)
            const newSnapshot: Snapshot = {
                key: operation.key,
                type: operation.type,
                id: operation.id,
                version: operation.version,
                schema: operation.schema,
                get data() {
                    const data = node.toJSON()
                    // Cache the data.
                    Object.defineProperty(this, 'data', {
                        value: data,
                        enumerable: true,
                        configurable: true,
                    })
                    return data
                },
                meta: operation.meta,
            }
            this.nodes.set(newSnapshot, node)
            return newSnapshot
        }

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

        {
            let node = this.getNode(snapshot)
            const steps = this.getSteps(operation)
            for (const step of steps) {
                const result = step.apply(node)
                if (result.doc) {
                    node = result.doc
                } else {
                    /* istanbul ignore next */
                    const message = result.failed || 'Failed to apply a step.'
                    throw new Error(message)
                }
            }
            const newSnapshot: Snapshot = {
                key: operation.key,
                type: operation.type,
                id: operation.id,
                version: operation.version,
                schema: operation.schema,
                get data() {
                    const data = node.toJSON()
                    // Cache the data.
                    Object.defineProperty(this, 'data', {
                        value: data,
                        enumerable: true,
                        configurable: true,
                    })
                    return data
                },
                meta: operation.meta,
            }
            this.nodes.set(newSnapshot, node)
            return newSnapshot
        }
    }

    private getSteps(operation: Operation): Step[] {
        let steps = this.steps.get(operation)
        if (!steps) {
            const schema = this.schemas.get(operation.schema)!
            const jsonSteps = operation.data as any[]
            steps = new Array(jsonSteps.length)
            for (let i = 0; i < jsonSteps.length; i++) {
                steps[i] = Step.fromJSON(schema, jsonSteps[i])
            }
            this.steps.set(operation, steps)
        }
        return steps
    }

    private getNode(entity: Snapshot | Operation): Node {
        let node = this.nodes.get(entity)
        if (!node) {
            const schema = this.schemas.get(entity.schema)!
            const jsonNode = entity.data
            node = Node.fromJSON(schema, jsonNode)
            this.nodes.set(entity, node)
        }
        return node
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
