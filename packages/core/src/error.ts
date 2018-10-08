export enum ErrorCodes {
    UnknownError = 'UnknownError',
    NotImplemented = 'NotImplemented',
    TypeNotFound = 'TypeNotFound'
}

export class SyncOtError extends Error {
    public code: ErrorCodes

    constructor(code: ErrorCodes, message?: string) {
        super(message)
        this.code = ErrorCodes.hasOwnProperty(code) ? code : ErrorCodes.UnknownError
    }

    public toJSON(): { code: ErrorCodes; message: string } {
        return {
            code: this.code,
            message: this.message
        }
    }
}
