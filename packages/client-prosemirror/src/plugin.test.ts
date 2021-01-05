import { ContentClient, ContentClientEvents } from '@syncot/content'
import { SyncOTEmitter } from '@syncot/util'
import { Schema } from 'prosemirror-model'
import { EditorState, Plugin } from 'prosemirror-state'
import { Duplex } from 'readable-stream'
import { syncOT } from '.'
import { key, PluginState, Rebaseable } from './plugin'

const sessionId = 'test-session'
const userId = 'test-user'
const type = 'test-type'
const id = 'test-id'
let contentClient: MockContentClient
const editorSchema = new Schema({
    nodes: {
        doc: { content: 'text*' },
        text: {},
    },
})

class MockContentClient
    extends SyncOTEmitter<ContentClientEvents>
    implements ContentClient {
    public active = true
    public sessionId = sessionId
    public userId = userId
    registerSchema = jest.fn(async () => undefined)
    getSchema = jest.fn(async () => Promise.resolve(null))
    getSnapshot = jest.fn(async (snapshotType, snapshotId) => ({
        key: '',
        type: snapshotType,
        id: snapshotId,
        version: 0,
        schema: '',
        data: null,
        meta: null,
    }))
    submitOperation = jest.fn(async () => undefined)
    streamOperations = jest.fn(async () => {
        const stream = new Duplex()
        queueMicrotask(() => stream.destroy())
        return stream
    })
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
})
