import { JsonValue } from './json'

export type TypeName = string
export type OperationData = JsonValue
export type SnapshotData = JsonValue
export interface Operation {
    type: TypeName
    data: OperationData
}
export interface Snapshot {
    type: TypeName
    data: SnapshotData
}

interface ApplyX {
    applyX(snapshot: Snapshot, operation: Operation): [Snapshot, Operation]
}
interface Compose {
    compose(operation1: Operation, operation2: Operation): Operation
}
interface Invert {
    invert(operation: Operation): Operation
}
interface Diff {
    diff(
        baseSnapshot: Snapshot,
        targetSnapshot: Snapshot,
        hint?: any
    ): Operation
}
interface DiffX {
    diffX(
        snapshot1: Snapshot,
        snapshot2: Snapshot,
        hint?: any
    ): [Operation, Operation]
}

export interface Type
    extends Partial<ApplyX & Compose & Invert & Diff & DiffX> {
    name: string
    apply(snapshot: Snapshot, operation: Operation): Snapshot
    transform?(
        operationToTransform: Operation,
        anotherOperation: Operation,
        priority: boolean
    ): Operation
    transformX?(
        operationToTransform: Operation,
        anotherOperation: Operation
    ): [Operation, Operation]
    isNoop?(operation: Operation): boolean
    areOperationstSimilar?(
        operation1: Operation,
        operation2: Operation
    ): boolean
}

type InvertType = Type & Required<Invert>
type ComposeType = Type & Required<Compose>
type ApplyXType = Type & Required<ApplyX>
type DiffType = Type & Required<Diff>
type DiffXType = Type & Required<DiffX>

function isApplyX(type: Type): type is ApplyXType {
    return !!type.applyX
}
function isDiff(type: Type): type is DiffType {
    return !!type.diff
}
function isDiffX(type: Type): type is DiffXType {
    return !!type.diffX
}

export function apply(
    type: Type,
    snapshot: Snapshot,
    operation: Operation
): Snapshot {
    return type.apply(snapshot, operation)
}

export function canApplyX(type: Type): type is ApplyXType | InvertType {
    return !!type.applyX || !!type.invert
}

export function applyX(
    type: ApplyXType | InvertType,
    snapshot: Snapshot,
    operation: Operation
): [Snapshot, Operation] {
    if (isApplyX(type)) {
        return type.applyX(snapshot, operation)
    } else {
        return [type.apply(snapshot, operation), type.invert(operation)]
    }
}

export function canInvert(type: Type): type is InvertType {
    return !!type.invert
}

export function invert(type: InvertType, operation: Operation): Operation {
    return type.invert(operation)
}

export function transform(
    type: Type,
    operationToTransform: Operation,
    anotherOperation: Operation,
    priority: boolean
): Operation {
    if (type.transform) {
        return type.transform(operationToTransform, anotherOperation, priority)
    } else if (type.transformX) {
        return priority
            ? type.transformX(operationToTransform, anotherOperation)[0]
            : type.transformX(anotherOperation, operationToTransform)[1]
    } else {
        return operationToTransform
    }
}

export function transformX(
    type: Type,
    operationToTransform: Operation,
    anotherOperation: Operation
): [Operation, Operation] {
    if (type.transformX) {
        return type.transformX(operationToTransform, anotherOperation)
    } else if (type.transform) {
        return [
            type.transform(operationToTransform, anotherOperation, true),
            type.transform(anotherOperation, operationToTransform, false)
        ]
    } else {
        return [operationToTransform, anotherOperation]
    }
}

export function canCompose(type: Type): type is ComposeType {
    return !!type.compose
}

export function compose(
    type: Compose,
    operation: Operation,
    anotherOperation: Operation
): Operation {
    return type.compose(
        operation,
        anotherOperation
    )
}

export function canDiff(type: Type): type is DiffType | DiffXType {
    return isDiff(type) || isDiffX(type)
}

export function diff(
    type: DiffType | DiffXType,
    baseSnapshot: Snapshot,
    targetSnapshot: Snapshot,
    hint?: any
): Operation {
    return isDiff(type)
        ? type.diff(baseSnapshot, targetSnapshot, hint)
        : type.diffX(baseSnapshot, targetSnapshot, hint)[0]
}

export function diffX(
    type: DiffType | DiffXType,
    snapshot1: Snapshot,
    snapshot2: Snapshot,
    hint?: any
): [Operation, Operation] {
    return isDiffX(type)
        ? type.diffX(snapshot1, snapshot2, hint)
        : [
              type.diff(snapshot1, snapshot2, hint),
              type.diff(snapshot2, snapshot1, hint)
          ]
}

export function isNoop(type: Type, operation: Operation): boolean {
    return type.isNoop ? type.isNoop(operation) : false
}

export function areOperationstSimilar(
    type: Type,
    operation1: Operation,
    operation2: Operation
): boolean {
    return type.areOperationstSimilar
        ? type.areOperationstSimilar(operation1, operation2)
        : false
}
