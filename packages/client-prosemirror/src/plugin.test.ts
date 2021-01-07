/**
 * @jest-environment jsdom
 */
import {
    ContentClient,
    ContentClientEvents,
    createSchemaHash,
    maxVersion,
    minVersion,
    Snapshot,
} from '@syncot/content'
import { SyncOTEmitter, whenNextTick } from '@syncot/util'
import { Schema as EditorSchema, Node } from 'prosemirror-model'
import { EditorState, Plugin } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { Duplex } from 'readable-stream'
import { syncOT } from '.'
import {
    getSchema,
    key,
    PluginState,
    Rebaseable,
    rebaseableStepsFrom,
} from './plugin'

const sessionId = 'test-session'
const userId = 'test-user'
const type = 'test-type'
const id = 'test-id'
let contentClient: MockContentClient
const editorSchema = new EditorSchema({
    nodes: {
        doc: { content: 'text*' },
        text: {},
    },
})
const schema = getSchema(type, editorSchema)
const defaultDoc = editorSchema.topNodeType.createChecked(
    null,
    editorSchema.text('test text'),
)

class MockContentClient
    extends SyncOTEmitter<ContentClientEvents>
    implements ContentClient {
    public active = true
    public sessionId = sessionId
    public userId = userId
    registerSchema = jest.fn(async () => undefined)
    getSchema = jest.fn(async () => Promise.resolve(null))
    getSnapshot = jest.fn<Promise<Snapshot>, [string, string, number?]>(
        async (snapshotType, snapshotId) => ({
            key: '',
            type: snapshotType,
            id: snapshotId,
            version: 0,
            schema: '',
            data: null,
            meta: null,
        }),
    )
    submitOperation = jest.fn(async () => undefined)
    streamOperations = jest.fn(
        async () =>
            new Duplex({
                read() {
                    // Do nothing.
                },
            }),
    )
}

beforeEach(() => {
    contentClient = new MockContentClient()
})

describe('syncOT', () => {
    test('invalid type', () => {
        expect(() => syncOT({ type: 5 as any, id, contentClient })).toThrow(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: 'Argument "type" must be a string.',
            }),
        )
    })
    test('invalid id', () => {
        expect(() => syncOT({ type, id: 5 as any, contentClient })).toThrow(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: 'Argument "id" must be a string.',
            }),
        )
    })
    test('invalid onError', () => {
        expect(() =>
            syncOT({ type, id, contentClient, onError: 5 as any }),
        ).toThrow(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: 'Argument "onError" must be a function or undefined.',
            }),
        )
    })
    test('invalid contentClient (null)', () => {
        expect(() => syncOT({ type, id, contentClient: null as any })).toThrow(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: 'Argument "contentClient" must be an object.',
            }),
        )
    })
    test('invalid contentClient (number)', () => {
        expect(() => syncOT({ type, id, contentClient: 5 as any })).toThrow(
            expect.objectContaining({
                name: 'SyncOTError Assert',
                message: 'Argument "contentClient" must be an object.',
            }),
        )
    })
    test('key', () => {
        const plugin = syncOT({ type, id, contentClient })
        expect(plugin.spec.key).toBe(key)
    })
    test('historyPreserveItems', () => {
        const plugin = syncOT({ type, id, contentClient })
        expect((plugin.spec as any).historyPreserveItems).toBe(true)
    })
    test('editable', () => {
        const plugin = syncOT({ type, id, contentClient })
        const state = EditorState.create({
            schema: editorSchema,
            plugins: [plugin],
        })
        expect(plugin.props.editable!.call(plugin, state)).toBe(false)
        const stateWithVersion = state.apply(
            state.tr.setMeta(key, {
                ...key.getState(state),
                version: 1,
            }),
        )
        expect(plugin.props.editable!.call(plugin, stateWithVersion)).toBe(true)
    })
    describe('state', () => {
        let plugin: Plugin
        let state: EditorState
        let pluginState: PluginState

        beforeEach(() => {
            plugin = syncOT({ type, id, contentClient })
            state = EditorState.create({
                schema: editorSchema,
                plugins: [plugin],
            })
            pluginState = key.getState(state)!
        })

        test('init', () => {
            expect(key.getState(state)).toStrictEqual({
                type,
                id,
                version: -1,
                pendingSteps: [],
            })
        })

        describe('apply', () => {
            test('new plugin state in meta', () => {
                const newPluginState = {
                    ...pluginState,
                    version: 1,
                }
                const newState = state.apply(
                    state.tr.setMeta(key, newPluginState),
                )
                expect(key.getState(newState)).toBe(newPluginState)
            })
            test('content not changed', () => {
                const newState = state.apply(
                    state.tr.setMeta('test-key', { some: 'value' }),
                )
                expect(key.getState(newState)).toBe(pluginState)
            })
            test('content changed', () => {
                const tr = state.tr.insertText('test', 0, 0)
                const newState = state.apply(tr)
                const newPluginState = key.getState(newState)
                expect(newPluginState).toStrictEqual({
                    ...pluginState,
                    pendingSteps: [
                        new Rebaseable(
                            tr.steps[0],
                            tr.steps[0].invert(tr.docs[0]),
                            undefined,
                        ),
                    ],
                })
            })
        })
    })

    describe('view', () => {
        const views: EditorView[] = []
        function createView({
            onError,
            doc = defaultDoc,
        }: {
            onError?: (error: Error) => void
            doc?: Node
        } = {}): EditorView {
            const view = new EditorView(undefined, {
                state: EditorState.create({
                    doc,
                    plugins: [
                        syncOT({
                            type,
                            id,
                            contentClient,
                            onError,
                        }),
                    ],
                }),
            })
            views.push(view)
            return view
        }
        afterEach(() => {
            for (const view of views) {
                view.destroy()
            }
            views.length = 0
        })

        test('destroy non-initialized', async () => {
            const view = createView()
            view.destroy()
            await whenNextTick()
            expect(contentClient.getSnapshot).toHaveBeenCalledTimes(0)
            expect(contentClient.streamOperations).toHaveBeenCalledTimes(0)
        })

        test('destroy initialized', async () => {
            const view = createView()
            await whenNextTick()
            expect(contentClient.getSnapshot).toHaveBeenCalledTimes(1)
            expect(contentClient.streamOperations).toHaveBeenCalledTimes(1)
            const stream: Duplex = await contentClient.streamOperations.mock
                .results[0].value
            expect(stream.destroyed).toBe(false)
            await whenNextTick()
            expect(stream.destroyed).toBe(false)
            view.destroy()
            await whenNextTick()
            expect(stream.destroyed).toBe(true)
        })

        test('init with a new document', async () => {
            const view = createView()

            // Verify the initial state.
            expect(contentClient.getSnapshot).toHaveBeenCalledTimes(0)
            expect(contentClient.streamOperations).toHaveBeenCalledTimes(0)
            expect(key.getState(view.state)).toStrictEqual({
                type,
                id,
                version: -1,
                pendingSteps: [],
            })
            expect(view.state.doc.toJSON()).toStrictEqual(defaultDoc.toJSON())

            // Verify the new state.
            await whenNextTick()
            expect(key.getState(view.state)).toStrictEqual({
                type,
                id,
                version: 1,
                pendingSteps: [],
            })
            expect(view.state.doc.toJSON()).toStrictEqual(defaultDoc.toJSON())

            // Verify contentClient usage.
            expect(contentClient.getSnapshot).toHaveBeenCalledTimes(1)
            expect(contentClient.getSnapshot).toHaveBeenCalledWith(
                type,
                id,
                maxVersion,
            )

            expect(contentClient.registerSchema).toHaveBeenCalledTimes(1)
            expect(contentClient.registerSchema).toHaveBeenCalledWith(schema)

            expect(contentClient.submitOperation).toHaveBeenCalledTimes(1)
            expect(contentClient.submitOperation).toHaveBeenCalledWith(
                expect.objectContaining({
                    key: expect.toBeString(),
                    type,
                    id,
                    version: minVersion + 1,
                    schema: schema.hash,
                    data: defaultDoc.toJSON(),
                    meta: null,
                }),
            )

            expect(contentClient.streamOperations).toHaveBeenCalledTimes(1)
            expect(contentClient.streamOperations).toHaveBeenCalledWith(
                type,
                id,
                minVersion + 2,
                maxVersion + 1,
            )
        })

        test('init with an existing document', async () => {
            const initialDoc = editorSchema.topNodeType.createChecked(
                null,
                editorSchema.text('content which will be overridden'),
            )
            const view = createView({ doc: initialDoc })
            contentClient.getSnapshot.mockImplementationOnce(
                async (snapshotType, snapshotId) => ({
                    key: 'key-1',
                    type: snapshotType,
                    id: snapshotId,
                    version: minVersion + 3,
                    schema: schema.hash,
                    data: defaultDoc.toJSON(),
                    meta: null,
                }),
            )

            // Verify the initial state.
            expect(contentClient.getSnapshot).toHaveBeenCalledTimes(0)
            expect(contentClient.streamOperations).toHaveBeenCalledTimes(0)
            expect(key.getState(view.state)).toStrictEqual({
                type,
                id,
                version: minVersion - 1,
                pendingSteps: [],
            })
            expect(view.state.doc.toJSON()).toStrictEqual(initialDoc.toJSON())

            // Verify the new state.
            await whenNextTick()
            expect(key.getState(view.state)).toStrictEqual({
                type,
                id,
                version: minVersion + 3,
                pendingSteps: [],
            })
            expect(view.state.doc.toJSON()).toStrictEqual(defaultDoc.toJSON())

            // Verify contentClient usage.
            expect(contentClient.getSnapshot).toHaveBeenCalledTimes(1)
            expect(contentClient.getSnapshot).toHaveBeenCalledWith(
                type,
                id,
                maxVersion,
            )

            expect(contentClient.registerSchema).toHaveBeenCalledTimes(0)

            expect(contentClient.submitOperation).toHaveBeenCalledTimes(0)

            expect(contentClient.streamOperations).toHaveBeenCalledTimes(1)
            expect(contentClient.streamOperations).toHaveBeenCalledWith(
                type,
                id,
                minVersion + 4,
                maxVersion + 1,
            )
        })

        test.skip.each<
            [
                () => {
                    serverInitialDoc: Node
                    clientInitialDoc: Node
                },
            ]
        >([
            [
                () => {
                    const serverEditorSchema = new EditorSchema({
                        nodes: {
                            doc: { content: 'block+' },
                            paragraph: {
                                group: 'block',
                                content: 'text*',
                                toDOM() {
                                    return ['p', 0]
                                },
                            },
                            text: {},
                        },
                    })
                    const serverInitialDoc = serverEditorSchema.topNodeType.createChecked(
                        null,
                        serverEditorSchema.node('paragraph', undefined, [
                            serverEditorSchema.text(
                                'content which will be overridden',
                            ),
                        ]),
                    )
                    const clientEditorSchema = new EditorSchema({
                        nodes: {
                            doc: { content: 'block+' },
                            paragraph: {
                                group: 'block',
                                content: 'text*',
                                toDOM() {
                                    return ['p', 0]
                                },
                            },
                            blockquote: {
                                group: 'block',
                                content: 'block+',
                                toDOM() {
                                    return ['blockquote', 0]
                                },
                            },
                            text: {},
                        },
                    })
                    const clientInitialDoc = clientEditorSchema.topNodeType.createChecked(
                        null,
                        clientEditorSchema.node('paragraph', undefined, [
                            clientEditorSchema.text(
                                'content which will be overridden',
                            ),
                        ]),
                    )
                    return {
                        serverInitialDoc,
                        clientInitialDoc,
                    }
                },
            ],
        ])('init with a mismatched schema', async (getConfig) => {
            const { serverInitialDoc, clientInitialDoc } = getConfig()
            const serverEditorSchema = serverInitialDoc.type.schema
            const serverSchema = getSchema(type, serverEditorSchema)
            const clientEditorSchema = clientInitialDoc.type.schema
            // const clientSchema = getSchema(type, clientEditorSchema)
            const view = createView({ doc: clientInitialDoc })
            contentClient.getSnapshot.mockImplementationOnce(
                async (snapshotType, snapshotId) => ({
                    key: 'key-1',
                    type: snapshotType,
                    id: snapshotId,
                    version: minVersion + 3,
                    schema: serverSchema.hash,
                    data: serverInitialDoc.toJSON(),
                    meta: null,
                }),
            )

            // Verify the initial state.
            expect(contentClient.getSnapshot).toHaveBeenCalledTimes(0)
            expect(contentClient.streamOperations).toHaveBeenCalledTimes(0)
            expect(key.getState(view.state)).toStrictEqual({
                type,
                id,
                version: minVersion - 1,
                pendingSteps: [],
            })
            expect(view.state.doc.toJSON()).toStrictEqual(
                clientInitialDoc.toJSON(),
            )

            // Verify the new state.
            await whenNextTick()
            expect(key.getState(view.state)).toStrictEqual({
                type,
                id,
                version: minVersion + 3,
                pendingSteps: [],
            })
            expect(view.state.schema).toBe(clientEditorSchema)
            expect(view.state.doc.toJSON()).toStrictEqual(
                serverInitialDoc.toJSON(),
            )

            // // Verify contentClient usage.
            // expect(contentClient.getSnapshot).toHaveBeenCalledTimes(1)
            // expect(contentClient.getSnapshot).toHaveBeenCalledWith(
            //     type,
            //     id,
            //     maxVersion,
            // )

            // expect(contentClient.registerSchema).toHaveBeenCalledTimes(0)

            // expect(contentClient.submitOperation).toHaveBeenCalledTimes(0)

            // expect(contentClient.streamOperations).toHaveBeenCalledTimes(1)
            // expect(contentClient.streamOperations).toHaveBeenCalledWith(
            //     type,
            //     id,
            //     minVersion + 4,
            //     maxVersion + 1,
            // )
        })
    })
})

describe('rebaseableStepsFrom', () => {
    let state: EditorState

    beforeEach(() => {
        state = EditorState.create({
            schema: editorSchema,
        })
    })

    test('no steps', () => {
        const tr = state.tr
        expect(rebaseableStepsFrom(tr)).toStrictEqual([])
    })

    test('some steps', () => {
        const tr = state.tr.insertText('some test text', 0, 0).replace(4, 9)
        expect(tr.steps.length).toBe(2)
        expect(rebaseableStepsFrom(tr)).toStrictEqual(
            tr.steps.map(
                (step, index) =>
                    new Rebaseable(
                        step,
                        step.invert(tr.docs[index]),
                        undefined,
                    ),
            ),
        )
    })
})

describe('getSchema', () => {
    test('create a schema', () => {
        const editorSchema1 = new EditorSchema({
            nodes: {
                doc: { content: 'p+' },
                p: { content: 'text*' },
                text: {},
            },
            marks: {
                bold: {},
                color: { colorCode: 'red' },
            },
            topNode: 'doc',
        })
        const schema1 = getSchema(type, editorSchema1)
        expect(schema1.type).toBe(type)
        expect(schema1.meta).toBe(null)
        expect(schema1.data).toStrictEqual({
            nodes: [
                'doc',
                { content: 'p+' },
                'p',
                { content: 'text*' },
                'text',
                {},
            ],
            marks: ['bold', {}, 'color', { colorCode: 'red' }],
            topNode: 'doc',
        })
        expect(schema1.hash).toBe(createSchemaHash(schema1.type, schema1.data))
    })
    describe('caching', () => {
        test('the same editor schema and the same type', () => {
            const schema1 = getSchema(type, editorSchema)
            const schema2 = getSchema(type, editorSchema)
            expect(schema2).toBe(schema1)
        })
        test('the same editor schema and different type', () => {
            const schema1 = getSchema(type, editorSchema)
            const schema2 = getSchema(type + '-2', editorSchema)
            expect(schema2).not.toBe(schema1)
        })
        test('different editor schema and the same type', () => {
            const editorSchema1 = new EditorSchema({
                nodes: {
                    doc: { content: 'text*' },
                    text: {},
                },
            })
            const editorSchema2 = new EditorSchema({
                nodes: {
                    doc: { content: 'text*' },
                    text: {},
                },
            })
            const schema1 = getSchema(type, editorSchema1)
            const schema2 = getSchema(type + '-2', editorSchema2)
            expect(schema2).not.toBe(schema1)
        })
        test('different editor schema and different type', () => {
            const editorSchema1 = new EditorSchema({
                nodes: {
                    doc: { content: 'text*' },
                    text: {},
                },
            })
            const editorSchema2 = new EditorSchema({
                nodes: {
                    doc: { content: 'text*' },
                    text: {},
                },
            })
            const schema1 = getSchema(type, editorSchema1)
            const schema2 = getSchema(type + '-2', editorSchema2)
            expect(schema2).not.toBe(schema1)
        })
    })
})
