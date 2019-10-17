/**
 * The binary types supported by `toBuffer`.
 */
export type Binary = Buffer | ArrayBuffer | SharedArrayBuffer | ArrayBufferView

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

    if (isArrayBuffer(binary) || isSharedArrayBuffer(binary)) {
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
    if (isArrayBuffer(binary) || isSharedArrayBuffer(binary)) {
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
        isArrayBuffer(value) ||
        isSharedArrayBuffer(value)
    )
}

const toString = Object.prototype.toString

export function isArrayBuffer(value: any): value is ArrayBuffer {
    return toString.call(value) === '[object ArrayBuffer]'
}

export function isSharedArrayBuffer(value: any): value is ArrayBuffer {
    return toString.call(value) === '[object SharedArrayBuffer]'
}

export interface BufferWriter {
    toBuffer(): Buffer
    writeBuffer(value: Buffer): void
    writeString(value: string, encoding: BufferEncoding): void
    writeUInt8(value: number): void
    writeInt8(value: number): void
    writeUInt16LE(value: number): void
    writeInt16LE(value: number): void
    writeUInt32LE(value: number): void
    writeInt32LE(value: number): void
    writeFloatLE(value: number): void
    writeDoubleLE(value: number): void
}

export function createBufferWriter(initialSize: number = 1024): BufferWriter {
    return new Writer(initialSize)
}

class Writer implements BufferWriter {
    private offset: number = 0
    private buffer: Buffer
    public constructor(initialSize: number) {
        this.buffer = Buffer.allocUnsafe(initialSize)
    }

    public toBuffer(): Buffer {
        return this.buffer.slice(0, this.offset)
    }

    public writeBuffer(value: Buffer): void {
        const size = value.length
        this.ensure(size)
        value.copy(this.buffer, this.offset)
        this.offset += size
    }
    public writeString(value: string, encoding: BufferEncoding): void {
        const size = Buffer.byteLength(value, encoding)
        this.ensure(size)
        this.buffer.write(value, this.offset, size, encoding)
        this.offset += size
    }
    public writeUInt8(value: number): void {
        this.ensure(1)
        this.buffer[this.offset] = value
        this.offset += 1
    }
    public writeInt8(value: number): void {
        this.ensure(1)
        this.buffer[this.offset] = value
        this.offset += 1
    }
    public writeUInt16LE(value: number): void {
        this.writeNumber(this.buffer.writeUInt16LE, value, 2)
    }
    public writeInt16LE(value: number): void {
        this.writeNumber(this.buffer.writeInt16LE, value, 2)
    }
    public writeUInt32LE(value: number): void {
        this.writeNumber(this.buffer.writeUInt32LE, value, 4)
    }
    public writeInt32LE(value: number): void {
        this.writeNumber(this.buffer.writeInt32LE, value, 4)
    }
    public writeFloatLE(value: number): void {
        this.writeNumber(this.buffer.writeFloatLE, value, 4)
    }
    public writeDoubleLE(value: number): void {
        this.writeNumber(this.buffer.writeDoubleLE, value, 8)
    }

    private writeNumber(
        fn: (value: number, offset: number) => void,
        value: number,
        size: number,
    ): void {
        this.ensure(size)
        fn.call(this.buffer, value, this.offset)
        this.offset += size
    }

    private ensure(size: number): void {
        const minLength = this.offset + size
        const oldLength = this.buffer.length

        if (minLength > oldLength) {
            // tslint:disable-next-line:no-bitwise
            let newLength = ((oldLength * 3) / 2 + 1) | 0
            if (newLength < minLength) {
                newLength = minLength
            }
            const newBuffer = Buffer.allocUnsafe(newLength)
            this.buffer.copy(newBuffer)
            this.buffer = newBuffer
        }
    }
}

export interface BufferReader {
    readBuffer(size: number): Buffer
    readString(size: number, encoding: string): string
    readUInt8(): number
    readInt8(): number
    readUInt16LE(): number
    readInt16LE(): number
    readUInt32LE(): number
    readInt32LE(): number
    readFloatLE(): number
    readDoubleLE(): number
}

export function createBufferReader(buffer: Buffer): BufferReader {
    return new Reader(buffer)
}

class Reader implements BufferReader {
    private offset: number = 0
    private buffer: Buffer
    public constructor(buffer: Buffer) {
        this.buffer = buffer
    }

    public readBuffer(size: number): Buffer {
        this.check(size)
        const result = this.buffer.slice(this.offset, this.offset + size)
        this.offset += size
        return result
    }

    public readString(size: number, encoding: string): string {
        this.check(size)
        const result = this.buffer
            .slice(this.offset, this.offset + size)
            .toString(encoding)
        this.offset += size
        return result
    }

    public readUInt8(): number {
        this.check(1)
        const result = this.buffer[this.offset]
        this.offset += 1
        return result
    }
    public readInt8(): number {
        this.check(1)
        // tslint:disable-next-line:no-bitwise
        const result = (this.buffer[this.offset] << 24) >> 24
        this.offset += 1
        return result
    }
    public readUInt16LE(): number {
        return this.readNumber(this.buffer.readUInt16LE, 2)
    }
    public readInt16LE(): number {
        return this.readNumber(this.buffer.readInt16LE, 2)
    }
    public readUInt32LE(): number {
        return this.readNumber(this.buffer.readUInt32LE, 4)
    }
    public readInt32LE(): number {
        return this.readNumber(this.buffer.readInt32LE, 4)
    }
    public readFloatLE(): number {
        return this.readNumber(this.buffer.readFloatLE, 4)
    }
    public readDoubleLE(): number {
        return this.readNumber(this.buffer.readDoubleLE, 8)
    }

    private readNumber(fn: (offset: number) => number, size: number): number {
        this.check(size)
        const result = fn.call(this.buffer, this.offset)
        this.offset += size
        return result
    }

    private check(size: number): void {
        if (this.offset + size > this.buffer.length) {
            throw new RangeError('Insufficient data to read.')
        }
    }
}
