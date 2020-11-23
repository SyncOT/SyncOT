import './polyfill'
import './index.css'
import 'prosemirror-view/style/prosemirror.css'
import {commentPlugin, addAnnotation, commentUI} from './comment'
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

// set up dom
const menuEl = document.createElement('div');
menuEl.classList.add('menu');
const addCommentBtnEl = document.createElement('button');
addCommentBtnEl.innerText = 'Comment';
menuEl.appendChild(addCommentBtnEl);
const editorEl = document.createElement('div');
editorEl.classList.add('content');

document.body.appendChild(menuEl);
document.body.appendChild(editorEl);

const state = EditorState.create({
    schema,
    plugins: [
        history(),
        keymap(historyKeyMap),
        keymap(baseKeymap),
        commentPlugin,
        commentUI
    ],
    // comments will be init from server when demo is made collaborative
    comments: {
        comments: [],
        version: 1,
    }
})

const view = new EditorView(editorEl, { state })

addCommentBtnEl.addEventListener('click', ()=>{
    addAnnotation(view.state, view.dispatch);
});

window.proseMirror = {
    view,
    EditorState,
    EditorView,
    Node,
    Schema,
}
