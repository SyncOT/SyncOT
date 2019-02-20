import {
    createDisconnectedError,
    createInvalidEntityError,
    createNoServiceError,
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
