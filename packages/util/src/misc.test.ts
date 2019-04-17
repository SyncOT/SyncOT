import { noop } from '.'

test('noop', () => {
    expect(noop).toBeFunction()
    expect(noop()).toBeUndefined()
})
