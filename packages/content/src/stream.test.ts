import { createOperationKey, Operation } from '@syncot/content/src/content'
import { delay, whenClose } from '@syncot/util'
import { OperationStream } from './stream'

const userId = 'test-user'
const type = 'test-type'
const id = 'test-id'
const versionStart = 4
const versionEnd = 7
const operations: Operation[] = Array.from(Array(10), (_value, version) => ({
    key: createOperationKey(userId),
    type,
    id,
    version,
    schema: '',
    data: version,
    meta: null,
}))

test('initial state', () => {
    const stream = new OperationStream(type, id, versionStart, versionEnd)
    const versionNext = versionStart
    expect(stream.type).toBe(type)
    expect(stream.id).toBe(id)
    expect(stream.versionStart).toBe(versionStart)
    expect(stream.versionNext).toBe(versionNext)
    expect(stream.versionEnd).toBe(versionEnd)
})

test('create with versionStart equal to versionEnd', async () => {
    const stream = new OperationStream(type, id, versionStart, versionStart)
    const onData = jest.fn()
    stream.on('data', onData)
    await whenClose(stream)
    expect(onData).not.toHaveBeenCalled()
})

test('write', () => {
    const stream = new OperationStream(type, id, versionStart, versionEnd)
    const onError = jest.fn()
    stream.on('error', onError)
    stream.write({})
    expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
            message: 'OperationStream does not support "write".',
            name: 'TypeError',
        }),
    )
})

test('end', async () => {
    const stream = new OperationStream(type, id, versionStart, versionEnd)
    stream.end()
    await whenClose(stream)
})

test('pushOperation', async () => {
    const onData = jest.fn()
    const onEnd = jest.fn()
    const stream = new OperationStream(type, id, versionStart, versionEnd)
    stream.on('data', onData)
    stream.on('end', onEnd)

    let versionNext = versionStart
    for (let i = 0; i < operations.length; i++) {
        stream.pushOperation(operations[i])
        if (i < versionStart) {
            // Do nothing.
        } else if (i >= versionEnd) {
            // Do nothing.
        } else {
            versionNext++
        }
        expect(stream.versionNext).toBe(versionNext)
    }
    await whenClose(stream)

    expect(onData).toHaveBeenCalledTimes(versionEnd - versionStart)
    expect(onEnd).toHaveBeenCalledTimes(1)

    versionNext = versionStart
    while (versionNext < versionStart) {
        expect(onData).toHaveBeenNthCalledWith(
            versionNext - versionStart,
            operations[versionNext],
        )
        versionNext++
    }
})

test('pushOperation out of sequence', () => {
    const stream = new OperationStream(type, id, versionStart, versionEnd)
    expect(() => stream.pushOperation(operations[versionStart + 1])).toThrow(
        expect.objectContaining({
            message: 'operation.version out of sequence.',
            name: 'RangeError',
        }),
    )
})

test('pushOperation after a delay', async () => {
    const onData = jest.fn()
    const stream = new OperationStream(type, id, versionStart, versionEnd)
    stream.on('data', onData)
    await delay(1)
    stream.pushOperation(operations[versionStart])
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith(operations[versionStart])
})
