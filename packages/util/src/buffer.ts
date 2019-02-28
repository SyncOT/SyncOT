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
