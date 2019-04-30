import { isScalar, ScalarMap } from '.'

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
        [new ArrayBuffer(0), false],
        [Buffer.allocUnsafe(8), true],
        [new Uint32Array(8), false],
        [new DataView(new ArrayBuffer(8)), false],
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
        name: 'AssertionError',
    })

    test('invalid key', () => {
        const symbol = Symbol() as any
        const arrayBuffer = new ArrayBuffer(1) as any
        const map = new ScalarMap()
        expect(() => map.set(symbol, 1)).toThrow(invalidKeyMatcher)
        expect(() => map.get(symbol)).toThrow(invalidKeyMatcher)
        expect(() => map.has(symbol)).toThrow(invalidKeyMatcher)
        expect(() => map.delete(symbol)).toThrow(invalidKeyMatcher)
        expect(() => map.set(arrayBuffer, 1)).toThrow(invalidKeyMatcher)
        expect(() => map.get(arrayBuffer)).toThrow(invalidKeyMatcher)
        expect(() => map.has(arrayBuffer)).toThrow(invalidKeyMatcher)
        expect(() => map.delete(arrayBuffer)).toThrow(invalidKeyMatcher)
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

    test('forEach', () => {
        const thisArg = { key: 'value' }
        const callback = jest.fn()
        const map = new ScalarMap()

        map.set('123', 'a string')
        map.set(123, 'a number')
        map.set(Buffer.from('123'), 'a buffer from string')
        map.set(Buffer.from([123]), 'a buffer from array')

        map.forEach(callback, thisArg)

        expect(callback).toHaveBeenCalledTimes(4)
        expect(callback.mock.instances[0]).toBe(thisArg)
        expect(callback.mock.instances[1]).toBe(thisArg)
        expect(callback.mock.instances[2]).toBe(thisArg)
        expect(callback.mock.instances[3]).toBe(thisArg)
        expect(callback).toHaveBeenCalledWith('a string', '123', map)
        expect(callback).toHaveBeenCalledWith('a number', 123, map)
        expect(callback).toHaveBeenCalledWith(
            'a buffer from string',
            Buffer.from('123'),
            map,
        )
        expect(callback).toHaveBeenCalledWith(
            'a buffer from array',
            Buffer.from([123]),
            map,
        )
    })

    test('multiple buffer keys', () => {
        const map = new ScalarMap()

        for (let i = 0; i < 0x10000; ++i) {
            const key = Buffer.allocUnsafe(2)
            key.writeUInt16BE(i, 0)
            map.set(key, i)
        }

        expect(map.size).toBe(0x10000)

        for (let i = 0; i < 0x10000; ++i) {
            const key = Buffer.allocUnsafe(2)
            key.writeUInt16BE(i, 0)
            const has = map.has(key)
            const get = map.get(key)
            const del = map.delete(key)

            if (!has) {
                expect(has).toBeTrue()
            }

            if (get !== i) {
                expect(get).toBe(i)
            }

            if (!del) {
                expect(del).toBeTrue()
            }
        }

        expect(map.size).toBe(0)
    })
})
