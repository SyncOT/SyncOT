import { ErrorCodes, SyncOtError } from "./error";

test('has code and message', () => {
    const error = new SyncOtError(ErrorCodes.NotImplemented, 'Not implemented')
    expect(error.code).toBe(ErrorCodes.NotImplemented)
    expect(error.message).toBe('Not implemented')
})

test('is serializable', () => {
    const error = new SyncOtError(ErrorCodes.NotImplemented, 'Not implemented')
    const serialized = JSON.stringify(error)
    const parsed = JSON.parse(serialized)
    expect(parsed).toEqual({
        code: ErrorCodes.NotImplemented,
        message: 'Not implemented'
    })
})
