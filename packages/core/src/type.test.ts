import { ErrorCodes, SyncOtError } from './error'
import {
    assertOperation,
    assertSnapshot,
    Operation,
    Snapshot,
    validateOperation,
    validateSnapshot,
} from './type'

const operation: Operation = {
    client: 'c',
    data: null,
    id: '1',
    kind: 'Operation',
    meta: null,
    sequence: 2,
    type: 't',
    version: 1,
}

const snapshot: Snapshot = {
    client: 'c',
    data: null,
    id: '1',
    kind: 'Snapshot',
    meta: null,
    sequence: 2,
    type: 't',
    version: 1,
}

describe('validateOperation', () => {
    test('valid', () => {
        expect(validateOperation(operation)).toBe(undefined)
    })
    test('is null', () => {
        const error = validateOperation(null as any) as SyncOtError
        expect(error).toBeInstanceOf(SyncOtError)
        expect(error.code).toBe(ErrorCodes.InvalidOperation)
        expect(error.details).toEqual({ property: null })
    })
    test.each([
        'client',
        'data',
        'id',
        'kind',
        'meta',
        'sequence',
        'type',
        'version',
    ])('invalid %s', property => {
        const error = validateOperation({
            ...operation,
            [property]: undefined as any,
        }) as SyncOtError
        expect(error).toBeInstanceOf(SyncOtError)
        expect(error.code).toBe(ErrorCodes.InvalidOperation)
        expect(error.details).toEqual({ property })
    })
    test('fail, if version is 0', () => {
        const error = validateOperation({
            ...operation,
            version: 0,
        }) as SyncOtError
        expect(error).toBeInstanceOf(SyncOtError)
        expect(error.code).toBe(ErrorCodes.InvalidOperation)
        expect(error.details).toEqual({ property: 'version' })
    })
})

describe('validateSnapshot', () => {
    test('valid', () => {
        expect(validateSnapshot(snapshot)).toBe(undefined)
    })
    test('is null', () => {
        const error = validateSnapshot(null as any) as SyncOtError
        expect(error).toBeInstanceOf(SyncOtError)
        expect(error.code).toBe(ErrorCodes.InvalidSnapshot)
        expect(error.details).toEqual({ property: null })
    })
    test.each([
        'client',
        'data',
        'id',
        'kind',
        'meta',
        'sequence',
        'type',
        'version',
    ])('invalid %s', property => {
        const error = validateSnapshot({
            ...snapshot,
            [property]: undefined as any,
        }) as SyncOtError
        expect(error).toBeInstanceOf(SyncOtError)
        expect(error.code).toBe(ErrorCodes.InvalidSnapshot)
        expect(error.details).toEqual({ property })
    })
    test('succeed, if version is 0', () => {
        expect(validateSnapshot({ ...snapshot, version: 0 })).toBe(undefined)
    })
})

describe('assertOperation', () => {
    test('valid', () => {
        assertOperation(operation)
    })
    test('invalid', () => {
        expect(() => assertOperation(null as any)).toThrowError(SyncOtError)
    })
})

describe('assertSnapshot', () => {
    test('valid', () => {
        assertSnapshot(snapshot)
    })
    test('invalid', () => {
        expect(() => assertSnapshot(null as any)).toThrowError(SyncOtError)
    })
})
