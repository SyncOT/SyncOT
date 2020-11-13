import { isSyncOTError } from '@syncot/util'
import { createAuthError, isAuthError } from '.'

describe('AuthError', () => {
    test('createAuthError', () => {
        const error = createAuthError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOTError Auth')
        expect(error.message).toBe('test')
        expect(error.cause).toBe(undefined)
    })
    test('createAuthError with cause', () => {
        const cause = new Error('Test cause!')
        const error = createAuthError('Test message.', cause)
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOTError Auth')
        expect(error.message).toBe('Test message. => Error: Test cause!')
        expect(error.toString()).toBe(
            'SyncOTError Auth: Test message. => Error: Test cause!',
        )
        expect(error.cause).toBe(cause)
    })
    test('isAuthError', () => {
        const error = createAuthError('test')
        expect(isSyncOTError(error)).toBeTrue()
        expect(isAuthError(error)).toBeTrue()
        expect(isAuthError(new Error())).toBeFalse()
        expect(isAuthError({})).toBeFalse()
    })
})
