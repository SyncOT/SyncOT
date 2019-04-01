import { strict as assert } from 'assert'
import { BinaryType, isBinary, toBuffer } from './buffer'

export type Scalar = BinaryType | string | number | boolean | null | undefined

export function isScalar(value: any): value is Scalar {
    if (value == null) {
        return true
    }

    const type = typeof value

    if (type === 'number' || type === 'string' || type === 'boolean') {
        return true
    }

    if (isBinary(value)) {
        return true
    }

    return false
}

/**
 * A simple map which supports only scalar values as keys.
 * The main difference from the standard JS Map is that the ScalarMap
 * compares binary types by their values rather than identity.
 */
export class ScalarMap<K extends Scalar, V> {
    private _binaryEntries: Map<string, V> | undefined = undefined
    private get binaryEntries(): Map<string, V> {
        if (!this._binaryEntries) {
            this._binaryEntries = new Map()
        }
        return this._binaryEntries
    }

    private _otherEntries: Map<K, V> | undefined = undefined
    private get otherEntries(): Map<K, V> {
        if (!this._otherEntries) {
            this._otherEntries = new Map()
        }
        return this._otherEntries
    }

    public get size(): number {
        let size = 0

        if (this._binaryEntries) {
            size += this._binaryEntries.size
        }

        if (this._otherEntries) {
            size += this._otherEntries.size
        }

        return size
    }

    public clear(): void {
        this._binaryEntries = undefined
        this._otherEntries = undefined
    }

    public delete(key: K): boolean {
        assert.ok(isScalar(key), 'Argument "key" must be a scalar value.')

        const buffer = toBuffer(key)

        if (buffer) {
            return this.binaryEntries.delete(buffer.toString('binary'))
        } else {
            return this.otherEntries.delete(key)
        }
    }

    public get(key: K): V | undefined {
        assert.ok(isScalar(key), 'Argument "key" must be a scalar value.')

        const buffer = toBuffer(key)

        if (buffer) {
            return this.binaryEntries.get(buffer.toString('binary'))
        } else {
            return this.otherEntries.get(key)
        }
    }

    public has(key: K): boolean {
        assert.ok(isScalar(key), 'Argument "key" must be a scalar value.')

        const buffer = toBuffer(key)

        if (buffer) {
            return this.binaryEntries.has(buffer.toString('binary'))
        } else {
            return this.otherEntries.has(key)
        }
    }

    public set(key: K, value: V): this {
        assert.ok(isScalar(key), 'Argument "key" must be a scalar value.')

        const buffer = toBuffer(key)

        if (buffer) {
            this.binaryEntries.set(buffer.toString('binary'), value)
        } else {
            this.otherEntries.set(key, value)
        }

        return this
    }
}
