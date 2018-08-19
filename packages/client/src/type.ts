import { JsonValue } from './json'
import { isErr, ok, Result } from './result'

export type OperationData = JsonValue
export type SnapshotData = any
export type SerializedSnapshotData = JsonValue

export interface Operation {
    type: string
    data: OperationData
}

export interface Snapshot {
    type: string
    data: SnapshotData
}

export interface SerializedSnapshot {
    type: string
    data: SerializedSnapshotData
}

export interface Type {
    name: string

    createSnapshot(data: any): Result<Snapshot>

    createOperation(data: JsonValue): Result<Operation>

    apply(snapshot: Snapshot, operation: Operation): Result<Snapshot>

    applyAndInvert?(
        snapshot: Snapshot,
        operation: Operation
    ): Result<{ snapshot: Snapshot; operation: Operation }>

    invert?(operation: Operation): Result<Operation>

    transform?(
        operationToTransform: Operation,
        anotherOperation: Operation,
        priority: boolean
    ): Result<Operation>

    transformX?(
        operationToTransform: Operation,
        anotherOperation: Operation
    ): Result<[Operation, Operation]>

    compose?(operation1: Operation, operation2: Operation): Result<Operation>

    composeSimilar?(
        operation1: Operation,
        operation2: Operation
    ): Result<Operation>

    diff?(
        baseSnapshot: Snapshot,
        targetSnapshot: Snapshot,
        hint?: any
    ): Result<Operation>

    diffX?(
        snapshot1: Snapshot,
        snapshot2: Snapshot,
        hint?: any
    ): Result<[Operation, Operation]>

    isNoop(operation: Operation): Result<boolean>

    serializeSnapshot(snapshot: Snapshot): Result<SerializedSnapshot>

    deserializeSnapshot(
        serializedSnapshot: SerializedSnapshot
    ): Result<Snapshot>
}

type RequiredPropertyNames = 'name' | 'apply'
type OptionalPropertyNames = Exclude<keyof Type, RequiredPropertyNames>
type RequiredProperties = Pick<Type, RequiredPropertyNames>
type OptionalProperties = Pick<Type, OptionalPropertyNames>

export type UserDefinedType = Required<RequiredProperties> &
    Partial<OptionalProperties>

export function createType(userDefinedType: UserDefinedType): Type {
    const newType: Type = {
        createOperation: userDefinedType.createOperation
            ? data => userDefinedType.createOperation!(data)
            : data => ok({ type: userDefinedType.name, data }),

        createSnapshot: userDefinedType.createSnapshot
            ? data => userDefinedType.createSnapshot!(data)
            : data => ok({ type: userDefinedType.name, data }),

        name: userDefinedType.name,

        apply: (snapshot, operation) =>
            userDefinedType.apply(snapshot, operation),

        isNoop: userDefinedType.isNoop
            ? operation => userDefinedType.isNoop!(operation)
            : _operation => ok(false),

        serializeSnapshot: userDefinedType.serializeSnapshot
            ? snapshot => userDefinedType.serializeSnapshot!(snapshot)
            : snapshot => ok(snapshot),

        deserializeSnapshot: userDefinedType.deserializeSnapshot
            ? serializedSnapshot =>
                  userDefinedType.deserializeSnapshot!(serializedSnapshot)
            : serializedSnapshot => ok(serializedSnapshot)
    }

    if (userDefinedType.applyAndInvert) {
        newType.applyAndInvert = (snapshot, operation) =>
            userDefinedType.applyAndInvert!(snapshot, operation)
    } else if (userDefinedType.invert) {
        newType.applyAndInvert = (snapshot, operation) => {
            const applyResult = userDefinedType.apply(snapshot, operation)
            if (isErr(applyResult)) {
                return applyResult
            }
            const invertResult = userDefinedType.invert!(operation)
            if (isErr(invertResult)) {
                return invertResult
            }
            return ok({
                operation: invertResult.value,
                snapshot: applyResult.value
            })
        }
    }

    if (userDefinedType.invert) {
        newType.invert = operation => userDefinedType.invert!(operation)
    }

    if (userDefinedType.transform) {
        newType.transform = (
            operationToTransform,
            anotherOperation,
            priority
        ) =>
            userDefinedType.transform!(
                operationToTransform,
                anotherOperation,
                priority
            )

        if (!userDefinedType.transformX) {
            newType.transformX = (operationToTransform, anotherOperation) => {
                const result1 = userDefinedType.transform!(
                    operationToTransform,
                    anotherOperation,
                    true
                )
                if (isErr(result1)) {
                    return result1
                }
                const result2 = userDefinedType.transform!(
                    operationToTransform,
                    anotherOperation,
                    false
                )
                if (isErr(result2)) {
                    return result2
                }
                return ok([result1.value, result2.value] as [
                    Operation,
                    Operation
                ])
            }
        }
    }

    if (userDefinedType.transformX) {
        newType.transformX = (operationToTransform, anotherOperation) =>
            userDefinedType.transformX!(operationToTransform, anotherOperation)

        if (!userDefinedType.transform) {
            newType.transform = (
                operationToTransform,
                anotherOperation,
                priority
            ) => {
                const result = userDefinedType.transformX!(
                    operationToTransform,
                    anotherOperation
                )
                if (isErr(result)) {
                    return result
                }
                return ok(priority ? result.value[0] : result.value[1])
            }
        }
    }

    if (userDefinedType.compose) {
        newType.compose = (operation1, operation2) =>
            userDefinedType.compose!(operation1, operation2)
    }

    if (userDefinedType.composeSimilar) {
        newType.composeSimilar = (operation1, operation2) =>
            userDefinedType.composeSimilar!(operation1, operation2)
    }

    if (userDefinedType.diff) {
        newType.diff = (baseSnapshot, targetSnapshot, hint) =>
            userDefinedType.diff!(baseSnapshot, targetSnapshot, hint)

        if (!userDefinedType.diffX) {
            newType.diffX = (snapshot1, snapshot2, hint) => {
                const result1 = userDefinedType.diff!(
                    snapshot2,
                    snapshot1,
                    hint
                )
                if (isErr(result1)) {
                    return result1
                }
                const result2 = userDefinedType.diff!(
                    snapshot1,
                    snapshot2,
                    hint
                )
                if (isErr(result2)) {
                    return result2
                }
                return ok([result1.value, result2.value] as [
                    Operation,
                    Operation
                ])
            }
        }
    }

    if (userDefinedType.diffX) {
        newType.diffX = (snapshot1, snapshot2, hint) =>
            userDefinedType.diffX!(snapshot1, snapshot2, hint)

        if (!userDefinedType.diff) {
            newType.diff = (baseSnapshot, targetSnapshot, hint) => {
                const result = userDefinedType.diffX!(
                    baseSnapshot,
                    targetSnapshot,
                    hint
                )
                if (isErr(result)) {
                    return result
                }
                return ok(result.value[1])
            }
        }
    }

    return newType
}
