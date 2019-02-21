import {
    createAlreadyInitializedError,
    createDisconnectedError,
    createInvalidEntityError,
    createNoServiceError,
    createNotInitializedError,
    createTypeNotFoundError,
    createUnexpectedClientIdError,
    createUnexpectedSequenceNumberError,
    createUnexpectedVersionNumberError,
} from './error'

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
