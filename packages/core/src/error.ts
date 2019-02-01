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
     * A code reserved for errors originating outside the SyncOT codebase.
     */
    ExternalError = 'ExternalError',
    /**
     * A function defined by an interface is not implemented.
     */
    NotImplemented = 'NotImplemented',
    /**
     * An invalid argument has been passed into a function.
     */
    InvalidArgument = 'InvalidArgument',
    /**
     * A Connection is already associated with an open stream.
     */
    AlreadyConnected = 'AlreadyConnected',
    /**
     * A Service with the same name has been already registered on a Connection.
     */
    DuplicateService = 'DuplicateService',
    /**
     * A Proxy with the same name has been already registered on a Connection.
     */
    DuplicateProxy = 'DuplicateProxy',
    /**
     * An invalid message has been received by a `Connection`.
     */
    InvalidMessage = 'InvalidMessage',
    /**
     * There has been no registered service to handle a messages received by a `Connection`.
     */
    NoService = 'NoService',
    /**
     * An action failed because there has been no active connection.
     */
    NotConnected = 'NotConnected',
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
     * A service is not initialized.
     */
    NotInitialized = 'NotInitialized',
    /**
     * A service can't be initialized because it has been initialized already.
     */
    AlreadyInitialized = 'AlreadyInitialized',
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

function isErrorCode(code: any): code is ErrorCodes {
    return typeof code === 'string' && ErrorCodes[code as any] === code
}

export class SyncOtError extends Error {
    public static fromJSON(json: JsonValue): SyncOtError {
        return json &&
            typeof json === 'object' &&
            !Array.isArray(json) &&
            isErrorCode(json.code) &&
            (typeof json.message === 'string' ||
                typeof json.message === 'undefined')
            ? new SyncOtError(json.code, json.message, json.details)
            : new SyncOtError(ErrorCodes.UnknownError, undefined, json)
    }

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
