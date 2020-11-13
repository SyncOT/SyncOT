import { isSyncOTError } from '@syncot/error'
import {
    createDisconnectedError,
    createDuplicateIdError,
    createNoServiceError,
    isDisconnectedError,
    isDuplicateIdError,
    isNoServiceError,
} from '.'

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

describe('DuplicateIdError', () => {
    test('createDuplicateIdError', () => {
        const error = createDuplicateIdError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOTError DuplicateId')
        expect(error.message).toBe('test')
    })
    test('isDuplicateIdError', () => {
        const error = createDuplicateIdError('test')
        expect(isSyncOTError(error)).toBeTrue()
        expect(isDuplicateIdError(error)).toBeTrue()
        expect(isDuplicateIdError(new Error())).toBeFalse()
        expect(isDuplicateIdError({})).toBeFalse()
    })
})

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
