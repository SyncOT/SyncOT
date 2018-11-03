import {
    DocumentId,
    DocumentOperation,
    DocumentVersion,
    SequenceNumber
} from '@syncot/core'

export interface Storage {
    saveRemoteOperations(
        id: DocumentId,
        operations: [DocumentOperation]
    ): Promise<undefined>
    loadRemoteOperations(
        id: DocumentId,
        start?: DocumentVersion,
        end?: DocumentVersion
    ): Promise<[DocumentOperation]>
    saveLocalOperations(
        id: DocumentId,
        operations: [DocumentOperation]
    ): Promise<undefined>
    loadLocalOperations(
        id: DocumentId,
        start?: SequenceNumber,
        end?: SequenceNumber
    ): Promise<[DocumentOperation]>
}
