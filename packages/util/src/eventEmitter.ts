import { EventEmitter } from 'events'
import { StrictEventEmitter } from 'strict-event-emitter-types'

/**
 * A strongly typed nodejs `EventEmitter`.
 */
export type NodeEventEmitter<Events> = StrictEventEmitter<EventEmitter, Events>
