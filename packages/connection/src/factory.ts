import { createCompositeError } from '@syncot/util'
import { Duplex } from 'readable-stream'

/**
 * The type of functions for creating streams expected by the `ConnectionManager`.
 */
export type StreamFactory = () => Promise<Duplex>

/**
 * Tries the specified stream `factories` in order until one succeeds,
 * and returns the created stream.
 * @param factories A list of stream factories.
 * @returns A stream created by one of the specified stream `factories`.
 */
export const createStream = (
    factories: StreamFactory[],
): StreamFactory => () => {
    const errors: Error[] = []
    let index = 0
    async function tryNext(): Promise<Duplex> {
        if (index < factories.length) {
            try {
                return await factories[index++]()
            } catch (error) {
                errors.push(error)
                return tryNext()
            }
        } else {
            throw createCompositeError('Failed to create a stream.', errors)
        }
    }
    return tryNext()
}
