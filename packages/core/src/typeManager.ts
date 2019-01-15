import { DocumentId, Operation, Snapshot, Type, TypeName } from './type'

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
    getType(name: TypeName): Type | undefined

    /**
     * Creates an empty snapshot of the specified type using `Type#create`.
     */
    create(type: TypeName, id: DocumentId): Snapshot

    /**
     * Forwards the call to `Type#apply`.
     */
    apply(snapshot: Snapshot, operation: Operation): Snapshot

    /**
     * Forwards the call to `Type#transform`, if possible,
     * and falls back to calling `Type#transformX`.
     * If neither `Type#transform` nor `Type#transformX` is defined,
     * returns unchanged `operation`, which is the correct behaviour for CRDT types.
     */
    transform(
        operation: Operation,
        anotherOperation: Operation,
        priority: boolean,
    ): Operation

    /**
     * Forwards the call to `Type#transformX`, if possible,
     * and falls back to calling `Type#transform`.
     * If neither `Type#transform` nor `Type#transformX` is defined,
     * returns unchanged `operation1` and `operation2`, which is the correct behaviour for CRDT types.
     */
    transformX(
        operation1: Operation,
        operation2: Operation,
    ): [Operation, Operation]

    /**
     * Forwards the call to `Type#diff` and returns `undefined`, if it is not defined.
     */
    diff(
        baseSnapshot: Snapshot,
        targetSnapshot: Snapshot,
        hint?: any,
    ): Operation | undefined

    /**
     * Farwards the call to `Type#compose` and returns `undefined`, if it is not defined.
     */
    compose(
        operation: Operation,
        anotherOperation: Operation,
    ): Operation | undefined

    /**
     * Forwards the call to `Type#invert` and returns `undefined`, if it is not defined.
     */
    invert(operation: Operation): Operation | undefined
}
