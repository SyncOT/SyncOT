import './polyfill'
import './index.css'
import 'prosemirror-view/style/prosemirror.css'
import { baseKeymap } from 'prosemirror-commands'
import { undo, redo, history } from 'prosemirror-history'
import { keymap } from 'prosemirror-keymap'
import { Schema, Node } from 'prosemirror-model'
import { schema } from 'prosemirror-schema-basic'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'

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
