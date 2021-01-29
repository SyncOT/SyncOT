import {
    ContentType,
    Operation,
    Snapshot,
    Schema,
    SchemaHash,
    minVersion,
} from '@syncot/content'
import { assert, createInvalidEntityError } from '@syncot/util'
import { Node, Schema as ProseMirrorSchema } from 'prosemirror-model'
import { Step } from 'prosemirror-transform'
import { equalShape, fromSyncOTSchema } from './schema'

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

    public validateSchema(schema: Schema): Schema {
        if (schema == null || typeof schema !== 'object')
            throw createInvalidEntityError('Schema', schema, null)

        if (schema.data == null || typeof schema.data !== 'object')
            throw createInvalidEntityError('Schema', schema, 'data')

        if (
            schema.data.topNode != null &&
            typeof schema.data.topNode !== 'string'
        )
            throw createInvalidEntityError('Schema', schema, 'data.topNode')

        {
            const { nodes } = schema.data
            if (!Array.isArray(nodes))
                throw createInvalidEntityError('Schema', schema, 'data.nodes')

            if (nodes.length % 2 !== 0)
                throw createInvalidEntityError(
                    'Schema',
                    schema,
                    'data.nodes.length',
                )

            for (let i = 0; i < nodes.length; i += 2) {
                const nameIndex = i
                const specIndex = i + 1
                const name = nodes[nameIndex]
                const spec = nodes[specIndex]

                if (typeof name !== 'string')
                    throw createInvalidEntityError(
                        'Schema',
                        schema,
                        `data.nodes.${nameIndex}`,
                    )

                if (typeof spec !== 'object' || spec == null)
                    throw createInvalidEntityError(
                        'Schema',
                        schema,
                        `data.nodes.${specIndex}`,
                    )
            }
        }
        {
            const { marks } = schema.data
            if (!Array.isArray(marks))
                throw createInvalidEntityError('Schema', schema, 'data.marks')

            if (marks.length % 2 !== 0)
                throw createInvalidEntityError(
                    'Schema',
                    schema,
                    'data.marks.length',
                )

            for (let i = 0; i < marks.length; i += 2) {
                const nameIndex = i
                const specIndex = i + 1
                const name = marks[nameIndex]
                const spec = marks[specIndex]

                if (typeof name !== 'string')
                    throw createInvalidEntityError(
                        'Schema',
                        schema,
                        `data.marks.${nameIndex}`,
                    )

                if (typeof spec !== 'object' || spec == null)
                    throw createInvalidEntityError(
                        'Schema',
                        schema,
                        `data.marks.${specIndex}`,
                    )
            }
        }

        try {
            fromSyncOTSchema(schema)
        } catch (error) {
            throw createInvalidEntityError('Schema', schema, 'data', error)
        }

        return schema
    }

    public registerSchema(schema: Schema): void {
        if (this.schemas.has(schema.hash)) return
        this.schemas.set(schema.hash, fromSyncOTSchema(schema))
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
        let node: Node

        if (operation.schema !== snapshot.schema) {
            node = this.getNode(operation)
            node.check()
            if (snapshot.version !== minVersion) {
                assert(
                    equalShape(node, this.getNode(snapshot)),
                    'The content "shape" must not change when changing the document schema.',
                )
            }
        } else {
            node = this.getNode(snapshot)
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
            node.check()
        }

        const newSnapshot: Snapshot = {
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
