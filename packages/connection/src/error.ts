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

export interface DuplicateIdError extends Error {
    name: 'SyncOTError DuplicateId'
}
export function createDuplicateIdError(message?: string): DuplicateIdError {
    return createError({
        message,
        name: 'SyncOTError DuplicateId',
    }) as DuplicateIdError
}
export function isDuplicateIdError(error: any): error is DuplicateIdError {
    return isCustomError(error) && error.name === 'SyncOTError DuplicateId'
}

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
