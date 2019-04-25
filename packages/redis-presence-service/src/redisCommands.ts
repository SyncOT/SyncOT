import Redis from 'ioredis'
import { EncodedPresence } from './types'

export interface PresenceCommands {
    presenceUpdate(
        sessionId: Buffer,
        userId: Buffer,
        locationId: Buffer,
        data: Buffer,
        lastModified: Buffer,
        ttl: number,
        modified: 0 | 1,
    ): Promise<void>
    presenceDelete(sessionId: Buffer): Promise<void>
    presenceGetBySessionIdBuffer(sessionId: Buffer): Promise<EncodedPresence>
    presenceGetByUserIdBuffer(userId: Buffer): Promise<EncodedPresence[]>
    presenceGetByLocationIdBuffer(
        locationId: Buffer,
    ): Promise<EncodedPresence[]>
}

const presenceUpdate = `
local sessionId = ARGV[1]
local userId = ARGV[2]
local locationId = ARGV[3]
local data = ARGV[4]
local lastModified = ARGV[5]
local ttl = tonumber(ARGV[6])
local modified = ARGV[7] == '1'

local presencePrefix = 'presence:sessionId='
local userPrefix = 'presence:userId='
local locationPrefix = 'presence:locationId='

local presenceKey = presencePrefix..sessionId
local userKey = userPrefix..userId
local locationKey = locationPrefix..locationId

-- Try to refresh the existing data only.
if (
    not modified and
    redis.call('expire', presenceKey, ttl) == 1 and
    redis.call('expire', userKey, ttl) == 1 and
    redis.call('expire', locationKey, ttl) == 1
)
then
    return redis.status_reply('OK')
end

-- Remove old indexes.
local oldPresence = redis.call('hmget', presenceKey, 'userId', 'locationId')
local oldUserId = oldPresence[1]
local oldLocationId = oldPresence[2]

if (oldUserId and oldUserId ~= userId)
then
    local oldUserKey = userPrefix..oldUserId
    redis.call('srem', oldUserKey, sessionId)
    redis.call('publish', oldUserKey, sessionId)
end

if (oldLocationId and oldLocationId ~= locationId)
then
    local oldLocationKey = locationPrefix..oldLocationId
    redis.call('srem', oldLocationKey, sessionId)
    redis.call('publish', oldLocationKey, sessionId)
end

-- Store the modified data.
redis.call('hmset', presenceKey,
    'userId', userId,
    'locationId', locationId,
    'data', data,
    'lastModified', lastModified
)
redis.call('expire', presenceKey, ttl)
redis.call('publish', presenceKey, sessionId)

redis.call('sadd', userKey, sessionId)
redis.call('expire', userKey, ttl)
redis.call('publish', userKey, sessionId)

redis.call('sadd', locationKey, sessionId)
redis.call('expire', locationKey, ttl)
redis.call('publish', locationKey, sessionId)

return redis.status_reply('OK')
`

const presenceDelete = `
local sessionId = ARGV[1]

local presencePrefix = 'presence:sessionId='
local userPrefix = 'presence:userId='
local locationPrefix = 'presence:locationId='

local presenceKey = presencePrefix..sessionId

local presence = redis.call('hmget', presenceKey, 'userId', 'locationId')
local userId = presence[1]
local locationId = presence[2]

if (userId)
then
    local userKey = userPrefix..userId
    redis.call('srem', userKey, sessionId)
    redis.call('publish', userKey, sessionId)
end

if (locationId)
then
    local locationKey = locationPrefix..locationId
    redis.call('srem', locationKey, sessionId)
    redis.call('publish', locationKey, sessionId)
end

redis.call('del', presenceKey)
redis.call('publish', presenceKey, sessionId)

return redis.status_reply('OK')
`

const presenceGetBySessionId = `
local sessionId = ARGV[1]
local presence = redis.call('hmget', 'presence:sessionId='..sessionId,
    'sessionId', 'userId', 'locationId', 'data', 'lastModified'
)
presence[1] = sessionId
return presence
`

const presenceGetByUserId = `
local userId = ARGV[1]
local list = redis.call('smembers', 'presence:userId='..userId)

for i = 1, #list
do
    local sessionId = list[i]
    local presence = redis.call('hmget', 'presence:sessionId='..sessionId,
        'sessionId', 'userId', 'locationId', 'data', 'lastModified'
    )
    presence[1] = sessionId
    list[i] = presence
end

return list
`

const presenceGetByLocationId = `
local locationId = ARGV[1]
local list = redis.call('smembers', 'presence:locationId='..locationId)

for i = 1, #list
do
    local sessionId = list[i]
    local presence = redis.call('hmget', 'presence:sessionId='..sessionId,
        'sessionId', 'userId', 'locationId', 'data', 'lastModified'
    )
    presence[1] = sessionId
    list[i] = presence
end

return list
`

export function defineRedisCommands(
    redis: Redis.Redis,
): Redis.Redis & PresenceCommands {
    if (!(redis as any).presenceUpdate) {
        redis.defineCommand('presenceUpdate', {
            lua: presenceUpdate,
            numberOfKeys: 0,
        })
    }

    if (!(redis as any).presenceDelete) {
        redis.defineCommand('presenceDelete', {
            lua: presenceDelete,
            numberOfKeys: 0,
        })
    }

    if (!(redis as any).presenceGetBySessionId) {
        redis.defineCommand('presenceGetBySessionId', {
            lua: presenceGetBySessionId,
            numberOfKeys: 0,
        })
    }

    if (!(redis as any).presenceGetByUserId) {
        redis.defineCommand('presenceGetByUserId', {
            lua: presenceGetByUserId,
            numberOfKeys: 0,
        })
    }

    if (!(redis as any).presenceGetByLocationId) {
        redis.defineCommand('presenceGetByLocationId', {
            lua: presenceGetByLocationId,
            numberOfKeys: 0,
        })
    }

    return redis as any
}
