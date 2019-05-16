import {
    isArrayBuffer,
    isBinary,
    isSharedArrayBuffer,
    toArrayBuffer,
    toBuffer,
} from '.'

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
    })

    test.each<[any]>([
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
        const buffer = Buffer.allocUnsafe(4)
        buffer.writeUInt32LE(number, 0)
        const arrayBuffer = toArrayBuffer(buffer)
        expect(arrayBuffer).not.toBe(buffer.buffer)
        expect(arrayBuffer).toBeInstanceOf(ArrayBuffer)
        expect(Buffer.from(arrayBuffer).equals(buffer)).toBeTrue()
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
        expect(Buffer.from(arrayBuffer).equals(buffer)).toBeTrue()
    })

    test.each<[any]>([
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

describe('isBinary', () => {
    test.each<[string, any, boolean]>(
        ([
            ['string', 'test', false],
            ['number', 5, false],
            ['null', null, false],
            ['undefined', undefined, false],
            ['object', {}, false],
            ['array', [], false],
            ['ArrayBuffer', new ArrayBuffer(0), true],
            ['SharedArrayBuffer', new SharedArrayBuffer(0), true],
            ['Buffer', Buffer.allocUnsafe(0), true],
        ] as Array<[string, any, boolean]>).concat([
            DataView,
            Int8Array,
            Uint8Array,
            Uint8ClampedArray,
            Int16Array,
            Uint16Array,
            Int32Array,
            Uint32Array,
            Float32Array,
            Float64Array,
        ].map(constructor => [
            constructor.name,
            new constructor(new ArrayBuffer(8)),
            true,
        ]) as Array<[string, any, boolean]>),
    )('%s', (_, value, expectedResult) => {
        expect(isBinary(value)).toBe(expectedResult)
    })
})

describe('isArrayBuffer', () => {
    test.each<[any, boolean]>([
        [null, false],
        [undefined, false],
        ['[object ArrayBuffer]', false],
        ['[object SharedArrayBuffer]', false],
        [new ArrayBuffer(0), true],
        [new SharedArrayBuffer(0), false],
        [Buffer.allocUnsafe(0), false],
        [new Uint8Array(0), false],
    ])('%s', (value, result) => {
        expect(isArrayBuffer(value)).toBe(result)
    })
})

describe('isSharedArrayBuffer', () => {
    test.each<[any, boolean]>([
        [null, false],
        [undefined, false],
        ['[object ArrayBuffer]', false],
        ['[object SharedArrayBuffer]', false],
        [new ArrayBuffer(0), false],
        [new SharedArrayBuffer(0), true],
        [Buffer.allocUnsafe(0), false],
        [new Uint8Array(0), false],
    ])('%s', (value, result) => {
        expect(isSharedArrayBuffer(value)).toBe(result)
    })
})
