import { isSyncOTError } from '@syncot/error'
import { createNoServiceError, isNoServiceError } from '.'

describe('NoServiceError', () => {
    test('createNoServiceError', () => {
        const error = createNoServiceError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOTError NoService')
        expect(error.message).toBe('test')
    })
    test('isNoServiceError', () => {
        const error = createNoServiceError('test')
        expect(isSyncOTError(error)).toBeTrue()
        expect(isNoServiceError(error)).toBeTrue()
        expect(isNoServiceError(new Error())).toBeFalse()
        expect(isNoServiceError({})).toBeFalse()
    })
})
