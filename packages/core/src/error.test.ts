import { ErrorCodes, SyncOtError } from '.'

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
        details: null,
        message: 'Not implemented',
    })
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

describe('fromJSON', () => {
    const code = 'NotImplemented'
    const message = 'a-message'
    const details = { a: 'property', anotherProperty: null }

    test('valid input', () => {
        expect(SyncOtError.fromJSON({ code }).toJSON()).toEqual({
            code,
            details: null,
            message: '',
        })
    })
    test('valid input with message', () => {
        expect(SyncOtError.fromJSON({ code, message }).toJSON()).toEqual({
            code,
            details: null,
            message,
        })
    })
    test('valid input with details', () => {
        expect(SyncOtError.fromJSON({ code, details }).toJSON()).toEqual({
            code,
            details,
            message: '',
        })
    })
    test('valid input with message and details', () => {
        expect(
            SyncOtError.fromJSON({ code, details, message }).toJSON(),
        ).toEqual({
            code,
            details,
            message,
        })
    })
    test('invalid input: 0', () => {
        expect(SyncOtError.fromJSON(0).toJSON()).toEqual({
            code: 'UnknownError',
            details: 0,
            message: '',
        })
    })
    test('invalid input: true', () => {
        expect(SyncOtError.fromJSON(true).toJSON()).toEqual({
            code: 'UnknownError',
            details: true,
            message: '',
        })
    })
    test('invalid input: []', () => {
        expect(SyncOtError.fromJSON([]).toJSON()).toEqual({
            code: 'UnknownError',
            details: [],
            message: '',
        })
    })
    test('invalid input: { code: 123 }', () => {
        expect(SyncOtError.fromJSON({ code: 123 }).toJSON()).toEqual({
            code: 'UnknownError',
            details: { code: 123 },
            message: '',
        })
    })
    test('invalid input: { code: "Unknown code" }', () => {
        expect(SyncOtError.fromJSON({ code: 'Unknown code' }).toJSON()).toEqual(
            {
                code: 'UnknownError',
                details: { code: 'Unknown code' },
                message: '',
            },
        )
    })
    test('invalid input: { code, message: 123 }', () => {
        expect(SyncOtError.fromJSON({ code, message: 123 }).toJSON()).toEqual({
            code: 'UnknownError',
            details: { code, message: 123 },
            message: '',
        })
    })
})
