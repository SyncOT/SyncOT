import { PresenceService } from '@syncot/presence'
import { RedisPresenceService } from './redisPresenceService'
import { PresenceServiceConfig, PresenceServiceOptions } from './types'

/**
 * Creates a new presence service based on Redis and communicating with a presence client
 * through the specified `connection`.
 * The `sessionService` and `authService` are used for authentication and authorization.
 * `redis` is used for storage and publishing events.
 * `redisSubscriber` is used for subscribing to events.
 *
 * `redis` and `redisSubscriber` must:
 *
 * - be different Redis client instances
 * - connected to the same single Redis server
 * - configured with the following options:
 *   - dropBufferSupport: false (the same as default)
 *   - autoResubscribe: true (the same as default)
 *
 * The service [defines some commands](https://github.com/luin/ioredis/#lua-scripting)
 * on `redis` with names starting with `presence`.
 */
export function createPresenceService(
    {
        connection,
        sessionService,
        authService,
        redis,
        redisSubscriber,
    }: PresenceServiceConfig,
    options: PresenceServiceOptions = {},
): PresenceService {
    return new RedisPresenceService(
        connection,
        sessionService,
        authService,
        redis,
        redisSubscriber,
        options,
    )
}
