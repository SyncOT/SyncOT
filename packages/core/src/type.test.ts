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
    session: 'c',
    type: 't',
    version: 1,
}

const snapshot: Snapshot = {
    data: null,
    id: '1',
    kind: 'Snapshot',
    meta: null,
    sequence: 2,
    session: 'c',
    type: 't',
    version: 1,
}

describe('validateOperation', () => {
    test('valid', () => {
        expect(validateOperation(operation)).toBe(undefined)
    })
    test('is null', () => {
        const error = validateOperation(null as any)
        expect(error).toBeInstanceOf(Error)
        expect(error!.name).toBe('SyncOtError InvalidEntity')
        expect(error!.message).toEqual('Invalid "Operation".')
        expect(error!.entityName).toEqual('Operation')
        expect(error!.entity).toEqual(null)
        expect(error!.key).toEqual(null)
    })
    test.each([
        'data',
        'id',
        'kind',
        'meta',
        'sequence',
        'session',
        'type',
        'version',
    ])('invalid %s', property => {
        const entity = {
            ...operation,
            [property]: undefined as any,
        }
        const error = validateOperation(entity)
        expect(error).toBeInstanceOf(Error)
        expect(error!.name).toBe('SyncOtError InvalidEntity')
        expect(error!.message).toBe(`Invalid "Operation.${property}".`)
        expect(error!.entityName).toBe('Operation')
        expect(error!.entity).toBe(entity)
        expect(error!.key).toBe(property)
    })
    test('fail, if version is 0', () => {
        const entity = {
            ...operation,
            version: 0,
        }
        const error = validateOperation(entity)
        expect(error).toBeInstanceOf(Error)
        expect(error!.name).toBe('SyncOtError InvalidEntity')
        expect(error!.message).toBe('Invalid "Operation.version".')
        expect(error!.entityName).toBe('Operation')
        expect(error!.entity).toBe(entity)
        expect(error!.key).toBe('version')
    })
})

describe('validateSnapshot', () => {
    test('valid', () => {
        expect(validateSnapshot(snapshot)).toBe(undefined)
    })
    test('is null', () => {
        const error = validateSnapshot(null as any)
        expect(error).toBeInstanceOf(Error)
        expect(error!.name).toBe('SyncOtError InvalidEntity')
        expect(error!.message).toBe('Invalid "Snapshot".')
        expect(error!.entityName).toBe('Snapshot')
        expect(error!.entity).toBe(null)
        expect(error!.key).toBe(null)
    })
    test.each([
        'data',
        'id',
        'kind',
        'meta',
        'sequence',
        'session',
        'type',
        'version',
    ])('invalid %s', property => {
        const entity = {
            ...snapshot,
            [property]: undefined as any,
        }
        const error = validateSnapshot(entity)
        expect(error).toBeInstanceOf(Error)
        expect(error!.name).toBe('SyncOtError InvalidEntity')
        expect(error!.message).toBe(`Invalid "Snapshot.${property}".`)
        expect(error!.entityName).toBe('Snapshot')
        expect(error!.entity).toBe(entity)
        expect(error!.key).toBe(property)
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
