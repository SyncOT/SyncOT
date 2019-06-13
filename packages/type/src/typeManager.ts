import { assert, createTypeNotFoundError, Interface } from '@syncot/util'
import { Operation, Snapshot, Type } from './type'

function typeNotFound(name: string): never {
    throw createTypeNotFoundError(name)
}

/**
 * Registers OT and CRDT types, and forwards function calls to the appropriate types
 * based on the `Operation`s and `Snapshot`s passed in as parameters.
 */
class TypeManagerImpl {
    /**
     * All registered types, indexed by the type name.
     */
    private types: Map<string, Type> = new Map()

    /**
     * Registers the specified type.
     * @param type An OT or CRDT type to register.
     */
    public registerType(type: Type): void {
        assert(
            !this.types.has(type.name),
            `Type "${type.name}" already registered.`,
        )
        this.types.set(type.name, type)
    }

    /**
     * Gets a `Type` by name.
     */
    public getType(name: string): Type | undefined {
        return this.types.get(name)
    }

    /**
     * Creates an empty snapshot of the specified type using `Type#create`.
     */
    public create(type: string, id: string): Snapshot {
        return this._getType(type).create(id)
    }

    /**
     * Forwards the call to `Type#apply`.
     */
    public apply(snapshot: Snapshot, operation: Operation): Snapshot {
        return this._getType(operation.documentType).apply(snapshot, operation)
    }

    /**
     * Forwards the call to `Type#transform`, if possible,
     * and falls back to calling `Type#transformX`.
     * If neither `Type#transform` nor `Type#transformX` is defined,
     * returns `operation` with an updated version,
     * which is the correct behaviour for CRDT types.
     */
    public transform(
        operation: Operation,
        anotherOperation: Operation,
        priority: boolean,
    ): Operation {
        const type = this._getType(operation.documentType)

        if (type.transform) {
            return type.transform(operation, anotherOperation, priority)
        } else if (type.transformX) {
            return priority
                ? type.transformX(operation, anotherOperation)[0]
                : type.transformX(anotherOperation, operation)[1]
        } else {
            return { ...operation, version: operation.version + 1 }
        }
    }

    /**
     * Forwards the call to `Type#transformX`, if possible,
     * and falls back to calling `Type#transform`.
     * If neither `Type#transform` nor `Type#transformX` is defined,
     * returns `operation1` and `operation2` with updated versions,
     * which is the correct behaviour for CRDT types.
     */
    public transformX(
        operation1: Operation,
        operation2: Operation,
    ): [Operation, Operation] {
        const type = this._getType(operation1.documentType)

        if (type.transformX) {
            return type.transformX(operation1, operation2)
        } else if (type.transform) {
            return [
                type.transform(operation1, operation2, true),
                type.transform(operation2, operation1, false),
            ] as [Operation, Operation]
        } else {
            return [
                { ...operation1, version: operation1.version + 1 },
                { ...operation2, version: operation2.version + 1 },
            ] as [Operation, Operation]
        }
    }

    /**
     * Forwards the call to `Type#diff` and returns `undefined`, if it is not defined.
     */
    public diff(
        baseSnapshot: Snapshot,
        targetSnapshot: Snapshot,
        hint?: any,
    ): Operation | undefined {
        const type = this._getType(baseSnapshot.documentType)

        return typeof type.diff === 'function'
            ? type.diff(baseSnapshot, targetSnapshot, hint)
            : undefined
    }

    /**
     * Farwards the call to `Type#compose` and returns `undefined`, if it is not defined.
     */
    public compose(
        operation: Operation,
        anotherOperation: Operation,
    ): Operation | undefined {
        const type = this._getType(operation.documentType)

        return typeof type.compose === 'function'
            ? type.compose(
                  operation,
                  anotherOperation,
              )
            : undefined
    }

    /**
     * Forwards the call to `Type#invert` and returns `undefined`, if it is not defined.
     */
    public invert(operation: Operation): Operation | undefined {
        const type = this._getType(operation.documentType)

        return typeof type.invert === 'function'
            ? type.invert(operation)
            : undefined
    }

    private _getType(name: string): Type {
        return this.types.get(name) || typeNotFound(name)
    }
}

export interface TypeManager extends Interface<TypeManagerImpl> {}

export function createTypeManager(): TypeManager {
    return new TypeManagerImpl()
}
