import { ErrorCodes, SyncOtError } from '.'

test('has code and message', () => {
    const error = new SyncOtError(ErrorCodes.NotImplemented, 'Not implemented')
    expect(error.code).toBe(ErrorCodes.NotImplemented)
    expect(error.message).toBe('Not implemented')
})

test('normalizes invalid error codes', () => {
    const error = new SyncOtError('rubbish' as ErrorCodes, 'Rubbish')
    expect(error.code).toBe(ErrorCodes.UnknownError)
    expect(error.message).toBe('Rubbish')
})

test('ErrorCodes keys match the values', () => {
    Object.keys(ErrorCodes).forEach(key => {
        expect(ErrorCodes[key as any]).toBe(key)
    })
})
