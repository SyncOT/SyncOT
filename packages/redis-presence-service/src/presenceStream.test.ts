import { Presence } from '@syncot/presence'
import { install as installClock, InstalledClock } from 'lolex'
import { PresenceStream } from './presenceStream'

const now = 12345
let clock: InstalledClock

let loadPresence: jest.Mock<Promise<Presence[]>, []>
const ttl = 10
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
    loadPresence = jest.fn().mockResolvedValue([])
    presenceStream = new PresenceStream(loadPresence, ttl)
})

afterEach(() => {
    clock.uninstall()
    presenceStream.destroy()
})

test('ttl validation', () => {
    const errorMatcher = expect.objectContaining({
        message: 'Argument "pollingInterval" must be a safe integer >= 10.',
        name: 'AssertionError [ERR_ASSERTION]',
    })
    expect(() => new PresenceStream(loadPresence, 9)).toThrow(errorMatcher)
    expect(() => new PresenceStream(loadPresence, 10.5)).toThrow(errorMatcher)
    expect(() => new PresenceStream(loadPresence, Infinity)).toThrow(
        errorMatcher,
    )
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
    expect(loadPresence).toHaveBeenCalledTimes(1)
    expect(clock.countTimers()).toBe(1)
    presenceStream.on('close', onClose)
    presenceStream.end()
    await whenNextTick()
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(clock.countTimers()).toBe(0)
})

test('destroy', async () => {
    const onClose = jest.fn()
    expect(loadPresence).toHaveBeenCalledTimes(1)
    expect(clock.countTimers()).toBe(1)
    presenceStream.on('close', onClose)
    presenceStream.destroy()
    expect(clock.countTimers()).toBe(0)
    await whenNextTick()
    expect(onClose).toHaveBeenCalledTimes(1)
})

test('destroy with an error', async () => {
    const onClose = jest.fn()
    const onError = jest.fn()
    expect(loadPresence).toHaveBeenCalledTimes(1)
    expect(clock.countTimers()).toBe(1)
    presenceStream.on('close', onClose)
    presenceStream.on('error', onError)
    presenceStream.destroy(testError)
    expect(clock.countTimers()).toBe(0)
    await whenNextTick()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(testErrorMatcher)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledAfter(onError)
})

test('loadPresence scheduling', () => {
    expect(loadPresence).toHaveBeenCalledTimes(1)

    clock.tick(ttl * 1000 - 1)
    expect(loadPresence).toHaveBeenCalledTimes(1)
    clock.tick(1)
    expect(loadPresence).toHaveBeenCalledTimes(2)

    clock.tick(ttl * 1000 - 1)
    expect(loadPresence).toHaveBeenCalledTimes(2)
    clock.tick(1)
    expect(loadPresence).toHaveBeenCalledTimes(3)

    clock.tick(ttl * 1000)
    expect(loadPresence).toHaveBeenCalledTimes(4)
})

test('loadPresence error handling', async () => {
    const onClose = jest.fn()
    const onError = jest.fn()
    presenceStream.on('close', onClose)
    presenceStream.on('error', onError)
    loadPresence.mockClear()
    loadPresence.mockRejectedValueOnce(testError)

    clock.tick(ttl * 1000)
    expect(loadPresence).toHaveBeenCalledTimes(1)
    await Promise.resolve()
    expect(onError).toHaveBeenCalledTimes(1)

    clock.tick(ttl * 1000)
    expect(loadPresence).toHaveBeenCalledTimes(2)
    await Promise.resolve()
    expect(onError).toHaveBeenCalledTimes(1)

    expect(onError).toHaveBeenCalledWith(testErrorMatcher)
    expect(onClose).not.toHaveBeenCalled()
})

test('add and remove some presence using loadPresence', async () => {
    const onData = jest.fn()
    presenceStream.on('data', onData)

    // Add some presence objects.
    onData.mockClear()
    loadPresence.mockResolvedValueOnce(presenceList)
    clock.tick(ttl * 1000)
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith([true, ...presenceList])

    // Load the same presence objects again.
    onData.mockClear()
    loadPresence.mockResolvedValueOnce(presenceList)
    clock.tick(ttl * 1000)
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(0)

    // Modify and remove some presence objects.
    onData.mockClear()
    loadPresence.mockResolvedValueOnce([
        { ...presenceList[0], lastModified: lastModified + 1 },
        { ...presenceList[1], lastModified: lastModified - 1 },
        { ...presenceList[2], lastModified: lastModified + 3 },
        // presenceList[3],
        presenceList[4],
        // presenceList[5],
    ])
    clock.tick(ttl * 1000)
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
    loadPresence.mockResolvedValueOnce([])
    clock.tick(ttl * 1000)
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
    loadPresence.mockResolvedValueOnce([presenceList[0]])
    clock.tick(ttl * 1000)
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith([true, presenceList[0]])

    // Add another presence object.
    onData.mockClear()
    loadPresence.mockResolvedValueOnce([presenceList[0], presenceList[1]])
    clock.tick(ttl * 1000)
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith([true, presenceList[1]])

    // Remove one presence object.
    onData.mockClear()
    loadPresence.mockResolvedValueOnce([presenceList[1]])
    clock.tick(ttl * 1000)
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith([false, presenceList[0].sessionId])

    // Remove another presence object.
    onData.mockClear()
    loadPresence.mockResolvedValueOnce([])
    clock.tick(ttl * 1000)
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith([false, presenceList[1].sessionId])
})

test('add and remove some presence using the API', async () => {
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

test('triggerLoadPresence loads some data', async () => {
    const onData = jest.fn()
    presenceStream.on('data', onData)
    loadPresence.mockClear()

    loadPresence.mockResolvedValueOnce(presenceList)
    presenceStream.triggerLoadPresence()
    expect(loadPresence).toHaveBeenCalledTimes(1)
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith([true, ...presenceList])
})

test('triggerLoadPresence error handling', async () => {
    const onData = jest.fn()
    const onError = jest.fn()
    presenceStream.on('data', onData)
    presenceStream.on('error', onError)

    loadPresence.mockRejectedValueOnce(testError)
    presenceStream.triggerLoadPresence()
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(0)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(testErrorMatcher)
})

test('loadPresence updates presence added by API (>= 1 second time difference)', async () => {
    const onData = jest.fn()
    presenceStream.on('data', onData)

    onData.mockClear()
    clock.tick((ttl - 1) * 1000)
    presenceStream.addPresence(presenceList[0])
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith([true, presenceList[0]])

    onData.mockClear()
    loadPresence.mockResolvedValueOnce([
        { ...presenceList[0], lastModified: lastModified + 1 },
    ])
    clock.tick(1000)
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith([
        true,
        { ...presenceList[0], lastModified: lastModified + 1 },
    ])
})

test('loadPresence does not update presence added by API (< 1 second time difference)', async () => {
    const onData = jest.fn()
    presenceStream.on('data', onData)

    onData.mockClear()
    clock.tick((ttl - 1) * 1000 + 1)
    presenceStream.addPresence(presenceList[0])
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith([true, presenceList[0]])

    onData.mockClear()
    loadPresence.mockResolvedValueOnce([
        { ...presenceList[0], lastModified: lastModified + 1 },
    ])
    clock.tick(999)
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(0)
})

test('loadPresence updates presence removed by API (>= 1 second time difference)', async () => {
    const onData = jest.fn()
    presenceStream.on('data', onData)

    clock.tick((ttl - 1) * 1000)
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
    loadPresence.mockResolvedValueOnce([
        { ...presenceList[0], lastModified: lastModified + 1 },
    ])
    clock.tick(1000)
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith([
        true,
        { ...presenceList[0], lastModified: lastModified + 1 },
    ])
})

test('loadPresence does not update presence removed by API (< 1 second time difference)', async () => {
    const onData = jest.fn()
    presenceStream.on('data', onData)

    clock.tick((ttl - 1) * 1000 + 1)

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
    loadPresence.mockResolvedValueOnce([
        { ...presenceList[0], lastModified: lastModified + 1 },
    ])
    clock.tick(999)
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(0)
})

test('loadPresence removes presence added by API (>= 1 second time difference)', async () => {
    const onData = jest.fn()
    presenceStream.on('data', onData)

    onData.mockClear()
    clock.tick((ttl - 1) * 1000)
    presenceStream.addPresence(presenceList[0])
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith([true, presenceList[0]])

    onData.mockClear()
    loadPresence.mockResolvedValueOnce([])
    clock.tick(1000)
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith([false, presenceList[0].sessionId])
})

test('loadPresence does not remove presence added by API (< 1 second time difference)', async () => {
    const onData = jest.fn()
    presenceStream.on('data', onData)

    onData.mockClear()
    clock.tick((ttl - 1) * 1000 + 1)
    presenceStream.addPresence(presenceList[0])
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith([true, presenceList[0]])

    onData.mockClear()
    loadPresence.mockResolvedValueOnce([])
    clock.tick(999)
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(0)
})

test('loadPresence removes presence removed by API (>= 1 second time difference)', async () => {
    const onData = jest.fn()
    presenceStream.on('data', onData)

    clock.tick((ttl - 1) * 1000)
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
    loadPresence.mockResolvedValueOnce([])
    clock.tick(1000)
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(0) // nothing to actually remove
})

test('loadPresence does not remove presence removed by API (< 1 second time difference)', async () => {
    const onData = jest.fn()
    presenceStream.on('data', onData)

    clock.tick((ttl - 1) * 1000 + 1)

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
    loadPresence.mockResolvedValueOnce([])
    clock.tick(999)
    await whenNextTick()
    expect(onData).toHaveBeenCalledTimes(0) // nothing to actually remove
})
