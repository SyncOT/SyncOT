import { Binary, toArrayBuffer, toBuffer } from '@syncot/util'
import { strict as assert } from 'assert'
import { EventEmitter } from 'events'
import { TsonSocket } from './tsonSocketStream'

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
            this.emit('message', {
                data: toArrayBuffer(Buffer.from(data, 'base64')),
            }),
        )
        this.sockJs.addEventListener('error', (event: any) => {
            this.emit('error', event)
        })
    }

    public send(data: Binary): void {
        const buffer = toBuffer(data)
        assert.ok(buffer, 'Argument "data" must be a Binary.')
        this.sockJs.send(buffer.toString('base64'))
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
            this.emit('message', {
                data: toArrayBuffer(Buffer.from(data, 'base64')),
            }),
        )
        this.sockJs.on('error', (event: any) => {
            this.emit('error', event)
        })
    }

    public send(data: Binary): void {
        const buffer = toBuffer(data)
        assert.ok(buffer, 'Argument "data" must be a Binary.')
        this.sockJs.write(buffer.toString('base64'))
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
