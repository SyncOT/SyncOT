import { fromByteArray } from 'base64-js'
import { randomInteger } from './util'

/* tslint:disable:no-bitwise */
const arrayBuffer = new ArrayBuffer(12)
const byteArray = new Uint8Array(arrayBuffer)
const dataView = new DataView(arrayBuffer)
dataView.setUint32(4, randomInteger(0, 0x100000000))
dataView.setUint32(8, randomInteger(0, 0x100000000))
let counter =
    (dataView.getUint8(9) << 16) +
    (dataView.getUint8(10) << 8) +
    dataView.getUint8(11)

/**
 * Creates a unique ID using an approach inspired by MongoDB ObjectID.
 * See https://docs.mongodb.com/manual/reference/method/ObjectId/.
 * @returns A new base64-encoded ID.
 */
export function createId(): string {
    dataView.setUint32(0, (Date.now() * 0.001) | 0)
    dataView.setUint8(9, counter >> 16)
    dataView.setUint8(10, counter >> 8)
    dataView.setUint8(11, counter)
    counter = (counter + 1) & 0x00ffffff
    return fromByteArray(byteArray)
}
