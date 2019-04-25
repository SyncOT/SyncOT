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
    await new Promise(resolve => process.nextTick(resolve))
    expect(onClose).not.toHaveBeenCalled()
})

test('end', async () => {
    const onClose = jest.fn()
    expect(loadPresence).toHaveBeenCalledTimes(1)
    expect(clock.countTimers()).toBe(1)
    presenceStream.on('close', onClose)
    presenceStream.end()
    await new Promise(resolve => process.nextTick(resolve))
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
    await new Promise(resolve => process.nextTick(resolve))
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
    await new Promise(resolve => process.nextTick(resolve))
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(testErrorMatcher)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledAfter(onError)
})

describe('loadPresence', () => {
    test('scheduling', () => {
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
    test('error handling', async () => {
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
})
