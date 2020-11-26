import { Duplex } from 'readable-stream'
import { assert } from '@syncot/util'
import { Operation } from './content'

/**
 * An Operation object stream which emits data events whenever new Operation objects are added.
 */
export class OperationStream extends Duplex {
    private _versionNext: number
    public get versionNext(): number {
        return this._versionNext
    }

    public constructor(
        public readonly type: string,
        public readonly id: string,
        public readonly versionStart: number,
        public readonly versionEnd: number,
    ) {
        super(streamOptions)
        assert(
            typeof versionStart === 'number',
            '"versionStart" must be a number.',
        )
        assert(typeof versionEnd === 'number', '"versionEnd" must be a number.')
        assert(
            versionStart <= versionEnd,
            '"versionStart" must be less or equal to "versionEnd".',
        )

        this._versionNext = versionStart

        if (this._versionNext >= this.versionEnd) {
            this.push(null)
        }
    }

    public _read() {
        // Nothing to do.
    }
    public _write(
        _data: any,
        _encoding: any,
        callback: (error?: Error | null) => void,
    ) {
        callback(new TypeError('OperationStream does not support "write".'))
    }
    public _final(callback: () => void) {
        callback()
        this.destroy()
    }

    /**
     * Pushes the `operation` to the stream and:
     * - discards duplicates,
     * - verifies that operations are added in order,
     * - closes the stream upon reaching the versionLimit.
     */
    public pushOperation(operation: Operation): void {
        if (this._versionNext >= this.versionEnd) {
            return
        }
        if (operation.version < this._versionNext) {
            return
        }
        if (operation.version > this._versionNext) {
            throw new RangeError('operation.version out of sequence.')
        }

        this._versionNext++
        this.push(operation)

        if (this._versionNext >= this.versionEnd) {
            this.push(null)
        }
    }
}

const streamOptions = {
    allowHalfOpen: false,
    objectMode: true,
}
