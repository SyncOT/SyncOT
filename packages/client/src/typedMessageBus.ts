import {
    createMessageBus as create,
    DocumentId,
    MessageBus,
    Operation,
    TypeName,
} from '@syncot/core'

type ConnectionMessageBus = MessageBus<
    {
        state: 'disconnected' | 'connecting' | 'connected' | 'disconnecting'
    },
    ['connection']
>
type OperationMessageBus = MessageBus<
    {
        operation: Operation
    },
    ['operation', TypeName, DocumentId],
    | ['operation', TypeName, DocumentId]
    | ['operation', TypeName]
    | ['operation']
>
export type TypedMessageBus = ConnectionMessageBus & OperationMessageBus

export const createMessageBus = create as () => TypedMessageBus
