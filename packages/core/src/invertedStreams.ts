import { Duplex } from 'stream'

/**
 * Creates a pair of Duplex Streams (a, b), such that
 * a.write(x) -> b.emit('data', x) and b.write(y) -> a.emit('data', y).
 */
export function invertedStreams({ objectMode = false } = {}): {
    a: Duplex
    b: Duplex
} {
    const a = new Duplex({
        objectMode,
        read() {
            return
        },
        write(data, encoding, callback) {
            b.push(data, encoding)
            callback()
        },
        final(callback) {
            b.push(null)
            callback()
        },
    })
    const b = new Duplex({
        objectMode,
        read() {
            return
        },
        write(data, encoding, callback) {
            a.push(data, encoding)
            callback()
        },
        final(callback) {
            a.push(null)
            callback()
        },
    })

    return { a, b }
}
