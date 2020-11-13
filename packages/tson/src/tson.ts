// tslint:disable:no-bitwise
import {
    Binary,
    isArrayBuffer,
    isSharedArrayBuffer,
    toBuffer,
} from '@syncot/buffer'
import { createTsonError } from './error'

/**
 * A list of types supported by TSON.
 * All numbers are in little-endian.
 * All strings are in utf8.
 * The type codes are encoded as 8 bit unsigned integers.
 * The type codes between 0 and 127 inclusive are reserved for TSON.
 * The type codes between 128 and 255 inclusive may be used to encode custom types.
 * Unknown data types are encoded as `NULL`.
 */
export enum Type {
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

/**
 * Returns the encoded `data` as a `Buffer`.
 * @param data The data to encode.
 * @returns The encoded `data`.
 */
export function encode(data: any): Buffer {
    return Encoder.encoder.encode(data)
}

/**
 * Decodes the `binaryData` and returns the result.
 * @param binaryData The binary data to decode.
 * @returns The decoded data.
 */
export function decode(binaryData: Binary): Value {
    return Decoder.decoder.decode(binaryData)
}

type Path = object[]
type Value = boolean | number | string | object | null
const hasOwnProperty = Object.prototype.hasOwnProperty
const propertyIsEnumerable = Object.prototype.propertyIsEnumerable
const floatArrayBuffer = new ArrayBuffer(8)
const floatDataView = new DataView(floatArrayBuffer)
const floatUInt8Array = new Uint8Array(floatArrayBuffer)
const emptyUInt8Array = new Uint8Array(0)
const emptyPath: Path = []

class Encoder {
    public static encoder: Encoder = new Encoder()
    private path: Path = []
    private buffer: Uint8Array = emptyUInt8Array
    private offset: number = 0

    public encode(value: any): Buffer {
        this.path = []
        this.buffer = new Uint8Array(1024)
        this.offset = 0
        this.encodeAny(value)
        const buffer = Buffer.from(
            this.buffer.buffer,
            this.buffer.byteOffset,
            this.offset,
        )
        this.path = emptyPath
        this.buffer = emptyUInt8Array
        this.offset = 0
        return buffer
    }

    private encodeAny(value: any): void {
        switch (typeof value) {
            case 'boolean':
                return this.encodeBoolean(value)
            case 'number':
                return this.encodeNumber(value)
            case 'string':
                return this.encodeString(value)
            case 'object':
                return this.encodeObject(value)
            default:
                return this.encodeObject(null)
        }
    }

    private encodeObject(object: object | null): void {
        const objectBuffer = toBuffer(object)
        if (objectBuffer) {
            this.encodeBuffer(objectBuffer)
        } else if (object === null) {
            this.encodeNull()
        } else if (Array.isArray(object)) {
            this.encodeArray(object)
        } else if (object instanceof Error) {
            this.encodeError(object)
        } else {
            this.encodePlainObject(object)
        }
    }

    private encodeNull(): void {
        this.ensure(1)
        this.buffer[this.offset++] = Type.NULL
    }

    private encodeBoolean(value: boolean): void {
        this.ensure(1)
        this.buffer[this.offset++] = value ? Type.TRUE : Type.FALSE
    }

    private encodeNumber(value: number): void {
        if (value === (value | 0)) {
            if (value <= 0x7f && value >= -0x80) {
                this.ensure(2)
                this.buffer[this.offset++] = Type.INT8
                this.buffer[this.offset++] = value
            } else if (value <= 0x7fff && value >= -0x8000) {
                this.ensure(3)
                this.buffer[this.offset++] = Type.INT16
                this.buffer[this.offset++] = value
                this.buffer[this.offset++] = value >>> 8
            } else {
                this.ensure(5)
                this.buffer[this.offset++] = Type.INT32
                this.buffer[this.offset++] = value
                this.buffer[this.offset++] = value >>> 8
                this.buffer[this.offset++] = value >>> 16
                this.buffer[this.offset++] = value >>> 24
            }
        } else {
            floatDataView.setFloat32(0, value, true)
            const storedValue = floatDataView.getFloat32(0, true)
            if (storedValue === value || isNaN(value)) {
                this.ensure(5)
                this.buffer[this.offset++] = Type.FLOAT32
                this.buffer[this.offset++] = floatUInt8Array[0]
                this.buffer[this.offset++] = floatUInt8Array[1]
                this.buffer[this.offset++] = floatUInt8Array[2]
                this.buffer[this.offset++] = floatUInt8Array[3]
            } else {
                floatDataView.setFloat64(0, value, true)
                this.ensure(9)
                this.buffer[this.offset++] = Type.FLOAT64
                this.buffer[this.offset++] = floatUInt8Array[0]
                this.buffer[this.offset++] = floatUInt8Array[1]
                this.buffer[this.offset++] = floatUInt8Array[2]
                this.buffer[this.offset++] = floatUInt8Array[3]
                this.buffer[this.offset++] = floatUInt8Array[4]
                this.buffer[this.offset++] = floatUInt8Array[5]
                this.buffer[this.offset++] = floatUInt8Array[6]
                this.buffer[this.offset++] = floatUInt8Array[7]
            }
        }
    }

    private encodeString(value: string): void {
        const valueLength = value.length

        // Allocate enough space for the worst case.
        const typeSize = 1
        const maxLengthSize = 4
        const maxLength = valueLength * 3
        this.ensure(typeSize + maxLengthSize + maxLength)

        // Try to write the data in the correct place and shift it later, if needed.
        const estimatedLengthSize =
            valueLength <= 0xff ? 1 : valueLength <= 0xffff ? 2 : 4
        const typeOffset = this.offset
        const lengthOffset = typeOffset + typeSize
        const estimatedDataOffset = lengthOffset + estimatedLengthSize
        this.offset = estimatedDataOffset

        // See http://unicode.org/faq/utf_bom.html#utf8-4
        for (let i = 0; i < valueLength; ++i) {
            const charcode = value.charCodeAt(i)
            if (charcode < 0x80) {
                this.buffer[this.offset++] = charcode
            } else if (charcode < 0x800) {
                this.buffer[this.offset++] = 0xc0 | (charcode >> 6)
                this.buffer[this.offset++] = 0x80 | (charcode & 0x3f)
            } else if (charcode < 0xd800 || charcode >= 0xe000) {
                this.buffer[this.offset++] = 0xe0 | (charcode >> 12)
                this.buffer[this.offset++] = 0x80 | ((charcode >> 6) & 0x3f)
                this.buffer[this.offset++] = 0x80 | (charcode & 0x3f)
            } else {
                if (charcode >= 0xd800 && charcode < 0xdc00) {
                    // `charcode` is a high surrogate.
                    if (i + 1 < valueLength) {
                        const charcode2 = value.charCodeAt(i + 1)
                        if (charcode2 >= 0xdc00 && charcode2 < 0xe000) {
                            // `charcode2` is a low surrogate.
                            i++
                            const surrogateOffset =
                                0x10000 - (0xd800 << 10) - 0xdc00
                            const codepoint =
                                (charcode << 10) + charcode2 + surrogateOffset
                            this.buffer[this.offset++] =
                                0xf0 | (codepoint >> 18)
                            this.buffer[this.offset++] =
                                0x80 | ((codepoint >> 12) & 0x3f)
                            this.buffer[this.offset++] =
                                0x80 | ((codepoint >> 6) & 0x3f)
                            this.buffer[this.offset++] =
                                0x80 | (codepoint & 0x3f)
                        } else {
                            // `charcode` is an unmatched high surrogate.
                            this.buffer[this.offset++] = 0xef
                            this.buffer[this.offset++] = 0xbf
                            this.buffer[this.offset++] = 0xbd
                        }
                    } else {
                        // `charcode` is an unmatched high surrogate.
                        this.buffer[this.offset++] = 0xef
                        this.buffer[this.offset++] = 0xbf
                        this.buffer[this.offset++] = 0xbd
                    }
                } else {
                    // `charcode` is an unmatched low surrogate.
                    this.buffer[this.offset++] = 0xef
                    this.buffer[this.offset++] = 0xbf
                    this.buffer[this.offset++] = 0xbd
                }
            }
        }

        const length = this.offset - estimatedDataOffset

        /* istanbul ignore if */
        if (length > 0xffffffff) {
            throw createTsonError('Max string utf8 size is 0xFFFFFFFF.')
        }

        const lengthSize = length <= 0xff ? 1 : length <= 0xffff ? 2 : 4
        const dataOffset = lengthOffset + lengthSize

        // Shift the data, if needed, to make space for encoding the length.
        if (dataOffset !== estimatedDataOffset) {
            this.buffer.set(
                new Uint8Array(this.buffer.buffer, estimatedDataOffset, length),
                dataOffset,
            )
            this.offset += dataOffset - estimatedDataOffset
        }

        if (lengthSize === 1) {
            this.buffer[typeOffset] = Type.STRING8
            this.buffer[lengthOffset] = length
        } else if (lengthSize === 2) {
            this.buffer[typeOffset] = Type.STRING16
            this.buffer[lengthOffset] = length
            this.buffer[lengthOffset + 1] = length >>> 8
        } else {
            this.buffer[typeOffset] = Type.STRING32
            this.buffer[lengthOffset] = length
            this.buffer[lengthOffset + 1] = length >>> 8
            this.buffer[lengthOffset + 2] = length >>> 16
            this.buffer[lengthOffset + 3] = length >>> 24
        }
    }

    private encodeBuffer(value: Buffer): void {
        const length = value.length

        /* istanbul ignore if */
        if (length > 0xffffffff) {
            throw createTsonError('Max binary data size is 0xFFFFFFFF.')
        }

        const typeSize = 1
        const lengthSize = length <= 0xff ? 1 : length <= 0xffff ? 2 : 4
        this.ensure(typeSize + lengthSize + length)

        if (length <= 0xff) {
            this.buffer[this.offset++] = Type.BINARY8
            this.buffer[this.offset++] = length
        } else if (length <= 0xffff) {
            this.buffer[this.offset++] = Type.BINARY16
            this.buffer[this.offset++] = length
            this.buffer[this.offset++] = length >>> 8
        } else {
            this.buffer[this.offset++] = Type.BINARY32
            this.buffer[this.offset++] = length
            this.buffer[this.offset++] = length >>> 8
            this.buffer[this.offset++] = length >>> 16
            this.buffer[this.offset++] = length >>> 24
        }
        this.buffer.set(value, this.offset)
        this.offset += length
    }

    private encodeArray(array: any[]): void {
        this.detectCircularReference(array)
        this.path.push(array)

        const length = array.length

        /* istanbul ignore if */
        if (length > 0xffffffff) {
            throw createTsonError('Max array length is 0xFFFFFFFF.')
        }

        const typeSize = 1
        const lengthSize = length <= 0xff ? 1 : length <= 0xffff ? 2 : 4
        this.ensure(typeSize + lengthSize + length)

        if (length <= 0xff) {
            this.buffer[this.offset++] = Type.ARRAY8
            this.buffer[this.offset++] = length
        } else if (length <= 0xffff) {
            this.buffer[this.offset++] = Type.ARRAY16
            this.buffer[this.offset++] = length
            this.buffer[this.offset++] = length >>> 8
        } else {
            this.buffer[this.offset++] = Type.ARRAY32
            this.buffer[this.offset++] = length
            this.buffer[this.offset++] = length >>> 8
            this.buffer[this.offset++] = length >>> 16
            this.buffer[this.offset++] = length >>> 24
        }
        for (let i = 0; i < length; ++i) {
            this.encodeAny(array[i])
        }

        this.path.pop()
    }

    private encodePlainObject(object: object): void {
        if (typeof (object as any).toJSON === 'function') {
            return this.encodeAny((object as any).toJSON(''))
        }

        this.detectCircularReference(object)
        this.path.push(object)

        const typeSize = 1
        const estimatedLengthSize = 1
        this.ensure(typeSize + estimatedLengthSize)

        const typeOffset = this.offset
        const lengthOffset = typeOffset + typeSize
        const estimatedDataOffset = lengthOffset + estimatedLengthSize
        this.offset = estimatedDataOffset

        let length = 0
        for (const key in object) {
            if (hasOwnProperty.call(object, key)) {
                length++
                this.encodeString(key)
                this.encodeAny((object as any)[key])
            }
        }

        /* istanbul ignore if */
        if (length > 0xffffffff) {
            throw createTsonError(
                'Max number of object properties is 0xFFFFFFFF.',
            )
        }

        const lengthSize = length <= 0xff ? 1 : length <= 0xffff ? 2 : 4
        const dataOffset = lengthOffset + lengthSize

        // Shift the data, if needed, to make space for encoding the length.
        if (dataOffset !== estimatedDataOffset) {
            this.buffer.set(
                new Uint8Array(
                    this.buffer.buffer,
                    estimatedDataOffset,
                    this.offset - estimatedDataOffset,
                ),
                dataOffset,
            )
            this.offset += dataOffset - estimatedDataOffset
        }

        if (length <= 0xff) {
            this.buffer[typeOffset] = Type.OBJECT8
            this.buffer[lengthOffset] = length
        } else if (length <= 0xffff) {
            this.buffer[typeOffset] = Type.OBJECT16
            this.buffer[lengthOffset] = length
            this.buffer[lengthOffset + 1] = length >>> 8
        } else {
            this.buffer[typeOffset] = Type.OBJECT32
            this.buffer[lengthOffset] = length
            this.buffer[lengthOffset + 1] = length >>> 8
            this.buffer[lengthOffset + 2] = length >>> 16
            this.buffer[lengthOffset + 3] = length >>> 24
        }

        this.path.pop()
    }

    private encodeError(error: Error): void {
        if (typeof (error as any).toJSON === 'function') {
            return this.encodeAny((error as any).toJSON(''))
        }

        if (typeof error.name !== 'string') {
            throw createTsonError('Error name is not a string.')
        }
        if (typeof error.message !== 'string') {
            throw createTsonError('Error message is not a string.')
        }

        this.ensure(1)
        this.buffer[this.offset++] = Type.ERROR
        this.encodeString(error.name)
        this.encodeString(error.message)

        let hasDetails = false
        for (const key in error) {
            if (
                hasOwnProperty.call(error, key) &&
                key !== 'name' &&
                key !== 'message'
            ) {
                hasDetails = true
                break
            }
        }

        if (hasDetails) {
            if (
                propertyIsEnumerable.call(error, 'name') ||
                propertyIsEnumerable.call(error, 'message')
            ) {
                // Copying the object is not great for performance, however,
                // it should be very rare in practice and even if it happens,
                // the number of properties would be small, so it likely is not worth optimizing.
                const details = {}
                for (const key in error) {
                    if (
                        hasOwnProperty.call(error, key) &&
                        key !== 'name' &&
                        key !== 'message'
                    ) {
                        ;(details as any)[key] = (error as any)[key]
                    }
                }
                this.encodePlainObject(details)
            } else {
                this.encodePlainObject(error)
            }
        } else {
            this.encodeNull()
        }
    }

    private ensure(size: number): void {
        const minLength = this.offset + size
        const oldLength = this.buffer.length

        if (minLength > oldLength) {
            let newLength = Math.floor((oldLength * 3) / 2 + 1)
            if (newLength < minLength) {
                newLength = minLength
            }
            const oldBuffer = new Uint8Array(this.buffer.buffer, 0, this.offset)
            this.buffer = new Uint8Array(newLength)
            this.buffer.set(oldBuffer)
        }
    }

    private detectCircularReference(object: object): void {
        const path = this.path
        for (let i = 0, l = path.length; i < l; ++i) {
            if (path[i] === object) {
                throw createTsonError('Circular reference detected.')
            }
        }
    }
}

class Decoder {
    public static readonly decoder: Decoder = new Decoder()
    private buffer: Uint8Array = emptyUInt8Array
    private offset: number = 0

    public decode(binaryData: Binary): Value {
        if (ArrayBuffer.isView(binaryData)) {
            this.buffer = new Uint8Array(
                binaryData.buffer,
                binaryData.byteOffset,
                binaryData.byteLength,
            )
        } else if (
            isArrayBuffer(binaryData) ||
            isSharedArrayBuffer(binaryData)
        ) {
            this.buffer = new Uint8Array(binaryData)
        } else {
            throw createTsonError('Expected binary data to decode.')
        }
        this.offset = 0
        const value = this.decodeAny()
        this.buffer = emptyUInt8Array
        this.offset = 0
        return value
    }

    private decodeAny(): Value {
        switch (this.decodeUint8()) {
            case Type.NULL:
                return null
            case Type.TRUE:
                return true
            case Type.FALSE:
                return false
            case Type.INT8:
                return this.decodeInt8()
            case Type.INT16:
                return this.decodeInt16()
            case Type.INT32:
                return this.decodeInt32()
            case Type.INT64:
                throw createTsonError('Cannot decode a 64-bit integer.')
            case Type.FLOAT32:
                return this.decodeFloat32()
            case Type.FLOAT64:
                return this.decodeFloat64()
            case Type.BINARY8:
                return this.decodeBuffer(this.decodeUint8())
            case Type.BINARY16:
                return this.decodeBuffer(this.decodeUint16())
            case Type.BINARY32:
                return this.decodeBuffer(this.decodeUint32())
            case Type.STRING8:
                return this.decodeString(this.decodeUint8())
            case Type.STRING16:
                return this.decodeString(this.decodeUint16())
            case Type.STRING32:
                return this.decodeString(this.decodeUint32())
            case Type.ARRAY8:
                return this.decodeArray(this.decodeUint8())
            case Type.ARRAY16:
                return this.decodeArray(this.decodeUint16())
            case Type.ARRAY32:
                return this.decodeArray(this.decodeUint32())
            case Type.OBJECT8:
                return this.decodeObject(this.decodeUint8())
            case Type.OBJECT16:
                return this.decodeObject(this.decodeUint16())
            case Type.OBJECT32:
                return this.decodeObject(this.decodeUint32())
            case Type.ERROR:
                return this.decodeError()
            default:
                throw createTsonError(`Unknown type.`)
        }
    }

    private decodeFloat32(): number {
        this.ensure(4)
        floatUInt8Array[0] = this.buffer[this.offset++]
        floatUInt8Array[1] = this.buffer[this.offset++]
        floatUInt8Array[2] = this.buffer[this.offset++]
        floatUInt8Array[3] = this.buffer[this.offset++]
        return floatDataView.getFloat32(0, true)
    }

    private decodeFloat64(): number {
        this.ensure(8)
        floatUInt8Array[0] = this.buffer[this.offset++]
        floatUInt8Array[1] = this.buffer[this.offset++]
        floatUInt8Array[2] = this.buffer[this.offset++]
        floatUInt8Array[3] = this.buffer[this.offset++]
        floatUInt8Array[4] = this.buffer[this.offset++]
        floatUInt8Array[5] = this.buffer[this.offset++]
        floatUInt8Array[6] = this.buffer[this.offset++]
        floatUInt8Array[7] = this.buffer[this.offset++]
        return floatDataView.getFloat64(0, true)
    }

    private decodeInt8(): number {
        this.ensure(1)
        return (this.buffer[this.offset++] << 24) >> 24
    }

    private decodeInt16(): number {
        this.ensure(2)
        return (
            this.buffer[this.offset++] +
            ((this.buffer[this.offset++] << 24) >> 16)
        )
    }

    private decodeInt32(): number {
        this.ensure(4)
        return (
            this.buffer[this.offset++] +
            (this.buffer[this.offset++] << 8) +
            (this.buffer[this.offset++] << 16) +
            (this.buffer[this.offset++] << 24)
        )
    }

    private decodeUint8(): number {
        this.ensure(1)
        return this.buffer[this.offset++]
    }

    private decodeUint16(): number {
        this.ensure(2)
        return this.buffer[this.offset++] + (this.buffer[this.offset++] << 8)
    }

    private decodeUint32(): number {
        this.ensure(4)
        return (
            this.buffer[this.offset++] +
            (this.buffer[this.offset++] << 8) +
            (this.buffer[this.offset++] << 16) +
            ((this.buffer[this.offset++] << 24) >>> 0)
        )
    }

    private decodeString(length: number): string {
        this.ensure(length)
        let string = ''
        const endOffset = this.offset + length

        while (this.offset < endOffset) {
            const byte = this.buffer[this.offset++]

            if (byte <= 0x7f) {
                string += String.fromCharCode(byte)
            } else if (byte <= 0xbf) {
                // A dangling continuation byte.
                string += '\ufffd'
            } else if (byte <= 0xdf) {
                const byte2 = this.buffer[this.offset]
                const byte2Valid = (byte2 & 0xc0) === 0x80
                if (byte2Valid) {
                    const codepoint = ((byte & 0x1f) << 6) | (byte2 & 0x3f)
                    if (codepoint >= 0x80) {
                        string += String.fromCharCode(codepoint)
                        this.offset += 1
                    } else {
                        // Codepoint out of range.
                        string += '\ufffd'
                    }
                } else {
                    // Invalid continuation byte.
                    string += '\ufffd'
                }
            } else if (byte <= 0xef) {
                const byte2 = this.buffer[this.offset]
                const byte3 = this.buffer[this.offset + 1]
                const byte2Valid = (byte2 & 0xc0) === 0x80
                const byte3Valid = (byte3 & 0xc0) === 0x80
                if (byte2Valid && byte3Valid) {
                    const codepoint =
                        ((byte & 0x0f) << 12) |
                        ((byte2 & 0x3f) << 6) |
                        (byte3 & 0x3f)
                    if (
                        (codepoint >= 0x0800 && codepoint <= 0xd7ff) ||
                        codepoint >= 0xe000
                    ) {
                        string += String.fromCharCode(codepoint)
                        this.offset += 2
                    } else {
                        // Codepoint out of range.
                        string += '\ufffd'
                    }
                } else {
                    // Invalid continuation byte.
                    string += '\ufffd'

                    // Necessary for compatibility with the native algorithm.
                    if (byte2Valid) {
                        this.offset += 1
                    }
                }
            } else if (byte <= 0xf7) {
                const byte2 = this.buffer[this.offset]
                const byte3 = this.buffer[this.offset + 1]
                const byte4 = this.buffer[this.offset + 2]
                const byte2Valid = (byte2 & 0xc0) === 0x80
                const byte3Valid = (byte3 & 0xc0) === 0x80
                const byte4Valid = (byte4 & 0xc0) === 0x80
                if (byte2Valid && byte3Valid && byte4Valid) {
                    const codepoint =
                        ((byte & 0x07) << 18) |
                        ((byte2 & 0x3f) << 12) |
                        ((byte3 & 0x3f) << 6) |
                        (byte4 & 0x3f)
                    if (codepoint >= 0x10000 && codepoint <= 0x10ffff) {
                        string += String.fromCharCode(
                            ((codepoint - 0x10000) >> 10) | 0xd800,
                            ((codepoint - 0x10000) & 0x03ff) | 0xdc00,
                        )
                        this.offset += 3
                    } else {
                        // Codepoint out of range.
                        string += '\ufffd'
                    }
                } else {
                    // Invalid continuation byte.
                    string += '\ufffd'

                    // Necessary for compatibility with the native algorithm.
                    if (byte2Valid) {
                        this.offset += 1
                        if (byte3Valid) {
                            this.offset += 1
                        }
                    }
                }
            } else {
                // Invalid byte.
                string += '\ufffd'
            }
        }

        return string
    }

    private decodeBuffer(length: number): Buffer {
        this.ensure(length)
        const slice = this.buffer.slice(this.offset, this.offset + length)
        const buffer = Buffer.from(
            slice.buffer,
            slice.byteOffset,
            slice.byteLength,
        )
        this.offset += length
        return buffer
    }

    private decodeArray(length: number): Value[] {
        const array: Value[] = new Array(length)
        for (let i = 0; i < length; ++i) {
            array[i] = this.decodeAny()
        }
        return array
    }

    private decodeObject(length: number): object {
        const object = {}
        for (let i = 0; i < length; ++i) {
            const key = this.decodeAny()
            if (typeof key !== 'string') {
                throw createTsonError('Object key not a string.')
            }
            const value = this.decodeAny()
            ;(object as any)[key] = value
        }
        return object
    }

    private decodeError(): Error {
        const name = this.decodeAny()
        if (typeof name !== 'string') {
            throw createTsonError('Error name not a string.')
        }

        const message = this.decodeAny()
        if (typeof message !== 'string') {
            throw createTsonError('Error message not a string.')
        }

        const details = this.decodeAny()
        if (typeof details !== 'object') {
            throw createTsonError('Error details not an object.')
        }

        if (details) {
            if (hasOwnProperty.call(details, 'name')) {
                throw createTsonError(
                    '"name" property present in Error details.',
                )
            }
            if (hasOwnProperty.call(details, 'message')) {
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

    private ensure(size: number): void {
        if (this.offset + size > this.buffer.length) {
            throw new RangeError('Insufficient data to read.')
        }
    }
}
