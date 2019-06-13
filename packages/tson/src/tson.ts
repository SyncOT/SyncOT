import { Binary, createTsonError, toBuffer } from '@syncot/util'
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
    /**
     * An Error with a name, message and details.
     * Encoding: `0x15 <string> <string> <plain-object-or-null>`.
     */
    ERROR,
}

const floatPrecisionTestingMemory = Buffer.allocUnsafe(4)

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

function detectCircularReference(path: Path, object: object): void {
    for (let i = 0, l = path.length; i < l; ++i) {
        if (path[i] === object) {
            throw createTsonError('Circular reference detected.')
        }
    }
}

// Working memory which should be sufficient for encoding most objects.
const workingMemory = Buffer.allocUnsafe(8192)

// Used to prevent uncontrolled recursion when encoding because it could
// easily corrupt the **shared** `workingMemory`.
let encoding = false

type Path = object[]

/**
 * Returns the encoded `data` as a `Buffer`.
 * @param data The data to encode.
 * @returns The encoded `data`.
 */
export function encode(data: any): Buffer {
    /* istanbul ignore if */
    if (encoding) {
        throw createTsonError('`encode` must not be called recursively.')
    }

    try {
        // `smartBuffer` and `workingMemory` share the same data, so that we can minimize
        // allocations, especially when encoding objects that fit in the `workingMemory`.
        // `smartBuffer` will still grow automatically when encoding larger objects.
        const smartBuffer = SmartBuffer.fromBuffer(workingMemory)
        smartBuffer.clear()

        // Used for detecting circular references.
        const path: Path = []

        // Encode the `data` into the `buffer`.
        encodeAny(smartBuffer, data, path)

        // Slice out a nodejs buffer from the smart buffer.
        // Both `buffer` and `smartBuffer` reference the same data.
        const buffer = smartBuffer.toBuffer()
        // Copy the encoded data into a new Buffer and return it.
        // It protects the `workingMemory` from corruption and helps to avoid unnecessary retention of
        // large amounts of memory in case a small encoded value is not GCed for a long time.
        return Buffer.from(buffer)
    } finally {
        encoding = false
    }
}

function encodeAny(buffer: SmartBuffer, item: any, path: Path): void {
    switch (typeof item) {
        case 'boolean':
            return encodeBoolean(buffer, item)
        case 'number':
            return encodeNumber(buffer, item)
        case 'string':
            return encodeString(buffer, item)
        case 'object':
            return encodeObject(buffer, item, path)
        default:
            return encodeObject(buffer, null, path)
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
        throw createTsonError('Max string utf8 size is 0xFFFFFFFF.')
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

function encodeObject(
    buffer: SmartBuffer,
    object: object | null,
    path: Path,
): void {
    const objectBuffer = toBuffer(object)
    if (objectBuffer) {
        encodeBuffer(buffer, objectBuffer)
    } else if (object === null) {
        encodeNull(buffer)
    } else if (Array.isArray(object)) {
        encodeArray(buffer, object, path)
    } else if (object instanceof Error) {
        encodeError(buffer, object, path)
    } else {
        encodePlainObject(buffer, object, path)
    }
}

function encodeNull(buffer: SmartBuffer): void {
    buffer.writeUInt8(Type.NULL)
}

function encodeBuffer(buffer: SmartBuffer, inputBuffer: Buffer): void {
    const length = inputBuffer.length
    /* istanbul ignore if */
    if (length > 0xffffffff) {
        throw createTsonError('Max binary data size is 0xFFFFFFFF.')
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
    buffer.writeBuffer(inputBuffer)
}

function encodeArray(buffer: SmartBuffer, array: any[], path: Path): void {
    detectCircularReference(path, array)
    path.push(array)

    const length = array.length
    /* istanbul ignore if */
    if (length > 0xffffffff) {
        throw createTsonError('Max array length is 0xFFFFFFFF.')
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
        encodeAny(buffer, array[i], path)
    }

    path.pop()
}

function encodeError(buffer: SmartBuffer, error: Error, path: Path): void {
    if (typeof (error as any).toJSON === 'function') {
        return encodeAny(buffer, (error as any).toJSON(''), path)
    }

    if (typeof error.name !== 'string') {
        throw createTsonError('Error name is not a string.')
    }
    if (typeof error.message !== 'string') {
        throw createTsonError('Error message is not a string.')
    }

    // `name` and `message` should not be enumerable but remove them in case
    // they appear in keys for any reason.
    const keys = Object.keys(error)
    const nameIndex = keys.indexOf('name')
    if (nameIndex >= 0) {
        keys.splice(nameIndex, 1)
    }
    const messageIndex = keys.indexOf('message')
    if (messageIndex >= 0) {
        keys.splice(messageIndex, 1)
    }

    buffer.writeUInt8(Type.ERROR)
    encodeString(buffer, error.name)
    encodeString(buffer, error.message)
    if (keys.length === 0) {
        encodeNull(buffer)
    } else {
        encodePlainObject(buffer, error, path, keys)
    }
}

function encodePlainObject(
    buffer: SmartBuffer,
    object: object,
    path: Path,
    keys: string[] = Object.keys(object),
): void {
    if (typeof (object as any).toJSON === 'function') {
        return encodeAny(buffer, (object as any).toJSON(''), path)
    }

    detectCircularReference(path, object)
    path.push(object)

    const length = keys.length
    /* istanbul ignore if */
    if (length > 0xffffffff) {
        throw createTsonError('Max number of object properties is 0xFFFFFFFF.')
    } else if (length <= 0xff) {
        buffer.writeUInt8(Type.OBJECT8)
        buffer.writeUInt8(length)
    } else if (length <= 0xffff) {
        buffer.writeUInt8(Type.OBJECT16)
        buffer.writeUInt16LE(length)
    } else {
        buffer.writeUInt8(Type.OBJECT32)
        buffer.writeUInt32LE(length)
    }
    for (let i = 0; i < length; ++i) {
        const key = keys[i]
        const value = (object as any)[key]
        encodeAny(buffer, key, path)
        encodeAny(buffer, value, path)
    }

    path.pop()
}

/**
 * Decodes the `binaryData` and returns the result.
 * @param binaryData The binary data to decode.
 * @returns The decoded data.
 */
export function decode(
    binaryData: Binary,
): boolean | number | string | object | null {
    const buffer = toBuffer(binaryData)

    if (!buffer) {
        throw createTsonError('Expected binary data to decode.')
    }

    return decodeAny(SmartBuffer.fromBuffer(buffer))
}

function assertBytes(buffer: SmartBuffer, count: number, what: string): void {
    if (buffer.readOffset + count > buffer.length) {
        throw createTsonError(`${what} expected.`)
    }
}

function decodeAny(
    buffer: SmartBuffer,
): boolean | number | string | object | null {
    assertBytes(buffer, 1, 'Type code')
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
            throw createTsonError('Cannot decode a 64-bit integer.')
        case Type.FLOAT32:
            assertBytes(buffer, 4, 'FLOAT32')
            return buffer.readFloatLE()
        case Type.FLOAT64:
            assertBytes(buffer, 8, 'FLOAT64')
            return buffer.readDoubleLE()
        case Type.STRING8: {
            assertBytes(buffer, 1, 'STRING8 length')
            const length = buffer.readUInt8()
            assertBytes(buffer, length, 'STRING8 data')
            return buffer.readString(length)
        }
        case Type.STRING16: {
            assertBytes(buffer, 2, 'STRING16 length')
            const length = buffer.readUInt16LE()
            assertBytes(buffer, length, 'STRING16 data')
            return buffer.readString(length)
        }
        case Type.STRING32: {
            assertBytes(buffer, 4, 'STRING32 length')
            const length = buffer.readUInt32LE()
            assertBytes(buffer, length, 'STRING32 data')
            return buffer.readString(length)
        }
        case Type.BINARY8: {
            assertBytes(buffer, 1, 'BINARY8 length')
            const length = buffer.readUInt8()
            assertBytes(buffer, length, 'BINARY8 data')
            return Buffer.from(buffer.readBuffer(length))
        }
        case Type.BINARY16: {
            assertBytes(buffer, 2, 'BINARY16 length')
            const length = buffer.readUInt16LE()
            assertBytes(buffer, length, 'BINARY16 data')
            return Buffer.from(buffer.readBuffer(length))
        }
        case Type.BINARY32: {
            assertBytes(buffer, 4, 'BINARY32 length')
            const length = buffer.readUInt32LE()
            assertBytes(buffer, length, 'BINARY32 data')
            return Buffer.from(buffer.readBuffer(length))
        }
        case Type.ARRAY8: {
            assertBytes(buffer, 1, 'ARRAY8 length')
            const length = buffer.readUInt8()
            const array = []
            for (let i = 0; i < length; ++i) {
                array[i] = decodeAny(buffer)
            }
            return array
        }
        case Type.ARRAY16: {
            assertBytes(buffer, 2, 'ARRAY16 length')
            const length = buffer.readUInt16LE()
            const array = []
            for (let i = 0; i < length; ++i) {
                array[i] = decodeAny(buffer)
            }
            return array
        }
        case Type.ARRAY32: {
            assertBytes(buffer, 4, 'ARRAY32 length')
            const length = buffer.readUInt32LE()
            const array = []
            for (let i = 0; i < length; ++i) {
                array[i] = decodeAny(buffer)
            }
            return array
        }
        case Type.OBJECT8: {
            assertBytes(buffer, 1, 'OBJECT8 size')
            const length = buffer.readUInt8()
            const object = {}
            for (let i = 0; i < length; ++i) {
                const key = decodeAny(buffer)
                if (typeof key !== 'string') {
                    throw createTsonError('Object key not a string.')
                }
                const value = decodeAny(buffer)
                ;(object as any)[key] = value
            }
            return object
        }
        case Type.OBJECT16: {
            assertBytes(buffer, 2, 'OBJECT16 size')
            const length = buffer.readUInt16LE()
            const object = {}
            for (let i = 0; i < length; ++i) {
                const key = decodeAny(buffer)
                if (typeof key !== 'string') {
                    throw createTsonError('Object key not a string.')
                }
                const value = decodeAny(buffer)
                ;(object as any)[key] = value
            }
            return object
        }
        case Type.OBJECT32: {
            assertBytes(buffer, 4, 'OBJECT32 size')
            const length = buffer.readUInt32LE()
            const object = {}
            for (let i = 0; i < length; ++i) {
                const key = decodeAny(buffer)
                if (typeof key !== 'string') {
                    throw createTsonError('Object key not a string.')
                }
                const value = decodeAny(buffer)
                ;(object as any)[key] = value
            }
            return object
        }
        case Type.ERROR: {
            const name = decodeAny(buffer)
            if (typeof name !== 'string') {
                throw createTsonError('Error name not a string.')
            }

            const message = decodeAny(buffer)
            if (typeof message !== 'string') {
                throw createTsonError('Error message not a string.')
            }

            // Read the type of the details without advancing the readOffset managed by the SmartBuffer.
            const detailsType = buffer.readUInt8(buffer.readOffset)
            if (
                detailsType !== Type.NULL &&
                detailsType !== Type.OBJECT8 &&
                detailsType !== Type.OBJECT16 &&
                detailsType !== Type.OBJECT32
            ) {
                throw createTsonError(
                    'Error details not a plain object nor null.',
                )
            }

            const details = decodeAny(buffer)
            /* istanbul ignore if */
            if (typeof details !== 'object') {
                throw createTsonError('This should never happen.')
            }
            if (details) {
                if (details.hasOwnProperty('name')) {
                    throw createTsonError(
                        '"name" property present in Error details.',
                    )
                }
                if (details.hasOwnProperty('message')) {
                    throw createTsonError(
                        '"message" property present in Error details.',
                    )
                }
            }

            const error = new Error(message)
            Object.defineProperty(error, 'name', {
                configurable: true,
                value: name,
                writable: true,
            })
            return Object.assign(error, details)
        }
        default:
            throw createTsonError(`Unknown type.`)
    }
}
