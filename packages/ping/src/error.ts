import { createError, isCustomError } from '@syncot/util'

export interface PingError extends Error {
    cause?: Error
    name: 'SyncOTError Ping'
}
export function createPingError(message?: string, cause?: Error): PingError {
    return createError({
        cause,
        message,
        name: 'SyncOTError Ping',
    }) as PingError
}
export function isPingError(error: any): error is PingError {
    return isCustomError(error) && error.name === 'SyncOTError Ping'
}
