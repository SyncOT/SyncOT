import { createError, isCustomError } from '@syncot/util'

export interface SocketError extends Error {
    cause?: Error
    name: 'SyncOTError Socket'
}
export function createSocketError(
    message?: string,
    cause?: Error,
): SocketError {
    return createError({
        cause,
        message,
        name: 'SyncOTError Socket',
    }) as SocketError
}
export function isSocketError(error: any): error is SocketError {
    return isCustomError(error) && error.name === 'SyncOTError Socket'
}
