import { isSyncOTError } from '@syncot/util'
import { createDisconnectedError, isDisconnectedError } from '.'

describe('DisconnectedError', () => {
    test('createDisconnectedError', () => {
        const error = createDisconnectedError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOTError Disconnected')
        expect(error.message).toBe('test')
    })
    test('isDisconnectedError', () => {
        const error = createDisconnectedError('test')
        expect(isSyncOTError(error)).toBeTrue()
        expect(isDisconnectedError(error)).toBeTrue()
        expect(isDisconnectedError(new Error())).toBeFalse()
        expect(isDisconnectedError({})).toBeFalse()
    })
})
