export function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const buffer = Buffer.from(base64, 'base64')
    return buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
    )
}

export function arrayBufferToBase64(arrayBuffer: ArrayBuffer): string {
    return Buffer.from(arrayBuffer).toString('base64')
}
