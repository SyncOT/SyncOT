import {
    createAssertError,
    createAuthError,
    createCompositeError,
    createDuplicateIdError,
    createError,
    createInvalidEntityError,
    createInvalidStreamError,
    createPingError,
    createPresenceError,
    createSocketError,
    CustomError,
    fromJSON,
    isAssertError,
    isAuthError,
    isCompositeError,
    isCustomError,
    isDuplicateIdError,
    isInvalidEntityError,
    isInvalidStreamError,
    isPingError,
    isPresenceError,
    isSocketError,
    isSyncOTError,
    toJSON,
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
    test('createError with no data', () => {
        const error = createError()
        expect(error).toBeInstanceOf(Error)
        expect(error.propertyIsEnumerable('name')).toBeFalse()
        expect(error.name).toBe('Error')
        expect(error.message).toBe('')
        expect(error.cause).toBeUndefined()
        expect(error.toString()).toBe('Error')
    })
    test('createError with invalid data', () => {
        expect(() => createError(5 as any)).toThrow(
            expect.objectContaining({
                message: 'Argument "data" must be an object.',
                name: 'SyncOTError Assert',
            }),
        )
    })
    test('createError with invalid data.name', () => {
        expect(() => createError({ name: 5 as any })).toThrow(
            expect.objectContaining({
                message: 'Argument "data.name" must be a string or undefined.',
                name: 'SyncOTError Assert',
            }),
        )
    })
    test('createError with invalid data.message', () => {
        expect(() => createError({ message: 5 as any })).toThrow(
            expect.objectContaining({
                message:
                    'Argument "data.message" must be a string or undefined.',
                name: 'SyncOTError Assert',
            }),
        )
    })
    test('createError with invalid data.cause', () => {
        expect(() => createError({ cause: 5 as any })).toThrow(
            expect.objectContaining({
                message: 'Argument "data.cause" must be an Error or undefined.',
                name: 'SyncOTError Assert',
            }),
        )
    })

    test('isCustomError', () => {
        expect(isCustomError(createError())).toBeTrue()
        expect(isCustomError(createError({ name: 'AnyError' }))).toBeTrue()
        expect(isCustomError(createError({ name: 'AnyError abc' }))).toBeTrue()
        expect(isCustomError(createError({ name: 'AnyErrors' }))).toBeTrue()
        expect(isCustomError({ name, message, cause })).toBeTrue()
        expect(
            isCustomError({ name, message, cause: { name, message, cause } }),
        ).toBeTrue()
        expect(isCustomError({})).toBeFalse()
        expect(isCustomError({ name: '' })).toBeFalse()
        expect(isCustomError({ message: '' })).toBeFalse()
        expect(isCustomError({ name, message, cause: { name } })).toBeFalse()
        expect(
            isCustomError({
                name,
                message,
                cause: { name, message, cause: { name } },
            }),
        ).toBeFalse()
    })

    test('isSyncOTError', () => {
        expect(isSyncOTError(createError({ name: 'SyncOTError' }))).toBeTrue()
        expect(
            isSyncOTError(createError({ name: 'SyncOTError abc' })),
        ).toBeTrue()
        expect(isSyncOTError({ name: 'SyncOTError', message })).toBeTrue()
        expect(isSyncOTError({ name: 'SyncOTError abc', message })).toBeTrue()
        expect(isSyncOTError(createError())).toBeFalse()
        expect(isSyncOTError(createError({ name: 'SyncOTErrors' }))).toBeFalse()
        expect(isSyncOTError({})).toBeFalse()
        expect(isSyncOTError({ name: 'SyncOTErrors', message })).toBeFalse()
    })

    describe('toJSON', () => {
        test('valid with valid cause', () => {
            const error = createError({ name, message, cause })
            expect(toJSON(error)).toEqual({
                name: error.name,
                message: error.message,
                cause: {
                    name: cause.name,
                    message: cause.message,
                },
            })
        })

        test('valid with invalid cause', () => {
            const error: CustomError = new Error(message)
            error.cause = 5 as any
            expect(toJSON(error)).toEqual({
                name: error.name,
                message: error.message,
                cause: {
                    name: 'TypeError',
                    message: 'Invalid "error" object.',
                    error: 5,
                },
            })
        })

        test('valid with no cause', () => {
            const error = createError({ name, message })
            expect(toJSON(error)).toEqual({
                name: error.name,
                message: error.message,
            })
        })

        test('invalid', () => {
            expect(toJSON(5 as any)).toEqual({
                name: 'TypeError',
                message: 'Invalid "error" object.',
                error: 5,
            })
        })
    })

    describe('fromJSON', () => {
        test('valid with valid cause', () => {
            const data = {
                name,
                message,
                cause: { name: causeName, message: causeMessage },
            }
            const error = fromJSON(data)
            expect(toJSON(error)).toEqual(data)
            expect(error.stack).toBeString()
            expect(error.cause!.stack).toBeString()
        })

        test('valid with invalid cause', () => {
            const data = {
                name,
                message,
                cause: 5 as any,
            }
            const error = fromJSON(data)
            expect(toJSON(error)).toEqual({
                name,
                message,
                cause: {
                    name: 'TypeError',
                    message: 'Invalid "error" object.',
                    error: 5,
                },
            })
            expect(error.stack).toBeString()
            expect(error.cause!.stack).toBeString()
        })

        test('valid with no cause', () => {
            const data = { name, message }
            const error = fromJSON(data)
            expect(toJSON(error)).toEqual(data)
            expect(error.stack).toBeString()
        })

        test('invalid', () => {
            const data = 5 as any
            const error = fromJSON(data)
            expect(toJSON(error)).toEqual({
                name: 'TypeError',
                message: 'Invalid "error" object.',
                error: 5,
            })
            expect(error.stack).toBeString()
        })
    })
})

describe('InvalidEntityError', () => {
    test('createInvalidEntityError with invalid entityName', () => {
        expect(() => createInvalidEntityError(5 as any, {})).toThrow(
            expect.objectContaining({
                message: 'Argument "entityName" must be a string.',
                name: 'SyncOTError Assert',
            }),
        )
    })
    test('createInvalidEntityError with invalid key', () => {
        expect(() => createInvalidEntityError('', {}, 5 as any)).toThrow(
            expect.objectContaining({
                message: 'Argument "key" must be a string or null.',
                name: 'SyncOTError Assert',
            }),
        )
    })
    test('createInvalidEntityError with without key', () => {
        const name = 'MyEntity'
        const entity = { key: 'value' }
        const error = createInvalidEntityError(name, entity)
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOTError InvalidEntity')
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
        expect(error.name).toBe('SyncOTError InvalidEntity')
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
        expect(error.name).toBe('SyncOTError InvalidEntity')
        expect(error.message).toBe(`Invalid "${name}".`)
        expect(error.entityName).toBe(name)
        expect(error.entity).toBe(entity)
        expect(error.key).toBe(key)
    })
    test('isInvalidEntityError', () => {
        const error = createInvalidEntityError('Entity', {}, null)
        expect(isSyncOTError(error)).toBeTrue()
        expect(isInvalidEntityError(error)).toBeTrue()
        expect(isInvalidEntityError(new Error())).toBeFalse()
        expect(isInvalidEntityError({})).toBeFalse()
    })
})

describe('PresenceError', () => {
    test('createPresenceError', () => {
        const error = createPresenceError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOTError Presence')
        expect(error.message).toBe('test')
        expect(error.cause).toBe(undefined)
    })
    test('createPresenceError with cause', () => {
        const cause = new Error('Test cause!')
        const error = createPresenceError('Test message.', cause)
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOTError Presence')
        expect(error.message).toBe('Test message. => Error: Test cause!')
        expect(error.toString()).toBe(
            'SyncOTError Presence: Test message. => Error: Test cause!',
        )
        expect(error.cause).toBe(cause)
    })
    test('isPresenceError', () => {
        const error = createPresenceError('test')
        expect(isSyncOTError(error)).toBeTrue()
        expect(isPresenceError(error)).toBeTrue()
        expect(isPresenceError(new Error())).toBeFalse()
        expect(isPresenceError({})).toBeFalse()
    })
})

describe('AuthError', () => {
    test('createAuthError', () => {
        const error = createAuthError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOTError Auth')
        expect(error.message).toBe('test')
        expect(error.cause).toBe(undefined)
    })
    test('createAuthError with cause', () => {
        const cause = new Error('Test cause!')
        const error = createAuthError('Test message.', cause)
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOTError Auth')
        expect(error.message).toBe('Test message. => Error: Test cause!')
        expect(error.toString()).toBe(
            'SyncOTError Auth: Test message. => Error: Test cause!',
        )
        expect(error.cause).toBe(cause)
    })
    test('isAuthError', () => {
        const error = createAuthError('test')
        expect(isSyncOTError(error)).toBeTrue()
        expect(isAuthError(error)).toBeTrue()
        expect(isAuthError(new Error())).toBeFalse()
        expect(isAuthError({})).toBeFalse()
    })
})

describe('DuplicateIdError', () => {
    test('createDuplicateIdError', () => {
        const error = createDuplicateIdError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOTError DuplicateId')
        expect(error.message).toBe('test')
    })
    test('isDuplicateIdError', () => {
        const error = createDuplicateIdError('test')
        expect(isSyncOTError(error)).toBeTrue()
        expect(isDuplicateIdError(error)).toBeTrue()
        expect(isDuplicateIdError(new Error())).toBeFalse()
        expect(isDuplicateIdError({})).toBeFalse()
    })
})

describe('InvalidStreamError', () => {
    test('createInvalidStreamError', () => {
        const error = createInvalidStreamError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOTError InvalidStream')
        expect(error.message).toBe('test')
    })
    test('isInvalidStreamError', () => {
        const error = createInvalidStreamError('test')
        expect(isSyncOTError(error)).toBeTrue()
        expect(isInvalidStreamError(error)).toBeTrue()
        expect(isInvalidStreamError(new Error())).toBeFalse()
        expect(isInvalidStreamError({})).toBeFalse()
    })
})

describe('SocketError', () => {
    test('createSocketError', () => {
        const error = createSocketError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOTError Socket')
        expect(error.message).toBe('test')
        expect(error.cause).toBe(undefined)
    })
    test('createSocketError with cause', () => {
        const cause = new Error('Test cause!')
        const error = createSocketError('Test message.', cause)
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOTError Socket')
        expect(error.message).toBe('Test message. => Error: Test cause!')
        expect(error.toString()).toBe(
            'SyncOTError Socket: Test message. => Error: Test cause!',
        )
        expect(error.cause).toBe(cause)
    })
    test('isSocketError', () => {
        const error = createSocketError('test')
        expect(isSyncOTError(error)).toBeTrue()
        expect(isSocketError(error)).toBeTrue()
        expect(isSocketError(new Error())).toBeFalse()
        expect(isSocketError({})).toBeFalse()
    })
})

describe('CompositeError', () => {
    test('createCompositeError', () => {
        const error = createCompositeError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOTError Composite')
        expect(error.message).toBe('test')
        expect(error.errors).toEqual([])
    })
    test('createCompositeError with errors', () => {
        const errors = [new Error('error 1.'), new Error('error 2.')]
        const error = createCompositeError('Test message.', errors)
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOTError Composite')
        expect(error.message).toBe('Test message.')
        expect(error.toString()).toBe('SyncOTError Composite: Test message.')
        expect(error.errors).toBe(errors)
    })
    test('isCompositeError', () => {
        const error = createCompositeError('test')
        expect(isSyncOTError(error)).toBeTrue()
        expect(isCompositeError(error)).toBeTrue()
        expect(isCompositeError(new Error())).toBeFalse()
        expect(isCompositeError({})).toBeFalse()
    })
})

describe('AssertError', () => {
    test('createAssertError', () => {
        const error = createAssertError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOTError Assert')
        expect(error.message).toBe('test')
    })
    test('isAssertError', () => {
        const error = createAssertError('test')
        expect(isSyncOTError(error)).toBeTrue()
        expect(isAssertError(error)).toBeTrue()
        expect(isAssertError(new Error())).toBeFalse()
        expect(isAssertError({})).toBeFalse()
    })
})

describe('PingError', () => {
    test('createPingError', () => {
        const error = createPingError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOTError Ping')
        expect(error.message).toBe('test')
        expect(error.cause).toBe(undefined)
    })
    test('createPingError with cause', () => {
        const cause = new Error('Test cause!')
        const error = createPingError('Test message.', cause)
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOTError Ping')
        expect(error.message).toBe('Test message. => Error: Test cause!')
        expect(error.toString()).toBe(
            'SyncOTError Ping: Test message. => Error: Test cause!',
        )
        expect(error.cause).toBe(cause)
    })
    test('isPingError', () => {
        const error = createPingError('test')
        expect(isSyncOTError(error)).toBeTrue()
        expect(isPingError(error)).toBeTrue()
        expect(isPingError(new Error())).toBeFalse()
        expect(isPingError({})).toBeFalse()
    })
})
