import { createError, isCustomError } from '@syncot/error'

export interface TsonError extends Error {
    name: 'SyncOTError TSON'
}
export function createTsonError(message?: string): TsonError {
    return createError({
        message,
        name: 'SyncOTError TSON',
    }) as TsonError
}
export function isTsonError(error: any): error is TsonError {
    return isCustomError(error) && error.name === 'SyncOTError TSON'
}
