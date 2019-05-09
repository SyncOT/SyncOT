import {
    assertOperation,
    assertSnapshot,
    Operation,
    Snapshot,
    validateOperation,
    validateSnapshot,
} from './type'

function omit<T extends object>(value: T, property: keyof T) {
    const newValue = { ...value }
    delete newValue[property]
    return newValue
}

const operation: Operation = {
    data: null,
    documentId: '1',
    documentType: 't',
    kind: 'Operation',
    meta: null,
    sequence: 2,
    sessionId: 'c',
    version: 1,
}

const snapshot: Snapshot = {
    data: null,
    documentId: '1',
    documentType: 't',
    kind: 'Snapshot',
    meta: null,
    sequence: 2,
    sessionId: 'c',
    version: 1,
}

describe('validateOperation', () => {
    test.each<[any, string | null | undefined]>([
        [operation, undefined],
        [{ ...operation, version: 0 }, 'version'],
        [{ ...operation, documentId: '' }, undefined],
        [{ ...operation, sessionId: '' }, undefined],
        [null, null],
        [() => undefined, null],
        [omit(operation, 'data'), 'data'],
        [{ ...operation, documentId: Buffer.allocUnsafe(0) }, 'documentId'],
        [{ ...operation, documentId: undefined }, 'documentId'],
        [{ ...operation, documentType: undefined }, 'documentType'],
        [{ ...operation, kind: undefined }, 'kind'],
        [omit(operation, 'meta'), 'meta'],
        [{ ...operation, sequence: undefined }, 'sequence'],
        [{ ...operation, sessionId: Buffer.allocUnsafe(0) }, 'sessionId'],
        [{ ...operation, sessionId: undefined }, 'sessionId'],
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
        [{ ...snapshot, documentId: '' }, undefined],
        [{ ...snapshot, sessionId: '' }, undefined],
        [null, null],
        [() => undefined, null],
        [omit(snapshot, 'data'), 'data'],
        [{ ...snapshot, documentId: Buffer.allocUnsafe(0) }, 'documentId'],
        [{ ...snapshot, documentId: undefined }, 'documentId'],
        [{ ...snapshot, documentType: undefined }, 'documentType'],
        [{ ...snapshot, kind: undefined }, 'kind'],
        [omit(snapshot, 'meta'), 'meta'],
        [{ ...snapshot, sequence: undefined }, 'sequence'],
        [{ ...snapshot, sessionId: Buffer.allocUnsafe(0) }, 'sessionId'],
        [{ ...snapshot, sessionId: undefined }, 'sessionId'],
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
