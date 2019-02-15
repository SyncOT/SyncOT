import { SmartBuffer } from 'smart-buffer'
import { decode, encode, toBuffer } from '.'
import { Type } from './tson'

const encodeToSmartBuffer = (data: any) => {
    const arrayBuffer = encode(data)
    const buffer = Buffer.from(arrayBuffer)
    const smartBuffer = SmartBuffer.fromBuffer(buffer)
    expect(arrayBuffer).toBeInstanceOf(ArrayBuffer)
    return smartBuffer
}

const stringFFLong = Array.from(Array(0xff), (_v, k) => k % 10).join('')
const string100Long = Array.from(Array(0x100), (_v, k) => k % 10).join('')
const stringFFFFLong = Array.from(Array(0xffff), (_v, k) => k % 10).join('')
const string10000Long = Array.from(Array(0x10000), (_v, k) => k % 10).join('')

const longString = Array.from(
    Array(100),
    () =>
        // < (1 byte)
        // unmatched-high-surrogate (3 bytes)
        // | (1 byte)
        // unmatched-low-surrogate (3 bytes)
        // | (1 byte)
        // 7F (1 byte)
        // 80 (2 bytes)
        // 7FF (2 bytes)
        // 800 (3 bytes)
        // FFFF (3 bytes)
        // 10000 (4 bytes)
        // 10FFFF (4 bytes)
        // > (1 byte)
        // total (29 bytes)
        // grand total (2900)
        '<\uD813|\uDC13|\u{7F}\u{80}\u{7FF}\u{800}\u{FFFF}\u{10000}\u{10FFFF}>',
).join('')
const fixedLongString = longString.replace(/\uD813|\uDC13/g, '\uFFFD')
const longStringUtf8Length = 2900

/**
 * Fills the arrayBuffer with 0xDD and then encodes the string
 * 'abcdefghijklmnopqrstuv' at offset 8.
 */
function initBinaryTestData(arrayBuffer: ArrayBuffer): void {
    const buffer = Buffer.from(arrayBuffer)
    buffer.fill(0xdd)
    buffer.writeUInt32BE(0x0c166162, 8)
    buffer.writeUInt32BE(0x63646566, 12)
    buffer.writeUInt32BE(0x6768696a, 16)
    buffer.writeUInt32BE(0x6b6c6d6e, 20)
    buffer.writeUInt32BE(0x6f707172, 24)
    buffer.writeUInt32BE(0x73747576, 28)
}

const testArrayBuffer = new ArrayBuffer(128)
const testSharedArrayBuffer = new ArrayBuffer(128)
const testBuffer = Buffer.from(testArrayBuffer, 8, 24)
const testDataView = new DataView(testArrayBuffer, 8, 24)
const testTypedArrays = [
    new Int8Array(testArrayBuffer, 8, 24),
    new Uint8Array(testArrayBuffer, 8, 24),
    new Uint8ClampedArray(testArrayBuffer, 8, 24),
    new Int16Array(testArrayBuffer, 8, 12),
    new Uint16Array(testArrayBuffer, 8, 12),
    new Int32Array(testArrayBuffer, 8, 6),
    new Uint32Array(testArrayBuffer, 8, 6),
    new Float32Array(testArrayBuffer, 8, 6),
    new Float64Array(testArrayBuffer, 8, 3),
]
initBinaryTestData(testArrayBuffer)
initBinaryTestData(testSharedArrayBuffer)

describe('toBuffer', () => {
    test('Buffer', () => {
        const originalBuffer = Buffer.allocUnsafe(4)
        const buffer = toBuffer(originalBuffer)
        expect(buffer).toBe(originalBuffer)
    })
    test.each([[ArrayBuffer], [SharedArrayBuffer]])(
        '%s',
        arrayBufferConstructor => {
            const arrayBuffer = new arrayBufferConstructor(4) as ArrayBuffer
            const buffer = toBuffer(arrayBuffer)
            expect(buffer).toBeInstanceOf(Buffer)
            expect(buffer.buffer).toBe(arrayBuffer)
            expect(buffer.byteOffset).toBe(0)
            expect(buffer.byteLength).toBe(4)
            expect(toBuffer(arrayBuffer)).toBe(buffer)
        },
    )
    test.each([
        [DataView],
        [Int8Array],
        [Uint8Array],
        [Uint8ClampedArray],
        [Int16Array],
        [Uint16Array],
        [Int32Array],
        [Uint32Array],
        [Float32Array],
        [Float64Array],
    ])('%s', viewConstructor => {
        const arrayBuffer = new ArrayBuffer(128)
        const view = new viewConstructor(arrayBuffer, 8, 2) as ArrayBufferView
        const buffer = toBuffer(view)
        expect(buffer).toBeInstanceOf(Buffer)
        expect(buffer.buffer).toBe(arrayBuffer)
        expect(buffer.byteOffset).toBe(view.byteOffset)
        expect(buffer.byteLength).toBe(view.byteLength)
        expect(toBuffer(view)).toBe(buffer)
    })
})

describe('encode', () => {
    describe('unsupported type', () => {
        test('undefined', () => {
            const buffer = encodeToSmartBuffer(undefined)
            expect(buffer.length).toBe(1)
            expect(buffer.readUInt8()).toBe(Type.NULL)
        })
        test('function', () => {
            const buffer = encodeToSmartBuffer(() => 5)
            expect(buffer.length).toBe(1)
            expect(buffer.readUInt8()).toBe(Type.NULL)
        })
        test('symbol', () => {
            const buffer = encodeToSmartBuffer(Symbol())
            expect(buffer.length).toBe(1)
            expect(buffer.readUInt8()).toBe(Type.NULL)
        })
    })

    describe('null', () => {
        test('null', () => {
            const buffer = encodeToSmartBuffer(null)
            expect(buffer.length).toBe(1)
            expect(buffer.readUInt8()).toBe(Type.NULL)
        })
    })

    describe('boolean', () => {
        test('true', () => {
            const buffer = encodeToSmartBuffer(true)
            expect(buffer.length).toBe(1)
            expect(buffer.readUInt8()).toBe(Type.TRUE)
        })
        test('false', () => {
            const buffer = encodeToSmartBuffer(false)
            expect(buffer.length).toBe(1)
            expect(buffer.readUInt8()).toBe(Type.FALSE)
        })
    })

    describe('INT8', () => {
        test('0x00', () => {
            const buffer = encodeToSmartBuffer(0)
            expect(buffer.length).toBe(2)
            expect(buffer.readUInt8()).toBe(Type.INT8)
            expect(buffer.readInt8()).toBe(0)
        })
        test('0x7F', () => {
            const buffer = encodeToSmartBuffer(0x7f)
            expect(buffer.length).toBe(2)
            expect(buffer.readUInt8()).toBe(Type.INT8)
            expect(buffer.readInt8()).toBe(0x7f)
        })
        test('-0x80', () => {
            const buffer = encodeToSmartBuffer(-0x80)
            expect(buffer.length).toBe(2)
            expect(buffer.readUInt8()).toBe(Type.INT8)
            expect(buffer.readInt8()).toBe(-0x80)
        })
    })

    describe('INT16', () => {
        test('0x80', () => {
            const buffer = encodeToSmartBuffer(0x80)
            expect(buffer.length).toBe(3)
            expect(buffer.readUInt8()).toBe(Type.INT16)
            expect(buffer.readInt16LE()).toBe(0x80)
        })
        test('-0x81', () => {
            const buffer = encodeToSmartBuffer(-0x81)
            expect(buffer.length).toBe(3)
            expect(buffer.readUInt8()).toBe(Type.INT16)
            expect(buffer.readInt16LE()).toBe(-0x81)
        })
        test('0x7FFF', () => {
            const buffer = encodeToSmartBuffer(0x7fff)
            expect(buffer.length).toBe(3)
            expect(buffer.readUInt8()).toBe(Type.INT16)
            expect(buffer.readInt16LE()).toBe(0x7fff)
        })
        test('-0x8000', () => {
            const buffer = encodeToSmartBuffer(-0x8000)
            expect(buffer.length).toBe(3)
            expect(buffer.readUInt8()).toBe(Type.INT16)
            expect(buffer.readInt16LE()).toBe(-0x8000)
        })
    })

    describe('INT32', () => {
        test('0x8000', () => {
            const buffer = encodeToSmartBuffer(0x8000)
            expect(buffer.length).toBe(5)
            expect(buffer.readUInt8()).toBe(Type.INT32)
            expect(buffer.readInt32LE()).toBe(0x8000)
        })
        test('-0x8001', () => {
            const buffer = encodeToSmartBuffer(-0x8001)
            expect(buffer.length).toBe(5)
            expect(buffer.readUInt8()).toBe(Type.INT32)
            expect(buffer.readInt32LE()).toBe(-0x8001)
        })
        test('0x7FFFFFFF', () => {
            const buffer = encodeToSmartBuffer(0x7fffffff)
            expect(buffer.length).toBe(5)
            expect(buffer.readUInt8()).toBe(Type.INT32)
            expect(buffer.readInt32LE()).toBe(0x7fffffff)
        })
        test('-0x80000000', () => {
            const buffer = encodeToSmartBuffer(-0x80000000)
            expect(buffer.length).toBe(5)
            expect(buffer.readUInt8()).toBe(Type.INT32)
            expect(buffer.readInt32LE()).toBe(-0x80000000)
        })
    })

    describe('FLOAT32', () => {
        test('1.5', () => {
            const buffer = encodeToSmartBuffer(1.5)
            expect(buffer.length).toBe(5)
            expect(buffer.readUInt8()).toBe(Type.FLOAT32)
            expect(buffer.readFloatLE()).toBe(1.5)
        })
        test('-1.5', () => {
            const buffer = encodeToSmartBuffer(-1.5)
            expect(buffer.length).toBe(5)
            expect(buffer.readUInt8()).toBe(Type.FLOAT32)
            expect(buffer.readFloatLE()).toBe(-1.5)
        })
        test('NaN', () => {
            const buffer = encodeToSmartBuffer(NaN)
            expect(buffer.length).toBe(5)
            expect(buffer.readUInt8()).toBe(Type.FLOAT32)
            expect(buffer.readFloatLE()).toBe(NaN)
        })
        test('Infinity', () => {
            const buffer = encodeToSmartBuffer(Infinity)
            expect(buffer.length).toBe(5)
            expect(buffer.readUInt8()).toBe(Type.FLOAT32)
            expect(buffer.readFloatLE()).toBe(Infinity)
        })
        test('-Infinity', () => {
            const buffer = encodeToSmartBuffer(-Infinity)
            expect(buffer.length).toBe(5)
            expect(buffer.readUInt8()).toBe(Type.FLOAT32)
            expect(buffer.readFloatLE()).toBe(-Infinity)
        })
    })

    describe('FLOAT64', () => {
        test('1.3', () => {
            const buffer = encodeToSmartBuffer(1.3)
            expect(buffer.length).toBe(9)
            expect(buffer.readUInt8()).toBe(Type.FLOAT64)
            expect(buffer.readDoubleLE()).toBe(1.3)
        })
        test('-1.3', () => {
            const buffer = encodeToSmartBuffer(-1.3)
            expect(buffer.length).toBe(9)
            expect(buffer.readUInt8()).toBe(Type.FLOAT64)
            expect(buffer.readDoubleLE()).toBe(-1.3)
        })
        test('0x80000000', () => {
            // Must be FLOAT64 because JS does not support INT64.
            const buffer = encodeToSmartBuffer(0x80000000)
            expect(buffer.length).toBe(9)
            expect(buffer.readUInt8()).toBe(Type.FLOAT64)
            expect(buffer.readDoubleLE()).toBe(0x80000000)
        })
        test('-0x80000001', () => {
            // Must be FLOAT64 because JS does not support INT64.
            const buffer = encodeToSmartBuffer(-0x80000001)
            expect(buffer.length).toBe(9)
            expect(buffer.readUInt8()).toBe(Type.FLOAT64)
            expect(buffer.readDoubleLE()).toBe(-0x80000001)
        })
    })

    describe('STRING', () => {
        test('(empty)', () => {
            const buffer = encodeToSmartBuffer('')
            expect(buffer.length).toBe(2)
            expect(buffer.readUInt8()).toBe(Type.STRING8)
            expect(buffer.readUInt8()).toBe(0)
        })
        test('\\u{0} - min code point', () => {
            const buffer = encodeToSmartBuffer('\u{0}')
            expect(buffer.length).toBe(3)
            expect(buffer.readUInt8()).toBe(Type.STRING8)
            expect(buffer.readUInt8()).toBe(1)
            expect(buffer.readString(1)).toBe('\u{0}')
        })
        test('\\u{7F} - max 1 byte code point', () => {
            const buffer = encodeToSmartBuffer('\u{7F}')
            expect(buffer.length).toBe(3)
            expect(buffer.readUInt8()).toBe(Type.STRING8)
            expect(buffer.readUInt8()).toBe(1)
            expect(buffer.readString(1)).toBe('\u{7F}')
        })
        test('\\u{80} - min 2 byte code point', () => {
            const buffer = encodeToSmartBuffer('\u{80}')
            expect(buffer.length).toBe(4)
            expect(buffer.readUInt8()).toBe(Type.STRING8)
            expect(buffer.readUInt8()).toBe(2)
            expect(buffer.readString(2)).toBe('\u{80}')
        })
        test('\\u{7FF} - max 2 byte code point', () => {
            const buffer = encodeToSmartBuffer('\u{7FF}')
            expect(buffer.length).toBe(4)
            expect(buffer.readUInt8()).toBe(Type.STRING8)
            expect(buffer.readUInt8()).toBe(2)
            expect(buffer.readString(2)).toBe('\u{7FF}')
        })
        test('\\u{800} - min 3 byte code point', () => {
            const buffer = encodeToSmartBuffer('\u{800}')
            expect(buffer.length).toBe(5)
            expect(buffer.readUInt8()).toBe(Type.STRING8)
            expect(buffer.readUInt8()).toBe(3)
            expect(buffer.readString(3)).toBe('\u{800}')
        })
        test('\\u{FFFF} - max 3 byte code point', () => {
            const buffer = encodeToSmartBuffer('\u{FFFF}')
            expect(buffer.length).toBe(5)
            expect(buffer.readUInt8()).toBe(Type.STRING8)
            expect(buffer.readUInt8()).toBe(3)
            expect(buffer.readString(3)).toBe('\u{FFFF}')
        })
        test('\\u{10000} - min 4 byte code point', () => {
            const buffer = encodeToSmartBuffer('\u{10000}')
            expect(buffer.length).toBe(6)
            expect(buffer.readUInt8()).toBe(Type.STRING8)
            expect(buffer.readUInt8()).toBe(4)
            expect(buffer.readString(4)).toBe('\u{10000}')
        })
        test('\\u{10FFFF} - max code point', () => {
            const buffer = encodeToSmartBuffer('\u{10FFFF}')
            expect(buffer.length).toBe(6)
            expect(buffer.readUInt8()).toBe(Type.STRING8)
            expect(buffer.readUInt8()).toBe(4)
            expect(buffer.readString(4)).toBe('\u{10FFFF}')
        })
        test('\\uD800 - min high surrogate (unmatched)', () => {
            const buffer = encodeToSmartBuffer('\uD800')
            expect(buffer.length).toBe(5)
            expect(buffer.readUInt8()).toBe(Type.STRING8)
            expect(buffer.readUInt8()).toBe(3)
            expect(buffer.readString(3)).toBe('\uFFFD') // REPLACEMENT CHARACTER
        })
        test('\\uDBFF - max high surrogate (unmatched)', () => {
            const buffer = encodeToSmartBuffer('\uDBFF')
            expect(buffer.length).toBe(5)
            expect(buffer.readUInt8()).toBe(Type.STRING8)
            expect(buffer.readUInt8()).toBe(3)
            expect(buffer.readString(3)).toBe('\uFFFD') // REPLACEMENT CHARACTER
        })
        test('\\uDC00 - min low surrogate (unmatched)', () => {
            const buffer = encodeToSmartBuffer('\uDC00')
            expect(buffer.length).toBe(5)
            expect(buffer.readUInt8()).toBe(Type.STRING8)
            expect(buffer.readUInt8()).toBe(3)
            expect(buffer.readString(3)).toBe('\uFFFD') // REPLACEMENT CHARACTER
        })
        test('\\uDFFF - max low surrogate (unmatched)', () => {
            const buffer = encodeToSmartBuffer('\uDFFF')
            expect(buffer.length).toBe(5)
            expect(buffer.readUInt8()).toBe(Type.STRING8)
            expect(buffer.readUInt8()).toBe(3)
            expect(buffer.readString(3)).toBe('\uFFFD') // REPLACEMENT CHARACTER
        })
        test('0xFF characters (1 byte length)', () => {
            const buffer = encodeToSmartBuffer(stringFFLong)
            expect(buffer.length).toBe(0xff + 2)
            expect(buffer.readUInt8()).toBe(Type.STRING8)
            expect(buffer.readUInt8()).toBe(0xff)
            expect(buffer.readString(0xff)).toBe(stringFFLong)
        })
        test('0x100 characters (2 byte length)', () => {
            const buffer = encodeToSmartBuffer(string100Long)
            expect(buffer.length).toBe(0x100 + 3)
            expect(buffer.readUInt8()).toBe(Type.STRING16)
            expect(buffer.readUInt16LE()).toBe(0x100)
            expect(buffer.readString(0x100)).toBe(string100Long)
        })
        test('0xFFFF characters (2 byte length)', () => {
            const buffer = encodeToSmartBuffer(stringFFFFLong)
            expect(buffer.length).toBe(0xffff + 3)
            expect(buffer.readUInt8()).toBe(Type.STRING16)
            expect(buffer.readUInt16LE()).toBe(0xffff)
            expect(buffer.readString(0xffff)).toBe(stringFFFFLong)
        })
        test('0x10000 characters (4 byte length)', () => {
            const buffer = encodeToSmartBuffer(string10000Long)
            expect(buffer.length).toBe(0x10000 + 5)
            expect(buffer.readUInt8()).toBe(Type.STRING32)
            expect(buffer.readUInt32LE()).toBe(0x10000)
            expect(buffer.readString(0x10000)).toBe(string10000Long)
        })
        test('mixed characters', () => {
            const buffer = encodeToSmartBuffer(longString)
            expect(buffer.length).toBe(longStringUtf8Length + 3)
            expect(buffer.readUInt8()).toBe(Type.STRING16)
            expect(buffer.readUInt16LE()).toBe(longStringUtf8Length)
            expect(buffer.readString(longStringUtf8Length)).toBe(
                fixedLongString,
            )
        })
    })

    describe('BINARY', () => {
        test.each(
            [
                ['ArrayBuffer', testArrayBuffer.slice(8, 32)],
                ['SharedArrayBuffer', testSharedArrayBuffer.slice(8, 32)],
                ['DataView', testDataView],
                ['Buffer', testBuffer],
            ].concat(
                testTypedArrays.map(array => [array.constructor.name, array]),
            ),
        )('type: %s', (_message, data) => {
            const buffer = encodeToSmartBuffer(data)
            expect(buffer.length).toBe(26)
            expect(buffer.readUInt8()).toBe(Type.BINARY8)
            expect(buffer.readUInt8()).toBe(24)
            expect(buffer.readBuffer(24).compare(testBuffer)).toBe(0)
        })
        // [0x00, 0x01, 0xff, 0x100, 0xffff, 0x10000, 0x10011]
        // data.fill(0x57)
        test('length: 0x00', () => {
            const data = Buffer.allocUnsafe(0x0)
            const buffer = encodeToSmartBuffer(data)
            expect(buffer.length).toBe(2)
            expect(buffer.readUInt8()).toBe(Type.BINARY8)
            expect(buffer.readUInt8()).toBe(0)
        })
        test('length: 0x01', () => {
            const data = Buffer.allocUnsafe(0x01)
            data.fill(0x57)
            const buffer = encodeToSmartBuffer(data)
            expect(buffer.length).toBe(2 + 1)
            expect(buffer.readUInt8()).toBe(Type.BINARY8)
            expect(buffer.readUInt8()).toBe(1)
            expect(buffer.readBuffer(1).compare(data)).toBe(0)
        })
        test('length: 0xff', () => {
            const data = Buffer.allocUnsafe(0xff)
            data.fill(0x57)
            const buffer = encodeToSmartBuffer(data)
            expect(buffer.length).toBe(2 + 0xff)
            expect(buffer.readUInt8()).toBe(Type.BINARY8)
            expect(buffer.readUInt8()).toBe(0xff)
            expect(buffer.readBuffer(0xff).compare(data)).toBe(0)
        })
        test('length: 0x100', () => {
            const data = Buffer.allocUnsafe(0x100)
            data.fill(0x57)
            const buffer = encodeToSmartBuffer(data)
            expect(buffer.length).toBe(3 + 0x100)
            expect(buffer.readUInt8()).toBe(Type.BINARY16)
            expect(buffer.readUInt16LE()).toBe(0x100)
            expect(buffer.readBuffer(0x100).compare(data)).toBe(0)
        })
        test('length: 0xFFFF', () => {
            const data = Buffer.allocUnsafe(0xffff)
            data.fill(0x57)
            const buffer = encodeToSmartBuffer(data)
            expect(buffer.length).toBe(3 + 0xffff)
            expect(buffer.readUInt8()).toBe(Type.BINARY16)
            expect(buffer.readUInt16LE()).toBe(0xffff)
            expect(buffer.readBuffer(0xffff).compare(data)).toBe(0)
        })
        test('length: 0x10000', () => {
            const data = Buffer.allocUnsafe(0x10000)
            data.fill(0x57)
            const buffer = encodeToSmartBuffer(data)
            expect(buffer.length).toBe(5 + 0x10000)
            expect(buffer.readUInt8()).toBe(Type.BINARY32)
            expect(buffer.readUInt32LE()).toBe(0x10000)
            expect(buffer.readBuffer(0x10000).compare(data)).toBe(0)
        })
        test('length: 0x10011', () => {
            const data = Buffer.allocUnsafe(0x10011)
            data.fill(0x57)
            const buffer = encodeToSmartBuffer(data)
            expect(buffer.length).toBe(5 + 0x10011)
            expect(buffer.readUInt8()).toBe(Type.BINARY32)
            expect(buffer.readUInt32LE()).toBe(0x10011)
            expect(buffer.readBuffer(0x10011).compare(data)).toBe(0)
        })
    })

    describe('ARRAY', () => {
        test('length: 0x00', () => {
            const buffer = encodeToSmartBuffer([])
            expect(buffer.length).toBe(2)
            expect(buffer.readUInt8()).toBe(Type.ARRAY8)
            expect(buffer.readUInt8()).toBe(0)
        })
        test('length: 0x01', () => {
            const buffer = encodeToSmartBuffer([-5])
            expect(buffer.length).toBe(4)
            expect(buffer.readUInt8()).toBe(Type.ARRAY8)
            expect(buffer.readUInt8()).toBe(1)
            expect(buffer.readUInt8()).toBe(Type.INT8)
            expect(buffer.readInt8()).toBe(-5)
        })
        test('length: 0xff', () => {
            const array = Array.from(Array(0xff), (_, i) => 0x7f - i)
            const buffer = encodeToSmartBuffer(array)
            expect(buffer.length).toBe(2 + 0xff * 2)
            expect(buffer.readUInt8()).toBe(Type.ARRAY8)
            expect(buffer.readUInt8()).toBe(0xff)
            for (let i = 0; i < 0xff; ++i) {
                expect(buffer.readUInt8()).toBe(Type.INT8)
                expect(buffer.readInt8()).toBe(0x7f - i)
            }
        })
        test('length: 0x100', () => {
            const array = Array.from(Array(0x100), (_, i) =>
                Math.max(-0x80, 0x7f - i),
            )
            const buffer = encodeToSmartBuffer(array)
            expect(buffer.length).toBe(3 + 0x100 * 2)
            expect(buffer.readUInt8()).toBe(Type.ARRAY16)
            expect(buffer.readUInt16LE()).toBe(0x100)
            for (let i = 0; i < 0x100; ++i) {
                expect(buffer.readUInt8()).toBe(Type.INT8)
                expect(buffer.readInt8()).toBe(Math.max(-0x80, 0x7f - i))
            }
        })
        test('length: 0xFFFF', () => {
            const array = Array.from(Array(0xffff), (_, i) =>
                Math.max(-0x80, 0x7f - i),
            )
            const buffer = encodeToSmartBuffer(array)
            expect(buffer.length).toBe(3 + 0xffff * 2)
            expect(buffer.readUInt8()).toBe(Type.ARRAY16)
            expect(buffer.readUInt16LE()).toBe(0xffff)
            for (let i = 0; i < 0xffff; ++i) {
                const type = buffer.readUInt8()
                const value = buffer.readInt8()
                const expectedType = Type.INT8
                const expectedValue = Math.max(-0x80, 0x7f - i)
                // `expect` is just too slow to call in a loop ~ 10s.
                if (type !== expectedType || value !== expectedValue) {
                    expect(type).toBe(expectedType)
                    expect(value).toBe(expectedValue)
                }
            }
        })
        test('length: 0x10000', () => {
            const array = Array.from(Array(0x10000), (_, i) =>
                Math.max(-0x80, 0x7f - i),
            )
            const buffer = encodeToSmartBuffer(array)
            expect(buffer.length).toBe(5 + 0x10000 * 2)
            expect(buffer.readUInt8()).toBe(Type.ARRAY32)
            expect(buffer.readUInt32LE()).toBe(0x10000)
            for (let i = 0; i < 0x10000; ++i) {
                const type = buffer.readUInt8()
                const value = buffer.readInt8()
                const expectedType = Type.INT8
                const expectedValue = Math.max(-0x80, 0x7f - i)
                // `expect` is just too slow to call in a loop ~ 10s.
                if (type !== expectedType || value !== expectedValue) {
                    expect(type).toBe(expectedType)
                    expect(value).toBe(expectedValue)
                }
            }
        })
        test('length: 0x10011', () => {
            const array = Array.from(Array(0x10011), (_, i) =>
                Math.max(-0x80, 0x7f - i),
            )
            const buffer = encodeToSmartBuffer(array)
            expect(buffer.length).toBe(5 + 0x10011 * 2)
            expect(buffer.readUInt8()).toBe(Type.ARRAY32)
            expect(buffer.readUInt32LE()).toBe(0x10011)
            for (let i = 0; i < 0x10011; ++i) {
                const type = buffer.readUInt8()
                const value = buffer.readInt8()
                const expectedType = Type.INT8
                const expectedValue = Math.max(-0x80, 0x7f - i)
                // `expect` is just too slow to call in a loop ~ 10s.
                if (type !== expectedType || value !== expectedValue) {
                    expect(type).toBe(expectedType)
                    expect(value).toBe(expectedValue)
                }
            }
        })

        test('mixed value types', () => {
            const array = [
                0x12,
                0.3,
                undefined,
                true,
                [1, 2, 3, [false]],
                'abc',
            ]
            const buffer = encodeToSmartBuffer(array)
            expect(buffer.readUInt8()).toBe(Type.ARRAY8)
            expect(buffer.readUInt8()).toBe(array.length)
            expect(buffer.readUInt8()).toBe(Type.INT8)
            expect(buffer.readInt8()).toBe(0x12)
            expect(buffer.readUInt8()).toBe(Type.FLOAT64)
            expect(buffer.readDoubleLE()).toBe(0.3)
            expect(buffer.readUInt8()).toBe(Type.NULL)
            expect(buffer.readUInt8()).toBe(Type.TRUE)
            expect(buffer.readUInt8()).toBe(Type.ARRAY8)
            expect(buffer.readUInt8()).toBe(4)
            expect(buffer.readUInt8()).toBe(Type.INT8)
            expect(buffer.readInt8()).toBe(1)
            expect(buffer.readUInt8()).toBe(Type.INT8)
            expect(buffer.readInt8()).toBe(2)
            expect(buffer.readUInt8()).toBe(Type.INT8)
            expect(buffer.readInt8()).toBe(3)
            expect(buffer.readUInt8()).toBe(Type.ARRAY8)
            expect(buffer.readUInt8()).toBe(1)
            expect(buffer.readUInt8()).toBe(Type.FALSE)
            expect(buffer.readUInt8()).toBe(Type.STRING8)
            expect(buffer.readUInt8()).toBe(3)
            expect(buffer.readString(3)).toBe('abc')
        })
    })
})

describe('decode', () => {
    test.each(
        [
            ['ArrayBuffer', testArrayBuffer.slice(8, 32)],
            ['SharedArrayBuffer', testSharedArrayBuffer.slice(8, 32)],
            ['DataView', testDataView],
            ['Buffer', testBuffer],
        ].concat(testTypedArrays.map(array => [array.constructor.name, array])),
    )('input type: %s', (_message, data) => {
        expect(decode(data)).toBe('abcdefghijklmnopqrstuv')
    })

    test('input type: Array', () => {
        expect(() => decode([0x00] as any)).toThrow(
            '@syncot/tson: Expected binary data to decode.',
        )
    })

    const generateArray = (length: number) => {
        return Array.from(Array(length), (_, i) => {
            switch (i % 10) {
                case 0:
                    return 2 * i - 0x100
                case 1:
                    return i - 0.5
                case 2:
                    return i - 0.3
                case 3:
                    return '!' + i
                case 4:
                    return new ArrayBuffer(5)
                case 5:
                    return true
                case 6:
                    return false
                case 7:
                    return Infinity
                case 8:
                    return null
                case 9:
                    return [1, 2, 3, 'abc']
                default:
                    return i
            }
        })
    }

    test.each([
        ['NULL', null],
        ['BOOLEAN true', true],
        ['BOOLEAN false', false],
        ['INT8 0x0', 0x0],
        ['INT8 0x10', 0x10],
        ['INT8 -0x10', -0x10],
        ['INT8 0x7f', 0x7f],
        ['INT8 -0x80', -0x80],
        ['INT16 0x80', 0x80],
        ['INT16 -0x81', -0x81],
        ['INT16 0x7fff', 0x7fff],
        ['INT16 -0x8000', -0x8000],
        ['INT32 0x8000', 0x8000],
        ['INT32 -0x8001', -0x8001],
        ['INT32 0x7fffffff', 0x7fffffff],
        ['INT32 -0x80000000', -0x80000000],
        ['FLOAT32 1.5', 1.5],
        ['FLOAT32 -1.5', -1.5],
        ['FLOAT32 NaN', NaN],
        ['FLOAT32 Infinity', Infinity],
        ['FLOAT32 -Infinity', -Infinity],
        ['FLOAT64 1.3333', 1.3333],
        ['FLOAT64 -1.3333', -1.3333],
        ['FLOAT64 0x80000000', 0x80000000],
        ['FLOAT64 -0x80000001', -0x80000001],
        ['STRING 0x0 long', ''],
        ['STRING 0xFF long', stringFFLong],
        ['STRING 0x100 long', string100Long],
        ['STRING 0xFFFF long', stringFFFFLong],
        ['STRING 0x10000 long', string10000Long],
        ['ARRAY 0x0 long', generateArray(0x00)],
        ['ARRAY 0xFF long', generateArray(0xff)],
        ['ARRAY 0x100 long', generateArray(0x100)],
        ['ARRAY 0xFFFF long', generateArray(0xffff)],
        ['ARRAY 0x10000 long', generateArray(0x10000)],
        ['ARRAY 0x10011 long', generateArray(0x10011)],
    ])('%s', (_message, data) => {
        expect(decode(encode(data))).toEqual(data)
    })

    test.each([0x0, 0x01, 0xff, 0x100, 0xffff, 0x10000, 0x10047])(
        'BINARY %d long',
        length => {
            const data = Buffer.allocUnsafe(length).fill(0x46)
            const output = decode(encode(data)) as ArrayBuffer
            expect(output).toBeInstanceOf(ArrayBuffer)
            expect(toBuffer(output).compare(data)).toBe(0)
        },
    )

    test('INT64', () => {
        const smartBuffer = SmartBuffer.fromSize(9)
        smartBuffer.writeUInt8(Type.INT64)
        smartBuffer.writeInt32LE(0)
        smartBuffer.writeInt32LE(0)
        const buffer = smartBuffer.toBuffer()
        const arrayBuffer = buffer.buffer.slice(
            buffer.byteOffset,
            buffer.byteOffset + buffer.byteLength,
        )
        expect(arrayBuffer.byteLength).toBe(9)
        expect(() => decode(arrayBuffer)).toThrow(
            '@syncot/tson: Cannot decode a 64-bit integer.',
        )
    })

    test('STRING with mixed characters', () => {
        expect(decode(encode(longString))).toBe(fixedLongString)
    })

    test('unknown type', () => {
        const buffer = Buffer.allocUnsafe(1)
        buffer.writeUInt8(0xff, 0)
        expect(() => decode(buffer)).toThrow('@syncot/tson: Unknown type 0xff.')
    })

    test('ARRAY8 containing values of unknown types', () => {
        expect(
            decode(encode([1, undefined, 2, () => false, Symbol(), 3])),
        ).toEqual([1, null, 2, null, null, 3])
    })
})
