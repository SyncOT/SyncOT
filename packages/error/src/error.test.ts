import {
    createAlreadyInitializedError,
    createAssertError,
    createAuthError,
    createCompositeError,
    createDisconnectedError,
    createDuplicateIdError,
    createError,
    createInvalidEntityError,
    createInvalidStreamError,
    createNoServiceError,
    createNotInitializedError,
    createPresenceError,
    createSessionError,
    createSocketError,
    createTsonError,
    createTypeNotFoundError,
    createUnexpectedSequenceNumberError,
    createUnexpectedSessionIdError,
    createUnexpectedVersionNumberError,
    isAlreadyInitializedError,
    isAssertError,
    isAuthError,
    isCompositeError,
    isDisconnectedError,
    isDuplicateIdError,
    isInvalidEntityError,
    isInvalidStreamError,
    isNoServiceError,
    isNotInitializedError,
    isPresenceError,
    isSessionError,
    isSocketError,
    isSyncOtError,
    isTsonError,
    isTypeNotFoundError,
    isUnexpectedSequenceNumberError,
    isUnexpectedSessionIdError,
    isUnexpectedVersionNumberError,
} from '.'

describe('CustomError', () => {
    const name = 'AnError'
    const message = 'A message.'
    const causeName = 'Error'
    const causeMessage = 'A cause.'
    const cause = new Error(causeMessage)
    const messageWithCause = `${message} => ${causeName}: ${causeMessage}`
    const extra1 = [1, 2, 3]
    const extra2 = 123

    test('createError with all details', () => {
        const error = createError({
            cause,
            extra1,
            extra2,
            message,
            name,
        })
        expect(error).toBeInstanceOf(Error)
        expect(error.propertyIsEnumerable('name')).toBeFalse()
        expect(error.name).toBe(name)
        expect(error.message).toBe(messageWithCause)
        expect(error.cause).toBe(cause)
        expect(error.extra1).toBe(extra1)
        expect(error.extra2).toBe(extra2)
        expect(error.toString()).toBe(
            `${name}: ${message} => ${causeName}: ${causeMessage}`,
        )
    })
    test('createError with no message and a cause', () => {
        const error = createError({
            cause,
            extra1,
            extra2,
            name,
        })
        expect(error).toBeInstanceOf(Error)
        expect(error.propertyIsEnumerable('name')).toBeFalse()
        expect(error.name).toBe(name)
        expect(error.message).toBe(`=> ${causeName}: ${causeMessage}`)
        expect(error.cause).toBe(cause)
        expect(error.extra1).toBe(extra1)
        expect(error.extra2).toBe(extra2)
        expect(error.toString()).toBe(
            `${name}: => ${causeName}: ${causeMessage}`,
        )
    })
    test('createError with a message and no cause', () => {
        const error = createError({
            extra1,
            extra2,
            message,
            name,
        })
        expect(error).toBeInstanceOf(Error)
        expect(error.propertyIsEnumerable('name')).toBeFalse()
        expect(error.name).toBe(name)
        expect(error.message).toBe(message)
        expect(error.cause).toBeUndefined()
        expect(error.toString()).toBe(`${name}: ${message}`)
    })
    test('createError with no details', () => {
        const error = createError()
        expect(error).toBeInstanceOf(Error)
        expect(error.propertyIsEnumerable('name')).toBeFalse()
        expect(error.name).toBe('Error')
        expect(error.message).toBe('')
        expect(error.cause).toBeUndefined()
        expect(error.toString()).toBe('Error')
    })
    test('createError with invalid details', () => {
        expect(() => createError(5 as any)).toThrow(
            expect.objectContaining({
                message: 'Argument "details" must be an object.',
                name: 'AssertionError',
            }),
        )
    })
    test('createError with invalid details.name', () => {
        expect(() => createError({ name: 5 as any })).toThrow(
            expect.objectContaining({
                message:
                    'Argument "details.name" must be a string or undefined.',
                name: 'AssertionError',
            }),
        )
    })
    test('createError with invalid details.message', () => {
        expect(() => createError({ message: 5 as any })).toThrow(
            expect.objectContaining({
                message:
                    'Argument "details.message" must be a string or undefined.',
                name: 'AssertionError',
            }),
        )
    })
    test('createError with invalid details.cause', () => {
        expect(() => createError({ cause: 5 as any })).toThrow(
            expect.objectContaining({
                message:
                    'Argument "details.cause" must be an Error or undefined.',
                name: 'AssertionError',
            }),
        )
    })
    test('createError with forbidden property: details.stack', () => {
        expect(() => createError({ stack: '' })).toThrow(
            expect.objectContaining({
                message: 'Argument "details.stack" must not be present.',
                name: 'AssertionError',
            }),
        )
    })

    test('isSyncOtError', () => {
        expect(isSyncOtError(createError({ name: 'SyncOtError' }))).toBeTrue()
        expect(
            isSyncOtError(createError({ name: 'SyncOtError abc' })),
        ).toBeTrue()
        expect(isSyncOtError(createError())).toBeFalse()
        expect(isSyncOtError(createError({ name: 'SyncOtErrors' }))).toBeFalse()
        expect(isSyncOtError({})).toBeFalse()
    })
})

describe('TsonError', () => {
    test('createTsonError', () => {
        const error = createTsonError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOtError TSON')
        expect(error.message).toBe('test')
    })
    test('isTsonError', () => {
        const error = createTsonError('test')
        expect(isSyncOtError(error)).toBeTrue()
        expect(isTsonError(error)).toBeTrue()
        expect(isTsonError(new Error())).toBeFalse()
        expect(isTsonError({})).toBeFalse()
    })
})

describe('InvalidEntityError', () => {
    test('createInvalidEntityError with invalid entityName', () => {
        expect(() => createInvalidEntityError(5 as any, {})).toThrow(
            expect.objectContaining({
                message: 'Argument "entityName" must be a string.',
                name: 'AssertionError',
            }),
        )
    })
    test('createInvalidEntityError with invalid key', () => {
        expect(() => createInvalidEntityError('', {}, 5 as any)).toThrow(
            expect.objectContaining({
                message: 'Argument "key" must be a string or null.',
                name: 'AssertionError',
            }),
        )
    })
    test('createInvalidEntityError with without key', () => {
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
    test('createInvalidEntityError with string key', () => {
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
    test('createInvalidEntityError with null key', () => {
        const name = 'MyEntity'
        const entity = { key: 'value' }
        const key = null
        const error = createInvalidEntityError(name, entity, key)
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOtError InvalidEntity')
        expect(error.message).toBe(`Invalid "${name}".`)
        expect(error.entityName).toBe(name)
        expect(error.entity).toBe(entity)
        expect(error.key).toBe(key)
    })
    test('isInvalidEntityError', () => {
        const error = createInvalidEntityError('Entity', {}, null)
        expect(isSyncOtError(error)).toBeTrue()
        expect(isInvalidEntityError(error)).toBeTrue()
        expect(isInvalidEntityError(new Error())).toBeFalse()
        expect(isInvalidEntityError({})).toBeFalse()
    })
})

describe('TypeNotFoundError', () => {
    test('createTypeNotFoundError with invalid typeName', () => {
        expect(() => createTypeNotFoundError(5 as any)).toThrow(
            expect.objectContaining({
                message: 'Argument "typeName" must be a string.',
                name: 'AssertionError',
            }),
        )
    })
    test('createTypeNotFoundError with valid typeName', () => {
        const error = createTypeNotFoundError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOtError TypeNotFound')
        expect(error.message).toBe('Type "test" not found.')
        expect(error.typeName).toBe('test')
    })
    test('isTypeNotFoundError', () => {
        const error = createTypeNotFoundError('test')
        expect(isSyncOtError(error)).toBeTrue()
        expect(isTypeNotFoundError(error)).toBeTrue()
        expect(isTypeNotFoundError(new Error())).toBeFalse()
        expect(isTypeNotFoundError({})).toBeFalse()
    })
})

describe('NoServiceError', () => {
    test('createNoServiceError', () => {
        const error = createNoServiceError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOtError NoService')
        expect(error.message).toBe('test')
    })
    test('isNoServiceError', () => {
        const error = createNoServiceError('test')
        expect(isSyncOtError(error)).toBeTrue()
        expect(isNoServiceError(error)).toBeTrue()
        expect(isNoServiceError(new Error())).toBeFalse()
        expect(isNoServiceError({})).toBeFalse()
    })
})

describe('DisconnectedError', () => {
    test('createDisconnectedError', () => {
        const error = createDisconnectedError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOtError Disconnected')
        expect(error.message).toBe('test')
    })
    test('isDisconnectedError', () => {
        const error = createDisconnectedError('test')
        expect(isSyncOtError(error)).toBeTrue()
        expect(isDisconnectedError(error)).toBeTrue()
        expect(isDisconnectedError(new Error())).toBeFalse()
        expect(isDisconnectedError({})).toBeFalse()
    })
})

describe('NotInitializedError', () => {
    test('createNotInitializedError', () => {
        const error = createNotInitializedError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOtError NotInitialized')
        expect(error.message).toBe('test')
    })
    test('isNotInitializedError', () => {
        const error = createNotInitializedError('test')
        expect(isSyncOtError(error)).toBeTrue()
        expect(isNotInitializedError(error)).toBeTrue()
        expect(isNotInitializedError(new Error())).toBeFalse()
        expect(isNotInitializedError({})).toBeFalse()
    })
})

describe('AlreadyInitializedError', () => {
    test('createAlreadyInitializedError', () => {
        const error = createAlreadyInitializedError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOtError AlreadyInitialized')
        expect(error.message).toBe('test')
    })
    test('isAlreadyInitializedError', () => {
        const error = createAlreadyInitializedError('test')
        expect(isSyncOtError(error)).toBeTrue()
        expect(isAlreadyInitializedError(error)).toBeTrue()
        expect(isAlreadyInitializedError(new Error())).toBeFalse()
        expect(isAlreadyInitializedError({})).toBeFalse()
    })
})

describe('UnexpectedSessionIdError', () => {
    test('createUnexpectedSessionIdError', () => {
        const error = createUnexpectedSessionIdError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOtError UnexpectedSessionId')
        expect(error.message).toBe('test')
    })
    test('isUnexpectedSessionIdError', () => {
        const error = createUnexpectedSessionIdError('test')
        expect(isSyncOtError(error)).toBeTrue()
        expect(isUnexpectedSessionIdError(error)).toBeTrue()
        expect(isUnexpectedSessionIdError(new Error())).toBeFalse()
        expect(isUnexpectedSessionIdError({})).toBeFalse()
    })
})

describe('UnexpectedSequenceNumberError', () => {
    test('createUnexpectedSequenceNumberError', () => {
        const error = createUnexpectedSequenceNumberError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOtError UnexpectedSequenceNumber')
        expect(error.message).toBe('test')
        expect(isSyncOtError(error)).toBeTrue()
        expect(isUnexpectedSequenceNumberError(error)).toBeTrue()
    })
    test('isUnexpectedSequenceNumberError', () => {
        expect(isUnexpectedSequenceNumberError(new Error())).toBeFalse()
        expect(isUnexpectedSequenceNumberError({})).toBeFalse()
    })
})

describe('UnexpectedVersionNumberError', () => {
    test('createUnexpectedVersionNumberError', () => {
        const error = createUnexpectedVersionNumberError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOtError UnexpectedVersionNumber')
        expect(error.message).toBe('test')
    })
    test('not a UnexpectedVersionNumberError', () => {
        const error = createUnexpectedVersionNumberError('test')
        expect(isSyncOtError(error)).toBeTrue()
        expect(isUnexpectedVersionNumberError(error)).toBeTrue()
        expect(isUnexpectedVersionNumberError(new Error())).toBeFalse()
        expect(isUnexpectedVersionNumberError({})).toBeFalse()
    })
})

describe('SessionError', () => {
    test('createSessionError', () => {
        const error = createSessionError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOtError Session')
        expect(error.message).toBe('test')
        expect(error.cause).toBe(undefined)
    })
    test('createSessionError with cause', () => {
        const cause = new Error('Test cause!')
        const error = createSessionError('Test message.', cause)
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOtError Session')
        expect(error.message).toBe('Test message. => Error: Test cause!')
        expect(error.toString()).toBe(
            'SyncOtError Session: Test message. => Error: Test cause!',
        )
        expect(error.cause).toBe(cause)
    })
    test('isSessionError', () => {
        const error = createSessionError('test')
        expect(isSyncOtError(error)).toBeTrue()
        expect(isSessionError(error)).toBeTrue()
        expect(isSessionError(new Error())).toBeFalse()
        expect(isSessionError({})).toBeFalse()
    })
})

describe('PresenceError', () => {
    test('createPresenceError', () => {
        const error = createPresenceError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOtError Presence')
        expect(error.message).toBe('test')
        expect(error.cause).toBe(undefined)
    })
    test('createPresenceError with cause', () => {
        const cause = new Error('Test cause!')
        const error = createPresenceError('Test message.', cause)
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOtError Presence')
        expect(error.message).toBe('Test message. => Error: Test cause!')
        expect(error.toString()).toBe(
            'SyncOtError Presence: Test message. => Error: Test cause!',
        )
        expect(error.cause).toBe(cause)
    })
    test('isPresenceError', () => {
        const error = createPresenceError('test')
        expect(isSyncOtError(error)).toBeTrue()
        expect(isPresenceError(error)).toBeTrue()
        expect(isPresenceError(new Error())).toBeFalse()
        expect(isPresenceError({})).toBeFalse()
    })
})

describe('AuthError', () => {
    test('createAuthError', () => {
        const error = createAuthError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOtError Auth')
        expect(error.message).toBe('test')
        expect(error.cause).toBe(undefined)
    })
    test('createAuthError with cause', () => {
        const cause = new Error('Test cause!')
        const error = createAuthError('Test message.', cause)
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOtError Auth')
        expect(error.message).toBe('Test message. => Error: Test cause!')
        expect(error.toString()).toBe(
            'SyncOtError Auth: Test message. => Error: Test cause!',
        )
        expect(error.cause).toBe(cause)
    })
    test('isAuthError', () => {
        const error = createAuthError('test')
        expect(isSyncOtError(error)).toBeTrue()
        expect(isAuthError(error)).toBeTrue()
        expect(isAuthError(new Error())).toBeFalse()
        expect(isAuthError({})).toBeFalse()
    })
})

describe('DuplicateIdError', () => {
    test('createDuplicateIdError', () => {
        const error = createDuplicateIdError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOtError DuplicateId')
        expect(error.message).toBe('test')
    })
    test('isDuplicateIdError', () => {
        const error = createDuplicateIdError('test')
        expect(isSyncOtError(error)).toBeTrue()
        expect(isDuplicateIdError(error)).toBeTrue()
        expect(isDuplicateIdError(new Error())).toBeFalse()
        expect(isDuplicateIdError({})).toBeFalse()
    })
})

describe('InvalidStreamError', () => {
    test('createInvalidStreamError', () => {
        const error = createInvalidStreamError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOtError InvalidStream')
        expect(error.message).toBe('test')
    })
    test('isInvalidStreamError', () => {
        const error = createInvalidStreamError('test')
        expect(isSyncOtError(error)).toBeTrue()
        expect(isInvalidStreamError(error)).toBeTrue()
        expect(isInvalidStreamError(new Error())).toBeFalse()
        expect(isInvalidStreamError({})).toBeFalse()
    })
})

describe('SocketError', () => {
    test('createSocketError', () => {
        const error = createSocketError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOtError Socket')
        expect(error.message).toBe('test')
        expect(error.cause).toBe(undefined)
    })
    test('createSocketError with cause', () => {
        const cause = new Error('Test cause!')
        const error = createSocketError('Test message.', cause)
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOtError Socket')
        expect(error.message).toBe('Test message. => Error: Test cause!')
        expect(error.toString()).toBe(
            'SyncOtError Socket: Test message. => Error: Test cause!',
        )
        expect(error.cause).toBe(cause)
    })
    test('isSocketError', () => {
        const error = createSocketError('test')
        expect(isSyncOtError(error)).toBeTrue()
        expect(isSocketError(error)).toBeTrue()
        expect(isSocketError(new Error())).toBeFalse()
        expect(isSocketError({})).toBeFalse()
    })
})

describe('CompositeError', () => {
    test('createCompositeError', () => {
        const error = createCompositeError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOtError Composite')
        expect(error.message).toBe('test')
        expect(error.errors).toEqual([])
    })
    test('createCompositeError with errors', () => {
        const errors = [new Error('error 1.'), new Error('error 2.')]
        const error = createCompositeError('Test message.', errors)
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOtError Composite')
        expect(error.message).toBe('Test message.')
        expect(error.toString()).toBe('SyncOtError Composite: Test message.')
        expect(error.errors).toBe(errors)
    })
    test('isCompositeError', () => {
        const error = createCompositeError('test')
        expect(isSyncOtError(error)).toBeTrue()
        expect(isCompositeError(error)).toBeTrue()
        expect(isCompositeError(new Error())).toBeFalse()
        expect(isCompositeError({})).toBeFalse()
    })
})

describe('AssertError', () => {
    test('createAssertError', () => {
        const error = createAssertError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOtError Assert')
        expect(error.message).toBe('test')
    })
    test('isAssertError', () => {
        const error = createAssertError('test')
        expect(isSyncOtError(error)).toBeTrue()
        expect(isAssertError(error)).toBeTrue()
        expect(isAssertError(new Error())).toBeFalse()
        expect(isAssertError({})).toBeFalse()
    })
})
