import { createError, SyncOtError } from '@syncot/error'

export function createTsonError(message: string): SyncOtError {
    return createError('TsonError', message)
}
