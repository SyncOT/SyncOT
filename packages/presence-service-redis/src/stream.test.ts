import { Presence } from '@syncot/presence'
import { whenNextTick } from '@syncot/util'
import { PresenceStream } from './stream'

let presenceStream: PresenceStream

const testError = new Error('test error')
const testErrorMatcher = expect.objectContaining({
    message: 'test error',
    name: 'Error',
})

const lastModified = 999
const createPresence = (id: number): Presence => ({
    data: { id },
    lastModified,
    locationId: 'location-' + id,
    sessionId: 'session-' + id,
    userId: 'user-' + id,
})
const presenceList: Presence[] = [
    createPresence(1),
    createPresence(2),
    createPresence(3),
    createPresence(4),
    createPresence(5),
    createPresence(6),
]

beforeEach(() => {
    presenceStream = new PresenceStream()
})

afterEach(() => {
    presenceStream.destroy()
})

test('write', async () => {
    const onClose = jest.fn()
    const onError = jest.fn()
    presenceStream.on('close', onClose)
    presenceStream.on('error', onError)
    presenceStream.write({})
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
            message: 'PresenceStream does not support "write".',
            name: 'SyncOTError Assert',
        }),
    )
    await whenNextTick()
    expect(onClose).not.toHaveBeenCalled()
})

test('end', async () => {
    const onClose = jest.fn()
    presenceStream.on('close', onClose)
    presenceStream.end()
    await whenNextTick()
    expect(onClose).toHaveBeenCalledTimes(1)
})

test('destroy', async () => {
    const onClose = jest.fn()
    presenceStream.on('close', onClose)
    presenceStream.destroy()
    await whenNextTick()
    expect(onClose).toHaveBeenCalledTimes(1)
})

test('destroy with an error', async () => {
    const onClose = jest.fn()
    const onError = jest.fn()
    presenceStream.on('close', onClose)
    presenceStream.on('error', onError)
    presenceStream.destroy(testError)
    await whenNextTick()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(testErrorMatcher)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledAfter(onError)
})

test('addPresence and removePresence', async () => {
    const onData = jest.fn()
    presenceStream.on('data', onData)

    onData.mockClear()
    presenceStream.removePresence(presenceList[0].sessionId)
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(0)

    onData.mockClear()
    presenceStream.addPresence(presenceList[0])
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith([true, presenceList[0]])

    onData.mockClear()
    presenceStream.addPresence(presenceList[0])
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(0)

    onData.mockClear()
    presenceStream.addPresence({
        ...presenceList[0],
        lastModified: lastModified + 1,
    })
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith([
        true,
        { ...presenceList[0], lastModified: lastModified + 1 },
    ])

    onData.mockClear()
    presenceStream.addPresence(presenceList[1])
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith([true, presenceList[1]])

    onData.mockClear()
    presenceStream.removePresence(presenceList[0].sessionId)
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith([false, presenceList[0].sessionId])

    onData.mockClear()
    presenceStream.removePresence(presenceList[0].sessionId)
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(0)

    onData.mockClear()
    presenceStream.removePresence(presenceList[1].sessionId)
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith([false, presenceList[1].sessionId])
})

test('resetPresence', async () => {
    const onData = jest.fn()
    presenceStream.on('data', onData)

    onData.mockClear()
    presenceStream.resetPresence(presenceList)
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith([true, ...presenceList])

    onData.mockClear()
    presenceStream.resetPresence(presenceList)
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(0)

    onData.mockClear()
    presenceStream.resetPresence([
        presenceList[0],
        presenceList[2],
        presenceList[3],
    ])
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith([
        false,
        presenceList[1].sessionId,
        presenceList[4].sessionId,
        presenceList[5].sessionId,
    ])

    onData.mockClear()
    presenceStream.resetPresence([
        presenceList[0],
        presenceList[1],
        presenceList[2],
        presenceList[3],
        presenceList[4],
    ])
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith([
        true,
        presenceList[1],
        presenceList[4],
    ])

    onData.mockClear()
    presenceStream.resetPresence(presenceList)
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith([true, presenceList[5]])

    onData.mockClear()
    presenceStream.resetPresence([
        presenceList[0],
        presenceList[1],
        { ...presenceList[2], lastModified: lastModified - 1 },
        { ...presenceList[4], lastModified: lastModified + 1 },
        presenceList[5],
    ])
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(2)
    expect(onData).toHaveBeenCalledWith([
        true,
        { ...presenceList[2], lastModified: lastModified - 1 },
        { ...presenceList[4], lastModified: lastModified + 1 },
    ])
    expect(onData).toHaveBeenCalledWith([false, presenceList[3].sessionId])
})

test('addPresence, removePresence and resetPresence', async () => {
    const onData = jest.fn()
    presenceStream.on('data', onData)

    onData.mockClear()
    presenceStream.addPresence(presenceList[0])
    presenceStream.addPresence(presenceList[1])
    presenceStream.addPresence(presenceList[2])
    presenceStream.removePresence(presenceList[2].sessionId)
    presenceStream.removePresence(presenceList[3].sessionId)
    presenceStream.resetPresence([
        presenceList[1],
        presenceList[2],
        presenceList[3],
        presenceList[4],
        presenceList[5],
    ])
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(6)
    expect(onData).toHaveBeenNthCalledWith(1, [true, presenceList[0]])
    expect(onData).toHaveBeenNthCalledWith(2, [true, presenceList[1]])
    expect(onData).toHaveBeenNthCalledWith(3, [true, presenceList[2]])
    expect(onData).toHaveBeenNthCalledWith(4, [
        false,
        presenceList[2].sessionId,
    ])
    expect(onData).toHaveBeenNthCalledWith(5, [
        true,
        presenceList[2],
        presenceList[3],
        presenceList[4],
        presenceList[5],
    ])
    expect(onData).toHaveBeenNthCalledWith(6, [
        false,
        presenceList[0].sessionId,
    ])
})
