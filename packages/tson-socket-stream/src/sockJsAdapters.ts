import { strict as assert } from 'assert'
import { EventEmitter } from 'events'
import { TsonSocket } from './tsonSocketStream'
import { arrayBufferToBase64, base64ToArrayBuffer } from './util'

class SockJsClientConnectionTsonSocket extends EventEmitter
    implements TsonSocket {
    public get binaryType(): string {
        return 'arraybuffer'
    }
    public set binaryType(binaryType: string) {
        assert.equal(
            binaryType,
            'arraybuffer',
            'Argument "binaryType" must be "arraybuffer".',
        )
    }

    public get readyState(): number {
        return this.sockJs.readyState
    }

    public addEventListener = this.on
    public removeEventListener = this.off

    public constructor(private sockJs: any) {
        super()
        this.sockJs.addEventListener('open', () => this.emit('open'))
        this.sockJs.addEventListener('close', () => this.emit('close'))
        this.sockJs.addEventListener('message', ({ data }: { data: string }) =>
            this.emit('message', { data: base64ToArrayBuffer(data) }),
        )
    }

    public send(data: ArrayBuffer): void {
        assert.ok(
            data instanceof ArrayBuffer,
            'Argument "data" must be an ArrayBuffer.',
        )
        this.sockJs.send(arrayBufferToBase64(data))
    }

    public close(): void {
        this.sockJs.close()
    }
}

class SockJsServerConnectionTsonSocket extends EventEmitter
    implements TsonSocket {
    public get binaryType(): string {
        return 'arraybuffer'
    }
    public set binaryType(binaryType: string) {
        assert.equal(
            binaryType,
            'arraybuffer',
            'Argument "binaryType" must be "arraybuffer".',
        )
    }

    public get readyState(): number {
        return this.sockJs.readyState
    }

    public addEventListener = this.on
    public removeEventListener = this.off

    public constructor(private sockJs: any) {
        super()
        this.sockJs.on('close', () => this.emit('close'))
        this.sockJs.on('data', (data: string) =>
            this.emit('message', { data: base64ToArrayBuffer(data) }),
        )
    }

    public send(data: ArrayBuffer): void {
        assert.ok(
            data instanceof ArrayBuffer,
            'Argument "data" must be an ArrayBuffer.',
        )
        this.sockJs.write(arrayBufferToBase64(data))
    }

    public close(): void {
        this.sockJs.close()
    }
}

/**
 * Wraps a SockJS client connection, so that it could be used as a TsonSocket.
 * It allows sending and receiving binary data by encoding and decoding it as base64.
 */
export function sockJsClientConnectionToTsonSocket(
    sockJsClientConnection: any,
): TsonSocket {
    return new SockJsClientConnectionTsonSocket(sockJsClientConnection)
}

/**
 * Wraps a SockJS server connection, so that it could be used as a TsonSocket.
 * It allows sending and receiving binary data by encoding and decoding it as base64.
 */
export function sockJsServerConnectionToTsonSocket(
    sockJsServerConnection: any,
): TsonSocket {
    return new SockJsServerConnectionTsonSocket(sockJsServerConnection)
}
