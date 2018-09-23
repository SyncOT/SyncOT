export enum ErrorCodes {
    NotImplemented = 'NotImplemented',
    TypeNotFound = 'TypeNotFound'
}

export class SyncOtError extends Error {
    constructor(public code: ErrorCodes, message?: string) {
        super(message)
    }

    public toJson(): { code: ErrorCodes; message: string } {
        return {
            code: this.code,
            message: this.message
        }
    }
}
