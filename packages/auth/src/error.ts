import { createError, isCustomError } from '@syncot/error'

export interface AuthError extends Error {
    cause?: Error
    name: 'SyncOTError Auth'
}
export function createAuthError(message?: string, cause?: Error): AuthError {
    return createError({
        cause,
        message,
        name: 'SyncOTError Auth',
    }) as AuthError
}
export function isAuthError(error: any): error is AuthError {
    return isCustomError(error) && error.name === 'SyncOTError Auth'
}
