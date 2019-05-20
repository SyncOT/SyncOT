import { createWebSocketStream } from '.'

test('invalid URL', () => {
    expect(() => createWebSocketStream(5 as any)).toThrow()
})
