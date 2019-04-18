import { Duplex } from 'stream'

const presenceStreamOptions = {
    allowHalfOpen: false,
    objectMode: true,
}

export class PresenceStream extends Duplex {
    public constructor() {
        super(presenceStreamOptions)
        this.once('finish', () => this.destroy())
    }
    public _read() {
        // Nothing to do.
    }
    public _write(_data: any, _encoding: any, callback: () => void) {
        callback()
    }
    public _final(callback: () => void) {
        callback()
    }
}
