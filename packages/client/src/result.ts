import { SyncOtError } from './error'

export interface Ok<T> {
    error?: undefined
    value: T
}
export interface Err {
    error: SyncOtError
    value?: undefined
}
export type Result<T> = Ok<T> | Err

export function ok<T>(value: T): Ok<T> {
    return { value }
}

export function err(error: SyncOtError): Err {
    return { error }
}

export function isOk<T>(result: Result<T>): result is Ok<T> {
    return !result.error
}

export function isErr<T>(result: Result<T>): result is Err {
    return !!result.error
}
