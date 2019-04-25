import { Presence } from '@syncot/presence'
import { install as installClock, InstalledClock } from 'lolex'
import { PresenceStream } from './presenceStream'

const now = 12345
let clock: InstalledClock

let presenceStream: PresenceStream

const testError = new Error('test error')
const testErrorMatcher = expect.objectContaining({
    message: 'test error',
    name: 'Error',
})

const whenNextTick = () => new Promise(resolve => process.nextTick(resolve))

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
    clock = installClock({ now })
    presenceStream = new PresenceStream()
})

afterEach(() => {
    clock.uninstall()
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
            name: 'AssertionError [ERR_ASSERTION]',
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

test('resetPresence', async () => {
    const onData = jest.fn()
    presenceStream.on('data', onData)

    // Add some presence objects.
    onData.mockClear()
    presenceStream.resetPresence(presenceList)
    clock.tick(1)
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith([true, ...presenceList])

    // Load the same presence objects again.
    onData.mockClear()
    presenceStream.resetPresence(presenceList)
    clock.tick(1)
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(0)

    // Modify and remove some presence objects.
    onData.mockClear()
    presenceStream.resetPresence([
        { ...presenceList[0], lastModified: lastModified + 1 },
        { ...presenceList[1], lastModified: lastModified - 1 },
        { ...presenceList[2], lastModified: lastModified + 3 },
        // presenceList[3],
        presenceList[4],
        // presenceList[5],
    ])
    clock.tick(1)
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(2)
    expect(onData).toHaveBeenNthCalledWith(1, [
        true,
        { ...presenceList[0], lastModified: lastModified + 1 },
        { ...presenceList[2], lastModified: lastModified + 3 },
    ])
    expect(onData).toHaveBeenNthCalledWith(2, [
        false,
        presenceList[3].sessionId,
        presenceList[5].sessionId,
    ])

    // Remove the remaining presence objects.
    onData.mockClear()
    presenceStream.resetPresence([])
    clock.tick(1)
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith([
        false,
        presenceList[0].sessionId,
        presenceList[1].sessionId,
        presenceList[2].sessionId,
        presenceList[4].sessionId,
    ])

    // Add one presence object.
    onData.mockClear()
    presenceStream.resetPresence([presenceList[0]])
    clock.tick(1)
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith([true, presenceList[0]])

    // Add another presence object.
    onData.mockClear()
    presenceStream.resetPresence([presenceList[0], presenceList[1]])
    clock.tick(1)
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith([true, presenceList[1]])

    // Remove one presence object.
    onData.mockClear()
    presenceStream.resetPresence([presenceList[1]])
    clock.tick(1)
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith([false, presenceList[0].sessionId])

    // Remove another presence object.
    onData.mockClear()
    presenceStream.resetPresence([])
    clock.tick(1)
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith([false, presenceList[1].sessionId])
})

test('addPresence and removePresence', async () => {
    const onData = jest.fn()
    presenceStream.on('data', onData)

    // Add a presence object.
    onData.mockClear()
    presenceStream.addPresence(presenceList[0])
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith([true, presenceList[0]])

    // Add the same presence object.
    onData.mockClear()
    presenceStream.addPresence(presenceList[0])
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(0)

    // Add another 2 presence objects.
    onData.mockClear()
    presenceStream.addPresence(presenceList[1])
    presenceStream.addPresence(presenceList[2])
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(2)
    expect(onData).toHaveBeenNthCalledWith(1, [true, presenceList[1]])
    expect(onData).toHaveBeenNthCalledWith(2, [true, presenceList[2]])

    // Update a presence object.
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

    // Update a presence object to have a lower lastModified value.
    onData.mockClear()
    presenceStream.addPresence({
        ...presenceList[1],
        lastModified: lastModified - 1,
    })
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(0)

    // Remove one presence object.
    onData.mockClear()
    presenceStream.removePresence(presenceList[1].sessionId)
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith([false, presenceList[1].sessionId])

    // Remove the remaining presence objects.
    onData.mockClear()
    presenceStream.removePresence(presenceList[0].sessionId)
    presenceStream.removePresence(presenceList[2].sessionId)
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(2)
    expect(onData).toHaveBeenNthCalledWith(1, [
        false,
        presenceList[0].sessionId,
    ])
    expect(onData).toHaveBeenNthCalledWith(2, [
        false,
        presenceList[2].sessionId,
    ])

    // Remove a non-existant presence object.
    onData.mockClear()
    presenceStream.removePresence(presenceList[4].sessionId)
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(0)
})

test('resetPresence updates presence added by addPresence (>= 1 second time difference)', async () => {
    const onData = jest.fn()
    presenceStream.on('data', onData)

    onData.mockClear()
    presenceStream.addPresence(presenceList[0])
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith([true, presenceList[0]])

    onData.mockClear()
    clock.tick(1000)
    presenceStream.resetPresence([
        { ...presenceList[0], lastModified: lastModified + 1 },
    ])
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith([
        true,
        { ...presenceList[0], lastModified: lastModified + 1 },
    ])
})

test('resetPresence does not update presence added by addPresence (< 1 second time difference)', async () => {
    const onData = jest.fn()
    presenceStream.on('data', onData)

    onData.mockClear()
    presenceStream.addPresence(presenceList[0])
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith([true, presenceList[0]])

    onData.mockClear()
    clock.tick(999)
    presenceStream.resetPresence([
        { ...presenceList[0], lastModified: lastModified + 1 },
    ])
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(0)
})

test('resetPresence updates presence removed by removePresence (>= 1 second time difference)', async () => {
    const onData = jest.fn()
    presenceStream.on('data', onData)

    onData.mockClear()
    presenceStream.addPresence(presenceList[0])
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith([true, presenceList[0]])

    onData.mockClear()
    presenceStream.removePresence(presenceList[0].sessionId)
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith([false, presenceList[0].sessionId])

    onData.mockClear()
    clock.tick(1000)
    presenceStream.resetPresence([
        { ...presenceList[0], lastModified: lastModified + 1 },
    ])
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith([
        true,
        { ...presenceList[0], lastModified: lastModified + 1 },
    ])
})

test('resetPresence does not update presence removed by removePresence (< 1 second time difference)', async () => {
    const onData = jest.fn()
    presenceStream.on('data', onData)

    onData.mockClear()
    presenceStream.addPresence(presenceList[0])
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith([true, presenceList[0]])

    onData.mockClear()
    presenceStream.removePresence(presenceList[0].sessionId)
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith([false, presenceList[0].sessionId])

    onData.mockClear()
    clock.tick(999)
    presenceStream.resetPresence([
        { ...presenceList[0], lastModified: lastModified + 1 },
    ])
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(0)
})

test('resetPresence removes presence added by addPresence (>= 1 second time difference)', async () => {
    const onData = jest.fn()
    presenceStream.on('data', onData)

    onData.mockClear()
    presenceStream.addPresence(presenceList[0])
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith([true, presenceList[0]])

    onData.mockClear()
    clock.tick(1000)
    presenceStream.resetPresence([])
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith([false, presenceList[0].sessionId])
})

test('resetPresence does not remove presence added by addPresence (< 1 second time difference)', async () => {
    const onData = jest.fn()
    presenceStream.on('data', onData)

    onData.mockClear()
    presenceStream.addPresence(presenceList[0])
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith([true, presenceList[0]])

    onData.mockClear()
    clock.tick(999)
    presenceStream.resetPresence([])
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(0)
})

test('resetPresence removes presence removed by removePresence (>= 1 second time difference)', async () => {
    const onData = jest.fn()
    presenceStream.on('data', onData)

    onData.mockClear()
    presenceStream.addPresence(presenceList[0])
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith([true, presenceList[0]])

    onData.mockClear()
    presenceStream.removePresence(presenceList[0].sessionId)
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith([false, presenceList[0].sessionId])

    onData.mockClear()
    clock.tick(1000)
    presenceStream.resetPresence([])
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(0) // nothing to actually remove
})

test('resetPresence does not remove presence removed by removePresence (< 1 second time difference)', async () => {
    const onData = jest.fn()
    presenceStream.on('data', onData)

    onData.mockClear()
    presenceStream.addPresence(presenceList[0])
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith([true, presenceList[0]])

    onData.mockClear()
    presenceStream.removePresence(presenceList[0].sessionId)
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith([false, presenceList[0].sessionId])

    onData.mockClear()
    clock.tick(999)
    presenceStream.resetPresence([])
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(0) // nothing to actually remove
})
