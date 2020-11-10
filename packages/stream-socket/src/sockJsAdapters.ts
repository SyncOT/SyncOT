import { EventEmitter } from 'events'
import { Socket } from './stream'

class SockJsClientConnectionSocket extends EventEmitter implements Socket {
    public get readyState(): number {
        return this.sockJs.readyState
    }

    public addEventListener = this.on
    public removeEventListener = this.off

    public constructor(private sockJs: any) {
        super()
        this.sockJs.addEventListener('open', () => this.emit('open'))
        this.sockJs.addEventListener('close', () => this.emit('close'))
        this.sockJs.addEventListener('message', (event: { data: string }) =>
            this.emit('message', event),
        )
        this.sockJs.addEventListener('error', (event: any) => {
            this.emit('error', event)
        })
    }

    public send(data: string): void {
        this.sockJs.send(data)
    }

    public close(): void {
        this.sockJs.close()
    }
}

class SockJsServerConnectionSocket extends EventEmitter implements Socket {
    public get readyState(): number {
        return this.sockJs.readyState
    }

    public addEventListener = this.on
    public removeEventListener = this.off

    public constructor(private sockJs: any) {
        super()
        this.sockJs.on('close', () => this.emit('close'))
        this.sockJs.on('data', (data: string) => this.emit('message', { data }))
        this.sockJs.on('error', (event: any) => {
            this.emit('error', event)
        })
    }

    public send(data: string): void {
        this.sockJs.write(data)
    }

    public close(): void {
        this.sockJs.close()
    }
}

/**
 * Wraps a SockJS client connection, so that it could be used as a Socket.
 */
export function sockJsClientConnectionToSocket(
    sockJsClientConnection: any,
): Socket {
    return new SockJsClientConnectionSocket(sockJsClientConnection)
}

/**
 * Wraps a SockJS server connection, so that it could be used as a Socket.
 */
export function sockJsServerConnectionToSocket(
    sockJsServerConnection: any,
): Socket {
    return new SockJsServerConnectionSocket(sockJsServerConnection)
}
