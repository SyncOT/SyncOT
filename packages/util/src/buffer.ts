/**
 * The binary types supported by `toBuffer`.
 */
export type Binary = Buffer | ArrayBuffer | ArrayBufferView

/**
 * Returns a `Buffer` sharing memory with the specified binary type.
 * @param binary A binary type.
 * @returns A `Buffer` , if `binary` is a binary type, otherwise `undefined`.
 */
export function toBuffer(binary: Binary): Buffer
export function toBuffer(binary: any): Buffer | undefined
export function toBuffer(binary: any): Buffer | undefined {
    if (Buffer.isBuffer(binary)) {
        return binary
    }

    if (binary instanceof ArrayBuffer || binary instanceof SharedArrayBuffer) {
        return Buffer.from(binary)
    }

    if (ArrayBuffer.isView(binary)) {
        return Buffer.from(binary.buffer, binary.byteOffset, binary.byteLength)
    }

    return undefined
}

/**
 * If given an ArrayBuffer or SharedArrayBuffer, returns it unchanged.
 * If given a Buffer, DataView or a Typed Array,
 * returns a new ArrayBuffer with data copied from the `binary` parameter.
 * Otherwise returns undefined.
 */
export function toArrayBuffer(binary: Binary): ArrayBuffer
export function toArrayBuffer(binary: any): ArrayBuffer | undefined
export function toArrayBuffer(binary: any): ArrayBuffer | undefined {
    if (binary instanceof ArrayBuffer || binary instanceof SharedArrayBuffer) {
        return binary
    }

    if (ArrayBuffer.isView(binary) || Buffer.isBuffer(binary)) {
        return binary.buffer.slice(
            binary.byteOffset,
            binary.byteOffset + binary.byteLength,
        )
    }

    return undefined
}

/**
 * Returns true, if value is binary, otherwise returns false.
 */
export function isBinary(value: any): value is Binary {
    return (
        Buffer.isBuffer(value) ||
        ArrayBuffer.isView(value) ||
        value instanceof ArrayBuffer ||
        value instanceof SharedArrayBuffer
    )
}
