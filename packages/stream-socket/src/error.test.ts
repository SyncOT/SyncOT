import { isSyncOTError } from '@syncot/error'
import { createSocketError, isSocketError } from '.'

describe('SocketError', () => {
    test('createSocketError', () => {
        const error = createSocketError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOTError Socket')
        expect(error.message).toBe('test')
        expect(error.cause).toBe(undefined)
    })
    test('createSocketError with cause', () => {
        const cause = new Error('Test cause!')
        const error = createSocketError('Test message.', cause)
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOTError Socket')
        expect(error.message).toBe('Test message. => Error: Test cause!')
        expect(error.toString()).toBe(
            'SyncOTError Socket: Test message. => Error: Test cause!',
        )
        expect(error.cause).toBe(cause)
    })
    test('isSocketError', () => {
        const error = createSocketError('test')
        expect(isSyncOTError(error)).toBeTrue()
        expect(isSocketError(error)).toBeTrue()
        expect(isSocketError(new Error())).toBeFalse()
        expect(isSocketError({})).toBeFalse()
    })
})
