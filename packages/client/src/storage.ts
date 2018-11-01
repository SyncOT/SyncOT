import { DocumentId, DocumentOperation, DocumentVersion } from './document';

export interface Storage {
    saveRemoteOperations(id: DocumentId, operations: [DocumentOperation]): Promise<undefined>
    loadRemoteOperations(id: DocumentId, start?: DocumentVersion, end?: DocumentVersion): Promise<[DocumentOperation]>
    saveLocalOperations(id: DocumentId, operations: [DocumentOperation]): Promise<undefined>
    loadLocalOperations(id: DocumentId): Promise<[DocumentOperation]>
}
