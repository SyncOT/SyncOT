/**
 * @jest-environment jsdom
 */

// These tests are inspired by
// https://github.com/ProseMirror/prosemirror-collab/blob/b053a302b12937f80cd4d0c92847b058eb5addcb/test/test-collab.js

import { BaseSession, createAuthClient, createAuthService } from '@syncot/auth'
import { Connection, createConnection } from '@syncot/connection'
import {
    Content,
    createContent,
    createContentClient,
    createContentService,
    createContentStore,
    createPubSub,
    Operation,
} from '@syncot/content'
import { Node } from 'prosemirror-model'
import { Selection } from 'prosemirror-state'
import { createContentType } from '@syncot/content-type-prosemirror'
import { delay, invertedStreams, noop, whenNextTick } from '@syncot/util'
import { closeHistory, history, redo, undo } from 'prosemirror-history'
import { EditorState, Transaction } from 'prosemirror-state'
import { doc, p, schema } from 'prosemirror-test-builder'
import { EditorView } from 'prosemirror-view'
import { syncOT } from '.'

const type = 'test'
const id = '1'

class TestSession extends BaseSession<any> {
    mayReadContent() {
        return true
    }
    mayWriteContent() {
        return true
    }
    mayReadPresence() {
        return true
    }
    mayWritePresence() {
        return true
    }
}

class Client {
    private readonly serverConnection: Connection = createConnection()
    private readonly clientConnection: Connection = createConnection()
    private submitOperationPromise = Promise.resolve()
    private submitOperationResolve = noop
    private delayed: number = 0
    public readonly view: EditorView
    public constructor(content: Content, node: Node | undefined) {
        const [serverStream, clientStream] = invertedStreams({
            allowHalfOpen: false,
            objectMode: true,
        })
        this.serverConnection.connect(serverStream)
        this.clientConnection.connect(clientStream)

        const authService = createAuthService({
            connection: this.serverConnection,
            createSession: () => new TestSession(),
        })
        const authClient = createAuthClient({
            connection: this.clientConnection,
            autoLogIn: true,
            getCredentials: () => null,
        })

        createContentService({
            connection: this.serverConnection,
            authService,
            content,
        })
        const contentClient = createContentClient({
            connection: this.clientConnection,
            authClient,
        })

        this.view = new EditorView(undefined, {
            state: EditorState.create({
                doc: node,
                schema,
                plugins: [
                    history(),
                    syncOT({
                        type,
                        id,
                        contentClient,
                    }),
                ],
            }),
            handleScrollToSelection() {
                // Prevent the default behaviour to avoid accessing DOM node coordinates
                // which are not supported in jsdom.
                return true
            },
        })

        const submitOperation = contentClient.submitOperation
        contentClient.submitOperation = async (
            operation: Operation,
        ): Promise<void> => {
            await this.submitOperationPromise
            return submitOperation.call(contentClient, operation)
        }
    }

    public async destroy(): Promise<void> {
        this.view.destroy()
        await whenNextTick()
        this.serverConnection.destroy()
        this.clientConnection.destroy()
    }

    public pause(): void {
        if (this.delayed++ === 0)
            this.submitOperationPromise = new Promise(
                (resolve) => (this.submitOperationResolve = resolve),
            )
    }

    public resume(): void {
        if (--this.delayed === 0) this.submitOperationResolve()
    }
}

class Context {
    private readonly contentStore = createContentStore()
    private readonly pubSub = createPubSub()
    private readonly contentType = createContentType()
    private readonly content = createContent({
        contentStore: this.contentStore,
        pubSub: this.pubSub,
        contentTypes: {
            test: this.contentType,
        },
    })
    public readonly clients: Client[] = []

    public static async create(
        node?: Node,
        editorCount: number = 2,
    ): Promise<Context> {
        const context = new Context(node, editorCount)
        await delay()
        return context
    }

    private constructor(node: Node | undefined, editorCount: number) {
        for (let i = 0; i < editorCount; i++)
            this.clients.push(new Client(this.content, node))
    }

    public destroy(): void {
        for (const client of this.clients) {
            client.destroy()
        }
    }

    public async update(
        client: number,
        f: (state: EditorState) => Transaction,
    ) {
        const { dispatch, state } = this.clients[client].view
        dispatch(f(state))
        await delay()
    }

    public async type(
        client: number,
        text: string,
        position?: number,
    ): Promise<void> {
        return await this.update(client, (s) =>
            s.tr.insertText(
                text,
                position != null ? position : s.selection.head,
            ),
        )
    }

    public async undo(client: number): Promise<void> {
        const { dispatch, state } = this.clients[client].view
        undo(state, dispatch)
        await delay()
    }

    public async redo(client: number): Promise<void> {
        const { dispatch, state } = this.clients[client].view
        redo(state, dispatch)
        await delay()
    }

    public async delay(client: number, f: () => Promise<void>): Promise<void> {
        this.clients[client].pause()
        await f()
        this.clients[client].resume()
        await delay()
    }

    public conv(nodeOrString: Node | string) {
        const node =
            typeof nodeOrString === 'string'
                ? doc(p(nodeOrString))
                : nodeOrString
        this.clients.forEach(({ view: { state } }) =>
            expect(state.doc.toJSON()).toStrictEqual(node.toJSON()),
        )
    }
}

/**
 * Puts the selection near the specified position.
 */
function sel(near: number) {
    return (s: EditorState) =>
        s.tr.setSelection(Selection.near(s.doc.resolve(near)))
}

let c: Context

afterEach(async () => {
    c.destroy()
})

describe('content synchronization', () => {
    test('converges for simple changes', async () => {
        c = await Context.create()
        await c.type(0, 'hi', 1)
        await c.type(1, 'ok', 3)
        await c.type(0, '!', 5)
        await c.type(1, '...', 1)
        await c.conv('...hiok!')
    })

    test('converges for multiple local changes', async () => {
        c = await Context.create()
        await c.type(0, 'hi')
        await c.delay(0, async () => {
            await c.type(0, 'A')
            await c.type(1, 'X')
            await c.type(0, 'B')
            await c.type(1, 'Y')
        })
        await c.conv('XYhiAB')
    })

    test('converges for multiple local changes with explicit insert positions', async () => {
        c = await Context.create()
        await c.type(0, 'hi', 1)
        await c.delay(0, async () => {
            await c.type(0, 'A', 3)
            await c.type(1, 'X', 3)
            await c.type(0, 'B', 5)
            await c.type(1, 'Y', 4)
        })
        await c.conv('hiXYAB')
    })

    test('converges with three peers', async () => {
        c = await Context.create(undefined, 3)
        await c.type(0, 'A')
        await c.type(1, 'X')
        await c.type(2, '1')
        await c.type(0, 'B')
        await c.type(1, 'Y')
        await c.type(2, '2')
        await c.conv('12XYAB')
    })

    test('converges with three peers with multiple steps', async () => {
        c = await Context.create(undefined, 3)
        await c.type(0, 'A')
        await c.delay(1, async () => {
            await c.type(1, 'X')
            await c.type(2, '1')
            await c.type(0, 'B')
            await c.type(1, 'Y')
            await c.type(2, '2')
        })
        await c.conv('12XYAB')
    })

    test('converges with three peers with multiple steps and explicit insert positions', async () => {
        c = await Context.create(undefined, 3)
        await c.type(0, 'A', 1)
        await c.delay(1, async () => {
            await c.type(1, 'X', 2)
            await c.type(2, '1', 2)
            await c.type(0, 'B', 2)
            await c.type(1, 'Y', 5)
            await c.type(2, '2', 4)
        })
        await c.conv('AB12XY')
    })

    test('supports undo', async () => {
        c = await Context.create()
        await c.type(0, 'A', 1)
        await c.type(1, 'B', 2)
        await c.type(0, 'C', 3)
        await c.undo(1)
        await c.conv('AC')
        await c.type(1, 'D', 3)
        await c.type(0, 'E', 4)
        await c.conv('ACDE')
    })

    test('supports redo', async () => {
        c = await Context.create()
        await c.type(0, 'A', 1)
        await c.type(1, 'B', 2)
        await c.type(0, 'C', 3)
        await c.undo(1)
        await c.redo(1)
        await c.type(1, 'D', 4)
        await c.type(0, 'E', 5)
        await c.conv('ABCDE')
    })

    test('supports deep undo', async () => {
        c = await Context.create(doc(p('hello'), p('bye')))
        await c.update(0, sel(6))
        await c.update(1, sel(11))
        await c.type(0, '!')
        await c.type(1, '!')
        await c.update(0, (s) => closeHistory(s.tr))
        await c.delay(0, async () => {
            await c.type(0, ' ...')
            await c.type(1, ' ,,,')
        })
        await c.update(0, (s) => closeHistory(s.tr))
        await c.type(0, '*')
        await c.type(1, '*')
        await c.undo(0)
        await c.conv(doc(p('hello! ...'), p('bye! ,,,*')))
        await c.undo(0)
        await c.undo(0)
        await c.conv(doc(p('hello'), p('bye! ,,,*')))
        await c.redo(0)
        await c.redo(0)
        await c.redo(0)
        await c.conv(doc(p('hello! ...*'), p('bye! ,,,*')))
        await c.undo(0)
        await c.undo(0)
        await c.conv(doc(p('hello!'), p('bye! ,,,*')))
        await c.undo(1)
        await c.conv(doc(p('hello!'), p('bye')))
    })

    test('support undo with clashing events', async () => {
        c = await Context.create(doc(p('hello')))
        await c.update(0, sel(6))
        await c.type(0, 'A')
        await c.delay(0, async () => {
            await c.type(0, 'B', 4)
            await c.type(0, 'C', 5)
            await c.type(0, 'D', 1)
            await c.update(1, (s) => s.tr.delete(2, 5))
        })
        await c.conv('DhoA')
        await c.undo(0)
        await c.undo(0)
        await c.conv('ho')
        expect(c.clients[0].view.state.selection.head).toBe(3)
    })

    test('handles conflicting steps', async () => {
        c = await Context.create(doc(p('abcde')))
        await c.delay(0, async () => {
            await c.update(0, (s) => s.tr.delete(3, 4))
            await c.type(0, 'x')
            await c.update(1, (s) => s.tr.delete(2, 5))
        })
        await c.undo(0)
        await c.undo(0)
        await c.conv(doc(p('ae')))
    })

    test('can undo simultaneous typing', async () => {
        c = await Context.create(doc(p('A'), p('B')))
        await c.update(0, sel(2))
        await c.update(1, sel(5))
        await c.delay(0, async () => {
            await c.type(0, '1')
            await c.type(0, '2')
            await c.type(1, 'x')
            await c.type(1, 'y')
        })
        await c.conv(doc(p('A12'), p('Bxy')))
        await c.undo(0)
        await c.conv(doc(p('A'), p('Bxy')))
        await c.undo(1)
        await c.conv(doc(p('A'), p('B')))
    })
})
