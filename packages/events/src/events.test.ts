import { delay, whenNextTick } from '@syncot/util'
import { SyncOTEmitter } from '.'

type Params = [number, string, boolean]
const params: Params = [1, 'test', true]

interface Events {
    event: (...args: Params) => void
    other: (...args: Params) => void
}

let emitter: SyncOTEmitter<Events>
let onEvent: jest.Mock<Params>

beforeEach(() => {
    emitter = new SyncOTEmitter()
    onEvent = jest.fn()
    emitter.on('event', onEvent)
})

describe('destroy', () => {
    test('basic', async () => {
        const onDestroy = jest.fn()
        emitter.on('destroy', onDestroy)
        expect(emitter.destroyed).toBeFalse()
        emitter.destroy()
        expect(emitter.destroyed).toBeTrue()
        expect(onDestroy).not.toHaveBeenCalled()
        await whenNextTick()
        expect(onDestroy).toHaveBeenCalledWith()
        emitter.destroy()
        emitter.destroy()
        await delay()
        expect(onDestroy).toHaveBeenCalledTimes(1)
    })
    test('with error', async () => {
        const error = new Error('test')
        const onDestroy = jest.fn()
        const onError = jest.fn()
        emitter.on('destroy', onDestroy)
        emitter.on('error', onError)
        emitter.destroy(error)
        expect(emitter.destroyed).toBeTrue()
        await whenNextTick()
        expect(onDestroy).toHaveBeenCalledWith()
        expect(onError).toHaveBeenCalledWith(error)
        expect(onError).toHaveBeenCalledBefore(onDestroy)
        emitter.destroy(error)
        await delay()
        expect(onDestroy).toHaveBeenCalledTimes(1)
        expect(onError).toHaveBeenCalledTimes(1)
    })
})

test('assertNotDestroyed', () => {
    class Test extends SyncOTEmitter<{}> {
        public test(): void {
            this.assertNotDestroyed()
        }
    }

    const test = new Test()
    test.test()
    test.destroy()
    expect(() => test.test()).toThrow(
        expect.objectContaining({
            message: 'Already destroyed.',
            name: 'SyncOTError Assert',
        }),
    )
})

describe('emit', () => {
    test('emit an event', () => {
        emitter.emit('event', ...params)
        expect(onEvent).toHaveBeenCalledWith(...params)
    })
    test('emit after destroy', () => {
        emitter.destroy()
        emitter.emit('event', ...params)
        expect(onEvent).not.toHaveBeenCalled()
    })
    test('return value', () => {
        expect(emitter.emit('event', ...params)).toBeTrue()
        expect(emitter.emit('other', ...params)).toBeFalse()
        emitter.destroy()
        expect(emitter.emit('event', ...params)).toBeTrue()
        expect(emitter.emit('other', ...params)).toBeFalse()
    })
})

describe('emitForce', () => {
    test('emit an event', () => {
        emitter.emitForce('event', ...params)
        expect(onEvent).toHaveBeenCalledWith(...params)
    })
    test('emit after destroy', () => {
        emitter.destroy()
        emitter.emitForce('event', ...params)
        expect(onEvent).toHaveBeenCalledWith(...params)
    })
    test('return value', () => {
        expect(emitter.emitForce('event', ...params)).toBeTrue()
        expect(emitter.emitForce('other', ...params)).toBeFalse()
        emitter.destroy()
        expect(emitter.emitForce('event', ...params)).toBeTrue()
        expect(emitter.emitForce('other', ...params)).toBeFalse()
    })
})

describe('emitAsync', () => {
    test('emit an event', async () => {
        emitter.emitAsync('event', ...params)
        expect(onEvent).not.toHaveBeenCalled()
        await whenNextTick()
        expect(onEvent).toHaveBeenCalledWith(...params)
    })
    test('emit after destroy', async () => {
        emitter.destroy()
        emitter.emitAsync('event', ...params)
        expect(onEvent).not.toHaveBeenCalled()
        await whenNextTick()
        expect(onEvent).not.toHaveBeenCalled()
    })
})

describe('emitAsyncForce', () => {
    test('emit an event', async () => {
        emitter.emitAsyncForce('event', ...params)
        expect(onEvent).not.toHaveBeenCalled()
        await whenNextTick()
        expect(onEvent).toHaveBeenCalledWith(...params)
    })
    test('emit after destroy', async () => {
        emitter.destroy()
        emitter.emitAsyncForce('event', ...params)
        expect(onEvent).not.toHaveBeenCalled()
        await whenNextTick()
        expect(onEvent).toHaveBeenCalledWith(...params)
    })
})
