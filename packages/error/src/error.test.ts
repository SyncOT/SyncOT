import { AssertionError } from 'assert'
import { createError } from '.'

describe('createError', () => {
    const defaultName = 'Error'
    const name = 'AnError'
    const message = 'A message.'
    const causeName = 'Error'
    const causeMessage = 'A cause.'
    const cause = new Error(causeMessage)
    const messageWithCause = `${message} => ${causeName}: ${causeMessage}`
    const extra1 = [1, 2, 3]
    const extra2 = 123

    test('name, message', () => {
        const error = createError(name, message)
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe(name)
        expect(error.message).toBe(message)
        expect(error.cause).not.toBeDefined()
        expect(error.toString()).toBe(`${name}: ${message}`)
    })
    test('name, message, cause', () => {
        const error = createError(name, message, cause)
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe(name)
        expect(error.message).toBe(messageWithCause)
        expect(error.cause).toBe(cause)
        expect(error.toString()).toBe(
            `${name}: ${message} => ${causeName}: ${causeMessage}`,
        )
    })
    test('name, message, invalid cause', () => {
        expect(() => createError(name, message, {} as any)).toThrow(
            AssertionError,
        )
    })

    test('message', () => {
        const error = createError(message)
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe(defaultName)
        expect(error.message).toBe(message)
        expect(error.cause).not.toBeDefined()
        expect(error.toString()).toBe(`${defaultName}: ${message}`)
    })
    test('message, cause', () => {
        const error = createError(message, cause)
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe(defaultName)
        expect(error.message).toBe(messageWithCause)
        expect(error.cause).toBe(cause)
        expect(error.toString()).toBe(
            `${defaultName}: ${message} => ${causeName}: ${causeMessage}`,
        )
    })
    test('message, invalid cause', () => {
        expect(() => createError(message, {} as any)).toThrow(AssertionError)
    })

    test('no arguments', () => {
        const error = createError()
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe(defaultName)
        expect(error.message).toBe('')
        expect(error.cause).not.toBeDefined()
        expect(error.toString()).toBe(defaultName)
    })
    test('empty details', () => {
        const error = createError({})
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe(defaultName)
        expect(error.message).toBe('')
        expect(error.cause).not.toBeDefined()
        expect(error.toString()).toBe(defaultName)
    })
    test('all details', () => {
        const error = createError({ cause, extra1, extra2, message, name })
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe(name)
        expect(error.message).toBe(messageWithCause)
        expect(error.cause).toBe(cause)
        expect(error.extra1).toBe(extra1)
        expect(error.extra2).toBe(extra2)
        expect(error.toString()).toBe(
            `${name}: ${message} => ${causeName}: ${causeMessage}`,
        )
    })
    test('invalid details', () => {
        expect(() => createError(5 as any)).toThrow(AssertionError)
    })
    test('invalid details.name', () => {
        expect(() => createError({ name: 5 as any })).toThrow(AssertionError)
    })
    test('invalid details.message', () => {
        expect(() => createError({ message: 5 as any })).toThrow(AssertionError)
    })
    test('invalid details.cause', () => {
        expect(() => createError({ cause: 5 as any })).toThrow(AssertionError)
    })
    test('forbidden property: details.stack', () => {
        expect(() => createError({ stack: '' })).toThrow(AssertionError)
    })
})
