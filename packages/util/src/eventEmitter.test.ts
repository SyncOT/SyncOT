import { SyncOtEmitter } from '.'

type Params = [number, string, boolean]
const params: Params = [1, 'test', true]

interface Events {
    event: (...args: Params) => void
    other: (...args: Params) => void
}

let emitter: SyncOtEmitter<Events>
let onEvent: jest.Mock<Params>

beforeEach(() => {
    emitter = new SyncOtEmitter()
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
        await Promise.resolve()
        expect(onDestroy).toHaveBeenCalledWith()
        emitter.destroy()
        emitter.destroy()
        await Promise.resolve()
        await Promise.resolve()
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
        await Promise.resolve()
        expect(onDestroy).toHaveBeenCalledWith()
        expect(onError).toHaveBeenCalledWith(error)
        expect(onError).toHaveBeenCalledBefore(onDestroy)
        emitter.destroy(error)
        await Promise.resolve()
        expect(onDestroy).toHaveBeenCalledTimes(1)
        expect(onError).toHaveBeenCalledTimes(1)
    })
})

test('assertNotDestroyed', () => {
    class Test extends SyncOtEmitter<{}> {
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
            name: 'AssertionError',
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
        await Promise.resolve()
        expect(onEvent).toHaveBeenCalledWith(...params)
    })
    test('emit after destroy', async () => {
        emitter.destroy()
        emitter.emitAsync('event', ...params)
        expect(onEvent).not.toHaveBeenCalled()
        await Promise.resolve()
        expect(onEvent).not.toHaveBeenCalled()
    })
    test('return value', async () => {
        await expect(emitter.emitAsync('event', ...params)).resolves.toBeTrue()
        await expect(emitter.emitAsync('other', ...params)).resolves.toBeFalse()
        emitter.destroy()
        await expect(emitter.emitAsync('event', ...params)).resolves.toBeTrue()
        await expect(emitter.emitAsync('other', ...params)).resolves.toBeFalse()
    })
})

describe('emitAsyncForce', () => {
    test('emit an event', async () => {
        emitter.emitAsyncForce('event', ...params)
        expect(onEvent).not.toHaveBeenCalled()
        await Promise.resolve()
        expect(onEvent).toHaveBeenCalledWith(...params)
    })
    test('emit after destroy', async () => {
        emitter.destroy()
        emitter.emitAsyncForce('event', ...params)
        expect(onEvent).not.toHaveBeenCalled()
        await Promise.resolve()
        expect(onEvent).toHaveBeenCalledWith(...params)
    })
    test('return value', async () => {
        await expect(
            emitter.emitAsyncForce('event', ...params),
        ).resolves.toBeTrue()
        await expect(
            emitter.emitAsyncForce('other', ...params),
        ).resolves.toBeFalse()
        emitter.destroy()
        await expect(
            emitter.emitAsyncForce('event', ...params),
        ).resolves.toBeTrue()
        await expect(
            emitter.emitAsyncForce('other', ...params),
        ).resolves.toBeFalse()
    })
})
