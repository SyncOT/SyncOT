/**
 * A cache mapping the `toBuffer` params to the corresponding results.
 * It helps to avoid unnecessary `Buffer` object creation,
 * if `toBuffer` is called repeatedly with the same params.
 */
const buffers = new WeakMap<ArrayBuffer | ArrayBufferView, Buffer>()

/**
 * The binary types supported by `toBuffer`.
 */
export type BinaryType = Buffer | ArrayBuffer | ArrayBufferView

/**
 * Returns a `Buffer` sharing memory with the specified binary type.
 * It caches the params and the corresponding `Buffer`s in a `WeakMap` to
 * avoid unnecessary allocations.
 * @param binary A binary type.
 * @returns A `Buffer`.
 */
export function toBuffer(binary: BinaryType): Buffer
export function toBuffer(binary: any): Buffer | undefined
export function toBuffer(binary: any): Buffer | undefined {
    if (Buffer.isBuffer(binary)) {
        return binary
    }

    let buffer = buffers.get(binary)

    if (!buffer) {
        if (
            binary instanceof ArrayBuffer ||
            binary instanceof SharedArrayBuffer
        ) {
            buffer = Buffer.from(binary)
            buffers.set(binary, buffer)
        } else if (ArrayBuffer.isView(binary)) {
            buffer = Buffer.from(
                binary.buffer,
                binary.byteOffset,
                binary.byteLength,
            )
            buffers.set(binary, buffer)
        }
    }

    return buffer
}

/**
 * If given an ArrayBuffer or SharedArrayBuffer, returns it unchanged.
 * If given a Buffer, DataView or a Typed Array,
 * returns a new ArrayBuffer with data copied from the `binary` parameter.
 * Otherwise returns undefined.
 */
export function toArrayBuffer(binary: BinaryType): ArrayBuffer
export function toArrayBuffer(binary: any): ArrayBuffer | undefined
export function toArrayBuffer(binary: any): ArrayBuffer | undefined {
    if (binary instanceof ArrayBuffer || binary instanceof SharedArrayBuffer) {
        return binary
    } else if (ArrayBuffer.isView(binary) || Buffer.isBuffer(binary)) {
        return binary.buffer.slice(
            binary.byteOffset,
            binary.byteOffset + binary.byteLength,
        )
    } else {
        return undefined
    }
}

/**
 * Returns true, if the two provided values are binary and contain the same data,
 * otherwise returns false.
 */
export function binaryEqual(binary1: any, binary2: any): boolean {
    const buffer1 = toBuffer(binary1)

    if (!buffer1) {
        return false
    }

    const buffer2 = toBuffer(binary2)

    if (!buffer2) {
        return false
    }

    return buffer1.compare(buffer2) === 0
}

/**
 * Returns true, if value is binary, otherwise returns false.
 */
export function isBinary(value: any): value is BinaryType {
    return (
        Buffer.isBuffer(value) ||
        ArrayBuffer.isView(value) ||
        value instanceof ArrayBuffer ||
        value instanceof SharedArrayBuffer
    )
}
