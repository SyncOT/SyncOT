import { AssertionError } from 'assert'
import {
    createAlreadyInitializedError,
    createDisconnectedError,
    createInvalidEntityError,
    createNoServiceError,
    createNotInitializedError,
    createSyncOtError,
    createTsonError,
    createTypeNotFoundError,
    createUnexpectedClientIdError,
    createUnexpectedSequenceNumberError,
    createUnexpectedVersionNumberError,
} from '.'

describe('createSyncOtError', () => {
    const defaultName = 'SyncOtError'
    const name = 'AnError'
    const fullName = `${defaultName} ${name}`
    const message = 'A message.'
    const causeName = 'Error'
    const causeMessage = 'A cause.'
    const cause = new Error(causeMessage)
    const messageWithCause = `${message} => ${causeName}: ${causeMessage}`
    const extra1 = [1, 2, 3]
    const extra2 = 123

    test('name, message', () => {
        const error = createSyncOtError(name, message)
        expect(error).toBeInstanceOf(Error)
        expect(error.propertyIsEnumerable('name')).toBe(false)
        expect(error.name).toBe(fullName)
        expect(error.message).toBe(message)
        expect(error.cause).not.toBeDefined()
        expect(error.toString()).toBe(`${fullName}: ${message}`)
    })
    test('empty name, message', () => {
        const error = createSyncOtError('', message)
        expect(error).toBeInstanceOf(Error)
        expect(error.propertyIsEnumerable('name')).toBe(false)
        expect(error.name).toBe(defaultName)
        expect(error.message).toBe(message)
        expect(error.cause).not.toBeDefined()
        expect(error.toString()).toBe(`${defaultName}: ${message}`)
    })
    test('name, message, cause', () => {
        const error = createSyncOtError(name, message, cause)
        expect(error).toBeInstanceOf(Error)
        expect(error.propertyIsEnumerable('name')).toBe(false)
        expect(error.name).toBe(fullName)
        expect(error.message).toBe(messageWithCause)
        expect(error.cause).toBe(cause)
        expect(error.toString()).toBe(
            `${fullName}: ${message} => ${causeName}: ${causeMessage}`,
        )
    })
    test('name, message, invalid cause', () => {
        expect(() => createSyncOtError(name, message, {} as any)).toThrow(
            AssertionError,
        )
    })

    test('message', () => {
        const error = createSyncOtError(message)
        expect(error).toBeInstanceOf(Error)
        expect(error.propertyIsEnumerable('name')).toBe(false)
        expect(error.name).toBe(defaultName)
        expect(error.message).toBe(message)
        expect(error.cause).not.toBeDefined()
        expect(error.toString()).toBe(`${defaultName}: ${message}`)
    })
    test('message, cause', () => {
        const error = createSyncOtError(message, cause)
        expect(error).toBeInstanceOf(Error)
        expect(error.propertyIsEnumerable('name')).toBe(false)
        expect(error.name).toBe(defaultName)
        expect(error.message).toBe(messageWithCause)
        expect(error.cause).toBe(cause)
        expect(error.toString()).toBe(
            `${defaultName}: ${message} => ${causeName}: ${causeMessage}`,
        )
    })
    test('message, invalid cause', () => {
        expect(() => createSyncOtError(message, {} as any)).toThrow(
            AssertionError,
        )
    })

    test('no arguments', () => {
        const error = createSyncOtError()
        expect(error).toBeInstanceOf(Error)
        expect(error.propertyIsEnumerable('name')).toBe(false)
        expect(error.name).toBe(defaultName)
        expect(error.message).toBe('')
        expect(error.cause).not.toBeDefined()
        expect(error.toString()).toBe(defaultName)
    })
    test('empty details', () => {
        const error = createSyncOtError({})
        expect(error).toBeInstanceOf(Error)
        expect(error.propertyIsEnumerable('name')).toBe(false)
        expect(error.name).toBe(defaultName)
        expect(error.message).toBe('')
        expect(error.cause).not.toBeDefined()
        expect(error.toString()).toBe(defaultName)
    })
    test('all details', () => {
        const error = createSyncOtError({
            cause,
            extra1,
            extra2,
            message,
            name,
        })
        expect(error).toBeInstanceOf(Error)
        expect(error.propertyIsEnumerable('name')).toBe(false)
        expect(error.name).toBe(fullName)
        expect(error.message).toBe(messageWithCause)
        expect(error.cause).toBe(cause)
        expect(error.extra1).toBe(extra1)
        expect(error.extra2).toBe(extra2)
        expect(error.toString()).toBe(
            `${fullName}: ${message} => ${causeName}: ${causeMessage}`,
        )
    })
    test('invalid details', () => {
        expect(() => createSyncOtError(5 as any)).toThrow(AssertionError)
    })
    test('invalid details.name', () => {
        expect(() => createSyncOtError({ name: 5 as any })).toThrow(
            AssertionError,
        )
    })
    test('invalid details.message', () => {
        expect(() => createSyncOtError({ message: 5 as any })).toThrow(
            AssertionError,
        )
    })
    test('invalid details.cause', () => {
        expect(() => createSyncOtError({ cause: 5 as any })).toThrow(
            AssertionError,
        )
    })
    test('forbidden property: details.stack', () => {
        expect(() => createSyncOtError({ stack: '' })).toThrow(AssertionError)
    })
})

describe('createTsonError', () => {
    test('invalid message', () => {
        expect(() => createTsonError(5 as any)).toThrow(
            expect.objectContaining({
                message: 'Argument "message" must be a string.',
                name: 'AssertionError [ERR_ASSERTION]',
            }),
        )
    })
    test('valid message', () => {
        const error = createTsonError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOtError TSON')
        expect(error.message).toBe('test')
    })
})

describe('createInvalidEntityError', () => {
    test('invalid name', () => {
        expect(() => createInvalidEntityError(5 as any, {})).toThrow(
            expect.objectContaining({
                message: 'Argument "name" must be a string.',
                name: 'AssertionError [ERR_ASSERTION]',
            }),
        )
    })
    test('invalid key', () => {
        expect(() => createInvalidEntityError('', {}, 5 as any)).toThrow(
            expect.objectContaining({
                message: 'Argument "key" must be a string or null.',
                name: 'AssertionError [ERR_ASSERTION]',
            }),
        )
    })
    test('without key', () => {
        const name = 'MyEntity'
        const entity = { key: 'value' }
        const error = createInvalidEntityError(name, entity)
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOtError InvalidEntity')
        expect(error.message).toBe(`Invalid "${name}".`)
        expect(error.entityName).toBe(name)
        expect(error.entity).toBe(entity)
        expect(error.key).toBe(null)
    })
    test('with key', () => {
        const name = 'MyEntity'
        const entity = { key: 'value' }
        const key = 'aKey'
        const error = createInvalidEntityError(name, entity, key)
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOtError InvalidEntity')
        expect(error.message).toBe(`Invalid "${name}.${key}".`)
        expect(error.entityName).toBe(name)
        expect(error.entity).toBe(entity)
        expect(error.key).toBe(key)
    })
})

describe('createTypeNotFoundError', () => {
    test('invalid typeName', () => {
        expect(() => createTypeNotFoundError(5 as any)).toThrow(
            expect.objectContaining({
                message: 'Argument "typeName" must be a string.',
                name: 'AssertionError [ERR_ASSERTION]',
            }),
        )
    })
    test('valid typeName', () => {
        const error = createTypeNotFoundError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOtError TypeNotFound')
        expect(error.message).toBe('Type "test" not found.')
        expect(error.typeName).toBe('test')
    })
})

describe('createNoServiceError', () => {
    test('invalid message', () => {
        expect(() => createNoServiceError(5 as any)).toThrow(
            expect.objectContaining({
                message: 'Argument "message" must be a string.',
                name: 'AssertionError [ERR_ASSERTION]',
            }),
        )
    })
    test('valid message', () => {
        const error = createNoServiceError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOtError NoService')
        expect(error.message).toBe('test')
    })
})

describe('createDisconnectedError', () => {
    test('invalid message', () => {
        expect(() => createDisconnectedError(5 as any)).toThrow(
            expect.objectContaining({
                message: 'Argument "message" must be a string.',
                name: 'AssertionError [ERR_ASSERTION]',
            }),
        )
    })
    test('valid message', () => {
        const error = createDisconnectedError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOtError Disconnected')
        expect(error.message).toBe('test')
    })
})

describe('createNotInitializedError', () => {
    test('invalid message', () => {
        expect(() => createNotInitializedError(5 as any)).toThrow(
            expect.objectContaining({
                message: 'Argument "message" must be a string.',
                name: 'AssertionError [ERR_ASSERTION]',
            }),
        )
    })
    test('valid message', () => {
        const error = createNotInitializedError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOtError NotInitialized')
        expect(error.message).toBe('test')
    })
})

describe('createAlreadyInitializedError', () => {
    test('invalid message', () => {
        expect(() => createAlreadyInitializedError(5 as any)).toThrow(
            expect.objectContaining({
                message: 'Argument "message" must be a string.',
                name: 'AssertionError [ERR_ASSERTION]',
            }),
        )
    })
    test('valid message', () => {
        const error = createAlreadyInitializedError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOtError AlreadyInitialized')
        expect(error.message).toBe('test')
    })
})

describe('createUnexpectedClientIdError', () => {
    test('invalid message', () => {
        expect(() => createUnexpectedClientIdError(5 as any)).toThrow(
            expect.objectContaining({
                message: 'Argument "message" must be a string.',
                name: 'AssertionError [ERR_ASSERTION]',
            }),
        )
    })
    test('valid message', () => {
        const error = createUnexpectedClientIdError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOtError UnexpectedClientId')
        expect(error.message).toBe('test')
    })
    test('no message', () => {
        const error = createUnexpectedClientIdError()
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOtError UnexpectedClientId')
        expect(error.message).toBe('Unexpected client id.')
    })
})

describe('createUnexpectedSequenceNumberError', () => {
    test('invalid message', () => {
        expect(() => createUnexpectedSequenceNumberError(5 as any)).toThrow(
            expect.objectContaining({
                message: 'Argument "message" must be a string.',
                name: 'AssertionError [ERR_ASSERTION]',
            }),
        )
    })
    test('valid message', () => {
        const error = createUnexpectedSequenceNumberError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOtError UnexpectedSequenceNumber')
        expect(error.message).toBe('test')
    })
    test('no message', () => {
        const error = createUnexpectedSequenceNumberError()
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOtError UnexpectedSequenceNumber')
        expect(error.message).toBe('Unexpected sequence number.')
    })
})

describe('createUnexpectedVersionNumberError', () => {
    test('invalid message', () => {
        expect(() => createUnexpectedVersionNumberError(5 as any)).toThrow(
            expect.objectContaining({
                message: 'Argument "message" must be a string.',
                name: 'AssertionError [ERR_ASSERTION]',
            }),
        )
    })
    test('valid message', () => {
        const error = createUnexpectedVersionNumberError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOtError UnexpectedVersionNumber')
        expect(error.message).toBe('test')
    })
    test('no message', () => {
        const error = createUnexpectedVersionNumberError()
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOtError UnexpectedVersionNumber')
        expect(error.message).toBe('Unexpected version number.')
    })
})
