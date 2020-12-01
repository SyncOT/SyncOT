import './polyfill'
import './index.css'
import 'prosemirror-view/style/prosemirror.css'
import { createAuthClient } from '@syncot/auth-client'
import { createConnection, createStreamManager } from '@syncot/connection'
import { createContentClient } from '@syncot/content'
import { syncOT } from '@syncot/client-prosemirror'
import { createPingService } from '@syncot/ping'
import { createWebSocketStream } from '@syncot/stream-socket-websocket'
import { baseKeymap } from 'prosemirror-commands'
import { undo, redo, history } from 'prosemirror-history'
import { keymap } from 'prosemirror-keymap'
import { Schema, Node } from 'prosemirror-model'
import { schema } from 'prosemirror-schema-basic'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'

const connection = createConnection()
const streamManager = createStreamManager({
    connection,
    createStream: createWebSocketStream({
        url: 'ws://localhost:10004/syncot/websocket',
    }),
})
const pingClient = createPingService({ connection })
const authClient = createAuthClient({ connection })
const contentClient = createContentClient({ connection, authClient })

const isWin = /Win/.test(navigator.platform)
const historyKeyMap = {
    'Mod-z': undo,
    'Mod-Shift-z': redo,
}
if (isWin) {
    historyKeyMap['Mod-y'] = redo
}
const state = EditorState.create({
    schema,
    plugins: [
        keymap(historyKeyMap),
        keymap(baseKeymap),
        history(),
        syncOT({
            type: 'demo',
            id: '1',
            contentClient,
        }),
    ],
})
const view = new EditorView(document.body, { state })

window.demo = {
    authClient,
    contentClient,
    pingClient,
    view,
    EditorState,
    EditorView,
    Node,
    Schema,
}
