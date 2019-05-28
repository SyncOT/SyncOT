import { strict as assert } from 'assert'
import { EventEmitter } from 'events'
import { Interface } from './types'

/**
 * Converts T to an Array type as follows:
 *
 * - function => function args
 * - void => []
 * - any T => [T]
 */
type Args<T> = [T] extends [(...args: infer U) => any]
    ? U
    : [T] extends [void]
    ? []
    : [T]

/**
 * An event listener function with the specified parameters.
 */
type Listener<T extends any[]> = (...args: T) => any

type ListenerMethods<ListenerEvents> = Record<
    | 'addListener'
    | 'on'
    | 'once'
    | 'prependListener'
    | 'prependOnceListener'
    | 'removeListener'
    | 'off',
    {
        <E extends keyof ListenerEvents, T>(
            this: T,
            event: E,
            listener: Listener<Args<ListenerEvents[E]>>,
        ): T
        <T>(this: T, event: symbol, listener: Listener<any[]>): T
    }
>

interface OtherMethods<ListenerEvents, EmitEvents> {
    removeAllListeners<E extends keyof ListenerEvents>(event: E): this
    removeAllListeners(event?: symbol): this

    setMaxListeners(n: number): this
    getMaxListeners(): number

    // tslint:disable-next-line:ban-types
    listeners<E extends keyof ListenerEvents>(event: E): Function[]
    // tslint:disable-next-line:ban-types
    listeners(event: symbol): Function[]

    // tslint:disable-next-line:ban-types
    rawListeners<E extends keyof ListenerEvents>(event: E): Function[]
    // tslint:disable-next-line:ban-types
    rawListeners(event: symbol): Function[]

    emit<E extends keyof EmitEvents>(
        event: E,
        ...args: Args<EmitEvents[E]>
    ): boolean
    emit(event: symbol, ...args: any[]): boolean

    eventNames(): Array<string | symbol>

    listenerCount<E extends keyof ListenerEvents>(event: E): number
    listenerCount(event: symbol): number
}

type TypedEventEmitterInterface<ListenEvents, EmitEvents> = ListenerMethods<
    ListenEvents
> &
    OtherMethods<ListenEvents, EmitEvents>

/**
 * Strongly-typed nodejs `EventEmitter`.
 *
 * `ListenEvents` defines events that can be listened for, and `EmitEvents` defines those
 * that can be emitted - they will usually be the same. The events are defined as a record:
 *
 * ```
 * {
 *   // An event that requires no parameters.
 *   eventName1: void,
 *   // An event that requires one parameter.
 *   eventName2: Error,
 *   // An event that requires 3 parameters, defined as function parameters.
 *   // This form is the most generic and can express any parameter types.
 *   eventName3: (a: string, b: number, c: { hello: string }) => void
 * }
 * ```
 */
// tslint:disable-next-line:variable-name
export const TypedEventEmitter: new <
    ListenEvents,
    EmitEvents = ListenEvents
>() => TypedEventEmitterInterface<ListenEvents, EmitEvents> = EventEmitter

/**
 * A strongly-typed event emitter based on nodejs `EventEmitter`.
 * It allows the emitter to be destroyed, in which case events are no
 * longer emitted, unless forced. Additionally, it supports asynchronous
 * event dispatching.
 *
 * The `Events` type param defines the events that can be emitted and
 * listened for. The format is the same as for `TypedEventEmitter`.
 *
 * @emits error Emitted asynchronously when `destroy` is called with an error argument.
 * @emits destroy Emitted asynchronously when this emitter is destroyed.
 */
export class SyncOtEmitter<Events> extends TypedEventEmitter<
    Events & { destroy: void; error: Error },
    Events
> {
    private _destroyed: boolean = false

    /**
     * Returns true, if this object has been already destroyed, otherwise false.
     */
    public get destroyed(): boolean {
        return this._destroyed
    }

    constructor() {
        super()
    }

    /**
     * Dispatches an event synchronously, unless the emitter has been already destroyed.
     */
    public emit<E extends keyof Events>(
        event: E,
        ...args: Args<Events[E]>
    ): boolean
    public emit(event: symbol, ...args: any[]): boolean
    public emit(event: any, ...args: any[]): boolean {
        return this._destroyed
            ? this.listenerCount(event) > 0
            : super.emit(event, ...args)
    }

    /**
     * Just like `emit` but dispatches the event even if the emitter has been destroyed.
     * It's the same as node EventEmitter#emit.
     */
    public emitForce<E extends keyof Events>(
        event: E,
        ...args: Args<Events[E]>
    ): boolean
    public emitForce(event: symbol, ...args: any[]): boolean
    public emitForce(event: any, ...args: any[]): boolean {
        return super.emit(event, ...args)
    }

    /**
     * Just like `emit` but dispatches the event asynchronously in a microtask.
     */
    public emitAsync<K extends keyof Events>(
        name: K,
        ...args: Args<Events[K]>
    ): void
    public emitAsync(name: symbol, ...args: any[]): void
    public emitAsync(name: any, ...args: any[]): void {
        process.nextTick(() => this.emit(name, ...args))
    }

    /**
     * Just like `emitAsync` but dispatches the event even if the emitter has been destroyed.
     */
    public emitAsyncForce<K extends keyof Events>(
        name: K,
        ...args: Args<Events[K]>
    ): void
    public emitAsyncForce(name: symbol, ...args: any[]): void
    public emitAsyncForce(name: any, ...args: any[]): void {
        process.nextTick(() => this.emitForce(name, ...args))
    }

    /**
     * Destroys this event emitter and emits a destroy event asynchronously.
     * If an error is specified, it is emitted as an "error" event before the "destroy" event.
     * Does nothing, if the object is already destroyed.
     */
    public destroy(error?: Error): void {
        if (!this._destroyed) {
            this._destroyed = true
            if (error) {
                this.emitAsyncForce('error' as any, error)
            }
            this.emitAsyncForce('destroy' as any)
        }
    }

    protected assertNotDestroyed(): void {
        assert.ok(!this._destroyed, 'Already destroyed.')
    }
}

/**
 * Extracts a public interface from an event emitter.
 */
export type EmitterInterface<T extends Interface<EventEmitter>> = Pick<
    Interface<T>,
    Exclude<
        keyof T,
        'emit' | 'emitForce' | 'emitAsync' | 'emitAsyncForce' | 'destroy'
    >
> &
    (Interface<T> extends { destroy(error?: Error): void }
        ? {
              destroy(): void
          }
        : {})
