// The test code in this file is copied from
// https://github.com/ProseMirror/prosemirror-collab/blob/b053a302b12937f80cd4d0c92847b058eb5addcb/test/test-rebase.js
// I only tweaked it a bit to:
// - use Rebaseable and rebaseSteps from SyncOT
// - use jest for assertions
// - fix lint errors

import {
    schema,
    eq,
    doc,
    blockquote,
    p,
    li,
    ul,
    em,
} from 'prosemirror-test-builder'
import { Transform } from 'prosemirror-transform'
import { Rebaseable, rebaseSteps } from './rebaseable'

function runRebase(transforms, expected) {
    const start = transforms[0].before
    const full = new Transform(start)
    transforms.forEach((transform) => {
        const rebased = new Transform(transform.doc)
        const begin = transform.steps.length + full.steps.length
        rebaseSteps(
            rebased,
            transform.steps.map(
                (s, i) =>
                    new Rebaseable(s, s.invert(transform.docs[i]), undefined),
            ),
            full.steps,
        )
        for (let i = begin; i < rebased.steps.length; i++)
            full.step(rebased.steps[i])
    })

    expect(eq(full.doc, expected)).toBe(true)

    // tslint:disable-next-line:forin
    for (const tag in start.tag) {
        const mapped = full.mapping.mapResult(start.tag[tag])

        const exp = expected.tag[tag]
        if (mapped.deleted) {
            if (exp) throw new Error('Tag ' + tag + ' was unexpectedly deleted')
        } else {
            if (!exp) throw new Error('Tag ' + tag + ' is not actually deleted')
            expect(mapped.pos).toBe(exp)
        }
    }
}

function permute(array) {
    if (array.length < 2) return [array]
    const result = []
    for (let i = 0; i < array.length; i++) {
        const others = permute(array.slice(0, i).concat(array.slice(i + 1)))
        for (const other of others) result.push([array[i]].concat(other))
    }
    return result
}

function rebase(node, ...clients) {
    const expected = clients.pop()
    runRebase(
        clients.map((cl) => cl(new Transform(node))),
        expected,
    )
}

function rebase$(node, ...clients) {
    const expected = clients.pop()
    permute(
        clients.map((cl) => cl(new Transform(node))),
    ).forEach((transforms) => runRebase(transforms, expected))
}

function type(tr, pos, text) {
    return tr.replaceWith(pos, pos, schema.text(text))
}

function wrap(tr, pos, typeName) {
    const $pos = tr.doc.resolve(pos)
    return tr.wrap($pos.blockRange($pos), [{ type: schema.nodes[typeName] }])
}

describe('rebaseSteps', () => {
    it('supports concurrent typing', () => {
        rebase$(
            doc(p('h<1>ell<2>o')),
            (tr) => type(tr, 2, 'X'),
            (tr) => type(tr, 5, 'Y'),
            doc(p('hX<1>ellY<2>o')),
        )
    })

    it('support multiple concurrently typed chars', () => {
        rebase$(
            doc(p('h<1>ell<2>o')),
            (tr) => type(type(type(tr, 2, 'X'), 3, 'Y'), 4, 'Z'),
            (tr) => type(type(tr, 5, 'U'), 6, 'V'),
            doc(p('hXYZ<1>ellUV<2>o')),
        )
    })

    it('supports three concurrent typers', () => {
        rebase$(
            doc(p('h<1>ell<2>o th<3>ere')),
            (tr) => type(tr, 2, 'X'),
            (tr) => type(tr, 5, 'Y'),
            (tr) => type(tr, 9, 'Z'),
            doc(p('hX<1>ellY<2>o thZ<3>ere')),
        )
    })

    it('handles wrapping of changed blocks', () => {
        rebase$(
            doc(p('<1>hell<2>o<3>')),
            (tr) => type(tr, 5, 'X'),
            (tr) => wrap(tr, 1, 'blockquote'),
            doc(blockquote(p('<1>hellX<2>o<3>'))),
        )
    })

    it('handles insertions in deleted content', () => {
        rebase$(
            doc(p('hello<1> wo<2>rld<3>!')),
            (tr) => tr.delete(6, 12),
            (tr) => type(tr, 9, 'X'),
            doc(p('hello<3>!')),
        )
    })

    it('allows deleting the same content twice', () => {
        rebase(
            doc(p('hello<1> wo<2>rld<3>!')),
            (tr) => tr.delete(6, 12),
            (tr) => tr.delete(6, 12),
            doc(p('hello<3>!')),
        )
    })

    it("isn't confused by joining a block that's being edited", () => {
        rebase$(
            doc(ul(li(p('one')), '<1>', li(p('tw<2>o')))),
            (tr) => type(tr, 12, 'A'),
            (tr) => tr.join(8),
            doc(ul(li(p('one'), p('twA<2>o')))),
        )
    })

    it('supports typing concurrently with marking', () => {
        rebase(
            doc(p('hello <1>wo<2>rld<3>')),
            (tr) => tr.addMark(7, 12, schema.mark('em')),
            (tr) => type(tr, 9, '_'),
            doc(p('hello <1>', em('wo'), '_<2>', em('rld<3>'))),
        )
    })

    it("doesn't unmark marks added concurrently", () => {
        rebase(
            doc(p(em('<1>hello'), ' world<2>')),
            (tr) => tr.addMark(1, 12, schema.mark('em')),
            (tr) => tr.removeMark(1, 12, schema.mark('em')),
            doc(p('<1>hello', em(' world<2>'))),
        )
    })

    it("doesn't mark concurrently unmarked text", () => {
        rebase(
            doc(p('<1>hello ', em('world<2>'))),
            (tr) => tr.removeMark(1, 12, schema.mark('em')),
            (tr) => tr.addMark(1, 12, schema.mark('em')),
            doc(p(em('<1>hello '), 'world<2>')),
        )
    })

    it('deletes inserts in replaced context', () => {
        rebase(
            doc(
                p('b<before>efore'),
                blockquote(
                    ul(li(p('o<1>ne')), li(p('t<2>wo')), li(p('thr<3>ee'))),
                ),
                p('a<after>fter'),
            ),
            (tr) =>
                tr.replace(
                    tr.doc.tag[1],
                    tr.doc.tag[3],
                    doc(p('a'), blockquote(p('b')), p('c')).slice(2, 9),
                ),
            (tr) => type(tr, tr.doc.tag[2], 'ayay'),
            doc(
                p('b<before>efore'),
                blockquote(ul(li(p('o'), blockquote(p('b')), p('<3>ee')))),
                p('a<after>fter'),
            ),
        )
    })

    it('maps through inserts', () => {
        rebase$(
            doc(p('X<1>X<2>X')),
            (tr) => type(tr, 2, 'hello'),
            (tr) => type(tr, 3, 'goodbye').delete(4, 7),
            doc(p('Xhello<1>Xgbye<2>X')),
        )
    })

    it('handle concurrent removal of blocks', () => {
        rebase(
            doc(p('a'), '<1>', p('b'), '<2>', p('c')),
            (tr) => tr.delete(tr.doc.tag[1], tr.doc.tag[2]),
            (tr) => tr.delete(tr.doc.tag[1], tr.doc.tag[2]),
            doc(p('a'), '<2>', p('c')),
        )
    })

    it('discards edits in removed blocks', () => {
        rebase$(
            doc(p('a'), '<1>', p('b<2>'), '<3>', p('c')),
            (tr) => tr.delete(tr.doc.tag[1], tr.doc.tag[3]),
            (tr) => type(tr, tr.doc.tag[2], 'ay'),
            doc(p('a'), '<3>', p('c')),
        )
    })

    it('preserves double block inserts', () => {
        rebase(
            doc(p('a'), '<1>', p('b')),
            (tr) => tr.replaceWith(3, 3, schema.node('paragraph')),
            (tr) => tr.replaceWith(3, 3, schema.node('paragraph')),
            doc(p('a'), p(), p(), '<1>', p('b')),
        )
    })
})
