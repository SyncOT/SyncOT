import { ErrorCodes, SyncOtError } from '.'
import { createNotImplementedError } from './error'

test('has code and message', () => {
    const error = new SyncOtError('A code' as ErrorCodes, 'Not implemented')
    expect(error.code).toBe('A code')
    expect(error.message).toBe('Not implemented')
})

test('ErrorCodes keys match the values', () => {
    Object.keys(ErrorCodes).forEach(key => {
        expect(ErrorCodes[key as any]).toBe(key)
    })
})

test('createNotImplementedError', () => {
    const error = createNotImplementedError('test')
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('SyncOtError NotImplemented')
    expect(error.message).toBe('test')
})
