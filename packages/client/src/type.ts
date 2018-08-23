import { ErrorCodes, SyncOtError } from './error'
import { JsonValue } from './json'
import { err, isErr, ok, Result } from './result'

export type OperationData = JsonValue
export type SnapshotData = JsonValue

export interface Operation {
    type: string
    data: OperationData
}

export interface Snapshot {
    type: string
    data: SnapshotData
}

export interface Type {
    name: string

    apply(snapshot: Snapshot, operation: Operation): Result<Snapshot>

    invert(operation: Operation): Result<Operation>

    applyAndInvert(
        snapshot: Snapshot,
        operation: Operation
    ): Result<{ snapshot: Snapshot; operation: Operation }>

    transform(
        operationToTransform: Operation,
        anotherOperation: Operation,
        priority: boolean
    ): Result<Operation>

    transformX(
        operationToTransform: Operation,
        anotherOperation: Operation
    ): Result<[Operation, Operation]>

    compose(operation1: Operation, operation2: Operation): Result<Operation>

    composeSimilar(
        operation1: Operation,
        operation2: Operation
    ): Result<Operation>

    diff(
        baseSnapshot: Snapshot,
        targetSnapshot: Snapshot,
        hint?: any
    ): Result<Operation>

    diffX(
        snapshot1: Snapshot,
        snapshot2: Snapshot,
        hint?: any
    ): Result<[Operation, Operation]>

    isNoop(operation: Operation): Result<boolean>

    validateSnapshot(snapshot: Snapshot): Result<boolean>

    validateOperation(operation: Operation): Result<boolean>
}

type RequiredPropertyNames = 'name' | 'apply'
type OptionalPropertyNames = Exclude<keyof Type, RequiredPropertyNames>
type RequiredProperties = Pick<Type, RequiredPropertyNames>
type OptionalProperties = Pick<Type, OptionalPropertyNames>

export type UserDefinedType = Required<RequiredProperties> &
    Partial<OptionalProperties>

class FullType implements Type {
    public name: string

    constructor(private userDefinedType: UserDefinedType) {
        this.name = this.userDefinedType.name
    }

    public apply(snapshot: Snapshot, operation: Operation): Result<Snapshot> {
        return this.userDefinedType.apply(snapshot, operation)
    }

    public invert(operation: Operation): Result<Operation> {
        if (this.userDefinedType.invert) {
            return this.userDefinedType.invert(operation)
        } else {
            return err(new SyncOtError(ErrorCodes.NotImplemented))
        }
    }

    public applyAndInvert(
        snapshot: Snapshot,
        operation: Operation
    ): Result<{ snapshot: Snapshot; operation: Operation }> {
        if (this.userDefinedType.applyAndInvert) {
            return this.userDefinedType.applyAndInvert(snapshot, operation)
        } else if (this.userDefinedType.invert) {
            const applyResult = this.userDefinedType.apply(snapshot, operation)
            if (isErr(applyResult)) {
                return applyResult
            }
            const invertResult = this.userDefinedType.invert(operation)
            if (isErr(invertResult)) {
                return invertResult
            }
            return ok({
                operation: invertResult.value,
                snapshot: applyResult.value
            })
        } else {
            return err(new SyncOtError(ErrorCodes.NotImplemented))
        }
    }

    public transform(
        operationToTransform: Operation,
        anotherOperation: Operation,
        priority: boolean
    ): Result<Operation> {
        if (this.userDefinedType.transform) {
            return this.userDefinedType.transform(
                operationToTransform,
                anotherOperation,
                priority
            )
        } else if (this.userDefinedType.transformX) {
            const result = this.userDefinedType.transformX(
                operationToTransform,
                anotherOperation
            )
            if (isErr(result)) {
                return result
            }
            return ok(priority ? result.value[0] : result.value[1])
        } else {
            return err(new SyncOtError(ErrorCodes.NotImplemented))
        }
    }

    public transformX(
        operationToTransform: Operation,
        anotherOperation: Operation
    ): Result<[Operation, Operation]> {
        if (this.userDefinedType.transformX) {
            return this.userDefinedType.transformX(
                operationToTransform,
                anotherOperation
            )
        } else if (this.userDefinedType.transform) {
            const result1 = this.userDefinedType.transform(
                operationToTransform,
                anotherOperation,
                true
            )
            if (isErr(result1)) {
                return result1
            }
            const result2 = this.userDefinedType.transform(
                operationToTransform,
                anotherOperation,
                false
            )
            if (isErr(result2)) {
                return result2
            }
            return ok([result1.value, result2.value] as [Operation, Operation])
        } else {
            return err(new SyncOtError(ErrorCodes.NotImplemented))
        }
    }

    public compose(
        operation1: Operation,
        operation2: Operation
    ): Result<Operation> {
        if (this.userDefinedType.compose) {
            return this.userDefinedType.compose(
                operation1,
                operation2
            )
        } else {
            return err(new SyncOtError(ErrorCodes.NotImplemented))
        }
    }

    public composeSimilar(
        operation1: Operation,
        operation2: Operation
    ): Result<Operation> {
        if (this.userDefinedType.composeSimilar) {
            return this.userDefinedType.composeSimilar(operation1, operation2)
        } else {
            return err(new SyncOtError(ErrorCodes.NotImplemented))
        }
    }

    public diff(
        baseSnapshot: Snapshot,
        targetSnapshot: Snapshot,
        hint: any
    ): Result<Operation> {
        if (this.userDefinedType.diff) {
            return this.userDefinedType.diff(baseSnapshot, targetSnapshot, hint)
        } else if (this.userDefinedType.diffX) {
            const result = this.userDefinedType.diffX(
                baseSnapshot,
                targetSnapshot,
                hint
            )
            if (isErr(result)) {
                return result
            }
            return ok(result.value[1])
        } else {
            return err(new SyncOtError(ErrorCodes.NotImplemented))
        }
    }

    public diffX(
        snapshot1: Snapshot,
        snapshot2: Snapshot,
        hint: any
    ): Result<[Operation, Operation]> {
        if (this.userDefinedType.diffX) {
            return this.userDefinedType.diffX(snapshot1, snapshot2, hint)
        } else if (this.userDefinedType.diff) {
            const result1 = this.userDefinedType.diff(
                snapshot2,
                snapshot1,
                hint
            )
            if (isErr(result1)) {
                return result1
            }
            const result2 = this.userDefinedType.diff(
                snapshot1,
                snapshot2,
                hint
            )
            if (isErr(result2)) {
                return result2
            }
            return ok([result1.value, result2.value] as [Operation, Operation])
        } else {
            return err(new SyncOtError(ErrorCodes.NotImplemented))
        }
    }

    public isNoop(operation: Operation): Result<boolean> {
        if (this.userDefinedType.isNoop) {
            return this.userDefinedType.isNoop(operation)
        } else {
            return ok(false)
        }
    }

    public validateSnapshot(snapshot: Snapshot): Result<boolean> {
        if (this.userDefinedType.validateSnapshot) {
            return this.userDefinedType.validateSnapshot(snapshot)
        } else {
            return ok(true)
        }
    }

    public validateOperation(operation: Operation): Result<boolean> {
        if (this.userDefinedType.validateOperation) {
            return this.userDefinedType.validateOperation(operation)
        } else {
            return ok(true)
        }
    }
}

export function createType(userDefinedType: UserDefinedType): Type {
    return new FullType(userDefinedType)
}
