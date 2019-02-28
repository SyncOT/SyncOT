import { toBuffer } from '.'

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
