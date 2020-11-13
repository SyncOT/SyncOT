import { Duplex } from 'readable-stream'
import { createStream, StreamFactory } from '.'

const read = () => undefined
const write = (
    _data: any,
    _encoding: string,
    callback: (error: Error | undefined) => void,
) => callback(undefined)

const streams: { [name: string]: Duplex } = {
    stream1: new Duplex({ read, write }),
    stream2: new Duplex({ read, write }),
    stream3: new Duplex({ read, write }),
}

const errors: { [name: string]: Error } = {
    error1: new Error('test error 1'),
    error2: new Error('test error 2'),
    error3: new Error('test error 3'),
}

const factories: { [name: string]: StreamFactory } = {
    fail1: () => Promise.reject(errors.error1),
    fail2: () => Promise.reject(errors.error2),
    fail3: () => Promise.reject(errors.error3),
    ok1: () => Promise.resolve(streams.stream1),
    ok2: () => Promise.resolve(streams.stream2),
    ok3: () => Promise.resolve(streams.stream3),
}

test.each<[string[], string, string[]]>([
    [[], '', []],
    [['ok1'], 'stream1', []],
    [['ok1', 'ok2', 'ok3'], 'stream1', []],
    [['ok1', 'ok2', 'ok3', 'fail1', 'fail2', 'fail3'], 'stream1', []],
    [['fail1', 'fail2', 'fail3', 'ok1', 'ok2', 'ok3'], 'stream1', []],
    [['fail1', 'fail2', 'fail3'], '', ['error1', 'error2', 'error3']],
])('factories=%p', async (factoryNames, streamName, errorNames) => {
    const factoryList = factoryNames.map((name) => factories[name])
    const stream = streams[streamName]
    const errorList = errorNames.map((name) => errors[name])
    const promise = createStream(factoryList)()

    if (stream) {
        await expect(promise).resolves.toBe(stream)
    } else {
        await expect(promise).rejects.toEqual(
            expect.objectContaining({
                errors: errorList,
                message: 'Failed to create a stream.',
                name: 'SyncOTError Composite',
            }),
        )
    }
})
