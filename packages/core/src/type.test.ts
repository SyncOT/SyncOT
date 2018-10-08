import { ErrorCodes, SyncOtError } from './error'
import { createTypeManager, Operation, Snapshot, Type, TypeManager } from './type'

const name = 'test-type'
const apply = (snapshot: Snapshot, _operation: Operation): Snapshot => snapshot
const type: Type = { apply, name }

let typeManager: TypeManager

beforeEach(() => {
    typeManager = createTypeManager()
})

describe('registerType', () => {
    test('register a type', () => {
        typeManager.registerType(type)
        expect(typeManager.getType(name).getValue()).toBe(type)
    })

    test('fail to register the same type twice', () => {
        typeManager.registerType(type)
        expect(() => typeManager.registerType(type)).toThrowError()
    })
})

describe('getType', () => {
    test('get a type by name', () => {
        typeManager.registerType(type)
        expect(typeManager.getType(name).getValue()).toBe(type)
    })

    test('fail to get a non-existant type', () => {
        const error = typeManager.getType(name).getError() as SyncOtError
        expect(error).toBeInstanceOf(SyncOtError)
        expect(error.code).toBe(ErrorCodes.TypeNotFound)
    })
})
