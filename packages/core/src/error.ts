import { createError, SyncOtError as NewSyncOtError } from '@syncot/error'
import { strict as assert } from 'assert'
import { JsonValue } from './json'

export function createNotImplementedError(message: string): NewSyncOtError {
    assert.equal(
        typeof message,
        'string',
        'Argument "message" must be a string.',
    )
    return createError('NotImplemented', message)
}

/**
 * A list of all possible error codes.
 */
export enum ErrorCodes {
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
     * There has been no service to handle a message received by a `Connection`.
     */
    NoService = 'NoService',
    /**
     * An action failed because there is no active connection.
     */
    Disconnected = 'Disconnected',
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

export class SyncOtError extends Error {
    public code: ErrorCodes
    public details: JsonValue

    constructor(code: ErrorCodes, message?: string, details: JsonValue = null) {
        super(message)
        this.code = code
        this.details = details
    }
}
