import { Duplex, Readable, Stream, Transform, Writable } from 'readable-stream'
import {
    delay,
    invertedStreams,
    isDuplexStream,
    isOpenDuplexStream,
    isOpenReadableStream,
    isOpenStream,
    isOpenTransformStream,
    isOpenWritableStream,
    isReadableStream,
    isStream,
    isTransformStream,
    isWritableStream,
    noop,
} from '.'

const read = (): void => undefined
const write = (
    _data: any,
    _encoding: string,
    callback: (error: Error | null) => void,
): void => callback(null)
const transform = (
    _data: any,
    _encoding: string,
    callback: (error: Error | undefined) => void,
): void => callback(undefined)

const invalidStream = new Stream()

const openReadableStream = new Readable({ read }).on('data', noop)
const endedReadableStream = new Readable({ read }).on('data', noop)
endedReadableStream.push(null)
const destroyedReadableStream = new Readable({ read }).on('data', noop)
destroyedReadableStream.destroy()

const openWritableStream = new Writable({ write })
const finishedWritableStream = new Writable({ write })
finishedWritableStream.end()
const destroyedWritableStream = new Writable({ write })
destroyedWritableStream.destroy()

const openDuplexStream = new Duplex({ read, write }).on('data', noop)
const endedDuplexStream = new Duplex({ read, write }).on('data', noop)
endedDuplexStream.push(null)
const finishedDuplexStream = new Duplex({ read, write }).on('data', noop)
finishedDuplexStream.end()
const destroyedDuplexStream = new Duplex({ read, write }).on('data', noop)
destroyedDuplexStream.destroy()

const openTransformStream = new Transform({ transform }).on('data', noop)
const endedTransformStream = new Transform({ transform }).on('data', noop)
endedTransformStream.push(null)
const finishedTransformStream = new Transform({ transform }).on('data', noop)
finishedTransformStream.end()
const destroyedTransformStream = new Transform({ transform }).on('data', noop)
destroyedTransformStream.destroy()

const functions: { [key: string]: (stream: any) => boolean } = {
    isDuplexStream,
    isOpenDuplexStream,
    isOpenReadableStream,
    isOpenStream,
    isOpenTransformStream,
    isOpenWritableStream,
    isReadableStream,
    isStream,
    isTransformStream,
    isWritableStream,
}

const streams: { [key: string]: any } = {
    destroyedDuplexStream,
    destroyedReadableStream,
    destroyedTransformStream,
    destroyedWritableStream,
    endedDuplexStream,
    endedReadableStream,
    endedTransformStream,
    finishedDuplexStream,
    finishedTransformStream,
    finishedWritableStream,
    function: () => undefined,
    invalidStream,
    null: null,
    openDuplexStream,
    openReadableStream,
    openTransformStream,
    openWritableStream,
    undefined,
}

beforeAll(async () => {
    // Introduce a delay, so that the stream's readable state could be updated.
    await new Promise((resolve) => setTimeout(resolve, 0))
})

test.each<[string, string, boolean]>([
    ['isDuplexStream', 'destroyedDuplexStream', true],
    ['isDuplexStream', 'destroyedReadableStream', false],
    ['isDuplexStream', 'destroyedTransformStream', true],
    ['isDuplexStream', 'destroyedWritableStream', false],
    ['isDuplexStream', 'endedDuplexStream', true],
    ['isDuplexStream', 'endedReadableStream', false],
    ['isDuplexStream', 'endedTransformStream', true],
    ['isDuplexStream', 'finishedDuplexStream', true],
    ['isDuplexStream', 'finishedTransformStream', true],
    ['isDuplexStream', 'finishedWritableStream', false],
    ['isDuplexStream', 'invalidStream', false],
    ['isDuplexStream', 'openDuplexStream', true],
    ['isDuplexStream', 'openReadableStream', false],
    ['isDuplexStream', 'openTransformStream', true],
    ['isDuplexStream', 'openWritableStream', false],
    ['isDuplexStream', 'null', false],
    ['isDuplexStream', 'undefined', false],
    ['isDuplexStream', 'function', false],
    ['isOpenDuplexStream', 'destroyedDuplexStream', false],
    ['isOpenDuplexStream', 'destroyedReadableStream', false],
    ['isOpenDuplexStream', 'destroyedTransformStream', false],
    ['isOpenDuplexStream', 'destroyedWritableStream', false],
    ['isOpenDuplexStream', 'endedDuplexStream', false],
    ['isOpenDuplexStream', 'endedReadableStream', false],
    ['isOpenDuplexStream', 'endedTransformStream', false],
    ['isOpenDuplexStream', 'finishedDuplexStream', false],
    ['isOpenDuplexStream', 'finishedTransformStream', false],
    ['isOpenDuplexStream', 'finishedWritableStream', false],
    ['isOpenDuplexStream', 'invalidStream', false],
    ['isOpenDuplexStream', 'openDuplexStream', true],
    ['isOpenDuplexStream', 'openReadableStream', false],
    ['isOpenDuplexStream', 'openTransformStream', true],
    ['isOpenDuplexStream', 'openWritableStream', false],
    ['isOpenDuplexStream', 'null', false],
    ['isOpenDuplexStream', 'undefined', false],
    ['isOpenDuplexStream', 'function', false],
    ['isOpenReadableStream', 'destroyedDuplexStream', false],
    ['isOpenReadableStream', 'destroyedReadableStream', false],
    ['isOpenReadableStream', 'destroyedTransformStream', false],
    ['isOpenReadableStream', 'destroyedWritableStream', false],
    ['isOpenReadableStream', 'endedDuplexStream', false],
    ['isOpenReadableStream', 'endedReadableStream', false],
    ['isOpenReadableStream', 'endedTransformStream', false],
    ['isOpenReadableStream', 'finishedDuplexStream', true],
    ['isOpenReadableStream', 'finishedTransformStream', false], // ended automatically on `end()`
    ['isOpenReadableStream', 'finishedWritableStream', false],
    ['isOpenReadableStream', 'invalidStream', false],
    ['isOpenReadableStream', 'openDuplexStream', true],
    ['isOpenReadableStream', 'openReadableStream', true],
    ['isOpenReadableStream', 'openTransformStream', true],
    ['isOpenReadableStream', 'openWritableStream', false],
    ['isOpenReadableStream', 'null', false],
    ['isOpenReadableStream', 'undefined', false],
    ['isOpenReadableStream', 'function', false],
    ['isOpenStream', 'destroyedDuplexStream', false],
    ['isOpenStream', 'destroyedReadableStream', false],
    ['isOpenStream', 'destroyedTransformStream', false],
    ['isOpenStream', 'destroyedWritableStream', false],
    ['isOpenStream', 'endedDuplexStream', true],
    ['isOpenStream', 'endedReadableStream', true],
    ['isOpenStream', 'endedTransformStream', true],
    ['isOpenStream', 'finishedDuplexStream', true],
    ['isOpenStream', 'finishedTransformStream', true],
    ['isOpenStream', 'finishedWritableStream', true],
    ['isOpenStream', 'invalidStream', false],
    ['isOpenStream', 'openDuplexStream', true],
    ['isOpenStream', 'openReadableStream', true],
    ['isOpenStream', 'openTransformStream', true],
    ['isOpenStream', 'openWritableStream', true],
    ['isOpenStream', 'null', false],
    ['isOpenStream', 'undefined', false],
    ['isOpenStream', 'function', false],
    ['isOpenTransformStream', 'destroyedDuplexStream', false],
    ['isOpenTransformStream', 'destroyedReadableStream', false],
    ['isOpenTransformStream', 'destroyedTransformStream', false],
    ['isOpenTransformStream', 'destroyedWritableStream', false],
    ['isOpenTransformStream', 'endedDuplexStream', false],
    ['isOpenTransformStream', 'endedReadableStream', false],
    ['isOpenTransformStream', 'endedTransformStream', false],
    ['isOpenTransformStream', 'finishedDuplexStream', false],
    ['isOpenTransformStream', 'finishedTransformStream', false],
    ['isOpenTransformStream', 'finishedWritableStream', false],
    ['isOpenTransformStream', 'invalidStream', false],
    ['isOpenTransformStream', 'openDuplexStream', false],
    ['isOpenTransformStream', 'openReadableStream', false],
    ['isOpenTransformStream', 'openTransformStream', true],
    ['isOpenTransformStream', 'openWritableStream', false],
    ['isOpenTransformStream', 'null', false],
    ['isOpenTransformStream', 'undefined', false],
    ['isOpenTransformStream', 'function', false],
    ['isOpenWritableStream', 'destroyedDuplexStream', false],
    ['isOpenWritableStream', 'destroyedReadableStream', false],
    ['isOpenWritableStream', 'destroyedTransformStream', false],
    ['isOpenWritableStream', 'destroyedWritableStream', false],
    ['isOpenWritableStream', 'endedDuplexStream', true],
    ['isOpenWritableStream', 'endedReadableStream', false],
    ['isOpenWritableStream', 'endedTransformStream', true],
    ['isOpenWritableStream', 'finishedDuplexStream', false],
    ['isOpenWritableStream', 'finishedTransformStream', false],
    ['isOpenWritableStream', 'finishedWritableStream', false],
    ['isOpenWritableStream', 'invalidStream', false],
    ['isOpenWritableStream', 'openDuplexStream', true],
    ['isOpenWritableStream', 'openReadableStream', false],
    ['isOpenWritableStream', 'openTransformStream', true],
    ['isOpenWritableStream', 'openWritableStream', true],
    ['isOpenWritableStream', 'null', false],
    ['isOpenWritableStream', 'undefined', false],
    ['isOpenWritableStream', 'function', false],
    ['isReadableStream', 'destroyedDuplexStream', true],
    ['isReadableStream', 'destroyedReadableStream', true],
    ['isReadableStream', 'destroyedTransformStream', true],
    ['isReadableStream', 'destroyedWritableStream', false],
    ['isReadableStream', 'endedDuplexStream', true],
    ['isReadableStream', 'endedReadableStream', true],
    ['isReadableStream', 'endedTransformStream', true],
    ['isReadableStream', 'finishedDuplexStream', true],
    ['isReadableStream', 'finishedTransformStream', true],
    ['isReadableStream', 'finishedWritableStream', false],
    ['isReadableStream', 'invalidStream', false],
    ['isReadableStream', 'openDuplexStream', true],
    ['isReadableStream', 'openReadableStream', true],
    ['isReadableStream', 'openTransformStream', true],
    ['isReadableStream', 'openWritableStream', false],
    ['isReadableStream', 'null', false],
    ['isReadableStream', 'undefined', false],
    ['isReadableStream', 'function', false],
    ['isStream', 'destroyedDuplexStream', true],
    ['isStream', 'destroyedReadableStream', true],
    ['isStream', 'destroyedTransformStream', true],
    ['isStream', 'destroyedWritableStream', true],
    ['isStream', 'endedDuplexStream', true],
    ['isStream', 'endedReadableStream', true],
    ['isStream', 'endedTransformStream', true],
    ['isStream', 'finishedDuplexStream', true],
    ['isStream', 'finishedTransformStream', true],
    ['isStream', 'finishedWritableStream', true],
    ['isStream', 'invalidStream', false],
    ['isStream', 'openDuplexStream', true],
    ['isStream', 'openReadableStream', true],
    ['isStream', 'openTransformStream', true],
    ['isStream', 'openWritableStream', true],
    ['isStream', 'null', false],
    ['isStream', 'undefined', false],
    ['isStream', 'function', false],
    ['isTransformStream', 'destroyedDuplexStream', false],
    ['isTransformStream', 'destroyedReadableStream', false],
    ['isTransformStream', 'destroyedTransformStream', true],
    ['isTransformStream', 'destroyedWritableStream', false],
    ['isTransformStream', 'endedDuplexStream', false],
    ['isTransformStream', 'endedReadableStream', false],
    ['isTransformStream', 'endedTransformStream', true],
    ['isTransformStream', 'finishedDuplexStream', false],
    ['isTransformStream', 'finishedTransformStream', true],
    ['isTransformStream', 'finishedWritableStream', false],
    ['isTransformStream', 'invalidStream', false],
    ['isTransformStream', 'openDuplexStream', false],
    ['isTransformStream', 'openReadableStream', false],
    ['isTransformStream', 'openTransformStream', true],
    ['isTransformStream', 'openWritableStream', false],
    ['isTransformStream', 'null', false],
    ['isTransformStream', 'undefined', false],
    ['isTransformStream', 'function', false],
    ['isWritableStream', 'destroyedDuplexStream', true],
    ['isWritableStream', 'destroyedReadableStream', false],
    ['isWritableStream', 'destroyedTransformStream', true],
    ['isWritableStream', 'destroyedWritableStream', true],
    ['isWritableStream', 'endedDuplexStream', true],
    ['isWritableStream', 'endedReadableStream', false],
    ['isWritableStream', 'endedTransformStream', true],
    ['isWritableStream', 'finishedDuplexStream', true],
    ['isWritableStream', 'finishedTransformStream', true],
    ['isWritableStream', 'finishedWritableStream', true],
    ['isWritableStream', 'invalidStream', false],
    ['isWritableStream', 'openDuplexStream', true],
    ['isWritableStream', 'openReadableStream', false],
    ['isWritableStream', 'openTransformStream', true],
    ['isWritableStream', 'openWritableStream', true],
    ['isWritableStream', 'null', false],
    ['isWritableStream', 'undefined', false],
    ['isWritableStream', 'function', false],
])('%s(%s) === %s', (predicate, stream, result) => {
    expect(functions[predicate](streams[stream])).toBe(result)
})

describe('invertedStreams', () => {
    const error = new Error('test')

    describe('objectMode=false', () => {
        test.each([
            // Test both streams in the same way.
            invertedStreams(),
            invertedStreams().reverse(),
        ])('read and write some data (%#)', async (a, b) => {
            const data = Array.from(Array(10), (_, x) => x.toString())
            const bufferData = data.map((d) => Buffer.from(d))

            const dataA = jest.fn()
            const dataB = jest.fn()
            const endA = jest.fn()
            const endB = jest.fn()

            a.on('data', dataA)
            b.on('data', dataB)
            a.on('end', endA)
            b.on('end', endB)

            a.write(data[0])
            a.write(data[1])
            a.write(data[2])
            b.write(data[3])
            b.write(data[4])
            b.write(data[5])
            a.write(data[6])
            a.write(data[7])
            a.write(data[8])
            a.end()
            b.write(data[9])
            b.end()

            await delay()

            expect(dataA).toHaveBeenCalledTimes(4)
            expect(dataA).toHaveBeenCalledWith(bufferData[3])
            expect(dataA).toHaveBeenCalledWith(bufferData[4])
            expect(dataA).toHaveBeenCalledWith(bufferData[5])
            expect(dataA).toHaveBeenCalledWith(bufferData[9])

            expect(dataB).toHaveBeenCalledTimes(6)
            expect(dataB).toHaveBeenCalledWith(bufferData[0])
            expect(dataB).toHaveBeenCalledWith(bufferData[1])
            expect(dataB).toHaveBeenCalledWith(bufferData[2])
            expect(dataB).toHaveBeenCalledWith(bufferData[6])
            expect(dataB).toHaveBeenCalledWith(bufferData[7])
            expect(dataB).toHaveBeenCalledWith(bufferData[8])

            expect(endA).toHaveBeenCalledTimes(1)
            expect(endB).toHaveBeenCalledTimes(1)
        })
    })

    describe('objectMode=true', () => {
        test.each([
            // Test both streams in the same way.
            invertedStreams({ objectMode: true }),
            invertedStreams({ objectMode: true }).reverse(),
        ])('read and write some data (%#)', async (a, b) => {
            const data = Array.from(Array(10), (_, x) => ({ data: x }))

            const dataA = jest.fn()
            const dataB = jest.fn()
            const endA = jest.fn()
            const endB = jest.fn()

            a.on('data', dataA)
            b.on('data', dataB)
            a.on('end', endA)
            b.on('end', endB)

            a.write(data[0])
            a.write(data[1])
            a.write(data[2])
            b.write(data[3])
            b.write(data[4])
            b.write(data[5])
            a.write(data[6])
            a.write(data[7])
            a.write(data[8])
            a.end()
            b.write(data[9])
            b.end()

            await delay()

            expect(dataA).toHaveBeenCalledTimes(4)
            expect(dataA).toHaveBeenCalledWith(data[3])
            expect(dataA).toHaveBeenCalledWith(data[4])
            expect(dataA).toHaveBeenCalledWith(data[5])
            expect(dataA).toHaveBeenCalledWith(data[9])

            expect(dataB).toHaveBeenCalledTimes(6)
            expect(dataB).toHaveBeenCalledWith(data[0])
            expect(dataB).toHaveBeenCalledWith(data[1])
            expect(dataB).toHaveBeenCalledWith(data[2])
            expect(dataB).toHaveBeenCalledWith(data[6])
            expect(dataB).toHaveBeenCalledWith(data[7])
            expect(dataB).toHaveBeenCalledWith(data[8])

            expect(endA).toHaveBeenCalledTimes(1)
            expect(endB).toHaveBeenCalledTimes(1)
        })
    })

    describe('allowHalfOpen=false', () => {
        test.each([
            // Test both streams in the same way.
            invertedStreams({ allowHalfOpen: false, objectMode: true }),
            invertedStreams({
                allowHalfOpen: false,
                objectMode: true,
            }).reverse(),
        ])('both streams end (%#)', async (a, b) => {
            const onEndA = jest.fn()
            const onEndB = jest.fn()

            a.on('end', onEndA)
            b.on('end', onEndB)
            a.resume()
            b.resume()
            a.end()
            await delay()

            expect(onEndA).toHaveBeenCalledTimes(1)
            expect(onEndB).toHaveBeenCalledTimes(1)
        })
    })

    describe('allowHalfOpen=true', () => {
        test.each([
            // Test both streams in the same way.
            invertedStreams({ objectMode: true }),
            invertedStreams({ objectMode: true }).reverse(),
        ])('end one stream and write to the other (%#)', async (a, b) => {
            const onDataA = jest.fn()
            const onEndA = jest.fn()
            const onDataB = jest.fn()
            const onEndB = jest.fn()

            a.on('data', onDataA)
            a.on('end', onEndA)
            b.on('data', onDataB)
            b.on('end', onEndB)

            a.end()
            await delay()

            expect(onDataA).toHaveBeenCalledTimes(0)
            expect(onEndA).toHaveBeenCalledTimes(0)
            expect(onDataB).toHaveBeenCalledTimes(0)
            expect(onEndB).toHaveBeenCalledTimes(1)

            b.write('5')
            b.end()
            await delay()

            expect(onDataA).toHaveBeenCalledTimes(1)
            expect(onDataA).toHaveBeenCalledWith('5')
            expect(onEndA).toHaveBeenCalledTimes(1)
            expect(onDataB).toHaveBeenCalledTimes(0)
            expect(onEndB).toHaveBeenCalledTimes(1)
        })
    })

    describe('destroy', () => {
        test.each([
            // Test both streams in the same way.
            invertedStreams(),
            invertedStreams().reverse(),
        ])('no error', async (a, b) => {
            const onCloseA = jest.fn()
            const onCloseB = jest.fn()
            a.on('close', onCloseA)
            b.on('close', onCloseB)
            b.destroy()
            await delay()
            expect(onCloseA).toHaveBeenCalledTimes(1)
            expect(onCloseB).toHaveBeenCalledTimes(1)
        })

        test.each([
            // Test both streams in the same way.
            invertedStreams(),
            invertedStreams().reverse(),
        ])('with error', async (a, b) => {
            const onErrorA = jest.fn()
            const onCloseA = jest.fn()
            const onErrorB = jest.fn()
            const onCloseB = jest.fn()
            a.on('error', onErrorA)
            a.on('close', onCloseA)
            b.on('error', onErrorB)
            b.on('close', onCloseB)
            b.destroy(error)
            await delay()
            expect(onErrorA).toHaveBeenCalledTimes(0)
            expect(onCloseA).toHaveBeenCalledTimes(1)
            expect(onErrorB).toHaveBeenCalledTimes(1)
            expect(onErrorB).toHaveBeenCalledWith(error)
            expect(onCloseB).toHaveBeenCalledTimes(1)
        })
    })
})
