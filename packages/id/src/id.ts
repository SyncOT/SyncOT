import { randomInteger } from '@syncot/util'

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
