import {
    Binary,
    BufferReader,
    BufferWriter,
    createBufferReader,
    createBufferWriter,
    createTsonError,
    toBuffer,
} from '@syncot/util'

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

type Path = object[]

/**
 * Returns the encoded `data` as a `Buffer`.
 * @param data The data to encode.
 * @returns The encoded `data`.
 */
export function encode(data: any): Buffer {
    const writer = createBufferWriter()
    encodeAny(writer, data, [])
    return writer.toBuffer()
}

function encodeAny(writer: BufferWriter, item: any, path: Path): void {
    switch (typeof item) {
        case 'boolean':
            return encodeBoolean(writer, item)
        case 'number':
            return encodeNumber(writer, item)
        case 'string':
            return encodeString(writer, item)
        case 'object':
            return encodeObject(writer, item, path)
        default:
            return encodeObject(writer, null, path)
    }
}

function encodeBoolean(writer: BufferWriter, item: boolean): void {
    writer.writeUInt8(item ? Type.TRUE : Type.FALSE)
}

function encodeNumber(writer: BufferWriter, item: number): void {
    // tslint:disable-next-line:no-bitwise
    if (item === (item | 0)) {
        if (item <= 0x7f && item >= -0x80) {
            writer.writeUInt8(Type.INT8)
            writer.writeInt8(item)
        } else if (item <= 0x7fff && item >= -0x8000) {
            writer.writeUInt8(Type.INT16)
            writer.writeInt16LE(item)
        } else {
            writer.writeUInt8(Type.INT32)
            writer.writeInt32LE(item)
        }
    } else if (canSaveWithSinglePrecision(item)) {
        writer.writeUInt8(Type.FLOAT32)
        writer.writeFloatLE(item)
    } else {
        writer.writeUInt8(Type.FLOAT64)
        writer.writeDoubleLE(item)
    }
}

function encodeString(writer: BufferWriter, item: string): void {
    const length = Buffer.byteLength(item)

    /* istanbul ignore if */
    if (length > 0xffffffff) {
        throw createTsonError('Max string utf8 size is 0xFFFFFFFF.')
    } else if (length <= 0xff) {
        writer.writeUInt8(Type.STRING8)
        writer.writeUInt8(length)
    } else if (length <= 0xffff) {
        writer.writeUInt8(Type.STRING16)
        writer.writeUInt16LE(length)
    } else {
        writer.writeUInt8(Type.STRING32)
        writer.writeUInt32LE(length)
    }
    writer.writeString(item, 'utf8')
}

function encodeObject(
    writer: BufferWriter,
    object: object | null,
    path: Path,
): void {
    const objectBuffer = toBuffer(object)
    if (objectBuffer) {
        encodeBuffer(writer, objectBuffer)
    } else if (object === null) {
        encodeNull(writer)
    } else if (Array.isArray(object)) {
        encodeArray(writer, object, path)
    } else if (object instanceof Error) {
        encodeError(writer, object, path)
    } else {
        encodePlainObject(writer, object, path)
    }
}

function encodeNull(writer: BufferWriter): void {
    writer.writeUInt8(Type.NULL)
}

function encodeBuffer(writer: BufferWriter, inputBuffer: Buffer): void {
    const length = inputBuffer.length
    /* istanbul ignore if */
    if (length > 0xffffffff) {
        throw createTsonError('Max binary data size is 0xFFFFFFFF.')
    } else if (length <= 0xff) {
        writer.writeUInt8(Type.BINARY8)
        writer.writeUInt8(length)
    } else if (length <= 0xffff) {
        writer.writeUInt8(Type.BINARY16)
        writer.writeUInt16LE(length)
    } else {
        writer.writeUInt8(Type.BINARY32)
        writer.writeUInt32LE(length)
    }
    writer.writeBuffer(inputBuffer)
}

function encodeArray(writer: BufferWriter, array: any[], path: Path): void {
    detectCircularReference(path, array)
    path.push(array)

    const length = array.length
    /* istanbul ignore if */
    if (length > 0xffffffff) {
        throw createTsonError('Max array length is 0xFFFFFFFF.')
    } else if (length <= 0xff) {
        writer.writeUInt8(Type.ARRAY8)
        writer.writeUInt8(length)
    } else if (length <= 0xffff) {
        writer.writeUInt8(Type.ARRAY16)
        writer.writeUInt16LE(length)
    } else {
        writer.writeUInt8(Type.ARRAY32)
        writer.writeUInt32LE(length)
    }
    for (let i = 0; i < length; ++i) {
        encodeAny(writer, array[i], path)
    }

    path.pop()
}

function encodeError(writer: BufferWriter, error: Error, path: Path): void {
    if (typeof (error as any).toJSON === 'function') {
        return encodeAny(writer, (error as any).toJSON(''), path)
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

    writer.writeUInt8(Type.ERROR)
    encodeString(writer, error.name)
    encodeString(writer, error.message)
    if (keys.length === 0) {
        encodeNull(writer)
    } else {
        encodePlainObject(writer, error, path, keys)
    }
}

function encodePlainObject(
    writer: BufferWriter,
    object: object,
    path: Path,
    keys: string[] = Object.keys(object),
): void {
    if (typeof (object as any).toJSON === 'function') {
        return encodeAny(writer, (object as any).toJSON(''), path)
    }

    detectCircularReference(path, object)
    path.push(object)

    const length = keys.length
    /* istanbul ignore if */
    if (length > 0xffffffff) {
        throw createTsonError('Max number of object properties is 0xFFFFFFFF.')
    } else if (length <= 0xff) {
        writer.writeUInt8(Type.OBJECT8)
        writer.writeUInt8(length)
    } else if (length <= 0xffff) {
        writer.writeUInt8(Type.OBJECT16)
        writer.writeUInt16LE(length)
    } else {
        writer.writeUInt8(Type.OBJECT32)
        writer.writeUInt32LE(length)
    }
    for (let i = 0; i < length; ++i) {
        const key = keys[i]
        const value = (object as any)[key]
        encodeAny(writer, key, path)
        encodeAny(writer, value, path)
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

    return decodeAny(createBufferReader(buffer))
}

function decodeAny(
    reader: BufferReader,
): boolean | number | string | object | null {
    const type: Type = reader.readUInt8()

    switch (type) {
        case Type.NULL:
            return null
        case Type.TRUE:
            return true
        case Type.FALSE:
            return false
        case Type.INT8:
            return reader.readInt8()
        case Type.INT16:
            return reader.readInt16LE()
        case Type.INT32:
            return reader.readInt32LE()
        case Type.INT64:
            throw createTsonError('Cannot decode a 64-bit integer.')
        case Type.FLOAT32:
            return reader.readFloatLE()
        case Type.FLOAT64:
            return reader.readDoubleLE()
        case Type.STRING8: {
            const length = reader.readUInt8()
            return reader.readString(length, 'utf8')
        }
        case Type.STRING16: {
            const length = reader.readUInt16LE()
            return reader.readString(length, 'utf8')
        }
        case Type.STRING32: {
            const length = reader.readUInt32LE()
            return reader.readString(length, 'utf8')
        }
        case Type.BINARY8: {
            const length = reader.readUInt8()
            return Buffer.from(reader.readBuffer(length))
        }
        case Type.BINARY16: {
            const length = reader.readUInt16LE()
            return Buffer.from(reader.readBuffer(length))
        }
        case Type.BINARY32: {
            const length = reader.readUInt32LE()
            return Buffer.from(reader.readBuffer(length))
        }
        case Type.ARRAY8: {
            const length = reader.readUInt8()
            const array = new Array(length)
            for (let i = 0; i < length; ++i) {
                array[i] = decodeAny(reader)
            }
            return array
        }
        case Type.ARRAY16: {
            const length = reader.readUInt16LE()
            const array = new Array(length)
            for (let i = 0; i < length; ++i) {
                array[i] = decodeAny(reader)
            }
            return array
        }
        case Type.ARRAY32: {
            const length = reader.readUInt32LE()
            const array = new Array(length)
            for (let i = 0; i < length; ++i) {
                array[i] = decodeAny(reader)
            }
            return array
        }
        case Type.OBJECT8: {
            const length = reader.readUInt8()
            const object = {}
            for (let i = 0; i < length; ++i) {
                const key = decodeAny(reader)
                if (typeof key !== 'string') {
                    throw createTsonError('Object key not a string.')
                }
                const value = decodeAny(reader)
                ;(object as any)[key] = value
            }
            return object
        }
        case Type.OBJECT16: {
            const length = reader.readUInt16LE()
            const object = {}
            for (let i = 0; i < length; ++i) {
                const key = decodeAny(reader)
                if (typeof key !== 'string') {
                    throw createTsonError('Object key not a string.')
                }
                const value = decodeAny(reader)
                ;(object as any)[key] = value
            }
            return object
        }
        case Type.OBJECT32: {
            const length = reader.readUInt32LE()
            const object = {}
            for (let i = 0; i < length; ++i) {
                const key = decodeAny(reader)
                if (typeof key !== 'string') {
                    throw createTsonError('Object key not a string.')
                }
                const value = decodeAny(reader)
                ;(object as any)[key] = value
            }
            return object
        }
        case Type.ERROR: {
            const name = decodeAny(reader)
            if (typeof name !== 'string') {
                throw createTsonError('Error name not a string.')
            }

            const message = decodeAny(reader)
            if (typeof message !== 'string') {
                throw createTsonError('Error message not a string.')
            }

            const details = decodeAny(reader)
            if (typeof details !== 'object') {
                throw createTsonError('Error details not an object.')
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
