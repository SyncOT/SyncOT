import { never } from './util'

describe('never', () => {
    test('throws with default message', () => {
        expect(() => never()).toThrowError('Should never happen')
    })

    test('throws with a custom message', () => {
        expect(() => never('custom message')).toThrowError('custom message')
    })
})
