import { createMessageBus, MessageBus } from '.'

let messageBus: MessageBus

beforeEach(() => {
    messageBus = createMessageBus()
})

test('dummy', () => {
    expect(messageBus).toBe(messageBus)

    messageBus.send(['connection'], { connected: true })
})
