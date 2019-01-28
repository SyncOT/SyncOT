import { ErrorCodes, SyncOtError } from './error'
import { JsonMap, JsonValue } from './json'
import { throwError, validate, Validator } from './util'

export type ClientId = string
export type Data = JsonValue
export type DocumentId = string
export type Meta = JsonValue
export type SequenceNumber = number
export type TypeName = string
export type DocumentVersion = number

/**
 * Represents the actions which turn one snapshot into another.
 * New `Operation`s can be created from scratch or
 * generated in various ways from existing `Operation`s and `Snapshot`s.
 */
export interface Operation extends JsonMap {
    readonly client: ClientId
    readonly data: Data
    readonly id: DocumentId
    readonly kind: 'Operation'
    readonly meta: Meta
    readonly sequence: SequenceNumber
    readonly type: TypeName
    readonly version: DocumentVersion
}

/**
 * Represents the state of a document at a particular version.
 * New `Snapshot`s can be created from scratch, using `Type#create` or
 * generated by applying `Operation`s to existing `Snapshot`s.
 */
export interface Snapshot extends JsonMap {
    readonly client: ClientId
    readonly data: Data
    readonly id: DocumentId
    readonly kind: 'Snapshot'
    readonly meta: Meta
    readonly sequence: SequenceNumber
    readonly type: TypeName
    readonly version: DocumentVersion
}

const invalid = (code: ErrorCodes, property: string | null): SyncOtError =>
    new SyncOtError(code, undefined, { property })

type ValidatorFactory = <
    C extends ErrorCodes,
    T extends Operation | Snapshot = C extends ErrorCodes.InvalidOperation
        ? Operation
        : C extends ErrorCodes.InvalidSnapshot
        ? Snapshot
        : never
>(
    code: C,
) => Validator<T>

const validateSelf: ValidatorFactory = code => self =>
    self == null ? invalid(code, null) : undefined

const validateKind: (kind: string) => ValidatorFactory = kind => code => self =>
    self.kind !== kind ? invalid(code, 'kind') : undefined

const validateId: ValidatorFactory = code => self =>
    typeof self.id !== 'string' ? invalid(code, 'id') : undefined

const validateType: ValidatorFactory = code => self =>
    typeof self.type !== 'string' ? invalid(code, 'type') : undefined

const validateVersion: (
    minVersion: DocumentVersion,
) => ValidatorFactory = minVersion => code => self =>
    !Number.isSafeInteger(self.version) || self.version < minVersion
        ? invalid(code, 'version')
        : undefined

const validateClient: ValidatorFactory = code => self =>
    typeof self.client !== 'string' ? invalid(code, 'client') : undefined

const validateSequence: ValidatorFactory = code => self =>
    !Number.isSafeInteger(self.sequence) || self.sequence < 0
        ? invalid(code, 'sequence')
        : undefined

const validateJson: (
    property: 'data' | 'meta',
) => ValidatorFactory = property => code => self => {
    switch (typeof self[property]) {
        case 'object':
        case 'string':
        case 'number':
        case 'boolean':
            return
        default:
            return invalid(code, property)
    }
}

export const validateOperation: Validator<Operation> = validate(
    [
        validateSelf,
        validateClient,
        validateJson('data'),
        validateId,
        validateKind('Operation'),
        validateJson('meta'),
        validateSequence,
        validateType,
        validateVersion(1),
    ].map(factory => factory(ErrorCodes.InvalidOperation)),
)
export const assertOperation = (operation: Operation) =>
    throwError(validateOperation(operation))

export const validateSnapshot: Validator<Snapshot> = validate(
    [
        validateSelf,
        validateClient,
        validateJson('data'),
        validateId,
        validateKind('Snapshot'),
        validateJson('meta'),
        validateSequence,
        validateType,
        validateVersion(0),
    ].map(factory => factory(ErrorCodes.InvalidSnapshot)),
)
export const assertSnapshot = (snapshot: Snapshot) =>
    throwError(validateSnapshot(snapshot))

/**
 * Defines an [OT](https://en.wikipedia.org/wiki/Operational_transformation) or
 * a [CRDT](https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type) data type.
 *
 * Each type must define `name`, `create` and `apply`.
 * OT types must additionally implement `transform` or `transformX`.
 * `diff`, `compose` and `invert` may be implemented to enable some optional features.
 *
 * All type functions must be "pure":
 *
 * - have no side effects AND
 * - always produce identical results given identical arguments.
 */
export interface Type {
    /**
     * The type's name.
     */
    readonly name: TypeName

    /**
     * Creates an initial "empty" snapshot with the specified `id`.
     */
    create(id: DocumentId): Snapshot

    /**
     * Returns a new snapshot, which is the result of applying `operation` to `snapshot`.
     *
     * @param snapshot A snapshot.
     * @param operation An operation to apply to the snapshot.
     */
    apply(snapshot: Snapshot, operation: Operation): Snapshot

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
