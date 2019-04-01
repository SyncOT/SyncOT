import { isScalar, ScalarMap, toArrayBuffer } from '.'

describe('isScalar', () => {
    test.each<[any, boolean]>([
        [null, true],
        [undefined, true],
        [true, true],
        [false, true],
        ['', true],
        ['test', true],
        [0, true],
        [1, true],
        [NaN, true],
        [new ArrayBuffer(0), true],
        [Buffer.allocUnsafe(8), true],
        [new Uint32Array(8), true],
        [new DataView(new ArrayBuffer(8)), true],
        [Symbol(), false],
        [() => undefined, false],
        [{}, false],
        [[], false],
    ])('%p', (value, result) => {
        expect(isScalar(value)).toBe(result)
    })
})

describe('ScalarMap', () => {
    const invalidKeyMatcher = expect.objectContaining({
        message: 'Argument "key" must be a scalar value.',
        name: 'AssertionError [ERR_ASSERTION]',
    })

    test('invalid key', () => {
        const map = new ScalarMap()
        expect(() => map.set(Symbol() as any, 1)).toThrow(invalidKeyMatcher)
        expect(() => map.get(Symbol() as any)).toThrow(invalidKeyMatcher)
        expect(() => map.has(Symbol() as any)).toThrow(invalidKeyMatcher)
        expect(() => map.delete(Symbol() as any)).toThrow(invalidKeyMatcher)
        expect(map.size).toBe(0)
    })

    test('number key', () => {
        const map = new ScalarMap<number, number>()
        expect(map.set(5, 123)).toBe(map)
        expect(map.get(5)).toBe(123)
        expect(map.has(5)).toBeTrue()
        expect(map.size).toBe(1)
        expect(map.delete(5)).toBeTrue()
        expect(map.size).toBe(0)
        expect(map.delete(5)).toBeFalse()
    })

    test('string key', () => {
        const map = new ScalarMap<string, number>()
        expect(map.set('a key', 123)).toBe(map)
        expect(map.get('a key')).toBe(123)
        expect(map.has('a key')).toBeTrue()
        expect(map.size).toBe(1)
        expect(map.delete('a key')).toBeTrue()
        expect(map.size).toBe(0)
        expect(map.delete('a key')).toBeFalse()
    })

    test('Buffer key', () => {
        const map = new ScalarMap<Buffer, number>()
        expect(map.set(Buffer.from('a key'), 123)).toBe(map)
        expect(map.get(Buffer.from('a key'))).toBe(123)
        expect(map.has(Buffer.from('a key'))).toBeTrue()
        expect(map.size).toBe(1)
        expect(map.delete(Buffer.from('a key'))).toBeTrue()
        expect(map.size).toBe(0)
        expect(map.delete(Buffer.from('a key'))).toBeFalse()
    })

    test('ArrayBuffer key', () => {
        const map = new ScalarMap<ArrayBuffer, number>()
        expect(map.set(toArrayBuffer(Buffer.from('a key')), 123)).toBe(map)
        expect(map.get(toArrayBuffer(Buffer.from('a key')))).toBe(123)
        expect(map.has(toArrayBuffer(Buffer.from('a key')))).toBeTrue()
        expect(map.size).toBe(1)
        expect(map.delete(toArrayBuffer(Buffer.from('a key')))).toBeTrue()
        expect(map.size).toBe(0)
        expect(map.delete(toArrayBuffer(Buffer.from('a key')))).toBeFalse()
    })

    test('mixed types', () => {
        const map = new ScalarMap()

        expect(map.set('123', 'a string')).toBe(map)
        expect(map.set(123, 'a number')).toBe(map)
        expect(map.set(Buffer.from('123'), 'a buffer from string')).toBe(map)
        expect(map.set(Buffer.from([123]), 'a buffer from array')).toBe(map)

        expect(map.size).toBe(4)
        expect(map.get('123')).toBe('a string')
        expect(map.get(123)).toBe('a number')
        expect(map.get(Buffer.from('123'))).toBe('a buffer from string')
        expect(map.get(Buffer.from([123]))).toBe('a buffer from array')

        expect(map.has('123')).toBeTrue()
        expect(map.has(123)).toBeTrue()
        expect(map.has(Buffer.from('123'))).toBeTrue()
        expect(map.has(Buffer.from([123]))).toBeTrue()

        expect(map.delete('123')).toBeTrue()
        expect(map.delete(123)).toBeTrue()
        expect(map.delete(Buffer.from('123'))).toBeTrue()
        expect(map.delete(Buffer.from([123]))).toBeTrue()

        expect(map.size).toBe(0)
    })

    test('clear', () => {
        const map = new ScalarMap()

        map.set('123', 'a string')
        map.set(123, 'a number')
        map.set(Buffer.from('123'), 'a buffer from string')
        map.set(Buffer.from([123]), 'a buffer from array')

        expect(map.size).toBe(4)
        map.clear()
        expect(map.size).toBe(0)

        expect(map.get('123')).toBeUndefined()
        expect(map.get(123)).toBeUndefined()
        expect(map.get(Buffer.from('123'))).toBeUndefined()
        expect(map.get(Buffer.from([123]))).toBeUndefined()

        expect(map.has('123')).toBeFalse()
        expect(map.has(123)).toBeFalse()
        expect(map.has(Buffer.from('123'))).toBeFalse()
        expect(map.has(Buffer.from([123]))).toBeFalse()

        expect(map.delete('123')).toBeFalse()
        expect(map.delete(123)).toBeFalse()
        expect(map.delete(Buffer.from('123'))).toBeFalse()
        expect(map.delete(Buffer.from([123]))).toBeFalse()
    })
})
