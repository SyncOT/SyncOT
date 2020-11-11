import './polyfill'
import './index.css'
import 'prosemirror-view/style/prosemirror.css'
import { decode } from '@syncot/tson'
import { baseKeymap } from 'prosemirror-commands'
import { undo, redo, history } from 'prosemirror-history'
import { keymap } from 'prosemirror-keymap'
import { Schema, Node } from 'prosemirror-model'
import { schema } from 'prosemirror-schema-basic'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'

// Expose a TSON decoder - handy for decoding WebSocket messages in dev-tools.
window.tsonDecodeBase64 = (base64) => decode(Buffer.from(base64, 'base64'))
window.tsonDecodeHex = (hex) => decode(Buffer.from(hex, 'hex'))
window.tsonDecodeUtf8 = (utf8) => decode(Buffer.from(utf8, 'utf8'))

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
    plugins: [history(), keymap(historyKeyMap), keymap(baseKeymap)],
})
const view = new EditorView(document.body, { state })

window.proseMirror = {
    view,
    EditorState,
    EditorView,
    Node,
    Schema,
}
