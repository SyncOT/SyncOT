import { toArrayBuffer, toBuffer } from '@syncot/util'

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
    return toArrayBuffer(Buffer.from(base64, 'base64'))
}

export function arrayBufferToBase64(arrayBuffer: ArrayBuffer): string {
    return toBuffer(arrayBuffer).toString('base64')
}
