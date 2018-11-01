import { Operation, Snapshot } from '@syncot/core'

export type DocumentId = string
export type DocumentVersion = number

export interface DocumentOperation {
    id: DocumentId
    version: DocumentVersion
    operation: Operation
}

export interface DocumentSnapshot {
    id: DocumentId
    version: DocumentVersion
    snapshot: Snapshot
}
