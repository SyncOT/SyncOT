import { Duplex } from 'stream'

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
        write(data, _encoding, callback) {
            b.push(data)
            callback()
        },
        final(callback) {
            b.push(null)
            callback()
        },
        destroy(error, callback) {
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
        write(data, _encoding, callback) {
            a.push(data)
            callback()
        },
        final(callback) {
            a.push(null)
            callback()
        },
        destroy(error, callback) {
            a.destroy()
            callback(error)
        },
    })

    return [a, b]
}
