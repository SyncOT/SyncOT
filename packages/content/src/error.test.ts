import { isSyncOTError } from '@syncot/util'
import {
    createAlreadyExistsError,
    createNotFoundError,
    isAlreadyExistsError,
    isNotFoundError,
} from '.'

describe('AlreadyExistsError', () => {
    test('createAlreadyExistsError with invalid entityName', () => {
        expect(() => createAlreadyExistsError(5 as any, {})).toThrow(
            expect.objectContaining({
                message: 'Argument "entityName" must be a string.',
                name: 'SyncOTError Assert',
            }),
        )
    })
    test('createAlreadyExistsError with invalid key', () => {
        expect(() => createAlreadyExistsError('', {}, 5 as any)).toThrow(
            expect.objectContaining({
                message: 'Argument "key" must be a string or null.',
                name: 'SyncOTError Assert',
            }),
        )
    })
    test('createAlreadyExistsError with without key', () => {
        const name = 'MyEntity'
        const entity = { key: 'value' }
        const error = createAlreadyExistsError(name, entity)
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOTError AlreadyExists')
        expect(error.message).toBe(`"${name}" already exists.`)
        expect(error.entityName).toBe(name)
        expect(error.entity).toBe(entity)
        expect(error.key).toBe(null)
    })
    test('createAlreadyExistsError with string key', () => {
        const name = 'MyEntity'
        const entity = { key: 'value' }
        const key = 'aKey'
        const error = createAlreadyExistsError(name, entity, key)
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOTError AlreadyExists')
        expect(error.message).toBe(`"${name}" already exists.`)
        expect(error.entityName).toBe(name)
        expect(error.entity).toBe(entity)
        expect(error.key).toBe(key)
    })
    test('createAlreadyExistsError with null key', () => {
        const name = 'MyEntity'
        const entity = { key: 'value' }
        const key = null
        const error = createAlreadyExistsError(name, entity, key)
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOTError AlreadyExists')
        expect(error.message).toBe(`"${name}" already exists.`)
        expect(error.entityName).toBe(name)
        expect(error.entity).toBe(entity)
        expect(error.key).toBe(key)
    })
    test('isAlreadyExistsError', () => {
        const error = createAlreadyExistsError('Entity', {}, null)
        expect(isSyncOTError(error)).toBeTrue()
        expect(isAlreadyExistsError(error)).toBeTrue()
        expect(isAlreadyExistsError(new Error())).toBeFalse()
        expect(isAlreadyExistsError({})).toBeFalse()
    })
})

describe('NotFoundError', () => {
    test('createNotFoundError', () => {
        const error = createNotFoundError('test')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('SyncOTError NotFound')
        expect(error.message).toBe('test')
    })
    test('isNotFoundError', () => {
        const error = createNotFoundError('test')
        expect(isSyncOTError(error)).toBeTrue()
        expect(isNotFoundError(error)).toBeTrue()
        expect(isNotFoundError(new Error())).toBeFalse()
        expect(isNotFoundError({})).toBeFalse()
    })
})
