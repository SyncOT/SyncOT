import { AuthService } from '@syncot/auth'
import { Connection } from '@syncot/connection'
import Redis from 'ioredis'

/**
 * The fields in order are: sessionId, userId, locationId, data, lastModified.
 */
export type EncodedPresence = [Buffer, Buffer, Buffer, Buffer, Buffer]

export interface PresenceServiceConfig {
    connection: Connection
    authService: AuthService
    redis: Redis.Redis
    redisSubscriber: Redis.Redis
}

export interface PresenceServiceOptions {
    /**
     * The time in seconds after which presence data will expire, unless refreshed.
     * PresenceService automatically refreshes the presence data one second before it expires.
     * The ttl ensures the data is eventually removed in case the PresenceService
     * cannot remove it for any reason when necessary.
     *
     * Defaults to 60 seconds. Min value is 10 seconds. The smaller the ttl,
     * the more frequently the presence data needs to be refreshed, which may negatively
     * impact the performance.
     *
     * The ttl should be set to the same value for all PresenceService instances connecting
     * to the same Redis server to ensure predictable behavior.
     */
    ttl?: number

    /**
     * The maximum size of the `tson` encoded presence data in bytes.
     * Defaults to 1024. Min value is 9 - the size of the smallest valid presence object.
     */
    presenceSizeLimit?: number
}
