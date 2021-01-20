import { EditorState } from 'prosemirror-state'
import { schema } from 'prosemirror-test-builder'
import { Rebaseable, rebaseableStepsFrom } from './rebaseable'

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
