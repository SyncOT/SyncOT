import {
    ClientStorage,
    DocumentId,
    DocumentOperation,
    DocumentVersion,
    SequenceNumber,
} from '@syncot/core'

export class MemoryClientStorage implements ClientStorage {
    public saveRemoteOperations(
        _id: DocumentId,
        _operations: [DocumentOperation],
    ): Promise<undefined> {
        return Promise.reject(new Error('Not implemented'))
    }

    public loadRemoteOperations(
        _id: DocumentId,
        _start?: DocumentVersion,
        _end?: DocumentVersion,
    ): Promise<[DocumentOperation]> {
        return Promise.reject(new Error('Not implemented'))
    }

    public saveLocalOperations(
        _id: DocumentId,
        _operations: [DocumentOperation],
    ): Promise<undefined> {
        return Promise.reject(new Error('Not implemented'))
    }

    public loadLocalOperations(
        _id: DocumentId,
        _start?: SequenceNumber,
        _end?: SequenceNumber,
    ): Promise<[DocumentOperation]> {
        return Promise.reject(new Error('Not implemented'))
    }
}
