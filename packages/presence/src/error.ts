import { createError, isCustomError } from '@syncot/error'

export interface PresenceError extends Error {
    cause?: Error
    name: 'SyncOTError Presence'
}
export function createPresenceError(
    message?: string,
    cause?: Error,
): PresenceError {
    return createError({
        cause,
        message,
        name: 'SyncOTError Presence',
    }) as PresenceError
}
export function isPresenceError(error: any): error is PresenceError {
    return isCustomError(error) && error.name === 'SyncOTError Presence'
}
