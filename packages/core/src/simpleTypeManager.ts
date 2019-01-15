import { ErrorCodes, SyncOtError } from './error'
import { DocumentId, Operation, Snapshot, Type, TypeName } from './type'
import { TypeManager } from './typeManager'

function typeNotFound(name: TypeName): never {
    throw new SyncOtError(ErrorCodes.TypeNotFound, `Type not found: ${name}`)
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

    public getType(name: TypeName): Type | undefined {
        return this.types.get(name)
    }

    public create(type: TypeName, id: DocumentId): Snapshot {
        return this._getType(type).create(id)
    }

    public apply(snapshot: Snapshot, operation: Operation): Snapshot {
        return this._getType(operation.type).apply(snapshot, operation)
    }

    public transform(
        operation: Operation,
        anotherOperation: Operation,
        priority: boolean,
    ): Operation {
        const type = this._getType(operation.type)

        if (type.transform) {
            return type.transform(operation, anotherOperation, priority)
        } else if (type.transformX) {
            return priority
                ? type.transformX(operation, anotherOperation)[0]
                : type.transformX(anotherOperation, operation)[1]
        } else {
            return operation
        }
    }

    public transformX(
        operation1: Operation,
        operation2: Operation,
    ): [Operation, Operation] {
        const type = this._getType(operation1.type)

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
    }

    public diff(
        baseSnapshot: Snapshot,
        targetSnapshot: Snapshot,
        hint?: any,
    ): Operation | undefined {
        const type = this._getType(baseSnapshot.type)

        return typeof type.diff === 'function'
            ? type.diff(baseSnapshot, targetSnapshot, hint)
            : undefined
    }

    public compose(
        operation: Operation,
        anotherOperation: Operation,
    ): Operation | undefined {
        const type = this._getType(operation.type)

        return typeof type.compose === 'function'
            ? type.compose(
                  operation,
                  anotherOperation,
              )
            : undefined
    }

    public invert(operation: Operation): Operation | undefined {
        const type = this._getType(operation.type)

        return typeof type.invert === 'function'
            ? type.invert(operation)
            : undefined
    }

    public _getType(name: TypeName): Type {
        return this.types.get(name) || typeNotFound(name)
    }
}

/**
 * Creates a new `SimpleTypeManager`.
 */
export function createTypeManager(): TypeManager {
    return new SimpleTypeManager()
}
