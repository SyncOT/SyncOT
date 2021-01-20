import { Schema } from 'prosemirror-model'
import { EditorState } from 'prosemirror-state'
import { Rebaseable, rebaseableStepsFrom } from './rebaseable'

const schema = new Schema({
    nodes: {
        doc: { content: 'text*' },
        text: {},
    },
})

describe('rebaseableStepsFrom', () => {
    let state: EditorState

    beforeEach(() => {
        state = EditorState.create({ schema })
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
