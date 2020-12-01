import { createPubSub } from '.'

test('subscribe, publish, unsubscribe', () => {
    const channel1 = 'channel-1'
    const channel2 = 'channel-2'
    const listener1 = jest.fn()
    const listener2 = jest.fn()
    const message1 = { key: 'value-1' }
    const message2 = { key: 'value-2' }
    const pubSub = createPubSub()
    pubSub.subscribe(channel1, listener1)
    pubSub.subscribe(channel2, listener2)

    pubSub.publish(channel1, message1)
    expect(listener1).toHaveBeenCalledTimes(1)
    expect(listener1).toHaveBeenCalledWith(message1)
    expect(listener2).toHaveBeenCalledTimes(0)
    listener1.mockClear()
    listener2.mockClear()

    pubSub.publish(channel2, message2)
    expect(listener1).toHaveBeenCalledTimes(0)
    expect(listener2).toHaveBeenCalledTimes(1)
    expect(listener2).toHaveBeenCalledWith(message2)
    listener1.mockClear()
    listener2.mockClear()

    pubSub.unsubscribe(channel2, listener2)

    pubSub.publish(channel1, message1)
    pubSub.publish(channel2, message2)
    expect(listener1).toHaveBeenCalledTimes(1)
    expect(listener1).toHaveBeenCalledWith(message1)
    expect(listener2).toHaveBeenCalledTimes(0)
})
