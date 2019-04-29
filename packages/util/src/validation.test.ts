import { createInvalidEntityError } from '@syncot/error'
import { assertUnreachable, throwError, validate, Validator } from '.'

const error = createInvalidEntityError('test error', null)
const numberError = createInvalidEntityError('number error', null)
const positiveError = createInvalidEntityError('positive error', null)

const numberValidator: Validator<any> = (target: any) =>
    typeof target === 'number' ? undefined : numberError
const positiveValidator: Validator<any> = (target: any) =>
    target > 0 ? undefined : positiveError

describe('throwError', () => {
    test('throws the specified error', () => {
        expect(() => throwError(error)).toThrowError(error)
    })
    test('does not throw an error, if undefined', () => {
        expect(() => throwError(undefined)).not.toThrowError()
    })
})

describe('validate', () => {
    test('success', () => {
        expect(validate([numberValidator, positiveValidator])(5)).toBe(
            undefined,
        )
    })
    test('first validator fails', () => {
        expect(validate([numberValidator, positiveValidator])('5')).toBe(
            numberError,
        )
    })
    test('second validator fails', () => {
        expect(validate([numberValidator, positiveValidator])(-5)).toBe(
            positiveError,
        )
    })
})

describe('assertUnreachable', () => {
    test('throws an error (with a param)', () => {
        expect(() => assertUnreachable({} as never)).toThrow(
            expect.objectContaining({
                message: 'This should never happen!',
                name: 'AssertionError [ERR_ASSERTION]',
            }),
        )
    })
    test('throws an error (without a param)', () => {
        expect(() => assertUnreachable()).toThrow(
            expect.objectContaining({
                message: 'This should never happen!',
                name: 'AssertionError [ERR_ASSERTION]',
            }),
        )
    })
})