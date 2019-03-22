import { invertedStreams } from '.'

const delay = () => new Promise(resolve => setTimeout(resolve, 0))

test('objectMode=false', async () => {
    const [a, b] = invertedStreams()
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

test('objectMode=true', async () => {
    const [a, b] = invertedStreams({ objectMode: true })
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

test('end stream 0 and receive "end" event', async () => {
    const onEndA = jest.fn()
    const onEndB = jest.fn()
    const [a, b] = invertedStreams()
    a.on('end', onEndA)
    b.on('end', onEndB)
    a.resume()
    b.resume()
    a.end()
    await delay()
    expect(onEndA).toHaveBeenCalled()
    expect(onEndB).toHaveBeenCalled()
})

test('end stream 1 and receive "end" event', async () => {
    const onEndA = jest.fn()
    const onEndB = jest.fn()
    const [a, b] = invertedStreams()
    a.on('end', onEndA)
    b.on('end', onEndB)
    a.resume()
    b.resume()
    b.end()
    await delay()
    expect(onEndA).toHaveBeenCalled()
    expect(onEndB).toHaveBeenCalled()
})

test('destroy stream 0', async () => {
    const onCloseA = jest.fn()
    const onCloseB = jest.fn()
    const [a, b] = invertedStreams()
    a.on('close', onCloseA)
    b.on('close', onCloseB)
    a.destroy()
    await delay()
    expect(onCloseA).toHaveBeenCalledTimes(1)
    expect(onCloseB).toHaveBeenCalledTimes(1)
})

test('destroy stream 1', async () => {
    const onCloseA = jest.fn()
    const onCloseB = jest.fn()
    const [a, b] = invertedStreams()
    a.on('close', onCloseA)
    b.on('close', onCloseB)
    b.destroy()
    await delay()
    expect(onCloseA).toHaveBeenCalledTimes(1)
    expect(onCloseB).toHaveBeenCalledTimes(1)
})