import {
    createBufferReader,
    createBufferWriter,
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
            ) => ArrayBufferView,
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

describe('BufferWriter & BufferReader', () => {
    test.each<[string, number, number]>([
        ['UInt8', 0x00, 0xff],
        ['Int8', -0x80, 0x7f],
        ['UInt16LE', 0x0000, 0xffff],
        ['Int16LE', -0x8000, 0x7fff],
        ['UInt32LE', 0x0000, 0xffff],
        ['Int32LE', -0x80000000, 0x7fffffff],
    ])('%s', (name, min, max) => {
        const count = 100
        const originalValues = new Array(count)
        const writer = createBufferWriter(4)

        for (let i = 0; i < count; ++i) {
            const value = Math.floor(Math.random() * (max - min) + min)
            originalValues[i] = value
            ;(writer as any)['write' + name](value)
        }

        const reader = createBufferReader(writer.toBuffer())

        for (let i = 0; i < count; ++i) {
            const value = (reader as any)['read' + name]()
            expect(value).toBe(originalValues[i])
        }

        expect(() => (reader as any)['read' + name]()).toThrow(
            'Insufficient data to read.',
        )
    })
    test.each(['FloatLE'])('%s', (name: string) => {
        const count = 100
        const originalValues = new Array(count)
        const writer = createBufferWriter(4)

        for (let i = 0; i < count; ++i) {
            const value = (Math.random() - 0.5) * 1000
            originalValues[i] = value
            ;(writer as any)['write' + name](value)
        }

        const reader = createBufferReader(writer.toBuffer())

        for (let i = 0; i < count; ++i) {
            const value = (reader as any)['read' + name]()
            expect(value).toBeCloseTo(originalValues[i])
        }

        expect(() => (reader as any)['read' + name]()).toThrow(
            'Insufficient data to read.',
        )
    })
    test.each(['DoubleLE'])('%s', (name: string) => {
        const count = 100
        const originalValues = new Array(count)
        const writer = createBufferWriter(4)

        for (let i = 0; i < count; ++i) {
            const value = (Math.random() - 0.5) * 1000
            originalValues[i] = value
            ;(writer as any)['write' + name](value)
        }

        const reader = createBufferReader(writer.toBuffer())

        for (let i = 0; i < count; ++i) {
            const value = (reader as any)['read' + name]()
            expect(value).toBe(originalValues[i])
        }

        expect(() => (reader as any)['read' + name]()).toThrow(
            'Insufficient data to read.',
        )
    })
    test('Buffer', () => {
        const count = 100
        const originalValues = new Array(count)
        const writer = createBufferWriter(4)

        for (let i = 0; i < count; ++i) {
            const value = Buffer.from(
                Math.random()
                    .toString()
                    .substring(0, 4),
            )
            originalValues[i] = value
            writer.writeBuffer(value)
        }

        const reader = createBufferReader(writer.toBuffer())

        for (let i = 0; i < count; ++i) {
            const value = reader.readBuffer(4)
            expect(value).toEqual(originalValues[i])
        }

        expect(() => reader.readBuffer(4)).toThrow('Insufficient data to read.')
    })
    test('String', () => {
        const count = 100
        const originalValues = new Array(count)
        const writer = createBufferWriter(4)

        for (let i = 0; i < count; ++i) {
            const value = Math.random()
                .toString()
                .substring(0, 4)
            originalValues[i] = value
            writer.writeString(value)
        }

        const reader = createBufferReader(writer.toBuffer())

        for (let i = 0; i < count; ++i) {
            const value = reader.readString(4)
            expect(value).toBe(originalValues[i])
        }

        expect(() => reader.readString(4)).toThrow('Insufficient data to read.')
    })
    test('createBufferWriter with default size', () => {
        const writer = createBufferWriter()
        writer.writeString('hello', 'utf8')
        writer.writeString('world', 'utf8')
        const reader = createBufferReader(writer.toBuffer())
        expect(reader.readString(5, 'utf8')).toBe('hello')
        expect(reader.readString(5, 'utf8')).toBe('world')
    })
    test('hex strings', () => {
        const hello = Buffer.from('hello').toString('hex')
        const world = Buffer.from('world').toString('hex')
        const writer = createBufferWriter()
        writer.writeString(hello, 'hex')
        writer.writeString(world, 'hex')

        const buffer = writer.toBuffer()
        expect(buffer).toEqual(Buffer.from(hello + world, 'hex'))

        const reader = createBufferReader(buffer)
        expect(reader.readString(buffer.length / 2, 'hex')).toBe(hello)
        expect(reader.readString(buffer.length / 2, 'hex')).toBe(world)

        const reader2 = createBufferReader(buffer)
        expect(reader2.readString(buffer.length / 2, 'utf8')).toBe('hello')
        expect(reader2.readString(buffer.length / 2, 'utf8')).toBe('world')
    })
    test('BufferReader length and offset', () => {
        const reader = createBufferReader(Buffer.from('helloworld'))
        expect(reader.length).toBe(10)
        expect(reader.offset).toBe(0)
        expect(reader.readString(5)).toBe('hello')
        expect(reader.offset).toBe(5)
        expect(reader.readString(2)).toBe('wo')
        expect(reader.offset).toBe(7)
        expect(reader.readString(3)).toBe('rld')
        expect(reader.offset).toBe(10)
    })
    test('BufferWriter length and offset', () => {
        const writer = createBufferWriter(0)
        expect(writer.length).toBe(0)
        expect(writer.offset).toBe(0)
        expect(writer.writeString('hello'))
        expect(writer.length).toBe(5)
        expect(writer.offset).toBe(5)
        expect(writer.writeString('w'))
        expect(writer.length).toBe(6)
        expect(writer.offset).toBe(6)
        expect(writer.writeString('o'))
        expect(writer.length).toBe(7)
        expect(writer.offset).toBe(7)
        expect(writer.writeString('rld'))
        expect(writer.length).toBe(10)
        expect(writer.offset).toBe(10)
    })
})
