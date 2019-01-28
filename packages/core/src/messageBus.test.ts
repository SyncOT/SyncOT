import { createMessageBus, MessageBus } from '.'

let messageBus: MessageBus

beforeEach(() => {
    messageBus = createMessageBus()
})

describe.each([
    [3, 3],
    [3, 2],
    [3, 1],
    [3, 0],
    [2, 3],
    [2, 2],
    [2, 1],
    [2, 0],
    [1, 3],
    [1, 2],
    [1, 1],
    [1, 0],
    [0, 3],
    [0, 2],
    [0, 1],
    [0, 0],
])('send at level %i; listen at level %i', (send: number, listen: number) => {
    const topic = ['operation', 'type', 'id']
    const sendTopic = topic.slice(0, send)
    const listenTopic = topic.slice(0, listen)
    const message1 = { message: 'one' }
    const message2 = { message: 'two' }

    test('subscribe, send, send', async () => {
        const listener = jest.fn()
        messageBus.on(listenTopic, listener)
        expect(messageBus.send(sendTopic, message1)).toBe(send >= listen)
        expect(messageBus.send(sendTopic, message2)).toBe(send >= listen)
        expect(listener).not.toHaveBeenCalled()
        await Promise.resolve()
        if (send >= listen) {
            expect(listener.mock.calls.length).toBe(2)
            expect(listener.mock.calls[0][0]).toEqual(sendTopic)
            expect(listener.mock.calls[0][1]).toBe(message1)
            expect(listener.mock.instances[0]).toBe(undefined)
            expect(listener.mock.calls[1][0]).toEqual(sendTopic)
            expect(listener.mock.calls[1][1]).toBe(message2)
            expect(listener.mock.instances[1]).toBe(undefined)
        } else {
            expect(listener.mock.calls.length).toBe(0)
        }
    })

    test('subscribe, send, wait, send', async () => {
        const listener = jest.fn()
        messageBus.on(listenTopic, listener)
        expect(messageBus.send(sendTopic, message1)).toBe(send >= listen)
        expect(listener).not.toHaveBeenCalled()

        await Promise.resolve()
        if (send >= listen) {
            expect(listener.mock.calls.length).toBe(1)
            expect(listener.mock.calls[0][0]).toEqual(sendTopic)
            expect(listener.mock.calls[0][1]).toBe(message1)
            expect(listener.mock.instances[0]).toBe(undefined)
        } else {
            expect(listener.mock.calls.length).toBe(0)
        }
        expect(messageBus.send(sendTopic, message2)).toBe(send >= listen)
        return Promise.resolve().then(() => {
            if (send >= listen) {
                expect(listener.mock.calls.length).toBe(2)
                expect(listener.mock.calls[0][0]).toEqual(sendTopic)
                expect(listener.mock.calls[0][1]).toBe(message1)
                expect(listener.mock.instances[0]).toBe(undefined)
                expect(listener.mock.calls[1][0]).toEqual(sendTopic)
                expect(listener.mock.calls[1][1]).toBe(message2)
                expect(listener.mock.instances[1]).toBe(undefined)
            } else {
                expect(listener.mock.calls.length).toBe(0)
            }
        })
    })

    test('subscribe, send, unsubscribe, send', async () => {
        const listener = jest.fn()
        messageBus.on(listenTopic, listener)
        expect(messageBus.send(sendTopic, message1)).toBe(send >= listen)
        messageBus.off(listenTopic, listener)
        expect(messageBus.send(sendTopic, message2)).toBe(false)
        expect(listener).not.toHaveBeenCalled()

        await Promise.resolve()
        if (send >= listen) {
            expect(listener.mock.calls.length).toBe(1)
            expect(listener.mock.calls[0][0]).toEqual(sendTopic)
            expect(listener.mock.calls[0][1]).toBe(message1)
            expect(listener.mock.instances[0]).toBe(undefined)
        } else {
            expect(listener.mock.calls.length).toBe(0)
        }
        return Promise.resolve().then(() => {
            if (send >= listen) {
                expect(listener.mock.calls.length).toBe(1)
                expect(listener.mock.calls[0][0]).toEqual(sendTopic)
                expect(listener.mock.calls[0][1]).toBe(message1)
                expect(listener.mock.instances[0]).toBe(undefined)
            } else {
                expect(listener.mock.calls.length).toBe(0)
            }
        })
    })

    test('subscribe, unsubscribe, subscribe, send', async () => {
        const listener = jest.fn()
        messageBus
            .on(listenTopic, listener)
            .off(listenTopic, listener)
            .on(listenTopic, listener)
        expect(messageBus.send(sendTopic, message1)).toBe(send >= listen)
        expect(listener).not.toHaveBeenCalled()
        await Promise.resolve()
        if (send >= listen) {
            expect(listener.mock.calls.length).toBe(1)
            expect(listener.mock.calls[0][0]).toEqual(sendTopic)
            expect(listener.mock.calls[0][1]).toBe(message1)
            expect(listener.mock.instances[0]).toBe(undefined)
        } else {
            expect(listener.mock.calls.length).toBe(0)
        }
    })

    test('subscribe, subscribe (the same listener), send', async () => {
        const listener = jest.fn()
        messageBus.on(listenTopic, listener).on(listenTopic, listener)
        expect(messageBus.send(sendTopic, message1)).toBe(send >= listen)
        expect(listener).not.toHaveBeenCalled()

        await Promise.resolve()
        if (send >= listen) {
            expect(listener.mock.calls.length).toBe(2)
            expect(listener.mock.calls[0][0]).toEqual(sendTopic)
            expect(listener.mock.calls[0][1]).toBe(message1)
            expect(listener.mock.instances[0]).toBe(undefined)
            expect(listener.mock.calls[1][0]).toEqual(sendTopic)
            expect(listener.mock.calls[1][1]).toBe(message1)
            expect(listener.mock.instances[1]).toBe(undefined)
        } else {
            expect(listener.mock.calls.length).toBe(0)
        }
    })

    test('subscribe, subscribe (the same listener), unsubscribe, send ', async () => {
        const listener = jest.fn()
        messageBus
            .on(listenTopic, listener)
            .on(listenTopic, listener)
            .off(listenTopic, listener)
        expect(messageBus.send(sendTopic, message1)).toBe(send >= listen)
        expect(listener).not.toHaveBeenCalled()

        await Promise.resolve()
        if (send >= listen) {
            expect(listener.mock.calls.length).toBe(1)
            expect(listener.mock.calls[0][0]).toEqual(sendTopic)
            expect(listener.mock.calls[0][1]).toBe(message1)
            expect(listener.mock.instances[0]).toBe(undefined)
        } else {
            expect(listener.mock.calls.length).toBe(0)
        }
    })

    test('subscribe, subscribe (different listener), send', async () => {
        const listener1 = jest.fn()
        const listener2 = jest.fn()
        messageBus.on(listenTopic, listener1).on(listenTopic, listener2)
        expect(messageBus.send(sendTopic, message1)).toBe(send >= listen)
        expect(listener1).not.toHaveBeenCalled()
        expect(listener2).not.toHaveBeenCalled()

        await Promise.resolve()
        if (send >= listen) {
            expect(listener1.mock.calls.length).toBe(1)
            expect(listener1.mock.calls[0][0]).toEqual(sendTopic)
            expect(listener1.mock.calls[0][1]).toBe(message1)
            expect(listener1.mock.instances[0]).toBe(undefined)
            expect(listener2.mock.calls.length).toBe(1)
            expect(listener2.mock.calls[0][0]).toEqual(sendTopic)
            expect(listener2.mock.calls[0][1]).toBe(message1)
            expect(listener2.mock.instances[0]).toBe(undefined)
        } else {
            expect(listener1.mock.calls.length).toBe(0)
            expect(listener2.mock.calls.length).toBe(0)
        }
    })

    test('subscribe, subscribe (different listener), unsubscribe (first listener), send', async () => {
        const listener1 = jest.fn()
        const listener2 = jest.fn()
        messageBus
            .on(listenTopic, listener1)
            .on(listenTopic, listener2)
            .off(listenTopic, listener1)
        expect(messageBus.send(sendTopic, message1)).toBe(send >= listen)
        expect(listener1).not.toHaveBeenCalled()
        expect(listener2).not.toHaveBeenCalled()

        await Promise.resolve()
        if (send >= listen) {
            expect(listener1.mock.calls.length).toBe(0)
            expect(listener2.mock.calls.length).toBe(1)
            expect(listener2.mock.calls[0][0]).toEqual(sendTopic)
            expect(listener2.mock.calls[0][1]).toBe(message1)
            expect(listener2.mock.instances[0]).toBe(undefined)
        } else {
            expect(listener1.mock.calls.length).toBe(0)
            expect(listener2.mock.calls.length).toBe(0)
        }
    })

    test('subscribe, subscribe (different listener), unsubscribe (last listener), send', async () => {
        const listener1 = jest.fn()
        const listener2 = jest.fn()
        messageBus
            .on(listenTopic, listener1)
            .on(listenTopic, listener2)
            .off(listenTopic, listener2)
        expect(messageBus.send(sendTopic, message1)).toBe(send >= listen)
        expect(listener1).not.toHaveBeenCalled()
        expect(listener2).not.toHaveBeenCalled()

        await Promise.resolve()
        if (send >= listen) {
            expect(listener1.mock.calls.length).toBe(1)
            expect(listener1.mock.calls[0][0]).toEqual(sendTopic)
            expect(listener1.mock.calls[0][1]).toBe(message1)
            expect(listener1.mock.instances[0]).toBe(undefined)
            expect(listener2.mock.calls.length).toBe(0)
        } else {
            expect(listener1.mock.calls.length).toBe(0)
            expect(listener2.mock.calls.length).toBe(0)
        }
    })

    test('subscribe (1), subscribe (2), subscribe (1), unsubscribe (1), send', async () => {
        const listener1 = jest.fn()
        const listener2 = jest.fn()
        messageBus
            .on(listenTopic, listener1)
            .on(listenTopic, listener2)
            .on(listenTopic, listener1)
            .off(listenTopic, listener1)
        expect(messageBus.send(sendTopic, message1)).toBe(send >= listen)
        expect(listener1).not.toHaveBeenCalled()
        expect(listener2).not.toHaveBeenCalled()

        await Promise.resolve()
        if (send >= listen) {
            expect(listener1.mock.calls.length).toBe(1)
            expect(listener1.mock.calls[0][0]).toEqual(sendTopic)
            expect(listener1.mock.calls[0][1]).toBe(message1)
            expect(listener1.mock.instances[0]).toBe(undefined)
            expect(listener2.mock.calls.length).toBe(1)
            expect(listener2.mock.calls[0][0]).toEqual(sendTopic)
            expect(listener2.mock.calls[0][1]).toBe(message1)
            expect(listener2.mock.instances[0]).toBe(undefined)
            expect(listener1).toHaveBeenCalledBefore(listener2)
        } else {
            expect(listener1.mock.calls.length).toBe(0)
            expect(listener2.mock.calls.length).toBe(0)
        }
    })

    test('unsubscribe, send', async () => {
        const listener = jest.fn()
        messageBus.off(listenTopic, listener)
        expect(messageBus.send(sendTopic, message1)).toBe(false)
        expect(listener).not.toHaveBeenCalled()
        await Promise.resolve()
        expect(listener.mock.calls.length).toBe(0)
    })

    test('subscribe, unsubscribe, send', async () => {
        const listener = jest.fn()
        messageBus.on(listenTopic, listener).off(listenTopic, listener)
        expect(messageBus.send(sendTopic, message1)).toBe(false)
        expect(listener).not.toHaveBeenCalled()
        await Promise.resolve()
        expect(listener.mock.calls.length).toBe(0)
    })

    test('subscribe, unsubscribe, unsubscribe, send', async () => {
        const listener = jest.fn()
        messageBus
            .on(listenTopic, listener)
            .off(listenTopic, listener)
            .off(listenTopic, listener)
        expect(messageBus.send(sendTopic, message1)).toBe(false)
        expect(listener).not.toHaveBeenCalled()
        await Promise.resolve()
        expect(listener.mock.calls.length).toBe(0)
    })

    test(`subscribe, unsubscribe (at level ${send}), send`, async () => {
        const listener = jest.fn()
        messageBus.on(listenTopic, listener).off(sendTopic, listener)
        expect(messageBus.send(sendTopic, message1)).toBe(send > listen)
        expect(listener).not.toHaveBeenCalled()

        await Promise.resolve()
        if (send > listen) {
            expect(listener.mock.calls.length).toBe(1)
            expect(listener.mock.calls[0][0]).toEqual(sendTopic)
            expect(listener.mock.calls[0][1]).toBe(message1)
            expect(listener.mock.instances[0]).toBe(undefined)
        } else {
            expect(listener.mock.calls.length).toBe(0)
        }
    })
})

test('callback execution order', async () => {
    const message = { a: 'message' }
    const topic1 = ['operation']
    const topic2 = ['operation', 'type']
    const topic3 = ['operation', 'type', 'id']
    const listener1 = jest.fn()
    const listener2 = jest.fn()
    const listener3 = jest.fn()
    const listener4 = jest.fn()
    const listener5 = jest.fn()
    const listener6 = jest.fn()
    const listener7 = jest.fn()
    messageBus
        .on(topic2, listener1)
        .on(topic1, listener2)
        .on(topic3, listener3)
        .on(topic3, listener4)
        .on(topic2, listener5)
        .on(topic1, listener6)
        .on(topic2, listener7)
    expect(messageBus.send(topic3, message)).toBe(true)
    await Promise.resolve()
    expect(listener1.mock.calls.length).toBe(1)
    expect(listener2.mock.calls.length).toBe(1)
    expect(listener3.mock.calls.length).toBe(1)
    expect(listener4.mock.calls.length).toBe(1)
    expect(listener5.mock.calls.length).toBe(1)
    expect(listener6.mock.calls.length).toBe(1)
    expect(listener7.mock.calls.length).toBe(1)

    expect(listener3).toHaveBeenCalledBefore(listener4)
    expect(listener4).toHaveBeenCalledBefore(listener1)
    expect(listener1).toHaveBeenCalledBefore(listener5)
    expect(listener5).toHaveBeenCalledBefore(listener7)
    expect(listener7).toHaveBeenCalledBefore(listener2)
    expect(listener2).toHaveBeenCalledBefore(listener6)
})
