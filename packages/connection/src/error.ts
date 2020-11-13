import { createError, isCustomError } from '@syncot/error'

export interface NoServiceError extends Error {
    name: 'SyncOTError NoService'
}
export function createNoServiceError(message?: string): NoServiceError {
    return createError({
        message,
        name: 'SyncOTError NoService',
    }) as NoServiceError
}
export function isNoServiceError(error: any): error is NoServiceError {
    return isCustomError(error) && error.name === 'SyncOTError NoService'
}
