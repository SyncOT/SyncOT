import { delay, invertedStreams } from '.'

const error = new Error('test')

describe('objectMode=false', () => {
    test.each([
        // Test both streams in the same way.
        invertedStreams(),
        invertedStreams().reverse(),
    ])('read and write some data (%#)', async (a, b) => {
        const data = Array.from(Array(10), (_, x) => x.toString())
        const bufferData = data.map(d => Buffer.from(d))

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
        invertedStreams({ allowHalfOpen: false, objectMode: true }).reverse(),
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
