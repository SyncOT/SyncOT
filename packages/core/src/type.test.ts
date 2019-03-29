import {
    assertOperation,
    assertSnapshot,
    Operation,
    Snapshot,
    validateOperation,
    validateSnapshot,
} from './type'

const operation: Operation = {
    data: null,
    id: '1',
    kind: 'Operation',
    meta: null,
    sequence: 2,
    sessionId: 'c',
    type: 't',
    version: 1,
}

const snapshot: Snapshot = {
    data: null,
    id: '1',
    kind: 'Snapshot',
    meta: null,
    sequence: 2,
    sessionId: 'c',
    type: 't',
    version: 1,
}

describe('validateOperation', () => {
    test.each<[any, string | null | undefined]>([
        [operation, undefined],
        [{ ...operation, version: 0 }, 'version'],
        [{ ...operation, sessionId: '' }, undefined],
        [{ ...operation, sessionId: new ArrayBuffer(0) }, undefined],
        [null, null],
        [() => undefined, null],
        [{ ...operation, data: undefined }, 'data'],
        [{ ...operation, id: undefined }, 'id'],
        [{ ...operation, kind: undefined }, 'kind'],
        [{ ...operation, meta: undefined }, 'meta'],
        [{ ...operation, sequence: undefined }, 'sequence'],
        [{ ...operation, sessionId: undefined }, 'sessionId'],
        [{ ...operation, type: undefined }, 'type'],
        [{ ...operation, version: undefined }, 'version'],
    ])('Test #%#', (data, invalidProperty) => {
        const result = validateOperation(data)
        if (invalidProperty === undefined) {
            expect(result).toBeUndefined()
        } else {
            expect(result).toEqual(
                expect.objectContaining({
                    entity: data,
                    entityName: 'Operation',
                    key: invalidProperty,
                    message:
                        invalidProperty === null
                            ? 'Invalid "Operation".'
                            : `Invalid "Operation.${invalidProperty}".`,
                    name: 'SyncOtError InvalidEntity',
                }),
            )
        }
    })
})

describe('validateSnapshot', () => {
    test.each<[any, string | null | undefined]>([
        [snapshot, undefined],
        [{ ...snapshot, version: 0 }, undefined],
        [{ ...snapshot, sessionId: '' }, undefined],
        [{ ...snapshot, sessionId: new ArrayBuffer(0) }, undefined],
        [null, null],
        [() => undefined, null],
        [{ ...snapshot, data: undefined }, 'data'],
        [{ ...snapshot, id: undefined }, 'id'],
        [{ ...snapshot, kind: undefined }, 'kind'],
        [{ ...snapshot, meta: undefined }, 'meta'],
        [{ ...snapshot, sequence: undefined }, 'sequence'],
        [{ ...snapshot, sessionId: undefined }, 'sessionId'],
        [{ ...snapshot, type: undefined }, 'type'],
        [{ ...snapshot, version: undefined }, 'version'],
    ])('Test #%#', (data, invalidProperty) => {
        const result = validateSnapshot(data)
        if (invalidProperty === undefined) {
            expect(result).toBeUndefined()
        } else {
            expect(result).toEqual(
                expect.objectContaining({
                    entity: data,
                    entityName: 'Snapshot',
                    key: invalidProperty,
                    message:
                        invalidProperty === null
                            ? 'Invalid "Snapshot".'
                            : `Invalid "Snapshot.${invalidProperty}".`,
                    name: 'SyncOtError InvalidEntity',
                }),
            )
        }
    })
})

describe('assertOperation', () => {
    test('valid', () => {
        assertOperation(operation)
    })
    test('invalid', () => {
        expect(() => assertOperation(null as any)).toThrow(
            expect.objectContaining({
                entity: null,
                entityName: 'Operation',
                key: null,
                message: 'Invalid "Operation".',
                name: 'SyncOtError InvalidEntity',
            }),
        )
    })
})

describe('assertSnapshot', () => {
    test('valid', () => {
        assertSnapshot(snapshot)
    })
    test('invalid', () => {
        expect(() => assertSnapshot(null as any)).toThrow(
            expect.objectContaining({
                entity: null,
                entityName: 'Snapshot',
                key: null,
                message: 'Invalid "Snapshot".',
                name: 'SyncOtError InvalidEntity',
            }),
        )
    })
})
