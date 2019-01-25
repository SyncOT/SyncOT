import { MessageBus } from './messageBus'

let messageBus: MessageBus

beforeEach(() => {
    messageBus = new MessageBus()
})

test('dummy', () => {
    expect(messageBus).toBe(messageBus)

    messageBus.send(['connection'], { connected: true })
})
