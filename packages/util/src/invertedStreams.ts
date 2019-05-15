import { Duplex } from 'readable-stream'

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
