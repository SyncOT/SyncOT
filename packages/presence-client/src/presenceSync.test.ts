import { SyncOtEmitter } from '@syncot/events'
import {
    Presence,
    PresenceClient,
    PresenceClientEvents,
} from '@syncot/presence'
import { invertedStreams } from '@syncot/stream'
import { whenNextTick } from '@syncot/util'
import { Duplex } from 'readable-stream'
import {
    PresenceSync,
    syncPresenceByCurrentLocationId,
    syncPresenceByLocationId,
    syncPresenceBySessionId,
    syncPresenceByUserId,
} from '.'

const sessionId = 'test-session-id'
const userId = 'test-session-id'
const locationId = 'test-session-id'
const data = null
const presenceList: Presence[] = Array.from({ length: 5 }, (_, index) => ({
    data: { index },
    lastModified: index,
    locationId: `${sessionId}-${index}`,
    sessionId: `${sessionId}-${index}`,
    userId: `${sessionId}-${index}`,
}))
const sessionIdList: string[] = presenceList.map(presence => presence.sessionId)
const pairList: [string, Presence][] = presenceList.map(presence => [
    presence.sessionId,
    presence,
])
const invalidPresenceClientMatcher = expect.objectContaining({
    message:
        'Argument "presenceClient" must be a non-destroyed PresenceClient.',
    name: 'SyncOtError Assert',
})
const invalidLocationIdMatcher = expect.objectContaining({
    message: 'Argument "locationId" must be a string.',
    name: 'SyncOtError Assert',
})
const invalidSessionIdMatcher = expect.objectContaining({
    message: 'Argument "sessionId" must be a string.',
    name: 'SyncOtError Assert',
})
const invalidUserIdMatcher = expect.objectContaining({
    message: 'Argument "userId" must be a string.',
    name: 'SyncOtError Assert',
})
let presenceClient: MockPresenceClient
let presenceStream: Duplex
let controllerStream: Duplex
async function createPresenceStream(_id: string): Promise<Duplex> {
    ;[presenceStream, controllerStream] = invertedStreams({ objectMode: true })
    return presenceStream
}
const testError = new Error('test error')
const testErrorMatcher = expect.objectContaining({
    message: 'test error',
    name: 'Error',
})

class MockPresenceClient extends SyncOtEmitter<PresenceClientEvents>
    implements PresenceClient {
    public sessionId: string | undefined = sessionId
    public userId: string | undefined = userId
    public locationId: string | undefined = locationId
    public data: any = data
    public active: boolean = true
    public presence: Presence | undefined = undefined
    public getPresenceBySessionId = jest.fn<
        Promise<Presence | null>,
        [string]
    >()
    public getPresenceByUserId = jest.fn<Promise<Presence[]>, [string]>()
    public getPresenceByLocationId = jest.fn<Promise<Presence[]>, [string]>()
    public streamPresenceBySessionId = jest.fn<Promise<Duplex>, [string]>(
        createPresenceStream,
    )
    public streamPresenceByUserId = jest.fn<Promise<Duplex>, [string]>(
        createPresenceStream,
    )
    public streamPresenceByLocationId = jest.fn<Promise<Duplex>, [string]>(
        createPresenceStream,
    )
}

beforeEach(() => {
    presenceClient = new MockPresenceClient()
})

describe('init', () => {
    describe('syncPresenceByCurrentLocationId', () => {
        test('invalid presenceClient (missing)', () => {
            expect(() =>
                syncPresenceByCurrentLocationId(undefined as any),
            ).toThrow(invalidPresenceClientMatcher)
        })
        test('invalid presenceClient (destroyed)', () => {
            presenceClient.destroy()
            expect(() =>
                syncPresenceByCurrentLocationId(presenceClient),
            ).toThrow(invalidPresenceClientMatcher)
        })
        test('destroy on presenceClient destroy', async () => {
            const sync = syncPresenceByCurrentLocationId(presenceClient)
            presenceClient.destroy()
            await new Promise(resolve => sync.once('destroy', resolve))
        })
        test('destroy twice - no errors', async () => {
            const sync = syncPresenceByCurrentLocationId(presenceClient)
            sync.destroy()
            sync.destroy()
            await new Promise(resolve => sync.once('destroy', resolve))
        })
    })

    describe('syncPresenceByLocationId', () => {
        test('invalid presenceClient (missing)', () => {
            expect(() =>
                syncPresenceByLocationId(undefined as any, ''),
            ).toThrow(invalidPresenceClientMatcher)
        })
        test('invalid presenceClient (destroyed)', () => {
            presenceClient.destroy()
            expect(() => syncPresenceByLocationId(presenceClient, '')).toThrow(
                invalidPresenceClientMatcher,
            )
        })
        test('invalid locationId', () => {
            expect(() =>
                syncPresenceByLocationId(presenceClient, undefined as any),
            ).toThrow(invalidLocationIdMatcher)
        })
        test('destroy on presenceClient destroy', async () => {
            const sync = syncPresenceByLocationId(presenceClient, '')
            presenceClient.destroy()
            await new Promise(resolve => sync.once('destroy', resolve))
        })
        test('destroy twice - no errors', async () => {
            const sync = syncPresenceByLocationId(presenceClient, locationId)
            sync.destroy()
            sync.destroy()
            await new Promise(resolve => sync.once('destroy', resolve))
        })
    })

    describe('syncPresenceBySessionId', () => {
        test('invalid presenceClient (missing)', () => {
            expect(() => syncPresenceBySessionId(undefined as any, '')).toThrow(
                invalidPresenceClientMatcher,
            )
        })
        test('invalid presenceClient (destroyed)', () => {
            presenceClient.destroy()
            expect(() => syncPresenceBySessionId(presenceClient, '')).toThrow(
                invalidPresenceClientMatcher,
            )
        })
        test('invalid sessionId', () => {
            expect(() =>
                syncPresenceBySessionId(presenceClient, undefined as any),
            ).toThrow(invalidSessionIdMatcher)
        })
        test('destroy on presenceClient destroy', async () => {
            const sync = syncPresenceBySessionId(presenceClient, '')
            presenceClient.destroy()
            await new Promise(resolve => sync.once('destroy', resolve))
        })
        test('destroy twice - no errors', async () => {
            const sync = syncPresenceBySessionId(presenceClient, sessionId)
            sync.destroy()
            sync.destroy()
            await new Promise(resolve => sync.once('destroy', resolve))
        })
    })

    describe('syncPresenceByUserId', () => {
        test('invalid presenceClient (missing)', () => {
            expect(() => syncPresenceByUserId(undefined as any, '')).toThrow(
                invalidPresenceClientMatcher,
            )
        })
        test('invalid presenceClient (destroyed)', () => {
            presenceClient.destroy()
            expect(() => syncPresenceByUserId(presenceClient, '')).toThrow(
                invalidPresenceClientMatcher,
            )
        })
        test('invalid userId', () => {
            expect(() =>
                syncPresenceByUserId(presenceClient, undefined as any),
            ).toThrow(invalidUserIdMatcher)
        })
        test('destroy on presenceClient destroy', async () => {
            const sync = syncPresenceByUserId(presenceClient, '')
            presenceClient.destroy()
            await new Promise(resolve => sync.once('destroy', resolve))
        })
        test('destroy twice - no errors', async () => {
            const sync = syncPresenceByUserId(presenceClient, userId)
            sync.destroy()
            sync.destroy()
            await new Promise(resolve => sync.once('destroy', resolve))
        })
    })
})

describe('sync', () => {
    describe.each<
        [
            (presenceClient: PresenceClient, id: string) => PresenceSync,
            keyof PresenceClient,
            string,
        ]
    >([
        [syncPresenceByLocationId, 'streamPresenceByLocationId', locationId],
        [
            syncPresenceByCurrentLocationId,
            'streamPresenceByLocationId',
            locationId,
        ],
        [syncPresenceBySessionId, 'streamPresenceBySessionId', sessionId],
        [syncPresenceByUserId, 'streamPresenceByUserId', userId],
    ])('%p', (syncPresence, streamName, id) => {
        test('initial sync', async () => {
            const onChange = jest.fn()
            const presenceSync = syncPresence(presenceClient, id)
            presenceSync.on('change', onChange)
            expect(presenceClient[streamName]).toHaveBeenCalledTimes(1)
            expect(presenceClient[streamName]).toHaveBeenCalledWith(id)

            // Add presence 0, 1, 2, 3, 4.
            controllerStream.write([true as any].concat(presenceList))
            await whenNextTick()
            expect(onChange).toHaveBeenCalledTimes(5)
            for (const presence of presenceList) {
                expect(onChange).toHaveBeenCalledWith(presence.sessionId)
            }
            expect(presenceSync.presence).toEqual(new Map(pairList))

            // Remove presence 3, 4.
            onChange.mockClear()
            controllerStream.write(
                [false as any].concat(sessionIdList.slice(3)),
            )
            await whenNextTick()
            expect(onChange).toHaveBeenCalledTimes(2)
            for (const removedSessionId of sessionIdList.slice(3)) {
                expect(onChange).toHaveBeenCalledWith(removedSessionId)
            }
            expect(presenceSync.presence).toEqual(new Map(pairList.slice(0, 3)))

            // Add presence 2, 3.
            onChange.mockClear()
            controllerStream.write(
                [true as any].concat(presenceList.slice(2, 4)),
            )
            await whenNextTick()
            expect(onChange).toHaveBeenCalledTimes(2)
            for (const presence of presenceList.slice(2, 4)) {
                expect(onChange).toHaveBeenCalledWith(presence.sessionId)
            }
            expect(presenceSync.presence).toEqual(new Map(pairList.slice(0, 4)))

            // Remove presence 0, 1, 2, 3, 4, 5.
            onChange.mockClear()
            controllerStream.write([false as any].concat(sessionIdList))
            await whenNextTick()
            expect(onChange).toHaveBeenCalledTimes(5)
            for (const removedSessionId of sessionIdList) {
                expect(onChange).toHaveBeenCalledWith(removedSessionId)
            }
            expect(presenceSync.presence).toEqual(new Map())
        })

        test('recreate stream', async () => {
            const onChange = jest.fn()
            const presenceSync = syncPresence(presenceClient, id)
            presenceSync.on('change', onChange)
            expect(presenceClient[streamName]).toHaveBeenCalledTimes(1)

            // Add some data.
            controllerStream.write([true as any].concat(presenceList))
            await whenNextTick()
            expect(onChange).toHaveBeenCalledTimes(5)
            expect(presenceSync.presence).toEqual(new Map(pairList))

            // Destroying the stream removes all data.
            onChange.mockClear()
            presenceClient[streamName].mockClear()
            controllerStream.destroy()
            await whenNextTick()
            expect(presenceClient[streamName]).toHaveBeenCalledTimes(1)
            expect(onChange).toHaveBeenCalledTimes(5)
            expect(presenceSync.presence).toEqual(new Map())

            // Add some data to the new stream.
            onChange.mockClear()
            controllerStream.write([true as any].concat(presenceList))
            await whenNextTick()
            expect(onChange).toHaveBeenCalledTimes(5)
            expect(presenceSync.presence).toEqual(new Map(pairList))
        })

        test('recreate stream once presenceClient gets active', async () => {
            const onChange = jest.fn()
            const presenceSync = syncPresence(presenceClient, id)
            presenceSync.on('change', onChange)
            expect(presenceClient[streamName]).toHaveBeenCalledTimes(1)

            // Add some data.
            controllerStream.write([true as any].concat(presenceList))
            await whenNextTick()
            expect(onChange).toHaveBeenCalledTimes(5)
            expect(presenceSync.presence).toEqual(new Map(pairList))

            // Simulate a disconnection.
            onChange.mockClear()
            presenceClient[streamName].mockClear()
            presenceClient.active = false
            controllerStream.destroy()
            await whenNextTick()
            expect(presenceClient[streamName]).toHaveBeenCalledTimes(0)
            expect(onChange).toHaveBeenCalledTimes(5)
            expect(presenceSync.presence).toEqual(new Map())

            // Simulate reconnection.
            presenceClient.active = true
            presenceClient.emit('active')
            await whenNextTick()
            expect(presenceClient[streamName]).toHaveBeenCalledTimes(1)

            // Add some data to the new stream.
            onChange.mockClear()
            controllerStream.write([true as any].concat(presenceList))
            await whenNextTick()
            expect(onChange).toHaveBeenCalledTimes(5)
            expect(presenceSync.presence).toEqual(new Map(pairList))
        })

        test('destroy stream on presenceSync destroy', async () => {
            const onClose = jest.fn()
            const presenceSync = syncPresence(presenceClient, id)
            await whenNextTick()
            controllerStream.on('close', onClose)
            presenceSync.destroy()
            await whenNextTick()
            expect(onClose).toHaveBeenCalledTimes(1)
        })

        test('forwards stream errors', async () => {
            const onError = jest.fn()
            const presenceSync = syncPresence(presenceClient, id)
            await whenNextTick()
            presenceSync.on('error', onError)
            presenceStream.emit('error', testError)
            await whenNextTick()
            expect(onError).toHaveBeenCalledTimes(1)
            expect(onError).toHaveBeenCalledWith(testErrorMatcher)
        })

        test('presence event - locationId changed', async () => {
            const onChange = jest.fn()
            const presenceSync = syncPresence(presenceClient, id)
            presenceSync.on('change', onChange)
            expect(presenceClient[streamName]).toHaveBeenCalledTimes(1)

            // Add some data.
            controllerStream.write([true as any].concat(presenceList))
            await whenNextTick()
            expect(onChange).toHaveBeenCalledTimes(5)
            expect(presenceSync.presence).toEqual(new Map(pairList))

            // Emulate presenceClient.locationId change.
            // syncPresenceByCurrentLocationId handles it but
            // the other functions ignore it.
            const differentLocationId = 'different-location-id'
            onChange.mockClear()
            presenceClient[streamName].mockClear()
            presenceClient.locationId = differentLocationId
            presenceClient.emit('presence')
            await whenNextTick()
            if (syncPresence !== syncPresenceByCurrentLocationId) {
                expect(onChange).toHaveBeenCalledTimes(0)
                return
            }

            // A new stream has been created.
            expect(presenceClient[streamName]).toHaveBeenCalledTimes(1)
            expect(presenceClient[streamName]).toHaveBeenCalledWith(
                differentLocationId,
            )
            expect(onChange).toHaveBeenCalledTimes(5)
            expect(presenceSync.presence).toEqual(new Map())

            // Add some data to the new stream.
            onChange.mockClear()
            controllerStream.write([true as any].concat(presenceList))
            await whenNextTick()
            expect(onChange).toHaveBeenCalledTimes(5)
            expect(presenceSync.presence).toEqual(new Map(pairList))
        })

        test('presence event - locationId not changed', async () => {
            const onChange = jest.fn()
            const presenceSync = syncPresence(presenceClient, id)
            presenceSync.on('change', onChange)
            expect(presenceClient[streamName]).toHaveBeenCalledTimes(1)

            // Add some data.
            controllerStream.write([true as any].concat(presenceList))
            await whenNextTick()
            expect(onChange).toHaveBeenCalledTimes(5)
            expect(presenceSync.presence).toEqual(new Map(pairList))

            // Emulate presenceClient.data change.
            // All functions ignore it.
            onChange.mockClear()
            presenceClient[streamName].mockClear()
            presenceClient.data = 'different data'
            presenceClient.emit('presence')
            await whenNextTick()
            expect(onChange).toHaveBeenCalledTimes(0)
        })

        if (syncPresence === syncPresenceByCurrentLocationId) {
            test('currentLocationId === undefined', async () => {
                presenceClient.locationId = undefined
                const presenceSync = syncPresence(presenceClient, id)
                await whenNextTick()
                expect(presenceClient[streamName]).toHaveBeenCalledTimes(0)
                expect(presenceSync.presence).toEqual(new Map())
            })
        }

        test('create streams concurrently', async () => {
            const onChange = jest.fn()
            const presenceSync = syncPresence(presenceClient, id)
            presenceSync.on('change', onChange)
            expect(presenceClient[streamName]).toHaveBeenCalledTimes(1)
            const controllerStream1 = controllerStream

            presenceClient[streamName].mockClear()
            presenceClient.emit('active')
            const controllerStream2 = controllerStream
            presenceClient.emit('active')
            const controllerStream3 = controllerStream
            expect(presenceClient[streamName]).toHaveBeenCalledTimes(2)
            expect(controllerStream1).not.toBe(controllerStream2)
            expect(controllerStream1).not.toBe(controllerStream3)
            expect(controllerStream2).not.toBe(controllerStream3)

            await whenNextTick()
            expect(controllerStream1.destroyed).toBeTrue()
            expect(controllerStream2.destroyed).toBeTrue()
            expect(controllerStream3.destroyed).toBeFalse()

            // Add some data.
            controllerStream.write([true as any].concat(presenceList))
            await whenNextTick()
            expect(onChange).toHaveBeenCalledTimes(5)
            expect(presenceSync.presence).toEqual(new Map(pairList))
        })

        test('stream creation error', async () => {
            const onError = jest.fn()
            presenceClient[streamName].mockRejectedValue(testError)
            const presenceSync = syncPresence(presenceClient, id)
            presenceSync.on('error', onError)
            await whenNextTick()
            expect(onError).toHaveBeenCalledTimes(1)
            expect(onError).toHaveBeenCalledWith(testErrorMatcher)
        })

        test('create streams concurrently with errors', async () => {
            const onError = jest.fn()
            presenceClient[streamName].mockRejectedValue(testError)
            const presenceSync = syncPresence(presenceClient, id)
            presenceSync.on('error', onError)
            presenceClient.emit('active')
            presenceClient.emit('active')
            expect(presenceClient[streamName]).toHaveBeenCalledTimes(3)
            await whenNextTick()
            expect(onError).toHaveBeenCalledTimes(1)
            expect(onError).toHaveBeenCalledWith(testErrorMatcher)
        })

        test('create a stream when one is already open', async () => {
            const onChange = jest.fn()
            const onClose = jest.fn()
            const presenceSync = syncPresence(presenceClient, id)
            presenceSync.on('change', onChange)
            expect(presenceClient[streamName]).toHaveBeenCalledTimes(1)

            // Add some data.
            controllerStream.write([true as any].concat(presenceList))
            await whenNextTick()
            expect(onChange).toHaveBeenCalledTimes(5)
            expect(presenceSync.presence).toEqual(new Map(pairList))

            // Trigger stream creation.
            onChange.mockClear()
            presenceClient[streamName].mockClear()
            controllerStream.on('close', onClose)
            presenceClient.emit('active')
            expect(presenceClient[streamName]).toHaveBeenCalledTimes(0)
            await whenNextTick()
            expect(onClose).toHaveBeenCalledTimes(1)
            expect(presenceClient[streamName]).toHaveBeenCalledTimes(1)
            expect(onChange).toHaveBeenCalledTimes(5)
            expect(presenceSync.presence).toEqual(new Map())

            // Add some data to the new stream.
            onChange.mockClear()
            controllerStream.write([true as any].concat(presenceList))
            await whenNextTick()
            expect(onChange).toHaveBeenCalledTimes(5)
            expect(presenceSync.presence).toEqual(new Map(pairList))
        })
    })
})
