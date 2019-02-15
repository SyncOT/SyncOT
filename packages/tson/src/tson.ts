import { SmartBuffer } from 'smart-buffer'

/**
 * A list of types supported by TSON.
 * All numbers are in little-endian.
 * All strings are in utf8.
 * The type codes are encoded as 8 bit unsigned integers.
 * The type codes between 0 and 127 inclusive are reserved for TSON.
 * The type codes between 128 and 255 inclusive may be used to encode custom types.
 * Unknown data types are encoded as `NULL`.
 */
export const enum Type {
    /**
     * The type of the `null` value.
     * Encoding: `0x00`.
     */
    NULL,
    /**
     * A boolean whose value is `true`.
     * Encoding: `0x01`.
     */
    TRUE,
    /**
     * A boolean whose value is `false`.
     * Encoding: `0x02`.
     */
    FALSE,
    /**
     * A signed 8-bit integer.
     * Encoding: `0x03 <int>`.
     */
    INT8,
    /**
     * A signed 16-bit integer.
     * Encoding: `0x04 <int>*2`.
     */
    INT16,
    /**
     * A signed 32-bit integer.
     * Encoding: `0x05 <int>*4`.
     */
    INT32,
    /**
     * A signed 64-bit integer.
     * Encoding: `0x06 <int>*8`.
     */
    INT64,
    /**
     * A single precision 32-bit floating point number.
     * Encoding: `0x07 <float>*4`.
     */
    FLOAT32,
    /**
     * A double precision 64-bit floating point number.
     * Encoding: `0x08 <float>*8`.
     */
    FLOAT64,
    /**
     * Raw binary data with the size encoded as an 8-bit unsigned integer.
     * Encoding: `0x09 <length> <data>*length`.
     */
    BINARY8,
    /**
     * Raw binary data with the size encoded as a 16-bit unsigned integer.
     * Encoding: `0x0A <length> <data>*length`.
     */
    BINARY16,
    /**
     * Raw binary data with the size encoded as a 32-bit unsigned integer.
     * Encoding: `0x0B <length> <data>*length`.
     */
    BINARY32,
    /**
     * A string with the size encoded as an 8-bit unsigned integer.
     * Encoding: `0x0C <length> <char>*length`.
     */
    STRING8,
    /**
     * A string with the length encoded as a 16-bit unsigned integer.
     * Encoding: `0x0D <length>*2 <char>*length`.
     */
    STRING16,
    /**
     * A string with the length encoded as a 32-bit unsigned integer.
     * Encoding: `0x0E <length>*4 <char>*length`.
     */
    STRING32,
    /**
     * An array of arbitrary values with the length encoded as an 8-bit unsigned integer.
     * Encoding: `0x0F <length> <value-any>*length`.
     */
    ARRAY8,
    /**
     * An array of arbitrary values with the length encoded as a 16-bit unsigned integer.
     * Encoding: `0x10 <length>*2 <value-any>*length`.
     */
    ARRAY16,
    /**
     * An array of arbitrary values with the length encoded as a 32-bit unsigned integer.
     * Encoding: `0x11 <length>*4 <value-any>*length`.
     */
    ARRAY32,
    /**
     * An object with arbitrary properties whose count is encoded as an 8-bit unsigned integer.
     * Encoding: `0x12 <length> <property>*length`, where `<property>` is `<key-string> <value-any>`.
     */
    OBJECT8,
    /**
     * An object with arbitrary properties whose count is encoded as an 8-bit unsigned integer.
     * Encoding: `0x13 <length>*2 <property>*length`, where `<property>` is `<key-string> <value-any>`.
     */
    OBJECT16,
    /**
     * An object with arbitrary properties whose count is encoded as an 8-bit unsigned integer.
     * Encoding: `0x14 <length>*4 <property>*length`, where`<property>` is `<key-string> <value-any>`.
     */
    OBJECT32,
}

const buffers = new WeakMap<ArrayBuffer | ArrayBufferView, Buffer>()

type BinaryType = Buffer | ArrayBuffer | ArrayBufferView
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

const floatPrecisionTestingMemory = Buffer.allocUnsafeSlow(4)

/**
 * Returns true, if float32 provides enough precision to save a number.
 */
function canSaveWithSinglePrecision(item: number): boolean {
    if (!isFinite(item)) {
        return true
    }

    floatPrecisionTestingMemory.writeFloatLE(item, 0)
    return floatPrecisionTestingMemory.readFloatLE(0) === item
}

// Working memory which should be sufficient for encoding most objects.
const workingMemory = Buffer.allocUnsafeSlow(8192)

// Used to prevent uncontrolled recursion when encoding because it could
// easily corrupt the **shared** `workingMemory`.
let encoding = false

/**
 * Returns the encoded `data` as an `ArrayBuffer`.
 * @param data The data to encode.
 * @returns The encoded `data`.
 */
export function encode(data: any): ArrayBuffer {
    /* istanbul ignore if */
    if (encoding) {
        throw new Error(
            '@syncot/tson: `encode` must not be called recursively.',
        )
    }

    try {
        // `smartBuffer` and `workingMemory` share the same data, so that we can minimize
        // allocations, especially when encoding objects that fit in the `workingMemory`.
        // `smartBuffer` will still grow automatically when encoding larger objects.
        const smartBuffer = SmartBuffer.fromBuffer(workingMemory)
        smartBuffer.clear()

        // Encode the `data` into the `buffer`.
        encodeAny(smartBuffer, data)

        // Slice out a nodejs buffer from the smart buffer.
        // Both `buffer` and `smartBuffer` reference the same data.
        const buffer = smartBuffer.toBuffer()
        // Copy the encoded data into a new ArrayBuffer and return it.
        return buffer.buffer.slice(
            buffer.byteOffset,
            buffer.byteOffset + buffer.byteLength,
        )
    } finally {
        encoding = false
    }
}

function encodeAny(buffer: SmartBuffer, item: any): void {
    switch (typeof item) {
        case 'boolean':
            return encodeBoolean(buffer, item)
        case 'number':
            return encodeNumber(buffer, item)
        case 'string':
            return encodeString(buffer, item)
        case 'object':
            return encodeObject(buffer, item)
        default:
            return encodeObject(buffer, null)
    }
}

function encodeBoolean(buffer: SmartBuffer, item: boolean): void {
    buffer.writeUInt8(item ? Type.TRUE : Type.FALSE)
}

function encodeNumber(buffer: SmartBuffer, item: number): void {
    if (Number.isInteger(item)) {
        if (item <= 0x7f && item >= -0x80) {
            buffer.writeUInt8(Type.INT8)
            buffer.writeInt8(item)
        } else if (item <= 0x7fff && item >= -0x8000) {
            buffer.writeUInt8(Type.INT16)
            buffer.writeInt16LE(item)
        } else if (item <= 0x7fffffff && item >= -0x80000000) {
            buffer.writeUInt8(Type.INT32)
            buffer.writeInt32LE(item)
        } else {
            // Until JavaScript can handle 64-bit integers,
            // we'll save big numbers as float64.
            buffer.writeUInt8(Type.FLOAT64)
            buffer.writeDoubleLE(item)
        }
    } else if (canSaveWithSinglePrecision(item)) {
        buffer.writeUInt8(Type.FLOAT32)
        buffer.writeFloatLE(item)
    } else {
        buffer.writeUInt8(Type.FLOAT64)
        buffer.writeDoubleLE(item)
    }
}

function encodeString(buffer: SmartBuffer, item: string): void {
    const length = Buffer.byteLength(item)

    /* istanbul ignore if */
    if (length > 0xffffffff) {
        throw new Error('@syncot/tson: Max string utf8 size is 0xFFFFFFFF.')
    } else if (length <= 0xff) {
        buffer.writeUInt8(Type.STRING8)
        buffer.writeUInt8(length)
    } else if (length <= 0xffff) {
        buffer.writeUInt8(Type.STRING16)
        buffer.writeUInt16LE(length)
    } else {
        buffer.writeUInt8(Type.STRING32)
        buffer.writeUInt32LE(length)
    }
    buffer.writeString(item)
}

function encodeObject(buffer: SmartBuffer, item: object | null): void {
    if (item === null) {
        buffer.writeUInt8(Type.NULL)
        return
    }

    const itemBuffer = toBuffer(item)

    if (itemBuffer) {
        const length = itemBuffer.length
        /* istanbul ignore if */
        if (length > 0xffffffff) {
            throw new Error('@syncot/tson: Max binary data size is 0xFFFFFFFF.')
        } else if (length <= 0xff) {
            buffer.writeUInt8(Type.BINARY8)
            buffer.writeUInt8(length)
        } else if (length <= 0xffff) {
            buffer.writeUInt8(Type.BINARY16)
            buffer.writeUInt16LE(length)
        } else {
            buffer.writeUInt8(Type.BINARY32)
            buffer.writeUInt32LE(length)
        }
        buffer.writeBuffer(itemBuffer)
        return
    }

    if (Array.isArray(item)) {
        const length = item.length
        /* istanbul ignore if */
        if (length > 0xffffffff) {
            throw new Error('@syncot/tson: Max array length is 0xFFFFFFFF.')
        } else if (length <= 0xff) {
            buffer.writeUInt8(Type.ARRAY8)
            buffer.writeUInt8(length)
        } else if (length <= 0xffff) {
            buffer.writeUInt8(Type.ARRAY16)
            buffer.writeUInt16LE(length)
        } else {
            buffer.writeUInt8(Type.ARRAY32)
            buffer.writeUInt32LE(length)
        }
        for (let i = 0; i < length; ++i) {
            encodeAny(buffer, item[i])
        }
        return
    }

    return
}

/**
 * Decodes the `binaryData` and returns the result.
 * @param binaryData The binary data to decode.
 * @returns The decoded data.
 */
export function decode(
    binaryData: BinaryType,
): boolean | number | string | object | null {
    const buffer = toBuffer(binaryData)

    if (!buffer) {
        throw new Error('@syncot/tson: Expected binary data to decode.')
    }

    return decodeAny(SmartBuffer.fromBuffer(buffer))
}

function assertBytes(buffer: SmartBuffer, count: number, what: string): void {
    if (buffer.readOffset + count > buffer.length) {
        throw new Error(`@syncot/tson: A ${what} expected.`)
    }
}

function decodeAny(
    buffer: SmartBuffer,
): boolean | number | string | object | null {
    assertBytes(buffer, 1, 'type code')
    const type: Type = buffer.readUInt8()

    switch (type) {
        case Type.NULL:
            return null
        case Type.TRUE:
            return true
        case Type.FALSE:
            return false
        case Type.INT8:
            assertBytes(buffer, 1, 'INT8')
            return buffer.readInt8()
        case Type.INT16:
            assertBytes(buffer, 2, 'INT16')
            return buffer.readInt16LE()
        case Type.INT32:
            assertBytes(buffer, 4, 'INT32')
            return buffer.readInt32LE()
        case Type.INT64:
            throw new Error('@syncot/tson: Cannot decode a 64-bit integer.')
        case Type.FLOAT32:
            assertBytes(buffer, 4, 'FLOAT32')
            return buffer.readFloatLE()
        case Type.FLOAT64:
            assertBytes(buffer, 8, 'FLOAT64')
            return buffer.readDoubleLE()
        case Type.STRING8: {
            assertBytes(buffer, 1, 'UINT8 string length')
            const length = buffer.readUInt8()
            assertBytes(buffer, length, 'string')
            return buffer.readString(length)
        }
        case Type.STRING16: {
            assertBytes(buffer, 2, 'UINT16 string length')
            const length = buffer.readUInt16LE()
            assertBytes(buffer, length, 'string')
            return buffer.readString(length)
        }
        case Type.STRING32: {
            assertBytes(buffer, 4, 'UINT32 string length')
            const length = buffer.readUInt32LE()
            assertBytes(buffer, length, 'string')
            return buffer.readString(length)
        }
        case Type.BINARY8: {
            assertBytes(buffer, 1, 'BINARY8 data length')
            const length = buffer.readUInt8()
            assertBytes(buffer, length, 'binary data')
            const readBuffer = buffer.readBuffer(length)
            return readBuffer.buffer.slice(
                readBuffer.byteOffset,
                readBuffer.byteOffset + readBuffer.byteLength,
            )
        }
        case Type.BINARY16: {
            assertBytes(buffer, 2, 'BINARY16 data length')
            const length = buffer.readUInt16LE()
            assertBytes(buffer, length, 'binary data')
            const readBuffer = buffer.readBuffer(length)
            return readBuffer.buffer.slice(
                readBuffer.byteOffset,
                readBuffer.byteOffset + readBuffer.byteLength,
            )
        }
        case Type.BINARY32: {
            assertBytes(buffer, 4, 'BINARY32 data length')
            const length = buffer.readUInt32LE()
            assertBytes(buffer, length, 'binary data')
            const readBuffer = buffer.readBuffer(length)
            return readBuffer.buffer.slice(
                readBuffer.byteOffset,
                readBuffer.byteOffset + readBuffer.byteLength,
            )
        }
        default:
            throw new Error(
                `@syncot/tson: Unknown type 0x${type.toString(16)}.`,
            )
    }
}
