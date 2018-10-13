import { ErrorCodes, SyncOtError } from './error'
import { Result } from './result'
import { createTypeManager, Operation, Snapshot, Type, TypeManager } from './type'

interface NumberSnapshot extends Snapshot { data: number }
interface NumberOperation extends Operation { data: number }

const expectFail = (errorCode: ErrorCodes) => (result: Result<any>) => {
    expect(result.isFail()).toBe(true)
    const error = result.getError() as SyncOtError
    expect(error).toBeInstanceOf(SyncOtError)
    expect(error.code).toBe(errorCode)
}
const expectTypeNotFound = expectFail(ErrorCodes.TypeNotFound)
const expectNotImplemented = expectFail(ErrorCodes.NotImplemented)
const expectInvalidOperation = expectFail(ErrorCodes.InvalidOperation)
// const expectInvalidSnapshot = expectFail(ErrorCodes.InvalidSnapshot)

let type0: Type
let type1: Type
let type2: Type
// let snapshot0: NumberSnapshot
let snapshot1: NumberSnapshot
// let snapshot2: NumberSnapshot
let operation0: NumberOperation
// let operation1: NumberOperation
let operation2: NumberOperation
let typeManager: TypeManager

beforeEach(() => {
    type0 = {
        apply: jest.fn(),
        applyX: jest.fn(),
        invert: jest.fn(),
        name: 'type0'
    }
    type1 = {
        apply: jest.fn(),
        applyX: jest.fn(),
        invert: jest.fn(),
        name: 'type1'
    }
    type2 = {
        apply: jest.fn(),
        applyX: jest.fn(),
        invert: jest.fn(),
        name: 'type2'
    }
    // snapshot0 = {
    //     data: 0,
    //     type: type0.name
    // }
    snapshot1 = {
        data: 1,
        type: type1.name
    }
    // snapshot2 = {
    //     data: 2,
    //     type: type2.name
    // }
    operation0 = {
        data: 0,
        type: type0.name
    }
    // operation1 = {
    //     data: 1,
    //     type: type1.name
    // }
    operation2 = {
        data: 2,
        type: type2.name
    }
    typeManager = createTypeManager()
    typeManager.registerType(type1)
    typeManager.registerType(type2)
})

describe('registerType', () => {
    test('register a type', () => {
        typeManager.registerType(type0)
    })
    test('fail to register the same type twice', () => {
        expect.hasAssertions()
        typeManager.registerType(type0)
        try {
            typeManager.registerType(type0)
        } catch (error) {
            expect(error).toBeInstanceOf(SyncOtError)
            expect(error.code).toBe(ErrorCodes.DuplicateType)
            expect(error.message).toBe(`Duplicate type: ${type0.name}`)
        }
    })
})

describe('getType', () => {
    test('get a type by name', () => {
        typeManager.registerType(type0)
        expect(typeManager.getType(type0.name).getValue()).toBe(type0)
        expect(typeManager.getType(type1.name).getValue()).toBe(type1)
        expect(typeManager.getType(type2.name).getValue()).toBe(type2)
    })
    test('fail to get a non-existant type', () => {
        expectTypeNotFound(typeManager.getType(type0.name))
    })
})

describe('apply', () => {
    test('fails, if type not found', () => {
        expectTypeNotFound(typeManager.apply(snapshot1, operation0))
    })
    test('fails on invalid operation', () => {
        expectInvalidOperation(typeManager.apply(snapshot1, null as any))
    })
    test('calls Type#apply', () => {
        (type2.apply as any).mockReturnValue(7)
        expect(typeManager.apply(snapshot1, operation2).getValue()).toBe(7)
        expect(type1.apply).not.toBeCalled()
        expect(type2.apply).toHaveBeenCalledTimes(1)
        expect((type2.apply as any).mock.instances[0]).toBe(type2)
        expect(type2.apply).toHaveBeenCalledWith(snapshot1, operation2)
    })
})

describe('applyX', () => {
    test('fails, if type not found', () => {
        expectTypeNotFound(typeManager.applyX(snapshot1, operation0))
    })
    test('fails on invalid operation', () => {
        expectInvalidOperation(typeManager.applyX(snapshot1, null as any))
    })
    test('calls Type#applyX', () => {
        const returnValue = [ 7, 9 ];
        (type2.applyX as any).mockReturnValue(returnValue)
        expect(typeManager.applyX(snapshot1, operation2).getValue()).toBe(returnValue)
        expect(type1.apply).not.toBeCalled()
        expect(type1.applyX).not.toBeCalled()
        expect(type1.invert).not.toBeCalled()
        expect(type2.apply).not.toBeCalled()
        expect(type2.applyX).toHaveBeenCalledTimes(1)
        expect((type2.applyX as any).mock.instances[0]).toBe(type2)
        expect(type2.applyX).toHaveBeenCalledWith(snapshot1, operation2)
        expect(type2.invert).not.toBeCalled()
    })
    test('calls Type#apply and Type#invert', () => {
        (type2.apply as any).mockReturnValue(7);
        type2.applyX = undefined;
        (type2.invert as any).mockReturnValue(9)
        expect(typeManager.applyX(snapshot1, operation2).getValue()).toEqual([ 7, 9 ])
        expect(type1.apply).not.toBeCalled()
        expect(type1.applyX).not.toBeCalled()
        expect(type1.invert).not.toBeCalled()
        expect(type2.apply).toHaveBeenCalledTimes(1)
        expect((type2.apply as any).mock.instances[0]).toBe(type2)
        expect(type2.apply).toHaveBeenCalledWith(snapshot1, operation2)
        expect(type2.invert).toHaveBeenCalledTimes(1)
        expect((type2.invert as any).mock.instances[0]).toBe(type2)
        expect(type2.invert).toHaveBeenCalledWith(operation2)
    })
    test('fails, if neither applyX nor invert are implemented', () => {
        type2.applyX = undefined
        type2.invert = undefined
        expectNotImplemented(typeManager.applyX(snapshot1, operation2))
        expect(type1.apply).not.toBeCalled()
        expect(type1.applyX).not.toBeCalled()
        expect(type1.invert).not.toBeCalled()
        expect(type2.apply).not.toBeCalled()
    })
})
