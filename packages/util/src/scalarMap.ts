import { AssertionError } from 'assert'

type Primitive = string | number | boolean | null | undefined

export type Scalar = Buffer | Primitive

function isPrimitive(value: any): value is Primitive {
    if (value == null) {
        return true
    }

    const type = typeof value

    if (type === 'number' || type === 'string' || type === 'boolean') {
        return true
    }

    return false
}

export function isScalar(value: any): value is Scalar {
    return isPrimitive(value) || Buffer.isBuffer(value)
}

const invalidKeyError = Object.freeze(
    new AssertionError({
        message: 'Argument "key" must be a scalar value.',
    }),
)

/**
 * A simple map which supports only scalar values as keys.
 * The main difference from the standard JS Map is that the ScalarMap
 * compares Buffers by their values rather than identity.
 */
export class ScalarMap<K extends Scalar, V> {
    private _bufferEntries: Map<string, V> | undefined = undefined
    private get bufferEntries(): Map<string, V> {
        if (!this._bufferEntries) {
            this._bufferEntries = new Map()
        }
        return this._bufferEntries
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

        if (this._bufferEntries) {
            size += this._bufferEntries.size
        }

        if (this._otherEntries) {
            size += this._otherEntries.size
        }

        return size
    }

    public clear(): void {
        if (this._bufferEntries) {
            this._bufferEntries.clear()
        }
        if (this._otherEntries) {
            this._otherEntries.clear()
        }
    }

    public delete(key: K): boolean {
        if (Buffer.isBuffer(key)) {
            return this.bufferEntries.delete(key.toString('binary'))
        } else if (isScalar(key)) {
            return this.otherEntries.delete(key)
        } else {
            throw invalidKeyError
        }
    }

    public get(key: K): V | undefined {
        if (Buffer.isBuffer(key)) {
            return this.bufferEntries.get(key.toString('binary'))
        } else if (isScalar(key)) {
            return this.otherEntries.get(key)
        } else {
            throw invalidKeyError
        }
    }

    public has(key: K): boolean {
        if (Buffer.isBuffer(key)) {
            return this.bufferEntries.has(key.toString('binary'))
        } else if (isScalar(key)) {
            return this.otherEntries.has(key)
        } else {
            throw invalidKeyError
        }
    }

    public set(key: K, value: V): this {
        if (Buffer.isBuffer(key)) {
            this.bufferEntries.set(key.toString('binary'), value)
        } else if (isScalar(key)) {
            this.otherEntries.set(key, value)
        } else {
            throw invalidKeyError
        }

        return this
    }

    public forEach(
        callback: (value: V, key: K, map: this) => void,
        thisArg?: any,
    ): void {
        if (this._bufferEntries) {
            this._bufferEntries.forEach((value, key) =>
                callback.call(
                    thisArg,
                    value,
                    Buffer.from(key, 'binary') as K,
                    this,
                ),
            )
        }
        if (this._otherEntries) {
            this._otherEntries.forEach((value, key) =>
                callback.call(thisArg, value, key, this),
            )
        }
    }
}
