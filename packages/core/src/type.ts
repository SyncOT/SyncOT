import { ErrorCodes, SyncOtError } from './error'
import { JsonValue } from './json'
import { Result } from './result'

export type TypeName = string
export type OperationData = JsonValue
export type SnapshotData = JsonValue
export interface Operation {
    readonly type: TypeName
    readonly data: OperationData
}
export interface Snapshot {
    readonly type: TypeName
    readonly data: SnapshotData
}

/**
 * Defines an [OT](https://en.wikipedia.org/wiki/Operational_transformation) or
 * a [CRDT](https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type) data type.
 * At the minimum, each type has a name, an operation type, a snapshot type and a way to
 * apply an operation to a snapshot to produce a new snapshot.
 * OT types must additionally implement `transform` or `transformX`, so that their
 * operations could be transformed and applied in any order.
 * All other functions are optional and can be implemented to improve performance or
 * enable optional features like undo/redo.
 *
 * Data in SyncOT is represented by read-only `Snapshot`s.
 * `Snapshot` modifications are expressed as read-only `Operation`s.
 * New `Snapshot`s can be created from scratch or
 * generated by applying `Operation`s to existing `Snapshot`s.
 * New `Operation`s can be created from scratch or
 * generated in various ways from existing `Operation`s and `Snapshot`s.
 */
export interface Type {
    /**
     * The name of the type which should be in the following format "<namespace>/<type>".
     * It's recommended that the name is based on the user/organization and package name
     * from the type's source code repository in order to minimize the chance of conflicts.
     * The core types don't follow the naming convention as they live in the global namespace.
     */
    readonly name: TypeName

    /**
     * Returns a new snapshot, which is the result of applying `operation` to `snapshot`.
     *
     * @param snapshot A snapshot.
     * @param operation An operation to apply to the snapshot.
     */
    apply(snapshot: Snapshot, operation: Operation): Snapshot

    /**
     * Returns:
     * - at index 0: a new snapshot, which is the result of applying `operation` to `snapshot`.
     * - at index 1: a new operation, which reverts the effect of `operation`.
     *
     * This function may be implemented as an optimization, for example:
     * - apply and invert may be performed more efficiently together then separately.
     * - operations may not need to contain "invert" metadata, if they can extract it from the snapshot.
     *
     * `applyX` satisfies the following equasion:
     * `applyX(snapshot, operation) === [ apply(snapshot, operation), invert(operation) ]`
     *
     * @param snapshot A snapshot.
     * @param operation An operation to apply to the snapshot and to invert.
     */
    applyX?(snapshot: Snapshot, operation: Operation): [Snapshot, Operation]

    /**
     * Returns a new operation, which subsumes the behaviour of `operation`, but modified in such a way
     * that it can be applied to a snapshot modified by `anotherOperation.
     *
     * The purpose of transformation is to allow applying `operation` to a snapshot modified
     * by `anotherOperation`. This way each client can apply operations in any order and obtain an
     * identical final snapshot, as long as the operations are properly transformed.
     *
     * Although each client can apply operations in any order, SyncOT uses a central server which
     * defines a canonical total order of operations. The `priority` parameter indicates which operation
     * happened first in that cannonical total order.
     *
     * `transform` satisfies the following equasion:
     * `apply(apply(snapshot, operation1), transform(operation2, operation1, false)) ===
     *      apply(apply(snapshot, operation2), transform(operation1, operation2, true))`
     *
     * @param operation An operation which needs to be transformed, so that it can be
     *  applied to the snapshot modified by `anotherOperation.
     * @param anotherOperation An operation which has modified the snapshot to which
     *  `operation` needs to be applied.
     * @param priority If `true`, `operation` happened first in the total order of operations
     *  defined by the server, otherwise `anotherOperation` happended first.
     */
    transform?(
        operation: Operation,
        anotherOperation: Operation,
        priority: boolean,
    ): Operation

    /**
     * Returns `operation1` transformed against `operation2` and
     * `operation2` transformed against `operation1`,
     * assuming that `operation1` happended before `operation2` in the total order of
     * operations defined by the server.
     *
     * `transformX` satisfies the following equasion:
     * `transformX(operation1, operation2) ===
     *  [ transform(operation1, operation2, true), transform(operation2, operation1, false) ]`.
     *
     * @param operation1 An operation to transform, which happened earlier in the total order of
     *  operations defined by the server.
     * @param operation2 An operation to transform, which happened later in the total order of
     *  operations defined by the server.
     */
    transformX?(
        operation1: Operation,
        operation2: Operation,
    ): [Operation, Operation]

    /**
     * Returns a new operation which can be applied to `baseSnapshot` to obtain `targetSnapshot`.
     *
     * `diff` satisfies the following equasion:
     * `apply(snapshot1, diff(snapshot1, snapshot2, hint)) === snapshot2`
     *
     * @param baseSnapshot The base snapshot.
     * @param targetSnapshot The target snapshot which should be produced by applying the returned
     *  operation to the base snapshot.
     * @param hint A type-specific hint which may be passed to the diff algorithm in order to affect
     *  what operation is returned, in case there is more than one operation which can be applied
     *  to `baseSnapshot` to produce `targetSnapshot`.
     */
    diff?(
        baseSnapshot: Snapshot,
        targetSnapshot: Snapshot,
        hint?: any,
    ): Operation

    /**
     * Returns a new operation, which can be applied to `baseSnapshot` to obtain `targetSnapshot`, and
     * an inverted operation. This function may be implemented as an optimization, if both operations
     * can be generated at the same time more efficiently than performing a diff and an invert separately.
     *
     * `diffX` satisfies the following equasion:
     * `diffX(snapshot1, snapshot2, hint) ===
     *   [diff(snapshot1, snapshot2, hint), invert(diff(snapshot1, snapshot2, hint))]`
     *
     * @param baseSnapshot The base snapshot.
     * @param targetSnapshot The target snapshot which should be produced by applying the returned
     *  operation to the base snapshot.
     * @param hint A type-specific hint which may be passed to the diff algorithm in order to affect
     *  what operation is returned, in case there is more than one operation which can be applied
     *  to `baseSnapshot` to produce `targetSnapshot`.
     */
    diffX?(
        baseSnapshot: Snapshot,
        targetSnapshot: Snapshot,
        hint?: any,
    ): [Operation, Operation]

    /**
     * Returns a new operation, which subsumes the behaviour of the specified operations.
     *
     * `compose` satisfies the following equasion:
     * `apply(apply(snapshot, operation1), operation2) === apply(snapshot, compose(operation1, operation2))`
     *
     * @param operation1 An earlier operation.
     * @param operation2 A later operation.
     */
    compose?(operation1: Operation, operation2: Operation): Operation

    /**
     * Returns a new operation, which reverts the effect of `operation`.
     *
     * `invert` satisfies the following equasion:
     * `apply(apply(snapshot, operation), invert(operation)) === snapshot`
     *
     * @param operation An operation to invert.
     */
    invert?(operation: Operation): Operation
}

/**
 * Registers OT and CRDT types, and forwards function calls to the appropriate types
 * based on the `Operation`s and `Snapshot`s passed in as parameters.
 */
export interface TypeManager {
    /**
     * Registers the specified type.
     * @param type An OT or CRDT type to register.
     */
    registerType(type: Type): void

    /**
     * Gets a `Type` by name.
     */
    getType(name: TypeName): Result<Type>

    /**
     * Forwards the call to `Type#apply`,
     * where `Type` is based on `operation`.
     */
    apply(snapshot: Snapshot, operation: Operation): Result<Snapshot>

    /**
     * Farwards the call to `Type#applyX`, if possible,
     * and falls back to calling `Type#apply` and `Type#invert`,
     * where `Type` is based on `operation`.
     */
    applyX(
        snapshot: Snapshot,
        operation: Operation,
    ): Result<[Snapshot, Operation]>

    /**
     * Forwards the call to `Type#transform`, if possible,
     * and falls back to calling `Type#transformX`,
     * where `Type` is based on `operation`, if `priority` is `false`,
     * or `anotherOperation`, if `priority` is `true`.
     * If neither `Type#transform` nor `Type#transformX` is defined,
     * returns unchanged `operation`, which is the correct behaviour for CRDT types.
     */
    transform(
        operation: Operation,
        anotherOperation: Operation,
        priority: boolean,
    ): Result<Operation>

    /**
     * Forwards the call to `Type#transformX`, if possible,
     * and falls back to calling `Type#transform`,
     * where `Type` is based on `operation2`.
     * If neither `Type#transform` nor `Type#transformX` is defined,
     * returns unchanged `operation1` and `operation2`, which is the correct behaviour for CRDT types.
     * @param operation1
     * @param operation2
     */
    transformX(
        operation1: Operation,
        operation2: Operation,
    ): Result<[Operation, Operation]>

    /**
     * Forwards the call to `Type#diff`, if possible,
     * and falls back to calling `Type#diffX`,
     * where `Type` is based on `targetSnapshot`.
     */
    diff(
        baseSnapshot: Snapshot,
        targetSnapshot: Snapshot,
        hint?: any,
    ): Result<Operation>

    /**
     * Forwards the call to `Type#diffX`, if possible,
     * and falls back to calling `Type#diff` and `Type#invert`,
     * where `Type` is based on `targetSnapshot`.
     */
    diffX(
        baseSnapshot: Snapshot,
        targetSnapshot: Snapshot,
        hint?: any,
    ): Result<[Operation, Operation]>

    /**
     * Farwards the call to `Type#compose`, where `Type` is based on `anotherOperation`.
     */
    compose(
        operation: Operation,
        anotherOperation: Operation,
    ): Result<Operation>

    /**
     * Forwards the call to `Type#invert`, where `Type` is based on `operation`.
     */
    invert(operation: Operation): Result<Operation>
}

/**
 * A simple type manager.
 */
class SimpleTypeManager implements TypeManager {
    /**
     * All registered types, indexed by the type name.
     */
    private types: Map<TypeName, Type> = new Map()

    public registerType(type: Type): void {
        if (this.types.has(type.name)) {
            throw new SyncOtError(
                ErrorCodes.DuplicateType,
                `Duplicate type: ${type.name}`,
            )
        }

        this.types.set(type.name, type)
    }

    public getType(name: TypeName): Result<Type> {
        const type = this.types.get(name)

        if (!type) {
            return Result.fail(
                new SyncOtError(
                    ErrorCodes.TypeNotFound,
                    `Type not found: ${name}`,
                ),
            )
        }

        return Result.ok(type)
    }

    public apply(snapshot: Snapshot, operation: Operation): Result<Snapshot> {
        return this.getTypeByOperation(operation).then(type =>
            type.apply(snapshot, operation),
        )
    }

    public applyX(
        snapshot: Snapshot,
        operation: Operation,
    ): Result<[Snapshot, Operation]> {
        return this.getTypeByOperation(operation).then(type => {
            if (type.applyX) {
                return type.applyX(snapshot, operation)
            } else if (type.invert) {
                return [
                    type.apply(snapshot, operation),
                    type.invert(operation),
                ] as [Snapshot, Operation]
            } else {
                return Result.fail(
                    new SyncOtError(
                        ErrorCodes.NotImplemented,
                        `Neither applyX nor invert are implemented in ${
                            operation.type
                        }`,
                    ),
                )
            }
        })
    }

    public transform(
        operation: Operation,
        anotherOperation: Operation,
        priority: boolean,
    ): Result<Operation> {
        return this.getTypeByOperation(
            priority ? anotherOperation : operation,
        ).then(type => {
            if (type.transform) {
                return type.transform(operation, anotherOperation, priority)
            } else if (type.transformX) {
                return priority
                    ? type.transformX(operation, anotherOperation)[0]
                    : type.transformX(anotherOperation, operation)[1]
            } else {
                return operation
            }
        })
    }

    public transformX(
        operation1: Operation,
        operation2: Operation,
    ): Result<[Operation, Operation]> {
        return this.getTypeByOperation(operation2).then(type => {
            if (type.transformX) {
                return type.transformX(operation1, operation2)
            } else if (type.transform) {
                return [
                    type.transform(operation1, operation2, true),
                    type.transform(operation2, operation1, false),
                ] as [Operation, Operation]
            } else {
                return [operation1, operation2] as [Operation, Operation]
            }
        })
    }

    public diff(
        baseSnapshot: Snapshot,
        targetSnapshot: Snapshot,
        hint?: any,
    ): Result<Operation> {
        return this.getTypeBySnapshot(targetSnapshot).then(type => {
            if (type.diff) {
                return type.diff(baseSnapshot, targetSnapshot, hint)
            } else if (type.diffX) {
                return type.diffX(baseSnapshot, targetSnapshot, hint)[0]
            } else {
                return Result.fail(
                    new SyncOtError(
                        ErrorCodes.NotImplemented,
                        `Neither diff nor diffX is implemented in ${
                            targetSnapshot.type
                        }`,
                    ),
                )
            }
        })
    }

    public diffX(
        baseSnapshot: Snapshot,
        targetSnapshot: Snapshot,
        hint?: any,
    ): Result<[Operation, Operation]> {
        return this.getTypeBySnapshot(targetSnapshot).then(type => {
            if (type.diffX) {
                return type.diffX(baseSnapshot, targetSnapshot, hint)
            } else if (type.diff && type.invert) {
                return this.diff(baseSnapshot, targetSnapshot, hint).then(
                    operation =>
                        this.invert(operation).then(
                            invertedOperation =>
                                [operation, invertedOperation] as [
                                    Operation,
                                    Operation
                                ],
                        ),
                )
            } else {
                return Result.fail(
                    new SyncOtError(
                        ErrorCodes.NotImplemented,
                        `Neither diffX, nor diff and invert are implemented in ${
                            targetSnapshot.type
                        }`,
                    ),
                )
            }
        })
    }

    public compose(
        operation: Operation,
        anotherOperation: Operation,
    ): Result<Operation> {
        return this.getTypeByOperation(anotherOperation).then(type => {
            if (type.compose) {
                return type.compose(
                    operation,
                    anotherOperation,
                )
            } else {
                return Result.fail(
                    new SyncOtError(
                        ErrorCodes.NotImplemented,
                        `compose is not implemented in ${operation.type}`,
                    ),
                )
            }
        })
    }

    public invert(operation: Operation): Result<Operation> {
        return this.getTypeByOperation(operation).then(type => {
            if (type.invert) {
                return type.invert(operation)
            } else {
                return Result.fail(
                    new SyncOtError(
                        ErrorCodes.NotImplemented,
                        `invert is not implemented in ${operation.type}`,
                    ),
                )
            }
        })
    }

    /**
     * Gets Type by operation.
     */
    private getTypeByOperation(operation: Operation): Result<Type> {
        if (!operation) {
            return Result.fail(new SyncOtError(ErrorCodes.InvalidOperation))
        }

        return this.getType(operation.type)
    }

    /**
     * Gets Type by snapshot.
     */
    private getTypeBySnapshot(snapshot: Snapshot): Result<Type> {
        if (!snapshot) {
            return Result.fail(new SyncOtError(ErrorCodes.InvalidSnapshot))
        }

        return this.getType(snapshot.type)
    }
}

/**
 * Creates a new `TypeManager`.
 */
export function createTypeManager(): TypeManager {
    return new SimpleTypeManager()
}
