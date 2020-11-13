import { isSyncOTError } from '@syncot/error'
import { createPingError, isPingError } from '.'

describe('PingError', () => {
    test('createPingError', () => {
        const error = createPingError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOTError Ping')
        expect(error.message).toBe('test')
        expect(error.cause).toBe(undefined)
    })
    test('createPingError with cause', () => {
        const cause = new Error('Test cause!')
        const error = createPingError('Test message.', cause)
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOTError Ping')
        expect(error.message).toBe('Test message. => Error: Test cause!')
        expect(error.toString()).toBe(
            'SyncOTError Ping: Test message. => Error: Test cause!',
        )
        expect(error.cause).toBe(cause)
    })
    test('isPingError', () => {
        const error = createPingError('test')
        expect(isSyncOTError(error)).toBeTrue()
        expect(isPingError(error)).toBeTrue()
        expect(isPingError(new Error())).toBeFalse()
        expect(isPingError({})).toBeFalse()
    })
})
