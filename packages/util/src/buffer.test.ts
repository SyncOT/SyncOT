import { toBuffer } from '.'
import { binaryEqual, BinaryType, toArrayBuffer } from './buffer'

describe('toBuffer', () => {
    test('Buffer', () => {
        const originalBuffer = Buffer.allocUnsafe(4)
        const buffer = toBuffer(originalBuffer)
        expect(buffer).toBe(originalBuffer)
    })

    test.each<[ArrayBufferConstructor | SharedArrayBufferConstructor]>([
        [ArrayBuffer],
        [SharedArrayBuffer],
    ])('%s', arrayBufferConstructor => {
        const arrayBuffer = new arrayBufferConstructor(4)
        const buffer = toBuffer(arrayBuffer)
        expect(buffer).toBeInstanceOf(Buffer)
        expect(buffer.buffer).toBe(arrayBuffer)
        expect(buffer.byteOffset).toBe(0)
        expect(buffer.byteLength).toBe(4)
        expect(toBuffer(arrayBuffer)).toBe(buffer)
    })

    test.each<
        [
            new (
                arrayBuffer: ArrayBuffer,
                offset: number,
                length: number,
            ) => ArrayBufferView
        ]
    >([
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
        const view = new viewConstructor(arrayBuffer, 8, 2)
        const buffer = toBuffer(view)
        expect(buffer).toBeInstanceOf(Buffer)
        expect(buffer.buffer).toBe(arrayBuffer)
        expect(buffer.byteOffset).toBe(view.byteOffset)
        expect(buffer.byteLength).toBe(view.byteLength)
        expect(toBuffer(view)).toBe(buffer)
    })

    test.each([
        [undefined],
        [null],
        [() => undefined],
        [() => Buffer.alloc(0)],
        [[]],
        [[0, 1, 2]],
        [{}],
        [1],
        ['abc'],
        [true],
        [false],
    ])('%p', input => {
        expect(toBuffer(input)).toBeUndefined()
    })
})

describe('toArrayBuffer', () => {
    test('Buffer', () => {
        const number = 0x01020304
        const buffer = Buffer.allocUnsafeSlow(4)
        buffer.writeUInt32LE(number, 0)
        const arrayBuffer = toArrayBuffer(buffer)
        expect(arrayBuffer).not.toBe(buffer.buffer)
        expect(arrayBuffer).toBeInstanceOf(ArrayBuffer)
        expect(Buffer.from(arrayBuffer).compare(buffer)).toBe(0)
    })

    test.each<[ArrayBufferConstructor | SharedArrayBufferConstructor]>([
        [ArrayBuffer],
        [SharedArrayBuffer],
    ])('%s', constructor => {
        const arrayBuffer = new constructor(8)
        expect(toArrayBuffer(arrayBuffer)).toBe(arrayBuffer)
    })

    test.each<[new (arrayBuffer: ArrayBuffer) => ArrayBufferView]>([
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
    ])('%p', viewConstructor => {
        const data = new ArrayBuffer(16)
        const view = new viewConstructor(data)
        const buffer = Buffer.from(data)
        buffer.writeUInt32LE(0x00010203, 0)
        buffer.writeUInt32LE(0x04050607, 4)
        buffer.writeUInt32LE(0x08090a0b, 8)
        buffer.writeUInt32LE(0x0c0d0e0f, 12)
        const arrayBuffer = toArrayBuffer(view)
        expect(arrayBuffer).not.toBe(data)
        expect(arrayBuffer).toBeInstanceOf(ArrayBuffer)
        expect(Buffer.from(arrayBuffer).compare(buffer)).toBe(0)
    })

    test.each([
        [undefined],
        [null],
        [() => undefined],
        [() => Buffer.alloc(0)],
        [[]],
        [[0, 1, 2]],
        [{}],
        [1],
        ['abc'],
        [true],
        [false],
    ])('%p', input => {
        expect(toArrayBuffer(input)).toBeUndefined()
    })
})

describe('binaryEqual', () => {
    test.each<[BinaryType, BinaryType, boolean]>([
        [Buffer.from('some data'), Buffer.from('some data'), true],
        [Buffer.allocUnsafe(0), Buffer.allocUnsafe(0), true],
        [Buffer.from('some data'), Buffer.from('some data!'), false],
        [Buffer.from('some data!'), Buffer.from('some data'), false],
        [
            toArrayBuffer(Buffer.from('test')),
            toArrayBuffer(Buffer.from('test')),
            true,
        ],
        [
            toArrayBuffer(Buffer.from('test')),
            toArrayBuffer(Buffer.from('test1')),
            false,
        ],
        [toArrayBuffer(Buffer.from('test')), Buffer.from('test'), true],
        [Buffer.from('test'), toArrayBuffer(Buffer.from('test')), true],
        [
            new DataView(toArrayBuffer(Buffer.from('test'))),
            Buffer.from('test'),
            true,
        ],
        [
            new Uint16Array(toArrayBuffer(Buffer.from('test'))),
            Buffer.from('test'),
            true,
        ],
    ])('test #%#', (binary1, binary2, result) => {
        expect(binaryEqual(binary1, binary2)).toBe(result)
    })

    test('invalid first param', () => {
        expect(() => binaryEqual(5 as any, Buffer.allocUnsafe(0))).toThrow(
            expect.objectContaining({
                name: 'TypeError',
            }),
        )
    })

    test('invalid second param', () => {
        expect(() => binaryEqual(Buffer.allocUnsafe(0), 5 as any)).toThrow(
            expect.objectContaining({
                name: 'TypeError [ERR_INVALID_ARG_TYPE]',
            }),
        )
    })
})