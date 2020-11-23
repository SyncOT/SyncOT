import { createError, isCustomError } from '@syncot/util'

export interface DisconnectedError extends Error {
    name: 'SyncOTError Disconnected'
}
export function createDisconnectedError(message?: string): DisconnectedError {
    return createError({
        message,
        name: 'SyncOTError Disconnected',
    }) as DisconnectedError
}
export function isDisconnectedError(error: any): error is DisconnectedError {
    return isCustomError(error) && error.name === 'SyncOTError Disconnected'
}
