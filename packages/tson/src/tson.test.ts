import { binaryEqual, toArrayBuffer } from '@syncot/util'
import { SmartBuffer } from 'smart-buffer'
import { decode, encode } from '.'
import { Type } from './tson'

const errorMatcher = (message: string) =>
    expect.objectContaining({
        message,
        name: 'SyncOtError TSON',
    })

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

        test.each([0x00, 0x01, 0xff, 0x100, 0xffff, 0x10000, 0x10011])(
            'length: %d',
            length => {
                const data = Buffer.allocUnsafe(length).fill(0x57)
                const buffer = encodeToSmartBuffer(data)
                const lengthSize = length <= 0xff ? 1 : length <= 0xffff ? 2 : 4
                expect(buffer.length).toBe(1 + lengthSize + length)
                expect(buffer.readUInt8()).toBe(
                    length <= 0xff
                        ? Type.BINARY8
                        : length <= 0xffff
                        ? Type.BINARY16
                        : Type.BINARY32,
                )
                expect(
                    length <= 0xff
                        ? buffer.readUInt8()
                        : length <= 0xffff
                        ? buffer.readUInt16LE()
                        : buffer.readUInt32LE(),
                ).toBe(length)
                expect(buffer.readBuffer(length).compare(data)).toBe(0)
            },
        )
    })

    describe('ARRAY', () => {
        test.each([0x00, 0x01, 0xff, 0x100, 0xffff, 0x10000, 0x10011])(
            'length: %d',
            length => {
                const lengthSize = length <= 0xff ? 1 : length <= 0xffff ? 2 : 4
                const arrayType =
                    length <= 0xff
                        ? Type.ARRAY8
                        : length <= 0xffff
                        ? Type.ARRAY16
                        : Type.ARRAY32
                const array = Array.from(Array(length), (_, i) =>
                    Math.max(-0x80, 0x7f - i),
                )
                const buffer = encodeToSmartBuffer(array)
                expect(buffer.length).toBe(1 + lengthSize + length * 2)
                expect(buffer.readUInt8()).toBe(arrayType)
                expect(
                    length <= 0xff
                        ? buffer.readUInt8()
                        : length <= 0xffff
                        ? buffer.readUInt16LE()
                        : buffer.readUInt32LE(),
                ).toBe(length)
                for (let i = 0; i < length; ++i) {
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
            },
        )

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

    describe('OBJECT', () => {
        test.each([0x00, 0x01, 0xff, 0x100, 0xffff, 0x10000, 0x10011])(
            'property count: %d',
            length => {
                const typeSize = 1
                const lengthSize = length <= 0xff ? 1 : length <= 0xffff ? 2 : 4
                const arrayType =
                    length <= 0xff
                        ? Type.OBJECT8
                        : length <= 0xffff
                        ? Type.OBJECT16
                        : Type.OBJECT32
                const propertySize = 14 // key-type (1) + key-length (1) + key (10) + value-type (1) + value (1)
                const object: { [key: string]: number } = {}
                for (let i = 0; i < length; ++i) {
                    object['' + (1000000000 + i)] = Math.max(-0x80, 0x7f - i)
                }
                const buffer = encodeToSmartBuffer(object)
                expect(buffer.length).toBe(
                    typeSize + lengthSize + propertySize * length,
                )
                expect(buffer.readUInt8()).toBe(arrayType)
                expect(
                    length <= 0xff
                        ? buffer.readUInt8()
                        : length <= 0xffff
                        ? buffer.readUInt16LE()
                        : buffer.readUInt32LE(),
                ).toBe(length)
                for (let i = 0; i < length; ++i) {
                    const keyType = buffer.readUInt8()
                    const keyLength = buffer.readUInt8()
                    const key = buffer.readString(10)
                    const valueType = buffer.readUInt8()
                    const value = buffer.readInt8()
                    const expectedKey = '' + (1000000000 + i)
                    const expectedValue = Math.max(-0x80, 0x7f - i)
                    // Avoid calling expect to drastically improve performance.
                    if (
                        keyType !== Type.STRING8 ||
                        keyLength !== 10 ||
                        key !== expectedKey ||
                        valueType !== Type.INT8 ||
                        value !== expectedValue
                    ) {
                        expect(keyType).toBe(Type.STRING8)
                        expect(keyLength).toBe(10)
                        expect(key).toBe(expectedKey)
                        expect(valueType).toBe(Type.INT8)
                        expect(value).toBe(expectedValue)
                    }
                }
            },
        )

        test.each([0x00, 0x01, 0xff, 0x100, 0xffff, 0x10000, 0x10011])(
            'key length: %d',
            length => {
                const lengthSize = length <= 0xff ? 1 : length <= 0xffff ? 2 : 4
                const object: { [key: string]: number } = {}
                const key = Array.from(Array(length), (_, i) => i % 10).join('')
                object[key] = 10 // 1 + lengthSize + length (key) + 2 (value)
                object[':'] = 20 // 3 (key) + 2 (value) bytes
                const buffer = encodeToSmartBuffer(object)
                expect(buffer.length).toBe(
                    2 + (1 + lengthSize + length + 2) + 5,
                )
                expect(buffer.readUInt8()).toBe(Type.OBJECT8)
                expect(buffer.readUInt8()).toBe(2)
                expect(buffer.readUInt8()).toBe(
                    length <= 0xff
                        ? Type.STRING8
                        : length <= 0xffff
                        ? Type.STRING16
                        : Type.STRING32,
                )
                expect(
                    length <= 0xff
                        ? buffer.readUInt8()
                        : length <= 0xffff
                        ? buffer.readUInt16LE()
                        : buffer.readUInt32LE(),
                ).toBe(length)
                expect(buffer.readString(length)).toBe(key)
                expect(buffer.readUInt8()).toBe(Type.INT8)
                expect(buffer.readInt8()).toBe(10)
                expect(buffer.readUInt8()).toBe(Type.STRING8)
                expect(buffer.readUInt8()).toBe(1)
                expect(buffer.readString(1)).toBe(':')
                expect(buffer.readUInt8()).toBe(Type.INT8)
                expect(buffer.readInt8()).toBe(20)
            },
        )

        test('mixed values', () => {
            const object: { [key: string]: any } = {}
            object.a = true
            object.b = null
            object.c = 0.3
            object.d = NaN
            object.e = Buffer.allocUnsafe(1).fill(0x13)
            object.f = {
                A: 'xyz',
                B: [1, { C: 2 }, 3],
            }
            object.g = 'abc'
            object.h = undefined
            const buffer = encodeToSmartBuffer(object)
            expect(buffer.length).toBe(
                1 + // object type
                1 + // object size
                4 + // property a
                4 + // property b
                12 + // property c
                8 + // property d
                6 + // property e
                5 + // property f
                8 + // property g
                4 + // property h
                8 + // property A
                5 + // property B
                2 + // array 0
                7 + // array 1
                    2, // array 2
            )
            expect(buffer.readUInt8()).toBe(Type.OBJECT8)
            expect(buffer.readUInt8()).toBe(8)

            expect(buffer.readUInt8()).toBe(Type.STRING8)
            expect(buffer.readUInt8()).toBe(1)
            expect(buffer.readString(1)).toBe('a')
            expect(buffer.readUInt8()).toBe(Type.TRUE)

            expect(buffer.readUInt8()).toBe(Type.STRING8)
            expect(buffer.readUInt8()).toBe(1)
            expect(buffer.readString(1)).toBe('b')
            expect(buffer.readUInt8()).toBe(Type.NULL)

            expect(buffer.readUInt8()).toBe(Type.STRING8)
            expect(buffer.readUInt8()).toBe(1)
            expect(buffer.readString(1)).toBe('c')
            expect(buffer.readUInt8()).toBe(Type.FLOAT64)
            expect(buffer.readDoubleLE()).toBe(0.3)

            expect(buffer.readUInt8()).toBe(Type.STRING8)
            expect(buffer.readUInt8()).toBe(1)
            expect(buffer.readString(1)).toBe('d')
            expect(buffer.readUInt8()).toBe(Type.FLOAT32)
            expect(buffer.readFloatLE()).toBe(NaN)

            expect(buffer.readUInt8()).toBe(Type.STRING8)
            expect(buffer.readUInt8()).toBe(1)
            expect(buffer.readString(1)).toBe('e')
            expect(buffer.readUInt8()).toBe(Type.BINARY8)
            expect(buffer.readUInt8()).toBe(1)
            expect(buffer.readUInt8()).toBe(0x13)

            expect(buffer.readUInt8()).toBe(Type.STRING8)
            expect(buffer.readUInt8()).toBe(1)
            expect(buffer.readString(1)).toBe('f')
            expect(buffer.readUInt8()).toBe(Type.OBJECT8)
            expect(buffer.readUInt8()).toBe(2)

            expect(buffer.readUInt8()).toBe(Type.STRING8)
            expect(buffer.readUInt8()).toBe(1)
            expect(buffer.readString(1)).toBe('A')
            expect(buffer.readUInt8()).toBe(Type.STRING8)
            expect(buffer.readUInt8()).toBe(3)
            expect(buffer.readString(3)).toBe('xyz')

            expect(buffer.readUInt8()).toBe(Type.STRING8)
            expect(buffer.readUInt8()).toBe(1)
            expect(buffer.readString(1)).toBe('B')
            expect(buffer.readUInt8()).toBe(Type.ARRAY8)
            expect(buffer.readUInt8()).toBe(3)

            expect(buffer.readUInt8()).toBe(Type.INT8)
            expect(buffer.readInt8()).toBe(1)

            expect(buffer.readUInt8()).toBe(Type.OBJECT8)
            expect(buffer.readUInt8()).toBe(1)
            expect(buffer.readUInt8()).toBe(Type.STRING8)
            expect(buffer.readUInt8()).toBe(1)
            expect(buffer.readString(1)).toBe('C')
            expect(buffer.readUInt8()).toBe(Type.INT8)
            expect(buffer.readInt8()).toBe(2)

            expect(buffer.readUInt8()).toBe(Type.INT8)
            expect(buffer.readInt8()).toBe(3)

            expect(buffer.readUInt8()).toBe(Type.STRING8)
            expect(buffer.readUInt8()).toBe(1)
            expect(buffer.readString(1)).toBe('g')
            expect(buffer.readUInt8()).toBe(Type.STRING8)
            expect(buffer.readUInt8()).toBe(3)
            expect(buffer.readString(3)).toBe('abc')

            expect(buffer.readUInt8()).toBe(Type.STRING8)
            expect(buffer.readUInt8()).toBe(1)
            expect(buffer.readString(1)).toBe('h')
            expect(buffer.readUInt8()).toBe(Type.NULL)
        })
    })

    describe('ERROR', () => {
        test('Error', () => {
            const name = 'Error'
            const message = 'test error'
            const error = new Error(message)
            const buffer = encodeToSmartBuffer(error)
            expect(buffer.length).toBe(
                1 + // type
                7 + // name
                12 + // message
                    1, // extra properties
            )
            expect(buffer.readUInt8()).toBe(Type.ERROR)
            expect(buffer.readUInt8()).toBe(Type.STRING8)
            expect(buffer.readUInt8()).toBe(name.length)
            expect(buffer.readString(name.length)).toBe(name)
            expect(buffer.readUInt8()).toBe(Type.STRING8)
            expect(buffer.readUInt8()).toBe(message.length)
            expect(buffer.readString(message.length)).toBe(message)
            expect(buffer.readUInt8()).toBe(Type.NULL)
        })
        test('TypeError', () => {
            const name = 'TypeError'
            const message = 'test error'
            const error = new TypeError(message)
            const buffer = encodeToSmartBuffer(error)
            expect(buffer.length).toBe(
                1 + // type
                11 + // name
                12 + // message
                    1, // extra properties
            )
            expect(buffer.readUInt8()).toBe(Type.ERROR)
            expect(buffer.readUInt8()).toBe(Type.STRING8)
            expect(buffer.readUInt8()).toBe(name.length)
            expect(buffer.readString(name.length)).toBe(name)
            expect(buffer.readUInt8()).toBe(Type.STRING8)
            expect(buffer.readUInt8()).toBe(message.length)
            expect(buffer.readString(message.length)).toBe(message)
            expect(buffer.readUInt8()).toBe(Type.NULL)
        })
        test('name not a string', () => {
            const error = new Error('test')
            error.name = 5 as any
            expect(() => encodeToSmartBuffer(error)).toThrow(
                errorMatcher('Error name is not a string.'),
            )
        })
        test('message not a string', () => {
            const error = new Error('test')
            error.message = 5 as any
            expect(() => encodeToSmartBuffer(error)).toThrow(
                errorMatcher('Error message is not a string.'),
            )
        })
        test.each([
            [0x01, 1],
            [0xff, 1],
            [0x100, 2],
            [0xffff, 2],
            [0x10000, 4],
            [0x10011, 4],
        ])('Error with details (%d properties)', (length, lengthSize) => {
            const name = 'Error'
            const message = 'test'
            const error = new Error(message)
            const keys = []
            const values = []
            for (let i = 0; i < length; ++i) {
                const key = (keys[i] = (1000000000 + i).toString())
                const value = (values[i] = (i % 0x100) - 0x80)
                ;(error as any)[key] = value
            }
            const buffer = encodeToSmartBuffer(error)
            expect(buffer.length).toBe(
                1 + // type
                7 + // name
                6 + // message
                1 + // details type
                lengthSize + // details size
                    length * (12 + 2), // details properties
            )
            expect(buffer.readUInt8()).toBe(Type.ERROR)
            expect(buffer.readUInt8()).toBe(Type.STRING8)
            expect(buffer.readUInt8()).toBe(name.length)
            expect(buffer.readString(name.length)).toBe(name)
            expect(buffer.readUInt8()).toBe(Type.STRING8)
            expect(buffer.readUInt8()).toBe(message.length)
            expect(buffer.readString(message.length)).toBe(message)
            expect(buffer.readUInt8()).toBe(
                lengthSize === 1
                    ? Type.OBJECT8
                    : lengthSize === 2
                    ? Type.OBJECT16
                    : Type.OBJECT32,
            )
            expect(
                lengthSize === 1
                    ? buffer.readUInt8()
                    : lengthSize === 2
                    ? buffer.readUInt16LE()
                    : buffer.readUInt32LE(),
            ).toBe(length)
            for (let i = 0; i < length; ++i) {
                const keyType = buffer.readUInt8()
                const keyLength = buffer.readUInt8()
                const key = buffer.readString(10)
                const valueType = buffer.readUInt8()
                const value = buffer.readInt8()
                if (
                    keyType !== Type.STRING8 ||
                    keyLength !== 10 ||
                    key !== keys[i] ||
                    valueType !== Type.INT8 ||
                    value !== values[i]
                ) {
                    expect(keyType).toBe(Type.STRING8)
                    expect(keyLength).toBe(10)
                    expect(key).toBe(keys[i])
                    expect(valueType).toBe(Type.INT8)
                    expect(value).toBe(values[i])
                }
            }
        })
        test('mixed details types', () => {
            const name = 'Error'
            const message = 'test'
            const error = new Error(message)
            ;(error as any).a = true
            ;(error as any).b = [1, { key: new Error('') }, 2]
            ;(error as any).c = undefined
            const buffer = encodeToSmartBuffer(error)
            expect(buffer.length).toBe(
                1 + // type
                7 + // name
                6 + // message
                1 + // details type
                1 + // details size
                4 + // property a
                27 + // property b
                    4, // property c
            )
            expect(buffer.readUInt8()).toBe(Type.ERROR)
            expect(buffer.readUInt8()).toBe(Type.STRING8)
            expect(buffer.readUInt8()).toBe(name.length)
            expect(buffer.readString(name.length)).toBe(name)
            expect(buffer.readUInt8()).toBe(Type.STRING8)
            expect(buffer.readUInt8()).toBe(message.length)
            expect(buffer.readString(message.length)).toBe(message)

            expect(buffer.readUInt8()).toBe(Type.OBJECT8)
            expect(buffer.readUInt8()).toBe(3)

            expect(buffer.readUInt8()).toBe(Type.STRING8)
            expect(buffer.readUInt8()).toBe(1)
            expect(buffer.readString(1)).toBe('a')
            expect(buffer.readUInt8()).toBe(Type.TRUE)

            expect(buffer.readUInt8()).toBe(Type.STRING8)
            expect(buffer.readUInt8()).toBe(1)
            expect(buffer.readString(1)).toBe('b')
            expect(buffer.readUInt8()).toBe(Type.ARRAY8)
            expect(buffer.readUInt8()).toBe(3)

            expect(buffer.readUInt8()).toBe(Type.INT8)
            expect(buffer.readInt8()).toBe(1)

            expect(buffer.readUInt8()).toBe(Type.OBJECT8)
            expect(buffer.readUInt8()).toBe(1)
            expect(buffer.readUInt8()).toBe(Type.STRING8)
            expect(buffer.readUInt8()).toBe(3)
            expect(buffer.readString(3)).toBe('key')
            expect(buffer.readUInt8()).toBe(Type.ERROR)
            expect(buffer.readUInt8()).toBe(Type.STRING8)
            expect(buffer.readUInt8()).toBe(5)
            expect(buffer.readString(5)).toBe('Error')
            expect(buffer.readUInt8()).toBe(Type.STRING8)
            expect(buffer.readUInt8()).toBe(0)
            expect(buffer.readUInt8()).toBe(Type.NULL)

            expect(buffer.readUInt8()).toBe(Type.INT8)
            expect(buffer.readInt8()).toBe(2)

            expect(buffer.readUInt8()).toBe(Type.STRING8)
            expect(buffer.readUInt8()).toBe(1)
            expect(buffer.readString(1)).toBe('c')
            expect(buffer.readUInt8()).toBe(Type.NULL)
        })
        test('no name', () => {
            const buffer = encodeToSmartBuffer(new Error())
            expect(buffer.length).toBe(11)
            expect(buffer.readUInt8()).toBe(Type.ERROR)
            expect(buffer.readUInt8()).toBe(Type.STRING8)
            expect(buffer.readUInt8()).toBe(5)
            expect(buffer.readString(5)).toBe('Error')
            expect(buffer.readUInt8()).toBe(Type.STRING8)
            expect(buffer.readUInt8()).toBe(0)
            expect(buffer.readUInt8()).toBe(Type.NULL)
        })
        test('enumerable name', () => {
            const error = new Error('test')
            const expectedBuffer = encodeToSmartBuffer(error).toBuffer()
            Object.defineProperty(error, 'name', {
                enumerable: true,
                value: error.name,
            })
            const buffer = encodeToSmartBuffer(error).toBuffer()
            expect(buffer.compare(expectedBuffer)).toBe(0)
        })
        test('enumerable message', () => {
            const error = new Error('test')
            const expectedBuffer = encodeToSmartBuffer(error).toBuffer()
            Object.defineProperty(error, 'message', {
                enumerable: true,
                value: error.message,
            })
            const buffer = encodeToSmartBuffer(error).toBuffer()
            expect(buffer.compare(expectedBuffer)).toBe(0)
        })
        test('enumerable name and message', () => {
            const error = new Error('test')
            const expectedBuffer = encodeToSmartBuffer(error).toBuffer()
            Object.defineProperty(error, 'name', {
                enumerable: true,
                value: error.name,
            })
            Object.defineProperty(error, 'message', {
                enumerable: true,
                value: error.message,
            })
            const buffer = encodeToSmartBuffer(error).toBuffer()
            expect(buffer.compare(expectedBuffer)).toBe(0)
        })
        test('enumerable name, message and details', () => {
            const error = new Error('test')
            ;(error as any).a = 5
            ;(error as any).b = 'abc'
            const expectedBuffer = encodeToSmartBuffer(error).toBuffer()
            Object.defineProperty(error, 'name', {
                enumerable: true,
                value: error.name,
            })
            Object.defineProperty(error, 'message', {
                enumerable: true,
                value: error.message,
            })
            const buffer = encodeToSmartBuffer(error).toBuffer()
            expect(buffer.compare(expectedBuffer)).toBe(0)
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
            errorMatcher('Expected binary data to decode.'),
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

    const generateObject = (constructor: new () => any) => (
        propertyCount: number,
    ) => {
        const object: { [key: string]: any } = new constructor()
        for (let i = 0; i < propertyCount; ++i) {
            switch (i % 10) {
                case 0:
                    object['' + (1000000000 + i)] = 2 * i - 0x100
                    break
                case 1:
                    object['' + (1000000000 + i)] = i - 0.5
                    break
                case 2:
                    object['' + (1000000000 + i)] = i - 0.3
                    break
                case 3:
                    object['' + (1000000000 + i)] = '!' + i
                    break
                case 4:
                    object['' + (1000000000 + i)] = new ArrayBuffer(5)
                    break
                case 5:
                    object['' + (1000000000 + i)] = true
                    break
                case 6:
                    object['' + (1000000000 + i)] = {
                        list: [1, 2, { A: 3 }, 'abc'],
                        q: 9,
                    }
                    break
                case 7:
                    object['' + (1000000000 + i)] = Infinity
                    break
                case 8:
                    object['' + (1000000000 + i)] = null
                    break
                case 9:
                    object['' + (1000000000 + i)] = [
                        1,
                        2,
                        3,
                        'abc',
                        { key: 'value' },
                    ]
                    break
                default:
                    object['' + (1000000000 + i)] = i
                    break
            }
        }
        return object
    }
    const generatePlainObject = generateObject(Object)
    const generateError = generateObject(Error)
    const generateErrorWithName = (length: number): Error => {
        const name = Array.from(Array(length), (_, i) =>
            (i % 10).toString(),
        ).join('')
        const error = new Error()
        Object.defineProperty(error, 'name', {
            configurable: true,
            value: name,
            writable: true,
        })
        return error
    }
    const generateErrorWithMessage = (length: number): Error => {
        const message = Array.from(Array(length), (_, i) =>
            (i % 10).toString(),
        ).join('')
        return new Error(message)
    }
    const toCharCodeArray = (text: string): number[] =>
        text.split('').map(c => c.charCodeAt(0))

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
        ['OBJECT 0x0 long', generatePlainObject(0x00)],
        ['OBJECT 0xFF long', generatePlainObject(0xff)],
        ['OBJECT 0x100 long', generatePlainObject(0x100)],
        ['OBJECT 0xFFFF long', generatePlainObject(0xffff)],
        ['OBJECT 0x10000 long', generatePlainObject(0x10000)],
        ['OBJECT 0x10011 long', generatePlainObject(0x10011)],
        ['ERROR 0x0 extra properties', generateError(0x00)],
        ['ERROR 0xFF extra properties', generateError(0xff)],
        ['ERROR 0x100 extra properties', generateError(0x100)],
        ['ERROR 0xFFFF extra properties', generateError(0xffff)],
        ['ERROR 0x10000 extra properties', generateError(0x10000)],
        ['ERROR 0x10011 extra properties', generateError(0x10011)],
        ['ERROR name 0x0 long', generateErrorWithName(0x0)],
        ['ERROR name 0xFF long', generateErrorWithName(0xff)],
        ['ERROR name 0x100 long', generateErrorWithName(0x100)],
        ['ERROR name 0xFFFF long', generateErrorWithName(0xffff)],
        ['ERROR name 0x10000 long', generateErrorWithName(0x10000)],
        ['ERROR name 0x10011 long', generateErrorWithName(0x10011)],
        ['ERROR message 0x0 long', generateErrorWithMessage(0x0)],
        ['ERROR message 0xFF long', generateErrorWithMessage(0xff)],
        ['ERROR message 0x100 long', generateErrorWithMessage(0x100)],
        ['ERROR message 0xFFFF long', generateErrorWithMessage(0xffff)],
        ['ERROR message 0x10000 long', generateErrorWithMessage(0x10000)],
        ['ERROR message 0x10011 long', generateErrorWithMessage(0x10011)],
    ])('%s', (_message, data) => {
        const decoded = decode(encode(data))
        expect(decoded).toEqual(data)
        if (data instanceof Error) {
            expect(decoded).toBeInstanceOf(Error)
            expect((decoded as Error).propertyIsEnumerable('name')).toBe(false)
            expect((decoded as Error).name).toBe(data.name)
            expect((decoded as Error).propertyIsEnumerable('message')).toBe(
                false,
            )
            expect((decoded as Error).message).toBe(data.message)
            expect(Object.entries(decoded as Error)).toEqual(
                Object.entries(data),
            )
        }
    })

    test.each([0x0, 0x01, 0xff, 0x100, 0xffff, 0x10000, 0x10047])(
        'BINARY %d long',
        length => {
            const data = Buffer.allocUnsafe(length).fill(0x46)
            const output = decode(encode(data)) as ArrayBuffer
            expect(output).toBeInstanceOf(ArrayBuffer)
            expect(binaryEqual(output, data)).toBeTrue()
        },
    )

    test('INT64', () => {
        const smartBuffer = SmartBuffer.fromSize(9)
        smartBuffer.writeUInt8(Type.INT64)
        smartBuffer.writeInt32LE(0)
        smartBuffer.writeInt32LE(0)
        const buffer = smartBuffer.toBuffer()
        const arrayBuffer = toArrayBuffer(buffer)
        expect(arrayBuffer.byteLength).toBe(9)
        expect(() => decode(arrayBuffer)).toThrow(
            errorMatcher('Cannot decode a 64-bit integer.'),
        )
    })

    test('STRING with mixed characters', () => {
        expect(decode(encode(longString))).toBe(fixedLongString)
    })

    test('unknown type', () => {
        const buffer = Buffer.allocUnsafe(1)
        buffer.writeUInt8(0xff, 0)
        expect(() => decode(buffer)).toThrow(errorMatcher('Unknown type.'))
    })

    test('ARRAY containing values of unknown types', () => {
        expect(
            decode(encode([1, undefined, 2, () => false, Symbol(), 3])),
        ).toEqual([1, null, 2, null, null, 3])
    })

    test('OBJECT containing values of unknown types', () => {
        expect(
            decode(
                encode({
                    a: 1,
                    b: undefined,
                    c: () => false,
                    d: Symbol(),
                    e: 5,
                }),
            ),
        ).toEqual({
            a: 1,
            b: null,
            c: null,
            d: null,
            e: 5,
        })
    })

    test.each([
        ['Type code', []],
        ['INT8', [Type.INT8]],
        ['INT16', [Type.INT16, 0]],
        ['INT32', [Type.INT32, 0, 0, 0]],
        ['FLOAT32', [Type.FLOAT32, 0, 0, 0]],
        ['FLOAT64', [Type.FLOAT64, 0, 0, 0, 0, 0, 0, 0]],
        ['STRING8 length', [Type.STRING8]],
        ['STRING8 data', [Type.STRING8, 3, 0, 0]],
        ['STRING16 length', [Type.STRING16, 0]],
        ['STRING16 data', [Type.STRING16, 3, 0, 0, 0]],
        ['STRING32 length', [Type.STRING32, 0, 0, 0]],
        ['STRING32 data', [Type.STRING32, 3, 0, 0, 0, 0, 0]],
        ['BINARY8 length', [Type.BINARY8]],
        ['BINARY8 data', [Type.BINARY8, 3, 0, 0]],
        ['BINARY16 length', [Type.BINARY16, 0]],
        ['BINARY16 data', [Type.BINARY16, 3, 0, 0, 0]],
        ['BINARY32 length', [Type.BINARY32, 0, 0, 0]],
        ['BINARY32 data', [Type.BINARY32, 3, 0, 0, 0, 0, 0]],
        ['ARRAY8 length', [Type.ARRAY8]],
        ['ARRAY16 length', [Type.ARRAY16, 0]],
        ['ARRAY32 length', [Type.ARRAY32, 0, 0, 0]],
        ['OBJECT8 size', [Type.OBJECT8]],
        ['OBJECT16 size', [Type.OBJECT16, 0]],
        ['OBJECT32 size', [Type.OBJECT32, 0, 0, 0]],
    ])('Error: %s expected', (what, data) => {
        expect(() => decode(Buffer.from(data))).toThrow(
            errorMatcher(`${what} expected.`),
        )
    })

    test.each([
        ['OBJECT8', [Type.OBJECT8, 1, Type.TRUE, Type.TRUE]],
        ['OBJECT16', [Type.OBJECT16, 1, 0, Type.TRUE, Type.TRUE]],
        ['OBJECT32', [Type.OBJECT32, 1, 0, 0, 0, Type.TRUE, Type.TRUE]],
    ])('%s key not a string', (_, data) => {
        expect(() => decode(Buffer.from(data))).toThrow(
            errorMatcher('Object key not a string.'),
        )
    })

    test.each([
        [
            'Error name not a string.',
            [Type.ERROR, Type.ARRAY8, 2, Type.TRUE, Type.FALSE],
        ],
        [
            'Error message not a string.',
            [Type.ERROR, Type.STRING8, 0, Type.INT8, 1],
        ],
        [
            'Error details not a plain object nor null.',
            [Type.ERROR, Type.STRING8, 0, Type.STRING8, 0, Type.FALSE],
        ],
        [
            '"name" property present in Error details.',
            [Type.ERROR].concat(
                [Type.STRING8, 5],
                toCharCodeArray('Error'),
                [Type.STRING8, 4],
                toCharCodeArray('test'),
                [Type.OBJECT8, 1, Type.STRING8, 4],
                toCharCodeArray('name'),
                [Type.STRING8, 5],
                toCharCodeArray('Error'),
            ),
        ],
        [
            '"message" property present in Error details.',
            [Type.ERROR].concat(
                [Type.STRING8, 5],
                toCharCodeArray('Error'),
                [Type.STRING8, 4],
                toCharCodeArray('test'),
                [Type.OBJECT8, 1, Type.STRING8, 7],
                toCharCodeArray('message'),
                [Type.STRING8, 4],
                toCharCodeArray('test'),
            ),
        ],
    ])('ERROR failure: %s', (message, data) => {
        expect(() => decode(Buffer.from(data))).toThrow(errorMatcher(message))
    })
})
