// TODO use sensible default messages per error code
// TODO strong typing for details per error code

import { JsonValue } from './json'

/**
 * A list of all possible error codes.
 */
export enum ErrorCodes {
    /**
     * An unknown error has occurred.
     */
    UnknownError = 'UnknownError',
    /**
     * A function defined by an interface is not implemented.
     */
    NotImplemented = 'NotImplemented',
    /**
     * An invalid argument has been passed into a function.
     */
    InvalidArgument = 'InvalidArgument',
    /**
     * An invalid snapshot has been detected.
     */
    InvalidSnapshot = 'InvalidSnapshot',
    /**
     * An invalid operation has been detected.
     */
    InvalidOperation = 'InvalidOperation',
    /**
     * A type implementation necessary to process an operation or snapshot has not been found.
     */
    TypeNotFound = 'TypeNotFound',
    /**
     * A duplicate type implementation has been found when registering a type implementation.
     */
    DuplicateType = 'DuplicateType',
    /**
     * An operation has an unexpected clientId value.
     */
    UnexpectedClientId = 'UnexpectedClientId',
    /**
     * An operation has an unexpected version number.
     */
    UnexpectedVersionNumber = 'UnexpectedVersionNumber',
    /**
     * An operation has an unexpected sequence number.
     */
    UnexpectedSequenceNumber = 'UnexpectedSequenceNumber',
}

export class SyncOtError extends Error {
    public code: ErrorCodes
    public details: JsonValue

    constructor(code: ErrorCodes, message?: string, details: JsonValue = null) {
        super(message)
        this.code = ErrorCodes.hasOwnProperty(code)
            ? code
            : ErrorCodes.UnknownError
        this.details = details
    }

    public toJSON(): { code: ErrorCodes; details: JsonValue; message: string } {
        return {
            code: this.code,
            details: this.details,
            message: this.message,
        }
    }
}
