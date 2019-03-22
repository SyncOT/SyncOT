import {
    createAlreadyInitializedError,
    createAuthError,
    createDisconnectedError,
    createInvalidEntityError,
    createNoServiceError,
    createNotInitializedError,
    createPresenceError,
    createSessionError,
    createSocketClosedError,
    createSyncOtError,
    createTsonError,
    createTypeNotFoundError,
    createUnexpectedSequenceNumberError,
    createUnexpectedSessionIdError,
    createUnexpectedVersionNumberError,
    isAlreadyInitializedError,
    isAuthError,
    isDisconnectedError,
    isInvalidEntityError,
    isNoServiceError,
    isNotInitializedError,
    isPresenceError,
    isSessionError,
    isSocketClosedError,
    isSyncOtError,
    isTsonError,
    isTypeNotFoundError,
    isUnexpectedSequenceNumberError,
    isUnexpectedSessionIdError,
    isUnexpectedVersionNumberError,
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
        expect(isSyncOtError(error)).toBeTrue()
    })
    test('empty name, message', () => {
        const error = createSyncOtError('', message)
        expect(error).toBeInstanceOf(Error)
        expect(error.propertyIsEnumerable('name')).toBe(false)
        expect(error.name).toBe(defaultName)
        expect(error.message).toBe(message)
        expect(error.cause).not.toBeDefined()
        expect(error.toString()).toBe(`${defaultName}: ${message}`)
        expect(isSyncOtError(error)).toBeTrue()
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
        expect(isSyncOtError(error)).toBeTrue()
    })
    test('name, message, invalid cause', () => {
        expect(() => createSyncOtError(name, message, {} as any)).toThrow(
            expect.objectContaining({
                message: 'Invalid arguments.',
                name: 'AssertionError [ERR_ASSERTION]',
            }),
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
        expect(isSyncOtError(error)).toBeTrue()
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
        expect(isSyncOtError(error)).toBeTrue()
    })
    test('message, invalid cause', () => {
        expect(() => createSyncOtError(message, {} as any)).toThrow(
            expect.objectContaining({
                message: 'Invalid arguments.',
                name: 'AssertionError [ERR_ASSERTION]',
            }),
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
        expect(isSyncOtError(error)).toBeTrue()
    })
    test('empty details', () => {
        const error = createSyncOtError({})
        expect(error).toBeInstanceOf(Error)
        expect(error.propertyIsEnumerable('name')).toBe(false)
        expect(error.name).toBe(defaultName)
        expect(error.message).toBe('')
        expect(error.cause).not.toBeDefined()
        expect(error.toString()).toBe(defaultName)
        expect(isSyncOtError(error)).toBeTrue()
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
        expect(isSyncOtError(error)).toBeTrue()
    })
    test('invalid details', () => {
        expect(() => createSyncOtError(5 as any)).toThrow(
            expect.objectContaining({
                message: 'Invalid arguments.',
                name: 'AssertionError [ERR_ASSERTION]',
            }),
        )
    })
    test('invalid details.name', () => {
        expect(() => createSyncOtError({ name: 5 as any })).toThrow(
            expect.objectContaining({
                message:
                    'Argument "details.name" must be a string, null or undefined.',
                name: 'AssertionError [ERR_ASSERTION]',
            }),
        )
    })
    test('invalid details.message', () => {
        expect(() => createSyncOtError({ message: 5 as any })).toThrow(
            expect.objectContaining({
                message:
                    'Argument "details.message" must be a string, null or undefined.',
                name: 'AssertionError [ERR_ASSERTION]',
            }),
        )
    })
    test('invalid details.cause', () => {
        expect(() => createSyncOtError({ cause: 5 as any })).toThrow(
            expect.objectContaining({
                message:
                    'Argument "details.cause" must be an Error, null or undefined.',
                name: 'AssertionError [ERR_ASSERTION]',
            }),
        )
    })
    test('forbidden property: details.stack', () => {
        expect(() => createSyncOtError({ stack: '' })).toThrow(
            expect.objectContaining({
                message: 'Argument "details.stack" must not be present.',
                name: 'AssertionError [ERR_ASSERTION]',
            }),
        )
    })
    test('not a SyntOtError', () => {
        expect(isSyncOtError(new Error())).toBeFalse()
        expect(isSyncOtError({})).toBeFalse()
        expect(
            isSyncOtError(Object.assign(new Error(), { name: 'SyncOtErrors' })),
        ).toBeFalse()
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
        expect(isSyncOtError(error)).toBeTrue()
        expect(isTsonError(error)).toBeTrue()
    })
    test('not a TsonError', () => {
        expect(isTsonError(new Error())).toBeFalse()
        expect(isTsonError({})).toBeFalse()
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
        expect(isSyncOtError(error)).toBeTrue()
        expect(isInvalidEntityError(error)).toBeTrue()
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
        expect(isSyncOtError(error)).toBeTrue()
        expect(isInvalidEntityError(error)).toBeTrue()
    })
    test('not a InvalidEntityError', () => {
        expect(isInvalidEntityError(new Error())).toBeFalse()
        expect(isInvalidEntityError({})).toBeFalse()
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
        expect(isSyncOtError(error)).toBeTrue()
        expect(isTypeNotFoundError(error)).toBeTrue()
    })
    test('not a TypeNotFoundError', () => {
        expect(isTypeNotFoundError(new Error())).toBeFalse()
        expect(isTypeNotFoundError({})).toBeFalse()
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
        expect(isSyncOtError(error)).toBeTrue()
        expect(isNoServiceError(error)).toBeTrue()
    })
    test('not a NoServiceError', () => {
        expect(isNoServiceError(new Error())).toBeFalse()
        expect(isNoServiceError({})).toBeFalse()
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
        expect(isSyncOtError(error)).toBeTrue()
        expect(isDisconnectedError(error)).toBeTrue()
    })
    test('not a DisconnectedError', () => {
        expect(isDisconnectedError(new Error())).toBeFalse()
        expect(isDisconnectedError({})).toBeFalse()
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
        expect(isSyncOtError(error)).toBeTrue()
        expect(isNotInitializedError(error)).toBeTrue()
    })
    test('not a NotInitializedError', () => {
        expect(isNotInitializedError(new Error())).toBeFalse()
        expect(isNotInitializedError({})).toBeFalse()
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
        expect(isSyncOtError(error)).toBeTrue()
        expect(isAlreadyInitializedError(error)).toBeTrue()
    })
    test('AlreadyInitializedError', () => {
        expect(isAlreadyInitializedError(new Error())).toBeFalse()
        expect(isAlreadyInitializedError({})).toBeFalse()
    })
})

describe('createUnexpectedSessionIdError', () => {
    test('invalid message', () => {
        expect(() => createUnexpectedSessionIdError(5 as any)).toThrow(
            expect.objectContaining({
                message: 'Argument "message" must be a string.',
                name: 'AssertionError [ERR_ASSERTION]',
            }),
        )
    })
    test('valid message', () => {
        const error = createUnexpectedSessionIdError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOtError UnexpectedSessionId')
        expect(error.message).toBe('test')
        expect(isSyncOtError(error)).toBeTrue()
        expect(isUnexpectedSessionIdError(error)).toBeTrue()
    })
    test('no message', () => {
        const error = createUnexpectedSessionIdError()
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOtError UnexpectedSessionId')
        expect(error.message).toBe('Unexpected session id.')
        expect(isSyncOtError(error)).toBeTrue()
        expect(isUnexpectedSessionIdError(error)).toBeTrue()
    })
    test('UnexpectedSessionIdError', () => {
        expect(isUnexpectedSessionIdError(new Error())).toBeFalse()
        expect(isUnexpectedSessionIdError({})).toBeFalse()
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
        expect(isSyncOtError(error)).toBeTrue()
        expect(isUnexpectedSequenceNumberError(error)).toBeTrue()
    })
    test('no message', () => {
        const error = createUnexpectedSequenceNumberError()
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOtError UnexpectedSequenceNumber')
        expect(error.message).toBe('Unexpected sequence number.')
        expect(isSyncOtError(error)).toBeTrue()
        expect(isUnexpectedSequenceNumberError(error)).toBeTrue()
    })
    test('not a UnexpectedSequenceNumberError', () => {
        expect(isUnexpectedSequenceNumberError(new Error())).toBeFalse()
        expect(isUnexpectedSequenceNumberError({})).toBeFalse()
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
        expect(isSyncOtError(error)).toBeTrue()
        expect(isUnexpectedVersionNumberError(error)).toBeTrue()
    })
    test('no message', () => {
        const error = createUnexpectedVersionNumberError()
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOtError UnexpectedVersionNumber')
        expect(error.message).toBe('Unexpected version number.')
        expect(isSyncOtError(error)).toBeTrue()
        expect(isUnexpectedVersionNumberError(error)).toBeTrue()
    })
    test('not a UnexpectedVersionNumberError', () => {
        expect(isUnexpectedVersionNumberError(new Error())).toBeFalse()
        expect(isUnexpectedVersionNumberError({})).toBeFalse()
    })
})

describe('createSocketClosedError', () => {
    test('invalid message', () => {
        expect(() => createSocketClosedError(5 as any)).toThrow(
            expect.objectContaining({
                message: 'Argument "message" must be a string.',
                name: 'AssertionError [ERR_ASSERTION]',
            }),
        )
    })
    test('valid message', () => {
        const error = createSocketClosedError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOtError SocketClosed')
        expect(error.message).toBe('test')
        expect(isSyncOtError(error)).toBeTrue()
        expect(isSocketClosedError(error)).toBeTrue()
    })
    test('no message', () => {
        const error = createSocketClosedError()
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOtError SocketClosed')
        expect(error.message).toBe('Socket closed.')
        expect(isSyncOtError(error)).toBeTrue()
        expect(isSocketClosedError(error)).toBeTrue()
    })
    test('not a SocketClosedError', () => {
        expect(isSocketClosedError(new Error())).toBeFalse()
        expect(isSocketClosedError({})).toBeFalse()
    })
})

describe('createSessionError', () => {
    test('invalid message', () => {
        expect(() => createSessionError(5 as any)).toThrow(
            expect.objectContaining({
                message: 'Argument "message" must be a string.',
                name: 'AssertionError [ERR_ASSERTION]',
            }),
        )
    })
    test('valid message', () => {
        const error = createSessionError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOtError Session')
        expect(error.message).toBe('test')
        expect(error.cause).toBe(undefined)
        expect(isSyncOtError(error)).toBeTrue()
        expect(isSessionError(error)).toBeTrue()
    })
    test('not a SessionError', () => {
        expect(isSessionError(new Error())).toBeFalse()
        expect(isSessionError({})).toBeFalse()
    })
    test('with cause', () => {
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
})

describe('createPresenceError', () => {
    test('invalid message', () => {
        expect(() => createPresenceError(5 as any)).toThrow(
            expect.objectContaining({
                message: 'Argument "message" must be a string.',
                name: 'AssertionError [ERR_ASSERTION]',
            }),
        )
    })
    test('valid message', () => {
        const error = createPresenceError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOtError Presence')
        expect(error.message).toBe('test')
        expect(error.cause).toBe(undefined)
        expect(isSyncOtError(error)).toBeTrue()
        expect(isPresenceError(error)).toBeTrue()
    })
    test('not a PresenceError', () => {
        expect(isPresenceError(new Error())).toBeFalse()
        expect(isPresenceError({})).toBeFalse()
    })
    test('with cause', () => {
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
})

describe('createAuthError', () => {
    test('invalid message', () => {
        expect(() => createAuthError(5 as any)).toThrow(
            expect.objectContaining({
                message: 'Argument "message" must be a string.',
                name: 'AssertionError [ERR_ASSERTION]',
            }),
        )
    })
    test('valid message', () => {
        const error = createAuthError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOtError Auth')
        expect(error.message).toBe('test')
        expect(error.cause).toBe(undefined)
        expect(isSyncOtError(error)).toBeTrue()
        expect(isAuthError(error)).toBeTrue()
    })
    test('not an AuthError', () => {
        expect(isAuthError(new Error())).toBeFalse()
        expect(isAuthError({})).toBeFalse()
    })
    test('with cause', () => {
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
})
