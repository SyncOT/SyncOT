import { ErrorCodes, SyncOtError } from './error'
import { Operation, Snapshot, Type } from './type'
import { TypeManager } from './typeManager'

export const typeManagerTests = (createTypeManager: () => TypeManager) => {
    describe('TypeManager', () => {
        const client = 'client-id'
        const id = 'document-id'
        const unknownTypeName = 'unknown-type'
        const typeName = 'type-name'

        const snapshot1: Snapshot = {
            client,
            data: 0,
            id,
            kind: 'Snapshot',
            meta: 0,
            sequence: 0,
            type: typeName,
            version: 0,
        }
        const snapshot2: Snapshot = { ...snapshot1 }
        const snapshot3: Snapshot = { ...snapshot1 }
        const unknownSnapshot: Snapshot = {
            ...snapshot1,
            type: unknownTypeName,
        }

        const operation1: Operation = {
            client,
            data: 0,
            id,
            kind: 'Operation',
            meta: 0,
            sequence: 0,
            type: typeName,
            version: 0,
        }
        const operation2: Operation = { ...operation1 }
        const operation3: Operation = { ...operation1 }
        const operation4: Operation = { ...operation1 }
        const unknownOperation: Operation = {
            ...operation1,
            type: unknownTypeName,
        }

        // Freeze them just in case.
        Object.freeze(snapshot1)
        Object.freeze(snapshot2)
        Object.freeze(snapshot3)
        Object.freeze(unknownSnapshot)
        Object.freeze(operation1)
        Object.freeze(operation2)
        Object.freeze(operation3)
        Object.freeze(operation4)
        Object.freeze(unknownOperation)

        let type: Type
        let typeManager: TypeManager

        const expectTypeNotFound = (fn: () => void) => {
            let error
            try {
                fn()
            } catch (caughtError) {
                error = caughtError
            }
            expect(error).toBeInstanceOf(SyncOtError)
            expect(error.code).toBe(ErrorCodes.TypeNotFound)
            expect(error.message).toBe(`Type not found: ${unknownTypeName}`)
        }

        beforeEach(() => {
            type = {
                apply: jest.fn(),
                compose: jest.fn(),
                create: jest.fn(),
                diff: jest.fn(),
                invert: jest.fn(),
                name: typeName,
                transform: jest.fn(),
                transformX: jest.fn(),
            }
            typeManager = createTypeManager()
            typeManager.registerType(type)
        })

        describe('registerType', () => {
            test('registers a type', () => {
                typeManager.registerType({ ...type, name: 'another-type' })
            })
            test('fails to register the same type twice', () => {
                expect.assertions(3)
                try {
                    typeManager.registerType(type)
                } catch (error) {
                    expect(error).toBeInstanceOf(SyncOtError)
                    expect(error.code).toBe(ErrorCodes.DuplicateType)
                    expect(error.message).toBe(`Duplicate type: ${type.name}`)
                }
            })
        })

        describe('getType', () => {
            test('gets a type by name', () => {
                const anotherType = { ...type, name: 'another-type' }
                typeManager.registerType(anotherType)
                expect(typeManager.getType(type.name)).toBe(type)
                expect(typeManager.getType(anotherType.name)).toBe(anotherType)
                expect(typeManager.getType(unknownTypeName)).toBe(undefined)
            })
        })

        describe('create', () => {
            test('fails, if type not found', () => {
                expectTypeNotFound(() =>
                    typeManager.create(unknownTypeName, '1'),
                )
            })
            test('calls Type#create', () => {
                ;(type.create as any).mockReturnValue(snapshot1)
                expect(typeManager.create(type.name, id)).toBe(snapshot1)
                expect(type.create).toHaveBeenCalledTimes(1)
                expect((type.create as any).mock.instances[0]).toBe(type)
                expect(type.create).toHaveBeenCalledWith(id)
            })
        })

        describe('apply', () => {
            test('fails, if type not found', () => {
                expectTypeNotFound(() =>
                    typeManager.apply(unknownSnapshot, unknownOperation),
                )
            })
            test('calls Type#apply', () => {
                ;(type.apply as any).mockReturnValue(snapshot2)
                expect(typeManager.apply(snapshot1, operation1)).toBe(snapshot2)
                expect(type.apply).toHaveBeenCalledTimes(1)
                expect((type.apply as any).mock.instances[0]).toBe(type)
                expect(type.apply).toHaveBeenCalledWith(snapshot1, operation1)
            })
        })

        describe('transform', () => {
            describe('priority=true', () => {
                test('fails, if type not found', () => {
                    expectTypeNotFound(() =>
                        typeManager.transform(
                            unknownOperation,
                            unknownOperation,
                            true,
                        ),
                    )
                })
                test('calls Type#transform', () => {
                    ;(type.transform as any).mockReturnValue(operation3)
                    expect(
                        typeManager.transform(operation1, operation2, true),
                    ).toBe(operation3)
                    expect(type.transform).toHaveBeenCalledTimes(1)
                    expect((type.transform as any).mock.instances[0]).toBe(type)
                    expect(type.transform).toHaveBeenCalledWith(
                        operation1,
                        operation2,
                        true,
                    )
                    expect(type.transformX).not.toBeCalled()
                })
                test('calls Type#transformX', () => {
                    type.transform = undefined
                    ;(type.transformX as any).mockReturnValue([
                        operation3,
                        operation4,
                    ])
                    expect(
                        typeManager.transform(operation1, operation2, true),
                    ).toBe(operation3)
                    expect(type.transformX).toHaveBeenCalledTimes(1)
                    expect((type.transformX as any).mock.instances[0]).toBe(
                        type,
                    )
                    expect(type.transformX).toHaveBeenCalledWith(
                        operation1,
                        operation2,
                    )
                })
                test('performs a default transformation', () => {
                    type.transform = undefined
                    type.transformX = undefined
                    expect(
                        typeManager.transform(operation1, operation2, true),
                    ).toEqual({
                        ...operation1,
                        version: operation1.version + 1,
                    })
                })
            })

            describe('priority=false', () => {
                test('fails, if type not found', () => {
                    expectTypeNotFound(() =>
                        typeManager.transform(
                            unknownOperation,
                            unknownOperation,
                            false,
                        ),
                    )
                })
                test('calls Type#transform', () => {
                    ;(type.transform as any).mockReturnValue(operation3)
                    expect(
                        typeManager.transform(operation1, operation2, false),
                    ).toBe(operation3)
                    expect(type.transform).toHaveBeenCalledTimes(1)
                    expect((type.transform as any).mock.instances[0]).toBe(type)
                    expect(type.transform).toHaveBeenCalledWith(
                        operation1,
                        operation2,
                        false,
                    )
                    expect(type.transformX).not.toBeCalled()
                })
                test('calls Type#transformX', () => {
                    type.transform = undefined
                    ;(type.transformX as any).mockReturnValue([
                        operation3,
                        operation4,
                    ])
                    expect(
                        typeManager.transform(operation1, operation2, false),
                    ).toBe(operation4)
                    expect(type.transformX).toHaveBeenCalledTimes(1)
                    expect((type.transformX as any).mock.instances[0]).toBe(
                        type,
                    )
                    expect(type.transformX).toHaveBeenCalledWith(
                        operation2,
                        operation1,
                    )
                })
                test('performs a default transformation', () => {
                    type.transform = undefined
                    type.transformX = undefined
                    expect(
                        typeManager.transform(operation1, operation2, false),
                    ).toEqual({
                        ...operation1,
                        version: operation1.version + 1,
                    })
                })
            })
        })

        describe('transformX', () => {
            test('fails, if type not found', () => {
                expectTypeNotFound(() =>
                    typeManager.transformX(unknownOperation, unknownOperation),
                )
            })
            test('calls Type#transformX', () => {
                const returnValue = [operation3, operation4]
                ;(type.transformX as any).mockReturnValue(returnValue)
                expect(typeManager.transformX(operation1, operation2)).toBe(
                    returnValue,
                )
                expect(type.transform).not.toBeCalled()
                expect(type.transformX).toHaveBeenCalledTimes(1)
                expect((type.transformX as any).mock.instances[0]).toBe(type)
                expect(type.transformX).toHaveBeenCalledWith(
                    operation1,
                    operation2,
                )
            })
            test('calls Type#transform', () => {
                ;(type.transform as any).mockReturnValueOnce(operation3)
                ;(type.transform as any).mockReturnValueOnce(operation4)
                type.transformX = undefined
                expect(typeManager.transformX(operation1, operation2)).toEqual([
                    operation3,
                    operation4,
                ])
                expect(type.transform).toHaveBeenCalledTimes(2)
                expect((type.transform as any).mock.instances[0]).toBe(type)
                expect((type.transform as any).mock.instances[1]).toBe(type)
                expect(type.transform).toHaveBeenNthCalledWith(
                    1,
                    operation1,
                    operation2,
                    true,
                )
                expect(type.transform).toHaveBeenNthCalledWith(
                    2,
                    operation2,
                    operation1,
                    false,
                )
            })
            test('performs a default transformation', () => {
                type.transform = undefined
                type.transformX = undefined
                expect(typeManager.transformX(operation1, operation2)).toEqual([
                    { ...operation1, version: operation1.version + 1 },
                    { ...operation2, version: operation2.version + 1 },
                ])
            })
        })

        describe('diff', () => {
            test('fails, if type not found', () => {
                expectTypeNotFound(() =>
                    typeManager.diff(unknownSnapshot, unknownSnapshot, 3),
                )
            })
            test('calls Type#diff', () => {
                ;(type.diff as any).mockReturnValue(operation1)
                expect(typeManager.diff(snapshot1, snapshot2, 3)).toBe(
                    operation1,
                )
                expect(type.diff).toHaveBeenCalledTimes(1)
                expect((type.diff as any).mock.instances[0]).toBe(type)
                expect(type.diff).toHaveBeenCalledWith(snapshot1, snapshot2, 3)
            })
            test('returns undefined, if Type#diff is not implemented', () => {
                type.diff = undefined
                expect(typeManager.diff(snapshot1, snapshot2, 3)).toBe(
                    undefined,
                )
            })
        })

        describe('compose', () => {
            test('fails, if type not found', () => {
                expectTypeNotFound(() =>
                    typeManager.compose(
                        unknownOperation,
                        unknownOperation,
                    ),
                )
            })
            test('calls Type#compose', () => {
                ;(type.compose as any).mockReturnValue(operation3)
                expect(
                    typeManager.compose(
                        operation1,
                        operation2,
                    ),
                ).toBe(operation3)
                expect(type.compose).toHaveBeenCalledTimes(1)
                expect((type.compose as any).mock.instances[0]).toBe(type)
                expect(type.compose).toHaveBeenCalledWith(
                    operation1,
                    operation2,
                )
            })
            test('returns undefined, if Type#compose is not implemented', () => {
                type.compose = undefined
                expect(
                    typeManager.compose(
                        operation1,
                        operation2,
                    ),
                ).toBe(undefined)
            })
        })

        describe('invert', () => {
            test('fails, if type not found', () => {
                expectTypeNotFound(() => typeManager.invert(unknownOperation))
            })
            test('calls Type#invert', () => {
                ;(type.invert as any).mockReturnValue(operation2)
                expect(typeManager.invert(operation1)).toBe(operation2)
                expect(type.invert).toHaveBeenCalledTimes(1)
                expect((type.invert as any).mock.instances[0]).toBe(type)
                expect(type.invert).toHaveBeenCalledWith(operation1)
            })
            test('returns undefined, if Type#invert is not implemented', () => {
                type.invert = undefined
                expect(typeManager.invert(operation1)).toBe(undefined)
            })
        })
    })
}