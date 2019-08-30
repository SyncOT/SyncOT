import Redis from 'ioredis'

export const sessionPrefix = 'presence:sessionId='
export const userPrefix = 'presence:userId='
export const locationPrefix = 'presence:locationId='
export const connectionPrefix = 'presence:connectionId='
export const connectionsKey = 'connections'

/**
 * The fields in order are: sessionId, userId, locationId, data, lastModified.
 */
export type EncodedPresence = [Buffer, Buffer, Buffer, Buffer, Buffer]

export interface PresenceCommands {
    presenceUpdate(
        sessionId: Buffer,
        userId: Buffer,
        locationId: Buffer,
        data: Buffer,
        lastModified: Buffer,
        connectionId: number,
    ): Promise<void>
    presenceDelete(sessionId: Buffer): Promise<void>
    presenceDeleteByConnectionId(
        connectionId: number,
        lock?: number,
    ): Promise<number>
    presenceGetBySessionIdBuffer(sessionId: string): Promise<EncodedPresence>
    presenceGetByUserIdBuffer(userId: string): Promise<EncodedPresence[]>
    presenceGetByLocationIdBuffer(
        locationId: string,
    ): Promise<EncodedPresence[]>
}

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

    if (!(redis as any).presenceDeleteByConnectionId) {
        redis.defineCommand('presenceDeleteByConnectionId', {
            lua: presenceDeleteByConnectionId,
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

const presenceUpdate = `
local sessionId = ARGV[1]
local userId = ARGV[2]
local locationId = ARGV[3]
local data = ARGV[4]
local lastModified = ARGV[5]
local connectionId = ARGV[6]

local sessionKey = '${sessionPrefix}'..sessionId
local userKey = '${userPrefix}'..userId
local locationKey = '${locationPrefix}'..locationId
local connectionKey = '${connectionPrefix}'..connectionId

-- Remove old indexes.
local oldPresence = redis.call('hmget', sessionKey, 'userId', 'locationId', 'connectionId')
local oldUserId = oldPresence[1]
local oldLocationId = oldPresence[2]
local oldConnectionId = oldPresence[3]

if (oldConnectionId and oldConnectionId ~= connectionId)
then
    return redis.error_reply('connectionId mismatch')
end

if (oldUserId and oldUserId ~= userId)
then
    local oldUserKey = '${userPrefix}'..oldUserId
    redis.call('srem', oldUserKey, sessionId)
    redis.call('publish', oldUserKey, sessionId)
end

if (oldLocationId and oldLocationId ~= locationId)
then
    local oldLocationKey = '${locationPrefix}'..oldLocationId
    redis.call('srem', oldLocationKey, sessionId)
    redis.call('publish', oldLocationKey, sessionId)
end

-- Store the data.
redis.call('hmset', sessionKey,
    'userId', userId,
    'locationId', locationId,
    'data', data,
    'lastModified', lastModified,
    'connectionId', connectionId
)
redis.call('publish', sessionKey, sessionId)

redis.call('sadd', userKey, sessionId)
redis.call('publish', userKey, sessionId)

redis.call('sadd', locationKey, sessionId)
redis.call('publish', locationKey, sessionId)

redis.call('sadd', connectionKey, sessionId)

return redis.status_reply('OK')
`

// Requires a `sessionId` Lua variable.
const presenceDeleteMacro = `
local sessionKey = '${sessionPrefix}'..sessionId
local presence = redis.call('hmget', sessionKey, 'userId', 'locationId', 'connectionId')
local userId = presence[1]
local locationId = presence[2]
local connectionId = presence[3]

if (connectionId)
then
    local connectionKey = '${connectionPrefix}'..connectionId
    redis.call('srem', connectionKey, sessionId)
end

if (userId)
then
    local userKey = '${userPrefix}'..userId
    redis.call('srem', userKey, sessionId)
    redis.call('publish', userKey, sessionId)
end

if (locationId)
then
    local locationKey = '${locationPrefix}'..locationId
    redis.call('srem', locationKey, sessionId)
    redis.call('publish', locationKey, sessionId)
end

redis.call('del', sessionKey)
redis.call('publish', sessionKey, sessionId)
`

const presenceDelete = `
local sessionId = ARGV[1]
${presenceDeleteMacro}
return redis.status_reply('OK')
`

const presenceDeleteByConnectionId = `
local connectionId = ARGV[1]
local lock = ARGV[2]

if lock
then
    if lock ~= redis.call('hget', '${connectionsKey}', connectionId)
    then
        return '0'
    end
    redis.call('hdel', '${connectionsKey}', connectionId)
end

local sessionIds = redis.call('smembers', '${connectionPrefix}'..connectionId)

for i = 1, #sessionIds
do
    local sessionId = sessionIds[i]
    ${presenceDeleteMacro}
end

return '1'
`

const presenceGetBySessionId = `
local sessionId = ARGV[1]
local presence = redis.call('hmget', '${sessionPrefix}'..sessionId,
    'sessionId', 'userId', 'locationId', 'data', 'lastModified'
)
presence[1] = sessionId
return presence
`

const presenceGetByUserId = `
local userId = ARGV[1]
local list = redis.call('smembers', '${userPrefix}'..userId)

for i = 1, #list
do
    local sessionId = list[i]
    local presence = redis.call('hmget', '${sessionPrefix}'..sessionId,
        'sessionId', 'userId', 'locationId', 'data', 'lastModified'
    )
    presence[1] = sessionId
    list[i] = presence
end

return list
`

const presenceGetByLocationId = `
local locationId = ARGV[1]
local list = redis.call('smembers', '${locationPrefix}'..locationId)

for i = 1, #list
do
    local sessionId = list[i]
    local presence = redis.call('hmget', '${sessionPrefix}'..sessionId,
        'sessionId', 'userId', 'locationId', 'data', 'lastModified'
    )
    presence[1] = sessionId
    list[i] = presence
end

return list
`
