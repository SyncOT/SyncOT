import { createAssertError } from '@syncot/error'
import { randomInteger } from './random'

export function noop() {
    // Do nothing.
}

/**
 * Returns a Promise that resolves on `process.nextTick`.
 */
export function whenNextTick() {
    return new Promise(resolve => process.nextTick(resolve))
}

/**
 * Returns a Promise that resolves after the specified minimum number of milliseconds.
 */
export function delay(minDelayMilliseconds: number = 0) {
    return new Promise(resolve => setTimeout(resolve, minDelayMilliseconds))
}

const randomIdBuffer = Buffer.allocUnsafeSlow(12)
randomIdBuffer.writeUInt32BE(randomInteger(0, 0x100000000), 4)
randomIdBuffer.writeUInt32BE(randomInteger(0, 0x100000000), 8)
let randomIdCounter = randomIdBuffer.readUIntBE(9, 3)

/**
 * Generates a unique ID using an approach inspired by MongoDB ObjectID.
 * See https://docs.mongodb.com/manual/reference/method/ObjectId/.
 */
export function generateId(): string {
    /* tslint:disable-next-line:no-bitwise */
    randomIdBuffer.writeIntBE((Date.now() * 0.001) | 0, 0, 4)
    randomIdBuffer.writeUIntBE(randomIdCounter, 9, 3)
    /* tslint:disable-next-line:no-bitwise */
    randomIdCounter = (randomIdCounter + 1) & 0x00ffffff
    return randomIdBuffer.toString('base64')
}

/**
 * Throws an `AssertError` if `value` is falsy.
 */
export function assert(value: any, message?: string): void {
    if (!value) {
        throw createAssertError(message)
    }
}
