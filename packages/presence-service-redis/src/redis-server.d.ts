declare module 'redis-server'

declare class RedisServer {
    constructor(port?: number)
    open(): Promise<void>
    close(): Promise<void>
}
