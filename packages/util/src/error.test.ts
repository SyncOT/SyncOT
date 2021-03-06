import {
    assert,
    assertUnreachable,
    createAssertError,
    createCompositeError,
    createEntityTooLargeError,
    createError,
    createInvalidEntityError,
    CustomError,
    fromJSON,
    isAssertError,
    isCompositeError,
    isEntityTooLargeError,
    isCustomError,
    isInvalidEntityError,
    isSyncOTError,
    toJSON,
} from '.'

describe('assert', () => {
    const message = 'Test message'

    test.each([true, 1, {}, () => 0, [], 'false'])(
        'do not throw on: value === %p',
        (value) => {
            assert(value, message)
        },
    )

    test.each([false, 0, null, undefined, ''])(
        'throw on: value === %p',
        (value) => {
            expect(() => assert(value, message)).toThrow(
                expect.objectContaining({
                    message,
                    name: 'SyncOTError Assert',
                }),
            )
        },
    )

    test('do not throw without a message', () => {
        assert(true)
    })

    test('throw without a message', () => {
        expect(() => assert(false)).toThrow(
            expect.objectContaining({
                message: '',
                name: 'SyncOTError Assert',
            }),
        )
    })
})

describe('assertUnreachable', () => {
    test('throws an error (with a param)', () => {
        expect(() => assertUnreachable({} as never)).toThrow(
            expect.objectContaining({
                message: 'This should never happen!',
                name: 'SyncOTError Assert',
            }),
        )
    })
    test('throws an error (without a param)', () => {
        expect(() => assertUnreachable()).toThrow(
            expect.objectContaining({
                message: 'This should never happen!',
                name: 'SyncOTError Assert',
            }),
        )
    })
})

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
        expect(error.cause).toBe(undefined)
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
        expect(error.cause).toBe(undefined)
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
        expect(error.cause).toBe(undefined)
    })
    test('createInvalidEntityError with cause', () => {
        const name = 'MyEntity'
        const entity = { key: 'value' }
        const key = 'aKey'
        const cause = new Error('test cause')
        const error = createInvalidEntityError(name, entity, key, cause)
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOTError InvalidEntity')
        expect(error.message).toBe(
            `Invalid "${name}.${key}". => Error: test cause`,
        )
        expect(error.entityName).toBe(name)
        expect(error.entity).toBe(entity)
        expect(error.key).toBe(key)
        expect(error.cause).toBe(cause)
    })
    test('isInvalidEntityError', () => {
        const error = createInvalidEntityError('Entity', {}, null)
        expect(isSyncOTError(error)).toBeTrue()
        expect(isInvalidEntityError(error)).toBeTrue()
        expect(isInvalidEntityError(new Error())).toBeFalse()
        expect(isInvalidEntityError({})).toBeFalse()
    })
})

describe('EntityTooLargeError', () => {
    test('createEntityTooLargeError with invalid entityName', () => {
        expect(() => createEntityTooLargeError(5 as any)).toThrow(
            expect.objectContaining({
                message: 'Argument "entityName" must be a string.',
                name: 'SyncOTError Assert',
            }),
        )
    })
    test('createInvalidEntityError with valid entityName', () => {
        const name = 'MyEntity'
        const error = createEntityTooLargeError(name)
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOTError EntityTooLarge')
        expect(error.message).toBe(`"${name}" too large.`)
        expect(error.entityName).toBe(name)
    })
    test('isEntityTooLargeError', () => {
        const error = createEntityTooLargeError('Entity')
        expect(isSyncOTError(error)).toBeTrue()
        expect(isEntityTooLargeError(error)).toBeTrue()
        expect(isEntityTooLargeError(new Error())).toBeFalse()
        expect(isEntityTooLargeError({})).toBeFalse()
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
