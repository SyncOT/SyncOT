import { createError, isCustomError } from '@syncot/util'

export interface TSONSocketError extends Error {
    cause?: Error
    name: 'SyncOTError TSONSocket'
}
export function createTSONSocketError(
    message?: string,
    cause?: Error,
): TSONSocketError {
    return createError({
        cause,
        message,
        name: 'SyncOTError TSONSocket',
    }) as TSONSocketError
}
export function isTSONSocketError(error: any): error is TSONSocketError {
    return isCustomError(error) && error.name === 'SyncOTError TSONSocket'
}
