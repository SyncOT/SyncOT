import { Presence } from '@syncot/presence'
import { delay, randomInteger, whenClose, whenError } from '@syncot/util'
import Redis from 'ioredis'
import RedisServer from 'redis-server'
import {
    connectionPrefix,
    connectionsKey,
    defineRedisCommands,
    PresenceCommands,
    sessionPrefix,
} from './commands'
import { extractConnectionIds } from './connection'
import { getRedisConnectionManager, RedisConnectionManager } from '.'

let port: number
let redisServer: RedisServer
let redisOptions: Redis.RedisOptions
let redis1: Redis.Redis & PresenceCommands
let redis2: Redis.Redis & PresenceCommands
let redis3: Redis.Redis & PresenceCommands

const presence1: Presence = {
    data: { key: 'value-1' },
    lastModified: 1,
    locationId: 'test-location-1',
    sessionId: 'test-session-1',
    userId: 'test-user-1',
}
const presence2: Presence = {
    data: { key: 'value-2' },
    lastModified: 2,
    locationId: 'test-location-2',
    sessionId: 'test-session-2',
    userId: 'test-user-2',
}
const presence3: Presence = {
    data: { key: 'value-3' },
    lastModified: 3,
    locationId: 'test-location-3',
    sessionId: 'test-session-3',
    userId: 'test-user-3',
}

async function updatePresence(
    presence: Presence,
    connectionId: number,
): Promise<void> {
    await redis2.presenceUpdate(
        presence.sessionId,
        presence.userId,
        presence.locationId,
        JSON.stringify(presence.data),
        connectionId,
    )
}

async function assertPresenceExists(
    presence: Presence,
    exists: boolean,
): Promise<void> {
    const expected = exists ? 1 : 0
    await expect(
        redis2.exists(sessionPrefix + presence.sessionId),
    ).resolves.toBe(expected)
}

const whenConnectionId = async (manager: RedisConnectionManager) =>
    new Promise((resolve) => manager.once('connectionId', resolve))

beforeAll(async () => {
    let attempt = 1
    while (true) {
        try {
            port = randomInteger(0x400, 0x10000)
            redisServer = new RedisServer(port)
            await redisServer.open()
            redisOptions = {
                autoResubscribe: false,
                enableOfflineQueue: false,
                enableReadyCheck: true,
                lazyConnect: true,
                port,
                showFriendlyErrorStack: true,
            }
            return
        } catch (error) {
            if (attempt++ > 10) {
                throw error
            }
        }
    }
})

afterAll(async () => {
    if (redisServer) {
        await redisServer.close()
    }
})

beforeEach(() => {
    redis1 = defineRedisCommands(new Redis(redisOptions))
    redis2 = defineRedisCommands(new Redis(redisOptions))
    redis3 = defineRedisCommands(new Redis(redisOptions))
})

afterEach(async () => {
    redis1.disconnect()
    await whenClose(redis1)
    redis2.disconnect()
    await whenClose(redis2)
    await redis3.connect()
    await redis3.flushall()
    redis3.disconnect()
    await whenClose(redis3)
})

describe('extractConnectionIds', () => {
    test.each<[string, number[]]>([
        ['', []],
        ['id=5', [5]],
        [' id=5', [5]],
        ['id=5 ', [5]],
        ['id=567 ', [567]],
        [' id=5 ', [5]],
        ['id=5 id=6', [5]],
        ['id=5\nid=6', [5, 6]],
        ['id=5\nawd\n\nid=6\nasa', [5, 6]],
        ['id=5 dd adw a\n awd id=6 adw ad asd', [5, 6]],
        ['ID=5', []],
        ['id=x', []],
        ['id=', []],
        ['cid=5', []],
    ])('%#', (clientList, expectedResult) => {
        expect(extractConnectionIds(clientList)).toEqual(expectedResult)
    })
})

test('get the same connection manager for the same Redis client', () => {
    const manager = getRedisConnectionManager(redis1)
    expect(getRedisConnectionManager(redis1)).toBe(manager)
})

test('get a different connection manager for a different Redis client', () => {
    const manager = getRedisConnectionManager(redis1)
    expect(getRedisConnectionManager(redis2)).not.toBe(manager)
})

test('throw on enableOfflineQueue=true', () => {
    expect(() =>
        getRedisConnectionManager(
            new Redis({
                enableOfflineQueue: true,
                enableReadyCheck: true,
                lazyConnect: true,
            }),
        ),
    ).toThrow(
        expect.objectContaining({
            message: 'Redis must be configured with enableOfflineQueue=false.',
            name: 'SyncOtError Assert',
        }),
    )
})

test('throw on enableReadyCheck=false', () => {
    expect(() =>
        getRedisConnectionManager(
            new Redis({
                enableOfflineQueue: false,
                enableReadyCheck: false,
                lazyConnect: true,
            }),
        ),
    ).toThrow(
        expect.objectContaining({
            message: 'Redis must be configured with enableReadyCheck=true.',
            name: 'SyncOtError Assert',
        }),
    )
})

test('claim connection ID, when it does not exist yet', async () => {
    await redis1.connect()
    const connectionId = await redis1.client('id')
    await expect(redis1.hget(connectionsKey, connectionId)).resolves.toBe(null)
    const manager = getRedisConnectionManager(redis1)
    await whenConnectionId(manager)
    await expect(redis1.hget(connectionsKey, connectionId)).resolves.toBe('1')
})

test('claim connection ID, when it already exists', async () => {
    await redis1.connect()
    const connectionId = await redis1.client('id')
    await redis1.hset(connectionsKey, connectionId, '987')
    const manager = getRedisConnectionManager(redis1)
    await whenConnectionId(manager)
    await expect(redis1.hget(connectionsKey, connectionId)).resolves.toBe('988')
})

test('initially disconnected, no data to remove', async () => {
    const manager = getRedisConnectionManager(redis1)
    expect(manager.connectionId).toBeUndefined()
    await redis1.connect()
    await whenConnectionId(manager)
    expect(manager.connectionId).toBe(await redis1.client('id'))
})

test('initially connected, no data to remove', async () => {
    await redis1.connect()
    const manager = getRedisConnectionManager(redis1)
    expect(manager.connectionId).toBeUndefined()
    await whenConnectionId(manager)
    expect(manager.connectionId).toBe(await redis1.client('id'))
})

test('initially disconnected, remove old data', async () => {
    await redis2.connect()
    const connectionId2: number = await redis2.client('id')
    const connectionId1: number = connectionId2 + 1
    await updatePresence(presence1, connectionId2)
    await updatePresence(presence2, connectionId1)
    await updatePresence(presence3, connectionId1)

    const manager = getRedisConnectionManager(redis1)
    expect(manager.connectionId).toBeUndefined()
    await redis1.connect()
    await whenConnectionId(manager)
    expect(manager.connectionId).toBe(connectionId1)
    expect(connectionId1).toBe(await redis1.client('id'))
    await assertPresenceExists(presence1, true)
    await assertPresenceExists(presence2, false)
    await assertPresenceExists(presence3, false)
})

test('initially connected, remove old data', async () => {
    await redis2.connect()
    await redis1.connect()
    const connectionId2: number = await redis2.client('id')
    const connectionId1: number = await redis1.client('id')
    await updatePresence(presence1, connectionId2)
    await updatePresence(presence2, connectionId1)
    await updatePresence(presence3, connectionId1)

    const manager = getRedisConnectionManager(redis1)
    expect(manager.connectionId).toBeUndefined()
    await whenConnectionId(manager)
    expect(manager.connectionId).toBe(connectionId1)
    await assertPresenceExists(presence1, true)
    await assertPresenceExists(presence2, false)
    await assertPresenceExists(presence3, false)
})

test('connectionId set and cleared after connect and disconnect', async () => {
    const manager = getRedisConnectionManager(redis1)

    await redis1.connect()
    await whenConnectionId(manager)
    expect(manager.connectionId).toBe(await redis1.client('id'))

    redis1.disconnect()
    await whenClose(redis1)
    expect(manager.connectionId).toBeUndefined()

    await redis1.connect()
    await whenConnectionId(manager)
    expect(manager.connectionId).toBe(await redis1.client('id'))
})

test('disconnect while initializing', async () => {
    const manager = getRedisConnectionManager(redis1)
    const onConnectionId = jest.fn()
    manager.on('connectionId', onConnectionId)
    await redis1.connect()
    redis1.disconnect() // ConnectionManager is still initializing now.
    await whenConnectionId(manager)
    expect(manager.connectionId).toBeUndefined()
    await delay(10)
    expect(onConnectionId).toHaveBeenCalledTimes(1)

    await redis1.connect()
    await whenConnectionId(manager)
    expect(manager.connectionId).toBe(await redis1.client('id'))
})

test('invalid data to remove', async () => {
    await redis1.connect()
    await redis1.set(
        connectionPrefix + (await redis1.client('id')),
        'invalid-value-type',
    )
    const manager = getRedisConnectionManager(redis1)
    const onError = jest.fn()
    manager.once('error', onError)
    await whenError(manager)
    expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
            cause: expect.objectContaining({
                message: expect.stringContaining('ERR Error running script'),
                name: 'ReplyError',
            }),
            message: expect.stringContaining(
                'Failed to initialize connectionId. => ReplyError: ERR Error running script',
            ),
            name: 'SyncOtError Presence',
        }),
    )
    expect(manager.connectionId).toBeUndefined()
})

test('remove dangling presence in constructor', async () => {
    // Set up.
    await redis1.connect()
    await redis2.connect()
    const connectionId1: number = await redis1.client('id')
    const connectionId2: number = await redis2.client('id')
    const manager1 = getRedisConnectionManager(redis1)
    await whenConnectionId(manager1)
    await updatePresence(presence1, connectionId2)
    await updatePresence(presence2, connectionId1)
    await updatePresence(presence3, connectionId1)
    redis1.disconnect()
    await whenClose(redis1)
    // Check that manager2 removes the data.
    const manager2 = getRedisConnectionManager(redis2)
    await whenConnectionId(manager2)
    await assertPresenceExists(presence1, false)
    await assertPresenceExists(presence2, false)
    await assertPresenceExists(presence3, false)
    await redis1.connect()
})

test('remove dangling presence on reconnect', async () => {
    // Set up.
    await redis1.connect()
    await redis2.connect()
    const connectionId1: number = await redis1.client('id')
    const connectionId2: number = await redis2.client('id')
    const manager1 = getRedisConnectionManager(redis1)
    const manager2 = getRedisConnectionManager(redis2)
    await Promise.all([whenConnectionId(manager1), whenConnectionId(manager2)])
    await updatePresence(presence1, connectionId2)
    await updatePresence(presence2, connectionId1)
    await updatePresence(presence3, connectionId1)
    redis1.disconnect()
    redis2.disconnect()
    await Promise.all([whenClose(redis1), whenClose(redis2)])
    // Check that manager2 removes the data.
    redis2.connect()
    await whenConnectionId(manager2)
    await assertPresenceExists(presence1, false)
    await assertPresenceExists(presence2, false)
    await assertPresenceExists(presence3, false)
    await redis1.connect()
})

test('remove dangling presence on timeout', async () => {
    // Set up.
    await redis1.connect()
    await redis2.connect()
    const connectionId1: number = await redis1.client('id')
    const connectionId2: number = await redis2.client('id')
    const manager1 = getRedisConnectionManager(redis1)
    const manager2 = getRedisConnectionManager(redis2)
    await Promise.all([whenConnectionId(manager1), whenConnectionId(manager2)])
    await updatePresence(presence1, connectionId2)
    await updatePresence(presence2, connectionId1)
    await updatePresence(presence3, connectionId1)
    redis1.disconnect()
    await whenClose(redis1)
    // Check that manager2 removes the data.
    await delay(manager2.pruningInterval)
    await assertPresenceExists(presence1, true)
    await assertPresenceExists(presence2, false)
    await assertPresenceExists(presence3, false)
    await redis1.connect()
})

test('remove dangling presence error - incorrect data type', async () => {
    await redis1.connect()
    await redis2.connect()
    await redis2.set(connectionsKey, 'invalid-value')
    const manager = getRedisConnectionManager(redis2)
    const onError = jest.fn()
    manager.on('error', onError)
    await whenError(manager)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
            cause: expect.objectContaining({
                message:
                    'WRONGTYPE Operation against a key holding the wrong kind of value',
                name: 'ReplyError',
            }),
            message:
                'Failed to prune dangling data. => ReplyError: WRONGTYPE Operation against a key holding the wrong kind of value',
            name: 'SyncOtError Presence',
        }),
    )
})
