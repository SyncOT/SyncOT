import { isSyncOTError } from '@syncot/util'
import { createTsonError, isTsonError } from '.'

describe('TsonError', () => {
    test('createTsonError', () => {
        const error = createTsonError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOTError TSON')
        expect(error.message).toBe('test')
    })
    test('isTsonError', () => {
        const error = createTsonError('test')
        expect(isSyncOTError(error)).toBeTrue()
        expect(isTsonError(error)).toBeTrue()
        expect(isTsonError(new Error())).toBeFalse()
        expect(isTsonError({})).toBeFalse()
    })
})
