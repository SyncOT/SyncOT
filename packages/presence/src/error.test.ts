import { isSyncOTError } from '@syncot/util'
import { createPresenceError, isPresenceError } from '.'

describe('PresenceError', () => {
    test('createPresenceError', () => {
        const error = createPresenceError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOTError Presence')
        expect(error.message).toBe('test')
        expect(error.cause).toBe(undefined)
    })
    test('createPresenceError with cause', () => {
        const cause = new Error('Test cause!')
        const error = createPresenceError('Test message.', cause)
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOTError Presence')
        expect(error.message).toBe('Test message. => Error: Test cause!')
        expect(error.toString()).toBe(
            'SyncOTError Presence: Test message. => Error: Test cause!',
        )
        expect(error.cause).toBe(cause)
    })
    test('isPresenceError', () => {
        const error = createPresenceError('test')
        expect(isSyncOTError(error)).toBeTrue()
        expect(isPresenceError(error)).toBeTrue()
        expect(isPresenceError(new Error())).toBeFalse()
        expect(isPresenceError({})).toBeFalse()
    })
})
