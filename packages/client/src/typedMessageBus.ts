import { createMessageBus as create, MessageBus, Operation } from '@syncot/core'
import { Id } from '@syncot/util'

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
    ['operation', string, Id],
    ['operation', string, Id] | ['operation', string] | ['operation']
>
export type TypedMessageBus = ConnectionMessageBus & OperationMessageBus

export const createMessageBus = create as () => TypedMessageBus
