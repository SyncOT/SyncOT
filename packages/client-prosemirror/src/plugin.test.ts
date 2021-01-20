/**
 * @jest-environment jsdom
 */
import {
    ContentClient,
    ContentClientEvents,
    createAlreadyExistsError,
    maxVersion,
    minVersion,
    Operation,
    Schema,
    Snapshot,
} from '@syncot/content'
import {
    PlaceholderNames,
    toSyncOTSchema,
} from '@syncot/content-type-prosemirror'
import { createId, noop, SyncOTEmitter, whenNextTick } from '@syncot/util'
import {
    Fragment,
    Node,
    Schema as EditorSchema,
    Slice,
} from 'prosemirror-model'
import { EditorState, Plugin } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { Duplex } from 'readable-stream'
import { syncOT } from '.'
import { key, PluginState, Rebaseable, rebaseableStepsFrom } from './plugin'

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
const schema = toSyncOTSchema(type, editorSchema)
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
    getSchema = jest.fn<Promise<Schema | null>, [string]>(async () =>
        Promise.resolve(null),
    )
    getSnapshot = jest.fn<Promise<Snapshot>, [string, string, number?]>(
        async (snapshotType, snapshotId) => ({
            type: snapshotType,
            id: snapshotId,
            version: minVersion,
            schema: '',
            data: null,
            meta: null,
        }),
    )
    submitOperation = jest.fn<Promise<undefined>, [Operation]>(
        async () => undefined,
    )
    streamOperations = jest.fn(
        async () =>
            new Duplex({
                objectMode: true,
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
            state.tr.setMeta(key, new PluginState(minVersion + 1, [])),
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
            expect(key.getState(state)).toStrictEqual(
                new PluginState(minVersion, []),
            )
        })

        describe('apply', () => {
            test('new plugin state in meta', () => {
                const newPluginState = new PluginState(minVersion + 1, [])
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
                expect(newPluginState).toStrictEqual(
                    new PluginState(minVersion, [
                        new Rebaseable(
                            tr.steps[0],
                            tr.steps[0].invert(tr.docs[0]),
                            undefined,
                        ),
                    ]),
                )
            })
        })
    })

    describe('view', () => {
        const views: EditorView[] = []
        function createView({
            onError,
            doc = defaultDoc,
            state,
        }: {
            onError?: (error: Error) => void
            doc?: Node
            state?: EditorState
        } = {}): EditorView {
            const view = new EditorView(undefined, {
                state:
                    state ||
                    EditorState.create({
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

        test('destroy during state initialization', async () => {
            const initialDoc = editorSchema.topNodeType.createChecked(
                null,
                editorSchema.text('content which will be overridden'),
            )
            const view = createView({ doc: initialDoc })
            let resolveLoadSnapshot = noop
            const loadSnapshotPromise = new Promise<Snapshot>(
                (resolve) =>
                    (resolveLoadSnapshot = () =>
                        resolve({
                            type,
                            id,
                            version: minVersion + 3,
                            schema: schema.hash,
                            data: defaultDoc.toJSON(),
                            meta: null,
                        })),
            )
            contentClient.getSnapshot.mockImplementationOnce(
                () => loadSnapshotPromise,
            )

            // Verify the initial state.
            expect(contentClient.getSnapshot).toHaveBeenCalledTimes(0)
            expect(contentClient.streamOperations).toHaveBeenCalledTimes(0)
            expect(contentClient.registerSchema).toHaveBeenCalledTimes(0)
            expect(contentClient.submitOperation).toHaveBeenCalledTimes(0)
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion, []),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(initialDoc.toJSON())

            // Verify the state has not changed while waiting for the snapshot.
            await whenNextTick()
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion, []),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(initialDoc.toJSON())

            // Destroy the view during initialization.
            view.destroy()
            resolveLoadSnapshot()
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion, []),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(initialDoc.toJSON())

            // Verify the new state.
            await whenNextTick()
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion, []),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(initialDoc.toJSON())

            // Verify contentClient usage.
            expect(contentClient.getSnapshot).toHaveBeenCalledTimes(1)
            expect(contentClient.getSnapshot).toHaveBeenCalledWith(
                type,
                id,
                maxVersion,
            )
            expect(contentClient.registerSchema).toHaveBeenCalledTimes(0)
            expect(contentClient.submitOperation).toHaveBeenCalledTimes(0)
            expect(contentClient.streamOperations).toHaveBeenCalledTimes(0)
        })

        // Note that "removing" the plugin from the state destroys the plugin view.
        test('remove plugin during state initialization', async () => {
            const initialDoc = editorSchema.topNodeType.createChecked(
                null,
                editorSchema.text('content which will be overridden'),
            )
            const view = createView({ doc: initialDoc })
            let resolveLoadSnapshot = noop
            const loadSnapshotPromise = new Promise<Snapshot>(
                (resolve) =>
                    (resolveLoadSnapshot = () =>
                        resolve({
                            type,
                            id,
                            version: minVersion + 3,
                            schema: schema.hash,
                            data: defaultDoc.toJSON(),
                            meta: null,
                        })),
            )
            contentClient.getSnapshot.mockImplementationOnce(
                () => loadSnapshotPromise,
            )

            // Verify the initial state.
            expect(contentClient.getSnapshot).toHaveBeenCalledTimes(0)
            expect(contentClient.streamOperations).toHaveBeenCalledTimes(0)
            expect(contentClient.registerSchema).toHaveBeenCalledTimes(0)
            expect(contentClient.submitOperation).toHaveBeenCalledTimes(0)
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion, []),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(initialDoc.toJSON())

            // Verify the state has not changed while waiting for the snapshot.
            await whenNextTick()
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion, []),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(initialDoc.toJSON())

            // Remove the plugin during initialization.
            const newState = EditorState.create({ doc: defaultDoc })
            view.updateState(newState)
            resolveLoadSnapshot()
            expect(key.getState(view.state)).toBe(undefined)
            expect(view.state.doc.toJSON()).toStrictEqual(defaultDoc.toJSON())

            // Verify the new state.
            await whenNextTick()
            expect(key.getState(view.state)).toBe(undefined)
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
            expect(contentClient.streamOperations).toHaveBeenCalledTimes(0)
        })

        test('init with a new document', async () => {
            const view = createView()

            // Verify the initial state.
            expect(contentClient.getSnapshot).toHaveBeenCalledTimes(0)
            expect(contentClient.streamOperations).toHaveBeenCalledTimes(0)
            expect(contentClient.registerSchema).toHaveBeenCalledTimes(0)
            expect(contentClient.submitOperation).toHaveBeenCalledTimes(0)
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion, []),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(defaultDoc.toJSON())

            // Verify the new state.
            await whenNextTick()
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion + 1, []),
            )
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
                    meta: {
                        session: sessionId,
                        time: expect.toBeNumber(),
                        user: userId,
                    },
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

        test('init with a new document after resetting "version"', async () => {
            let state = EditorState.create({
                doc: defaultDoc,
                plugins: [syncOT({ type, id, contentClient })],
            })
            state = state.apply(
                state.tr.setMeta(
                    key,
                    new PluginState(minVersion + 3, new Array(0)),
                ),
            )
            const view = createView({ state })

            // Verify the initial state.
            expect(contentClient.getSnapshot).toHaveBeenCalledTimes(0)
            expect(contentClient.streamOperations).toHaveBeenCalledTimes(0)
            expect(contentClient.registerSchema).toHaveBeenCalledTimes(0)
            expect(contentClient.submitOperation).toHaveBeenCalledTimes(0)
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion + 3, []),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(defaultDoc.toJSON())

            // Delay getSnapshot.
            contentClient.getSnapshot.mockImplementationOnce(
                async (snapshotType, snapshotId) => {
                    await whenNextTick()
                    return {
                        type: snapshotType,
                        id: snapshotId,
                        version: 0,
                        schema: '',
                        data: null,
                        meta: null,
                    }
                },
            )

            // Verify the intermediate state.
            await whenNextTick()
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion, []),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(defaultDoc.toJSON())

            // Verify the new state.
            await whenNextTick()
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion + 1, []),
            )
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
                    meta: {
                        session: sessionId,
                        time: expect.toBeNumber(),
                        user: userId,
                    },
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

        test('init with a new document after resetting "pendingSteps"', async () => {
            let state = EditorState.create({
                doc: defaultDoc,
                plugins: [syncOT({ type, id, contentClient })],
            })
            state = state.apply(
                state.tr.setMeta(
                    key,
                    new PluginState(minVersion, new Array(1)),
                ),
            )
            const view = createView({ state })

            // Verify the initial state.
            expect(contentClient.getSnapshot).toHaveBeenCalledTimes(0)
            expect(contentClient.streamOperations).toHaveBeenCalledTimes(0)
            expect(contentClient.registerSchema).toHaveBeenCalledTimes(0)
            expect(contentClient.submitOperation).toHaveBeenCalledTimes(0)
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion, new Array(1)),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(defaultDoc.toJSON())

            // Delay getSnapshot.
            contentClient.getSnapshot.mockImplementationOnce(
                async (snapshotType, snapshotId) => {
                    await whenNextTick()
                    return {
                        type: snapshotType,
                        id: snapshotId,
                        version: 0,
                        schema: '',
                        data: null,
                        meta: null,
                    }
                },
            )

            // Verify the intermediate state.
            await whenNextTick()
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion, []),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(defaultDoc.toJSON())

            // Verify the new state.
            await whenNextTick()
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion + 1, []),
            )
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
                    meta: {
                        session: sessionId,
                        time: expect.toBeNumber(),
                        user: userId,
                    },
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
            expect(contentClient.registerSchema).toHaveBeenCalledTimes(0)
            expect(contentClient.submitOperation).toHaveBeenCalledTimes(0)
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion, []),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(initialDoc.toJSON())

            // Verify the new state.
            await whenNextTick()
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion + 3, []),
            )
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

        test('init with a mismatched schema', async () => {
            const serverEditorSchema = new EditorSchema({
                nodes: {
                    doc: { content: 'block+' },
                    text: {},
                    h: {
                        group: 'block',
                        content: 'text*',
                        toDOM() {
                            return ['h1', 0]
                        },
                    },
                    [PlaceholderNames.blockBranch]: {
                        group: 'block',
                        content: 'text*',
                        attrs: { name: {}, attrs: {} },
                        toDOM() {
                            return ['placeholder-block-branch', 0]
                        },
                    },
                    p: {
                        group: 'block',
                        content: 'text*',
                        toDOM() {
                            return ['p', 0]
                        },
                    },
                },
            })
            const serverSchema = toSyncOTSchema(type, serverEditorSchema)

            const clientEditorSchema = new EditorSchema({
                nodes: {
                    doc: { content: 'block*' },
                    text: {},
                    h: {
                        group: 'block',
                        content: 'text*',
                        toDOM() {
                            return ['h1', 0]
                        },
                    },
                    [PlaceholderNames.blockBranch]: {
                        group: 'block',
                        content: 'text*',
                        attrs: { name: {}, attrs: {} },
                        toDOM() {
                            return ['placeholder-block-branch', 0]
                        },
                    },
                },
            })
            const clientSchema = toSyncOTSchema(type, clientEditorSchema)

            const serverInitialDoc = serverEditorSchema.nodeFromJSON({
                type: 'doc',
                content: [
                    {
                        type: 'h',
                        content: [
                            {
                                type: 'text',
                                text: 'a heading',
                            },
                        ],
                    },
                    {
                        type: 'p',
                        content: [
                            {
                                type: 'text',
                                text: 'a paragraph',
                            },
                        ],
                    },
                ],
            })
            const serverConvertedDoc = {
                type: 'doc',
                content: [
                    {
                        type: 'h',
                        content: [
                            {
                                type: 'text',
                                text: 'a heading',
                            },
                        ],
                    },
                    {
                        type: PlaceholderNames.blockBranch,
                        attrs: {
                            name: 'p',
                            attrs: {},
                        },
                        content: [
                            {
                                type: 'text',
                                text: 'a paragraph',
                            },
                        ],
                    },
                ],
            }
            const clientInitialDoc = clientEditorSchema.nodeFromJSON({
                type: 'doc',
                content: [
                    {
                        type: 'h',
                        content: [
                            {
                                type: 'text',
                                text: 'this whole document will be overridden',
                            },
                        ],
                    },
                ],
            })

            const view = createView({ doc: clientInitialDoc })

            contentClient.getSnapshot.mockImplementationOnce(
                async (snapshotType, snapshotId) => ({
                    type: snapshotType,
                    id: snapshotId,
                    version: minVersion + 3,
                    schema: serverSchema.hash,
                    data: serverInitialDoc.toJSON(),
                    meta: {
                        session: sessionId,
                        time: Date.now() - 1000,
                        user: userId,
                    },
                }),
            )
            contentClient.getSchema.mockImplementationOnce(
                async () => serverSchema,
            )

            // Verify the initial state.
            expect(contentClient.getSnapshot).toHaveBeenCalledTimes(0)
            expect(contentClient.streamOperations).toHaveBeenCalledTimes(0)
            expect(contentClient.registerSchema).toHaveBeenCalledTimes(0)
            expect(contentClient.submitOperation).toHaveBeenCalledTimes(0)
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion, []),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(
                clientInitialDoc.toJSON(),
            )

            // Verify the new state.
            await whenNextTick()
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion + 4, []),
            )
            expect(view.state.schema).toBe(clientEditorSchema)
            expect(view.state.doc.toJSON()).toEqual(serverConvertedDoc)

            // Verify contentClient usage.
            expect(contentClient.getSnapshot).toHaveBeenCalledTimes(1)
            expect(contentClient.getSnapshot).toHaveBeenCalledWith(
                type,
                id,
                maxVersion,
            )

            expect(contentClient.registerSchema).toHaveBeenCalledTimes(1)
            expect(contentClient.registerSchema).toHaveBeenCalledWith(
                clientSchema,
            )

            expect(contentClient.submitOperation).toHaveBeenCalledTimes(1)
            expect(contentClient.submitOperation).toHaveBeenCalledWith(
                expect.objectContaining({
                    key: expect.toBeString(),
                    type,
                    id,
                    version: minVersion + 4,
                    schema: clientSchema.hash,
                    data: serverConvertedDoc,
                    meta: {
                        session: sessionId,
                        time: expect.toBeNumber(),
                        user: userId,
                    },
                }),
            )

            expect(contentClient.streamOperations).toHaveBeenCalledTimes(1)
            expect(contentClient.streamOperations).toHaveBeenCalledWith(
                type,
                id,
                minVersion + 5,
                maxVersion + 1,
            )
        })

        test('init with a mismatched incompatible schema', async () => {
            const serverEditorSchema = new EditorSchema({
                nodes: {
                    doc: { content: 'p+' },
                    text: {},
                    p: {
                        content: 'text*',
                        toDOM() {
                            return ['p', 0]
                        },
                    },
                },
            })
            const serverSchema = toSyncOTSchema(type, serverEditorSchema)

            const clientEditorSchema = new EditorSchema({
                nodes: {
                    doc: { content: 'text*' },
                    text: {},
                },
            })

            const serverInitialDoc = serverEditorSchema.nodeFromJSON({
                type: 'doc',
                content: [
                    {
                        type: 'p',
                        content: [
                            {
                                type: 'text',
                                text: 'server content',
                            },
                        ],
                    },
                ],
            })
            const clientInitialDoc = clientEditorSchema.nodeFromJSON({
                type: 'doc',
                content: [
                    {
                        type: 'text',
                        text: 'client content',
                    },
                ],
            })

            const onError = jest.fn()
            const view = createView({ doc: clientInitialDoc, onError })

            contentClient.getSnapshot.mockImplementation(
                async (snapshotType, snapshotId) => ({
                    type: snapshotType,
                    id: snapshotId,
                    version: minVersion + 3,
                    schema: serverSchema.hash,
                    data: serverInitialDoc.toJSON(),
                    meta: {
                        session: sessionId,
                        time: Date.now() - 1000,
                        user: userId,
                    },
                }),
            )
            contentClient.getSchema.mockImplementation(async () => serverSchema)

            // Verify the initial state.
            expect(contentClient.getSnapshot).toHaveBeenCalledTimes(0)
            expect(contentClient.streamOperations).toHaveBeenCalledTimes(0)
            expect(contentClient.registerSchema).toHaveBeenCalledTimes(0)
            expect(contentClient.submitOperation).toHaveBeenCalledTimes(0)
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion, []),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(
                clientInitialDoc.toJSON(),
            )

            // Verify the state has not changed because the schemas are incompatible.
            await whenNextTick()
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion, []),
            )
            expect(view.state.schema).toBe(clientEditorSchema)
            expect(view.state.doc.toJSON()).toEqual(clientInitialDoc.toJSON())

            // Verify contentClient usage.
            expect(contentClient.getSnapshot).toHaveBeenCalledTimes(1)
            expect(contentClient.getSnapshot).toHaveBeenCalledWith(
                type,
                id,
                maxVersion,
            )
            expect(contentClient.registerSchema).toHaveBeenCalledTimes(0)
            expect(contentClient.submitOperation).toHaveBeenCalledTimes(0)
            expect(contentClient.streamOperations).toHaveBeenCalledTimes(0)
            expect(onError).toHaveBeenCalledTimes(1)
            expect(onError).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'SyncOTError SchemaConflict',
                    message:
                        'Failed to convert the existing content to the new schema.',
                }),
            )
        })

        test('init with a mismatched out-of-date schema', async () => {
            const serverEditorSchema = new EditorSchema({
                nodes: {
                    doc: { content: 'block+' },
                    text: {},
                    h: {
                        group: 'block',
                        content: 'text*',
                        toDOM() {
                            return ['h1', 0]
                        },
                    },
                    [PlaceholderNames.blockBranch]: {
                        group: 'block',
                        content: 'text*',
                        attrs: { name: {}, attrs: {} },
                        toDOM() {
                            return ['placeholder-block-branch', 0]
                        },
                    },
                    p: {
                        group: 'block',
                        content: 'text*',
                        toDOM() {
                            return ['p', 0]
                        },
                    },
                },
            })
            const serverSchema = toSyncOTSchema(type, serverEditorSchema)

            const clientEditorSchema = new EditorSchema({
                nodes: {
                    doc: { content: 'block*' },
                    text: {},
                    h: {
                        group: 'block',
                        content: 'text*',
                        toDOM() {
                            return ['h1', 0]
                        },
                    },
                    [PlaceholderNames.blockBranch]: {
                        group: 'block',
                        content: 'text*',
                        attrs: { name: {}, attrs: {} },
                        toDOM() {
                            return ['placeholder-block-branch', 0]
                        },
                    },
                },
            })

            const serverInitialDoc = serverEditorSchema.nodeFromJSON({
                type: 'doc',
                content: [
                    {
                        type: 'h',
                        content: [
                            {
                                type: 'text',
                                text: 'a heading',
                            },
                        ],
                    },
                    {
                        type: 'p',
                        content: [
                            {
                                type: 'text',
                                text: 'a paragraph',
                            },
                        ],
                    },
                ],
            })
            const clientInitialDoc = clientEditorSchema.nodeFromJSON({
                type: 'doc',
                content: [
                    {
                        type: 'h',
                        content: [
                            {
                                type: 'text',
                                text: 'this whole document will be overridden',
                            },
                        ],
                    },
                ],
            })

            const onError = jest.fn()
            const view = createView({ doc: clientInitialDoc, onError })

            contentClient.getSnapshot.mockImplementationOnce(
                async (snapshotType, snapshotId) => ({
                    type: snapshotType,
                    id: snapshotId,
                    version: minVersion + 3,
                    schema: serverSchema.hash,
                    data: serverInitialDoc.toJSON(),
                    meta: {
                        session: sessionId,
                        time: Date.now(),
                        user: userId,
                    },
                }),
            )

            // Verify the initial state.
            expect(contentClient.getSnapshot).toHaveBeenCalledTimes(0)
            expect(contentClient.streamOperations).toHaveBeenCalledTimes(0)
            expect(contentClient.registerSchema).toHaveBeenCalledTimes(0)
            expect(contentClient.submitOperation).toHaveBeenCalledTimes(0)
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion, []),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(
                clientInitialDoc.toJSON(),
            )

            // Verify that the state has not changed.
            await whenNextTick()
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion, []),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(
                clientInitialDoc.toJSON(),
            )
            expect(onError).toHaveBeenCalledTimes(1)
            expect(onError).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'SyncOTError SchemaConflict',
                    message:
                        "Cannot convert the snapshot's schema because the local schema is out of date.",
                }),
            )
            expect(contentClient.getSnapshot).toHaveBeenCalledTimes(1)
            expect(contentClient.getSnapshot).toHaveBeenCalledWith(
                type,
                id,
                maxVersion,
            )
            expect(contentClient.getSchema).toHaveBeenCalledTimes(0)
            expect(contentClient.registerSchema).toHaveBeenCalledTimes(0)
            expect(contentClient.submitOperation).toHaveBeenCalledTimes(0)
            expect(contentClient.streamOperations).toHaveBeenCalledTimes(0)
        })

        test('init with an existing document and change state later', async () => {
            const initialDoc = editorSchema.topNodeType.createChecked(
                null,
                editorSchema.text('content which will be overridden'),
            )
            const view = createView({ doc: initialDoc })
            contentClient.getSnapshot.mockImplementationOnce(
                async (snapshotType, snapshotId) => ({
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
            expect(contentClient.registerSchema).toHaveBeenCalledTimes(0)
            expect(contentClient.submitOperation).toHaveBeenCalledTimes(0)
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion, []),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(initialDoc.toJSON())

            // Verify the new state.
            await whenNextTick()
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion + 3, []),
            )
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

            // Reset mocks.
            const stream: Duplex = await contentClient.streamOperations.mock
                .results[0].value
            contentClient.getSnapshot.mockClear()
            contentClient.registerSchema.mockClear()
            contentClient.submitOperation.mockClear()
            contentClient.streamOperations.mockClear()

            // Update the state.
            view.dispatch(
                view.state.tr.replace(
                    0,
                    view.state.doc.nodeSize - 2,
                    new Slice(
                        Fragment.from(editorSchema.text('some new content')),
                        0,
                        0,
                    ),
                ),
            )
            view.dispatch(
                view.state.tr.setMeta(
                    key,
                    new PluginState(minVersion + 20, []),
                ),
            )
            const newState = view.state
            expect(newState.doc.toJSON()).toEqual({
                type: 'doc',
                content: [
                    {
                        type: 'text',
                        text: 'some new content',
                    },
                ],
            })
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion + 20, []),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(newState.doc.toJSON())
            expect(stream.destroyed).toBe(false)

            // Verify that the state does not change and the old stream is destroyed.
            await whenNextTick()
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion + 20, []),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(newState.doc.toJSON())
            expect(stream.destroyed).toBe(true)

            // Verify contentClient usage.
            expect(contentClient.getSnapshot).toHaveBeenCalledTimes(0)
            expect(contentClient.registerSchema).toHaveBeenCalledTimes(0)
            expect(contentClient.submitOperation).toHaveBeenCalledTimes(0)
            expect(contentClient.streamOperations).toHaveBeenCalledTimes(1)
            expect(contentClient.streamOperations).toHaveBeenCalledWith(
                type,
                id,
                minVersion + 21,
                maxVersion + 1,
            )
        })

        test('init with an existing document once contentClient becomes active', async () => {
            const initialDoc = editorSchema.topNodeType.createChecked(
                null,
                editorSchema.text('content which will be overridden'),
            )
            const view = createView({ doc: initialDoc })
            contentClient.active = false
            contentClient.getSnapshot.mockImplementationOnce(
                async (snapshotType, snapshotId) => ({
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
            expect(contentClient.registerSchema).toHaveBeenCalledTimes(0)
            expect(contentClient.submitOperation).toHaveBeenCalledTimes(0)
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion, []),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(initialDoc.toJSON())

            // Check that the state does not change as contentClient is not active.
            await whenNextTick()
            expect(contentClient.getSnapshot).toHaveBeenCalledTimes(0)
            expect(contentClient.streamOperations).toHaveBeenCalledTimes(0)
            expect(contentClient.registerSchema).toHaveBeenCalledTimes(0)
            expect(contentClient.submitOperation).toHaveBeenCalledTimes(0)
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion, []),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(initialDoc.toJSON())

            // Active contentClient.
            contentClient.active = true
            contentClient.emit('active')

            // Verify the new state.
            await whenNextTick()
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion + 3, []),
            )
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

        test('submit an operation', async () => {
            const initialDoc = editorSchema.topNodeType.createChecked(
                null,
                editorSchema.text('some content'),
            )
            const modifiedDoc = editorSchema.topNodeType.createChecked(
                null,
                editorSchema.text('some new content'),
            )
            const view = createView({ doc: initialDoc })
            await whenNextTick()
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion + 1, []),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(initialDoc.toJSON())
            expect(contentClient.getSnapshot).toHaveBeenCalledTimes(1)
            expect(contentClient.registerSchema).toHaveBeenCalledTimes(1)
            expect(contentClient.submitOperation).toHaveBeenCalledTimes(1)
            expect(contentClient.streamOperations).toHaveBeenCalledTimes(1)
            contentClient.getSnapshot.mockClear()
            contentClient.registerSchema.mockClear()
            contentClient.submitOperation.mockClear()
            contentClient.streamOperations.mockClear()

            // Update the state.
            const tr = view.state.tr.insertText(' new', 4, 4)
            const pendingSteps1 = rebaseableStepsFrom(tr)
            view.dispatch(tr)
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion + 1, pendingSteps1),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(modifiedDoc.toJSON())

            // Verify submitted.
            await whenNextTick()
            const { operationKey } = key.getState(view.state)!.pendingSteps[0]
            expect(operationKey).toBeString()
            const pendingSteps1WithOperationKey = pendingSteps1.map(
                (rebaseable) =>
                    new Rebaseable(
                        rebaseable.step,
                        rebaseable.invertedStep,
                        operationKey,
                    ),
            )
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion + 1, pendingSteps1WithOperationKey),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(modifiedDoc.toJSON())
            expect(contentClient.submitOperation).toHaveBeenCalledTimes(1)
            expect(contentClient.submitOperation).toHaveBeenCalledWith({
                key: operationKey,
                type,
                id,
                version: minVersion + 2,
                schema: schema.hash,
                data: [
                    {
                        stepType: 'replace',
                        from: 4,
                        to: 4,
                        slice: {
                            content: [
                                {
                                    type: 'text',
                                    text: ' new',
                                },
                            ],
                        },
                    },
                ],
                meta: null,
            })
        })

        test('submit an operation containing a subset of pendingSteps', async () => {
            const someContent = editorSchema.topNodeType.createChecked(
                null,
                editorSchema.text('some content'),
            )
            const someNewContent = editorSchema.topNodeType.createChecked(
                null,
                editorSchema.text('some new content'),
            )
            const someMoreNewContent = editorSchema.topNodeType.createChecked(
                null,
                editorSchema.text('some more new content'),
            )
            const error = new Error('test error')
            const onError = jest.fn()
            const view = createView({ doc: someContent, onError })
            await whenNextTick()
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion + 1, []),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(someContent.toJSON())
            expect(contentClient.getSnapshot).toHaveBeenCalledTimes(1)
            expect(contentClient.registerSchema).toHaveBeenCalledTimes(1)
            expect(contentClient.submitOperation).toHaveBeenCalledTimes(1)
            expect(contentClient.streamOperations).toHaveBeenCalledTimes(1)
            contentClient.getSnapshot.mockClear()
            contentClient.registerSchema.mockClear()
            contentClient.submitOperation.mockClear()
            contentClient.streamOperations.mockClear()

            // Add some pendingSteps.
            const tr1 = view.state.tr.insertText(' new', 4, 4)
            const pendingSteps1 = rebaseableStepsFrom(tr1)
            view.dispatch(tr1)
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion + 1, pendingSteps1),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(
                someNewContent.toJSON(),
            )

            // Make submitOperation fail, so that we could add more pendingSteps.
            contentClient.submitOperation.mockRejectedValueOnce(error)

            // Verify submitted.
            await whenNextTick()
            const { operationKey } = key.getState(view.state)!.pendingSteps[0]
            const pendingSteps1WithOperationKey = pendingSteps1.map(
                (rebaseable) =>
                    new Rebaseable(
                        rebaseable.step,
                        rebaseable.invertedStep,
                        operationKey,
                    ),
            )
            expect(operationKey).toBeString()
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion + 1, pendingSteps1WithOperationKey),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(
                someNewContent.toJSON(),
            )
            expect(contentClient.submitOperation).toHaveBeenCalledTimes(1)
            expect(contentClient.submitOperation).toHaveBeenCalledWith({
                key: operationKey,
                type,
                id,
                version: minVersion + 2,
                schema: schema.hash,
                data: [
                    {
                        stepType: 'replace',
                        from: 4,
                        to: 4,
                        slice: {
                            content: [
                                {
                                    type: 'text',
                                    text: ' new',
                                },
                            ],
                        },
                    },
                ],
                meta: null,
            })
            contentClient.submitOperation.mockClear()
            expect(onError).toHaveBeenCalledTimes(1)
            expect(onError).toHaveBeenCalledWith(error)
            onError.mockClear()

            // Add some more pendingSteps.
            const tr2 = view.state.tr.insertText(' more', 4, 4)
            const pendingSteps2 = rebaseableStepsFrom(tr2)
            const pendingStepsAll = pendingSteps1WithOperationKey.concat(
                pendingSteps2,
            )
            view.dispatch(tr2)
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion + 1, pendingStepsAll),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(
                someMoreNewContent.toJSON(),
            )

            // Verify that a subset of pendingSteps is submitted again.
            await whenNextTick()
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion + 1, pendingStepsAll),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(
                someMoreNewContent.toJSON(),
            )
            expect(contentClient.submitOperation).toHaveBeenCalledTimes(1)
            expect(contentClient.submitOperation).toHaveBeenCalledWith({
                key: operationKey,
                type,
                id,
                version: minVersion + 2,
                schema: schema.hash,
                data: [
                    {
                        stepType: 'replace',
                        from: 4,
                        to: 4,
                        slice: {
                            content: [
                                {
                                    type: 'text',
                                    text: ' new',
                                },
                            ],
                        },
                    },
                ],
                meta: null,
            })
            contentClient.submitOperation.mockClear()
            expect(onError).toHaveBeenCalledTimes(0)
        })

        test('submit an operation with operation.key conflict', async () => {
            const someContent = editorSchema.topNodeType.createChecked(
                null,
                editorSchema.text('some content'),
            )
            const someNewContent = editorSchema.topNodeType.createChecked(
                null,
                editorSchema.text('some new content'),
            )
            const someMoreNewContent = editorSchema.topNodeType.createChecked(
                null,
                editorSchema.text('some more new content'),
            )
            const onError = jest.fn()
            const view = createView({ doc: someContent, onError })
            await whenNextTick()
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion + 1, []),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(someContent.toJSON())
            expect(contentClient.getSnapshot).toHaveBeenCalledTimes(1)
            expect(contentClient.registerSchema).toHaveBeenCalledTimes(1)
            expect(contentClient.submitOperation).toHaveBeenCalledTimes(1)
            expect(contentClient.streamOperations).toHaveBeenCalledTimes(1)
            const stream: Duplex = await contentClient.streamOperations.mock
                .results[0].value
            contentClient.getSnapshot.mockClear()
            contentClient.registerSchema.mockClear()
            contentClient.submitOperation.mockClear()
            contentClient.streamOperations.mockClear()

            // Add some pendingSteps.
            const tr1 = view.state.tr.insertText(' new', 4, 4)
            const pendingSteps1 = rebaseableStepsFrom(tr1)
            view.dispatch(tr1)
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion + 1, pendingSteps1),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(
                someNewContent.toJSON(),
            )

            // Make submitOperation fail, so that we could update the state and submit again.
            contentClient.submitOperation.mockImplementationOnce(
                (operation: Operation) =>
                    Promise.reject(
                        createAlreadyExistsError(
                            'Operation',
                            operation,
                            'key',
                            operation.key,
                        ),
                    ),
            )

            // Verify submitted.
            await whenNextTick()
            const { operationKey } = key.getState(view.state)!.pendingSteps[0]
            const pendingSteps1WithOperationKey = pendingSteps1.map(
                (rebaseable) =>
                    new Rebaseable(
                        rebaseable.step,
                        rebaseable.invertedStep,
                        operationKey,
                    ),
            )
            expect(operationKey).toBeString()
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion + 1, pendingSteps1WithOperationKey),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(
                someNewContent.toJSON(),
            )
            expect(contentClient.submitOperation).toHaveBeenCalledTimes(1)
            expect(contentClient.submitOperation).toHaveBeenCalledWith({
                key: operationKey,
                type,
                id,
                version: minVersion + 2,
                schema: schema.hash,
                data: [
                    {
                        stepType: 'replace',
                        from: 4,
                        to: 4,
                        slice: {
                            content: [
                                {
                                    type: 'text',
                                    text: ' new',
                                },
                            ],
                        },
                    },
                ],
                meta: null,
            })
            const operation1: Operation =
                contentClient.submitOperation.mock.calls[0][0]
            contentClient.submitOperation.mockClear()
            expect(onError).toHaveBeenCalledTimes(0)

            // Add some more pendingSteps.
            const tr2 = view.state.tr.insertText(' more', 4, 4)
            const pendingSteps2 = rebaseableStepsFrom(tr2)
            const pendingStepsAll = pendingSteps1WithOperationKey.concat(
                pendingSteps2,
            )
            view.dispatch(tr2)
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion + 1, pendingStepsAll),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(
                someMoreNewContent.toJSON(),
            )

            // Verify that nothing is submitted until we receive some operations.
            await whenNextTick()
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion + 1, pendingStepsAll),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(
                someMoreNewContent.toJSON(),
            )
            expect(contentClient.submitOperation).toHaveBeenCalledTimes(0)
            expect(onError).toHaveBeenCalledTimes(0)

            // Receive the operation which caused the conflict earlier.
            stream.push(operation1)

            // Verify that the remaining steps are submitted.
            await whenNextTick()
            const operationKey2 = key.getState(view.state)!.pendingSteps[0]
                .operationKey
            const pendingSteps2WithOperationKey = pendingSteps2.map(
                (pendingStep) =>
                    new Rebaseable(
                        pendingStep.step,
                        pendingStep.invertedStep,
                        operationKey2,
                    ),
            )
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion + 2, pendingSteps2WithOperationKey),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(
                someMoreNewContent.toJSON(),
            )
            expect(contentClient.getSnapshot).toHaveBeenCalledTimes(0)
            expect(contentClient.registerSchema).toHaveBeenCalledTimes(0)
            expect(contentClient.streamOperations).toHaveBeenCalledTimes(0)
            expect(contentClient.submitOperation).toHaveBeenCalledTimes(1)
            expect(contentClient.submitOperation).toHaveBeenCalledWith({
                key: operationKey2,
                type,
                id,
                version: minVersion + 3,
                schema: schema.hash,
                data: [
                    {
                        stepType: 'replace',
                        from: 4,
                        to: 4,
                        slice: {
                            content: [
                                {
                                    type: 'text',
                                    text: ' more',
                                },
                            ],
                        },
                    },
                ],
                meta: null,
            })
        })

        test('submit an operation with operation.version conflict', async () => {
            const someContent = editorSchema.topNodeType.createChecked(
                null,
                editorSchema.text('some content'),
            )
            const someNewContent = editorSchema.topNodeType.createChecked(
                null,
                editorSchema.text('some new content'),
            )
            const someMoreNewContent = editorSchema.topNodeType.createChecked(
                null,
                editorSchema.text('some more new content'),
            )
            const onError = jest.fn()
            const view = createView({ doc: someContent, onError })
            await whenNextTick()
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion + 1, []),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(someContent.toJSON())
            expect(contentClient.getSnapshot).toHaveBeenCalledTimes(1)
            expect(contentClient.registerSchema).toHaveBeenCalledTimes(1)
            expect(contentClient.submitOperation).toHaveBeenCalledTimes(1)
            expect(contentClient.streamOperations).toHaveBeenCalledTimes(1)
            const stream: Duplex = await contentClient.streamOperations.mock
                .results[0].value
            contentClient.getSnapshot.mockClear()
            contentClient.registerSchema.mockClear()
            contentClient.submitOperation.mockClear()
            contentClient.streamOperations.mockClear()

            // Add some pendingSteps.
            const tr1 = view.state.tr.insertText(' new', 4, 4)
            const pendingSteps1 = rebaseableStepsFrom(tr1)
            view.dispatch(tr1)
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion + 1, pendingSteps1),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(
                someNewContent.toJSON(),
            )

            // Make submitOperation fail, so that we could update the state and submit again.
            contentClient.submitOperation.mockImplementationOnce(
                (operation: Operation) =>
                    Promise.reject(
                        createAlreadyExistsError(
                            'Operation',
                            operation,
                            'version',
                            minVersion + 5,
                        ),
                    ),
            )

            // Verify submitted.
            await whenNextTick()
            const { operationKey } = key.getState(view.state)!.pendingSteps[0]
            const pendingSteps1WithOperationKey = pendingSteps1.map(
                (rebaseable) =>
                    new Rebaseable(
                        rebaseable.step,
                        rebaseable.invertedStep,
                        operationKey,
                    ),
            )
            expect(operationKey).toBeString()
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion + 1, pendingSteps1WithOperationKey),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(
                someNewContent.toJSON(),
            )
            expect(contentClient.submitOperation).toHaveBeenCalledTimes(1)
            expect(contentClient.submitOperation).toHaveBeenCalledWith({
                key: operationKey,
                type,
                id,
                version: minVersion + 2,
                schema: schema.hash,
                data: [
                    {
                        stepType: 'replace',
                        from: 4,
                        to: 4,
                        slice: {
                            content: [
                                {
                                    type: 'text',
                                    text: ' new',
                                },
                            ],
                        },
                    },
                ],
                meta: null,
            })
            contentClient.submitOperation.mockClear()
            expect(onError).toHaveBeenCalledTimes(0)

            // Add some more pendingSteps.
            const tr2 = view.state.tr.insertText(' more', 4, 4)
            const pendingSteps2 = rebaseableStepsFrom(tr2)
            const pendingStepsAll = pendingSteps1WithOperationKey.concat(
                pendingSteps2,
            )
            view.dispatch(tr2)
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion + 1, pendingStepsAll),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(
                someMoreNewContent.toJSON(),
            )

            // Verify that nothing is submitted until we receive some operations.
            await whenNextTick()
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion + 1, pendingStepsAll),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(
                someMoreNewContent.toJSON(),
            )
            expect(contentClient.submitOperation).toHaveBeenCalledTimes(0)
            expect(onError).toHaveBeenCalledTimes(0)

            // Receive the missing operations.
            const createOperation = (version: number): Operation => ({
                key: createId(),
                type,
                id,
                version,
                schema: schema.hash,
                data: [],
                meta: null,
            })
            stream.push(createOperation(minVersion + 2))
            stream.push(createOperation(minVersion + 3))
            stream.push(createOperation(minVersion + 4))
            stream.push(createOperation(minVersion + 5))

            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion + 5, pendingStepsAll),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(
                someMoreNewContent.toJSON(),
            )

            // Verify that the first steps is resubmitted.
            await whenNextTick()
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion + 5, pendingStepsAll),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(
                someMoreNewContent.toJSON(),
            )
            expect(contentClient.submitOperation).toHaveBeenCalledTimes(1)
            expect(contentClient.submitOperation).toHaveBeenCalledWith({
                key: operationKey,
                type,
                id,
                version: minVersion + 6,
                schema: schema.hash,
                data: [
                    {
                        stepType: 'replace',
                        from: 4,
                        to: 4,
                        slice: {
                            content: [
                                {
                                    type: 'text',
                                    text: ' new',
                                },
                            ],
                        },
                    },
                ],
                meta: null,
            })
            const operation1: Operation =
                contentClient.submitOperation.mock.calls[0][0]
            contentClient.submitOperation.mockClear()
            expect(onError).toHaveBeenCalledTimes(0)

            // Receive the confirmation of the last operation.
            stream.push(operation1)

            // Verify that the remaining steps are submitted.
            await whenNextTick()
            const operationKey2 = key.getState(view.state)!.pendingSteps[0]
                .operationKey
            const pendingSteps2WithOperationKey = pendingSteps2.map(
                (pendingStep) =>
                    new Rebaseable(
                        pendingStep.step,
                        pendingStep.invertedStep,
                        operationKey2,
                    ),
            )
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion + 6, pendingSteps2WithOperationKey),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(
                someMoreNewContent.toJSON(),
            )
            expect(contentClient.getSnapshot).toHaveBeenCalledTimes(0)
            expect(contentClient.registerSchema).toHaveBeenCalledTimes(0)
            expect(contentClient.streamOperations).toHaveBeenCalledTimes(0)
            expect(contentClient.submitOperation).toHaveBeenCalledTimes(1)
            expect(contentClient.submitOperation).toHaveBeenCalledWith({
                key: operationKey2,
                type,
                id,
                version: minVersion + 7,
                schema: schema.hash,
                data: [
                    {
                        stepType: 'replace',
                        from: 4,
                        to: 4,
                        slice: {
                            content: [
                                {
                                    type: 'text',
                                    text: ' more',
                                },
                            ],
                        },
                    },
                ],
                meta: null,
            })
        })

        test('receive an operation after destroyed', async () => {
            const someContent = editorSchema.topNodeType.createChecked(
                null,
                editorSchema.text('some content'),
            )
            const view = createView({ doc: someContent })
            await whenNextTick()
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion + 1, []),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(someContent.toJSON())
            expect(contentClient.getSnapshot).toHaveBeenCalledTimes(1)
            expect(contentClient.registerSchema).toHaveBeenCalledTimes(1)
            expect(contentClient.submitOperation).toHaveBeenCalledTimes(1)
            expect(contentClient.streamOperations).toHaveBeenCalledTimes(1)
            const stream: Duplex = await contentClient.streamOperations.mock
                .results[0].value
            contentClient.getSnapshot.mockClear()
            contentClient.registerSchema.mockClear()
            contentClient.submitOperation.mockClear()
            contentClient.streamOperations.mockClear()

            // Destroy the view.
            view.destroy()
            expect(stream.destroyed).toBe(false)
            const operation: Operation = {
                key: createId(),
                type,
                id,
                version: minVersion + 2,
                schema: schema.hash,
                data: view.state.tr
                    .insertText(' new', 4, 4)
                    .steps.map((step) => step.toJSON()),
                meta: null,
            }
            stream.push(operation)

            // Verify that the state has not changed.
            await whenNextTick()
            expect(stream.destroyed).toBe(true)
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion + 1, []),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(someContent.toJSON())
            expect(contentClient.getSnapshot).toHaveBeenCalledTimes(0)
            expect(contentClient.registerSchema).toHaveBeenCalledTimes(0)
            expect(contentClient.submitOperation).toHaveBeenCalledTimes(0)
            expect(contentClient.streamOperations).toHaveBeenCalledTimes(0)
        })

        test('receive an operation with a mismatched schema', async () => {
            const someContent = editorSchema.topNodeType.createChecked(
                null,
                editorSchema.text('some content'),
            )
            const someNewContent = editorSchema.topNodeType.createChecked(
                null,
                editorSchema.text('some new content'),
            )
            const onError = jest.fn()
            const view = createView({ doc: someContent, onError })
            await whenNextTick()
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion + 1, []),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(someContent.toJSON())
            expect(contentClient.getSnapshot).toHaveBeenCalledTimes(1)
            expect(contentClient.registerSchema).toHaveBeenCalledTimes(1)
            expect(contentClient.submitOperation).toHaveBeenCalledTimes(1)
            expect(contentClient.streamOperations).toHaveBeenCalledTimes(1)
            const stream: Duplex = await contentClient.streamOperations.mock
                .results[0].value
            contentClient.getSnapshot.mockClear()
            contentClient.registerSchema.mockClear()
            contentClient.submitOperation.mockClear()
            contentClient.streamOperations.mockClear()

            const operation: Operation = {
                key: createId(),
                type,
                id,
                version: minVersion + 2,
                schema: 'different-schema',
                data: view.state.tr
                    .insertText(' new', 4, 4)
                    .steps.map((step) => step.toJSON()),
                meta: null,
            }
            stream.push(operation)

            // Verify that the state has been reset.
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion, []),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(someContent.toJSON())
            expect(contentClient.getSnapshot).toHaveBeenCalledTimes(0)
            expect(contentClient.registerSchema).toHaveBeenCalledTimes(0)
            expect(contentClient.submitOperation).toHaveBeenCalledTimes(0)
            expect(contentClient.streamOperations).toHaveBeenCalledTimes(0)
            expect(onError).toHaveBeenCalledTimes(1)
            expect(onError).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'SyncOTError SchemaConflict',
                    message:
                        'Cannot process the operation because the local schema is out of date.',
                }),
            )
            onError.mockClear()
            expect(stream.destroyed).toBe(false)

            // Verify that the state is not reinitialized with the local out-of-date schema.
            contentClient.getSnapshot.mockImplementationOnce(
                async (snapshotType, snapshotId) => ({
                    type: snapshotType,
                    id: snapshotId,
                    version: minVersion + 1,
                    schema: 'different-schema',
                    data: null,
                    meta: {
                        user: userId,
                        time: Date.now() - 10000,
                        session: sessionId,
                    },
                }),
            )
            await whenNextTick()
            expect(contentClient.getSnapshot).toHaveBeenCalledTimes(1)
            expect(contentClient.getSnapshot).toHaveBeenCalledWith(
                type,
                id,
                maxVersion,
            )
            contentClient.getSnapshot.mockClear()
            expect(contentClient.registerSchema).toHaveBeenCalledTimes(0)
            expect(contentClient.submitOperation).toHaveBeenCalledTimes(0)
            expect(contentClient.streamOperations).toHaveBeenCalledTimes(0)
            expect(onError).toHaveBeenCalledTimes(1)
            expect(onError).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'SyncOTError SchemaConflict',
                    message:
                        "Cannot convert the snapshot's schema because the local schema is out of date.",
                }),
            )
            onError.mockClear()
            expect(stream.destroyed).toBe(true)

            // Verify that the state can be initialized with a matching schema.
            contentClient.getSnapshot.mockImplementationOnce(
                async (snapshotType, snapshotId) => ({
                    type: snapshotType,
                    id: snapshotId,
                    version: minVersion + 1,
                    schema: schema.hash,
                    data: defaultDoc.toJSON(),
                    meta: {
                        user: userId,
                        time: Date.now() - 10000,
                        session: sessionId,
                    },
                }),
            )
            const tr = view.state.tr.insertText(' new', 4, 4)
            view.dispatch(tr)
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion, rebaseableStepsFrom(tr)),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(
                someNewContent.toJSON(),
            )
            await whenNextTick()
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion + 1, []),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(defaultDoc.toJSON())
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
                minVersion + 2,
                maxVersion + 1,
            )
            expect(onError).toHaveBeenCalledTimes(0)
        })

        test('receive an operation with an unexpected version', async () => {
            const someContent = editorSchema.topNodeType.createChecked(
                null,
                editorSchema.text('some content'),
            )
            const view = createView({ doc: someContent })
            await whenNextTick()
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion + 1, []),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(someContent.toJSON())
            expect(contentClient.getSnapshot).toHaveBeenCalledTimes(1)
            expect(contentClient.registerSchema).toHaveBeenCalledTimes(1)
            expect(contentClient.submitOperation).toHaveBeenCalledTimes(1)
            expect(contentClient.streamOperations).toHaveBeenCalledTimes(1)
            const stream: Duplex = await contentClient.streamOperations.mock
                .results[0].value
            contentClient.getSnapshot.mockClear()
            contentClient.registerSchema.mockClear()
            contentClient.submitOperation.mockClear()
            contentClient.streamOperations.mockClear()

            // Receive an operation with an unexpected version.
            const operation: Operation = {
                key: createId(),
                type,
                id,
                version: minVersion + 10,
                schema: schema.hash,
                data: null,
                meta: null,
            }
            stream.push(operation)

            // Verify that the state has not changed.
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion + 1, []),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(someContent.toJSON())
            expect(stream.destroyed).toBe(false)
            expect(contentClient.getSnapshot).toHaveBeenCalledTimes(0)
            expect(contentClient.registerSchema).toHaveBeenCalledTimes(0)
            expect(contentClient.submitOperation).toHaveBeenCalledTimes(0)
            expect(contentClient.streamOperations).toHaveBeenCalledTimes(0)

            // Verify that the stream is recreated.
            await whenNextTick()
            expect(key.getState(view.state)).toStrictEqual(
                new PluginState(minVersion + 1, []),
            )
            expect(view.state.doc.toJSON()).toStrictEqual(someContent.toJSON())
            expect(stream.destroyed).toBe(true)
            expect(contentClient.getSnapshot).toHaveBeenCalledTimes(0)
            expect(contentClient.registerSchema).toHaveBeenCalledTimes(0)
            expect(contentClient.submitOperation).toHaveBeenCalledTimes(0)
            expect(contentClient.streamOperations).toHaveBeenCalledTimes(1)
            expect(contentClient.streamOperations).toHaveBeenCalledWith(
                type,
                id,
                minVersion + 2,
                maxVersion + 1,
            )
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
