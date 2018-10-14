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
let operation1: NumberOperation
let operation2: NumberOperation
let typeManager: TypeManager

beforeEach(() => {
    type0 = {
        apply: jest.fn(),
        applyX: jest.fn(),
        invert: jest.fn(),
        name: 'type0',
        transform: jest.fn(),
        transformX: jest.fn(),
    }
    type1 = {
        apply: jest.fn(),
        applyX: jest.fn(),
        invert: jest.fn(),
        name: 'type1',
        transform: jest.fn(),
        transformX: jest.fn(),
    }
    type2 = {
        apply: jest.fn(),
        applyX: jest.fn(),
        invert: jest.fn(),
        name: 'type2',
        transform: jest.fn(),
        transformX: jest.fn(),
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
    operation1 = {
        data: 1,
        type: type1.name
    }
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

describe('transform', () => {
    describe('priority=true', () => {
        test('fails, if type not found', () => {
            expectTypeNotFound(typeManager.transform(operation1, operation0, true))
        })
        test('fails on invalid operation', () => {
            expectInvalidOperation(typeManager.transform(operation1, null as any, true))
        })
        test('calls Type#transform', () => {
            (type2.transform as any).mockReturnValue(7)
            expect(typeManager.transform(operation1, operation2, true).getValue()).toBe(7)
            expect(type1.transform).not.toBeCalled()
            expect(type1.transformX).not.toBeCalled()
            expect(type2.transform).toHaveBeenCalledTimes(1)
            expect((type2.transform as any).mock.instances[0]).toBe(type2)
            expect(type2.transform).toHaveBeenCalledWith(operation1, operation2, true)
            expect(type2.transformX).not.toBeCalled()
        })
        test('calls Type#transformX', () => {
            type2.transform = undefined;
            (type2.transformX as any).mockReturnValue([ 7, 9 ])
            expect(typeManager.transform(operation1, operation2, true).getValue()).toBe(7)
            expect(type1.transform).not.toBeCalled()
            expect(type1.transformX).not.toBeCalled()
            expect(type2.transformX).toHaveBeenCalledTimes(1)
            expect((type2.transformX as any).mock.instances[0]).toBe(type2)
            expect(type2.transformX).toHaveBeenCalledWith(operation1, operation2)
        })
        test('does not transform the operation', () => {
            type2.transform = undefined
            type2.transformX = undefined
            expect(typeManager.transform(operation1, operation2, true).getValue()).toBe(operation1)
            expect(type1.transform).not.toBeCalled()
            expect(type1.transformX).not.toBeCalled()
        })
    })

    describe('priority=false', () => {
        test('fails, if type not found', () => {
            expectTypeNotFound(typeManager.transform(operation0, operation1, false))
        })
        test('fails on invalid operation', () => {
            expectInvalidOperation(typeManager.transform(null as any, snapshot1, false))
        })
        test('calls Type#transform', () => {
            (type1.transform as any).mockReturnValue(7)
            expect(typeManager.transform(operation1, operation2, false).getValue()).toBe(7)
            expect(type1.transform).toHaveBeenCalledTimes(1)
            expect((type1.transform as any).mock.instances[0]).toBe(type1)
            expect(type1.transform).toHaveBeenCalledWith(operation1, operation2, false)
            expect(type1.transformX).not.toBeCalled()
            expect(type2.transform).not.toBeCalled()
            expect(type2.transformX).not.toBeCalled()
        })
        test('calls Type#transformX', () => {
            type1.transform = undefined;
            (type1.transformX as any).mockReturnValue([ 7, 9 ])
            expect(typeManager.transform(operation1, operation2, false).getValue()).toBe(9)
            expect(type1.transformX).toHaveBeenCalledTimes(1)
            expect((type1.transformX as any).mock.instances[0]).toBe(type1)
            expect(type1.transformX).toHaveBeenCalledWith(operation2, operation1)
            expect(type2.transform).not.toBeCalled()
            expect(type2.transformX).not.toBeCalled()
        })
        test('does not transform the operation', () => {
            type1.transform = undefined
            type1.transformX = undefined
            expect(typeManager.transform(operation1, operation2, false).getValue()).toBe(operation1)
            expect(type2.transform).not.toBeCalled()
            expect(type2.transformX).not.toBeCalled()
        })
    })
})

describe('transformX', () => {
    test('fails, if type not found', () => {
        expectTypeNotFound(typeManager.transformX(operation1, operation0))
    })
    test('fails on invalid operation', () => {
        expectInvalidOperation(typeManager.transformX(operation1, null as any))
    })
    test('calls Type#transformX', () => {
        const returnValue = [ 7, 9 ];
        (type2.transformX as any).mockReturnValue(returnValue)
        expect(typeManager.transformX(operation1, operation2).getValue()).toBe(returnValue)
        expect(type1.transform).not.toBeCalled()
        expect(type1.transformX).not.toBeCalled()
        expect(type2.transform).not.toBeCalled()
        expect(type2.transformX).toHaveBeenCalledTimes(1)
        expect((type2.transformX as any).mock.instances[0]).toBe(type2)
        expect(type2.transformX).toHaveBeenCalledWith(operation1, operation2)
    })
    test('calls Type#transform', () => {
        (type2.transform as any).mockReturnValueOnce(7);
        (type2.transform as any).mockReturnValueOnce(9)
        type2.transformX = undefined
        expect(typeManager.transformX(operation1, operation2).getValue()).toEqual([ 7, 9 ])
        expect(type1.transform).not.toBeCalled()
        expect(type1.transformX).not.toBeCalled()
        expect(type2.transform).toHaveBeenCalledTimes(2)
        expect((type2.transform as any).mock.instances[0]).toBe(type2)
        expect((type2.transform as any).mock.instances[1]).toBe(type2)
        expect(type2.transform).toHaveBeenNthCalledWith(1, operation1, operation2, true)
        expect(type2.transform).toHaveBeenNthCalledWith(2, operation2, operation1, false)
    })
    test('does not transform the operations', () => {
        type2.transform = undefined
        type2.transformX = undefined
        expect(typeManager.transformX(operation1, operation2).getValue()).toEqual([ operation1, operation2 ])
        expect(type1.transform).not.toBeCalled()
        expect(type1.transformX).not.toBeCalled()
    })
})
