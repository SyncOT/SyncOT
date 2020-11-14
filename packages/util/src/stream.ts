import { Duplex, Readable, Stream, Transform, Writable } from 'readable-stream'

export function isStream(stream: any): stream is Stream {
    return (
        stream !== null &&
        typeof stream === 'object' &&
        typeof stream.pipe === 'function' &&
        typeof stream.destroy === 'function'
    )
}

export function isOpenStream(stream: any): stream is Stream {
    return isStream(stream) && stream.destroyed === false
}

export function isWritableStream(stream: any): stream is Writable {
    return (
        isStream(stream) &&
        typeof (stream as any).writable === 'boolean' &&
        typeof (stream as any)._write === 'function' &&
        typeof (stream as any)._writableState === 'object'
    )
}

export function isOpenWritableStream(stream: any): stream is Writable {
    return (
        isWritableStream(stream) &&
        stream.destroyed === false &&
        stream.writable === true
    )
}

export function isReadableStream(stream: any): stream is Readable {
    return (
        isStream(stream) &&
        typeof stream.readable === 'boolean' &&
        typeof stream._read === 'function' &&
        typeof stream._readableState === 'object'
    )
}

export function isOpenReadableStream(stream: any): stream is Readable {
    return (
        isReadableStream(stream) &&
        stream.destroyed === false &&
        stream.readable === true
    )
}

export function isDuplexStream(stream: any): stream is Duplex {
    return isWritableStream(stream) && isReadableStream(stream)
}

export function isOpenDuplexStream(stream: any): stream is Duplex {
    return (
        isDuplexStream(stream) &&
        stream.destroyed === false &&
        stream.readable === true &&
        stream.writable === true
    )
}

export function isTransformStream(stream: any): stream is Transform {
    return (
        isDuplexStream(stream) &&
        typeof (stream as any)._transform === 'function' &&
        typeof (stream as any)._transformState === 'object'
    )
}

export function isOpenTransformStream(stream: any): stream is Transform {
    return (
        isTransformStream(stream) &&
        stream.destroyed === false &&
        stream.readable === true &&
        stream.writable === true
    )
}

/**
 * Creates a pair of Duplex Streams [a, b], such that
 * a.write(x) -> b.emit('data', x) and b.write(y) -> a.emit('data', y).
 */
export function invertedStreams({
    allowHalfOpen = true,
    objectMode = false,
} = {}): [Duplex, Duplex] {
    const a = new Duplex({
        allowHalfOpen,
        objectMode,
        read() {
            return
        },
        write(
            data: any,
            _encoding: string,
            callback: (error: Error | null) => void,
        ) {
            b.push(data)
            callback(null)
        },
        final(callback: (error: Error | null) => void) {
            b.push(null)
            callback(null)
        },
        destroy(error: Error | null, callback: (error: Error | null) => void) {
            b.destroy()
            callback(error)
        },
    })
    const b = new Duplex({
        allowHalfOpen,
        objectMode,
        read() {
            return
        },
        write(
            data: any,
            _encoding: string,
            callback: (error: Error | null) => void,
        ) {
            a.push(data)
            callback(null)
        },
        final(callback: (error: Error | null) => void) {
            a.push(null)
            callback(null)
        },
        destroy(error: Error | null, callback: (error: Error | null) => void) {
            a.destroy()
            callback(error)
        },
    })

    return [a, b]
}
