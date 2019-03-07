import { Duplex } from 'stream'

/**
 * Creates a pair of Duplex Streams [a, b], such that
 * a.write(x) -> b.emit('data', x) and b.write(y) -> a.emit('data', y).
 */
export function invertedStreams({ objectMode = false } = {}): [Duplex, Duplex] {
    const a = new Duplex({
        allowHalfOpen: false,
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
    })
    const b = new Duplex({
        allowHalfOpen: false,
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
    })

    return [a, b]
}
