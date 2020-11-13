import { isSyncOTError } from '@syncot/error'
import { createTSONSocketError, isTSONSocketError } from '.'

describe('TSONSocketError', () => {
    test('createTSONSocketError', () => {
        const error = createTSONSocketError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOTError TSONSocket')
        expect(error.message).toBe('test')
        expect(error.cause).toBe(undefined)
    })
    test('createTSONSocketError with cause', () => {
        const cause = new Error('Test cause!')
        const error = createTSONSocketError('Test message.', cause)
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOTError TSONSocket')
        expect(error.message).toBe('Test message. => Error: Test cause!')
        expect(error.toString()).toBe(
            'SyncOTError TSONSocket: Test message. => Error: Test cause!',
        )
        expect(error.cause).toBe(cause)
    })
    test('isTSONSocketError', () => {
        const error = createTSONSocketError('test')
        expect(isSyncOTError(error)).toBeTrue()
        expect(isTSONSocketError(error)).toBeTrue()
        expect(isTSONSocketError(new Error())).toBeFalse()
        expect(isTSONSocketError({})).toBeFalse()
    })
})
