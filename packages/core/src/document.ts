import { Operation, Snapshot } from './type'

export type DocumentId = string
export type DocumentVersion = number
export type ClientId = string
export type SequenceNumber = number

export interface DocumentOperation {
    id: DocumentId
    version: DocumentVersion
    client: ClientId
    sequence: SequenceNumber
    operation: Operation
}

export interface DocumentSnapshot {
    id: DocumentId
    version: DocumentVersion
    snapshot: Snapshot
}
