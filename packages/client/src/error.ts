export enum ErrorCodes {
    FailedToCreateSnapshot = 'FailedToCreateSnapshot',
    InvalidResult = 'InvalidResult',
    NotImplemented = 'NotImplemented'
}

for (const errorCode in ErrorCodes) {
    if (ErrorCodes[errorCode] !== errorCode) {
        throw new Error(`Invalid error code value: ${errorCode}`)
    }
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
