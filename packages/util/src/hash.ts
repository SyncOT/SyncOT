import { fromByteArray } from 'base64-js'
import md5 from 'blueimp-md5'

/**
 * Calculates a hash of any data.
 *
 * Here's the algorithm:
 * - Stringify `data` using `JSON.stringify` with a suitable `replacer`,
 * which eliminates the non-determinism caused by the undefined order of keys in objects.
 * - Calculate an MD5 hash of the obtained string as a raw string.
 * - Encode the raw string as a base64 string.
 * - Return the base64 string.
 *
 * @param data The input data.
 * @returns The hash of the `data` as a base64 string.
 */
export function hash(data: any): string {
    const string = JSON.stringify(data, replacer) || ''
    const rawHash = md5(string, undefined, true)
    const { length } = rawHash
    const byteArray = new Uint8Array(length)
    for (let i = 0; i < length; i++) {
        byteArray[i] = rawHash.charCodeAt(i)
    }
    return fromByteArray(byteArray)
}

/**
 * Replaces objects like:
 * { 'any-key-2': 'any-value-2', 'any-key-1': 'any-value-1' }
 * with:
 * [ 'O', 'any-key-1', 'any-value-1', 'any-key-2', 'any-value-2' ]
 * by flattening objects into arrays, sorted by key and prefixed by "O".
 *
 * Replaces arrays like:
 * [ 'item-2', 'item-1' ]
 * with:
 * [ 'A', 'item-2', 'item-1' ]
 * by prefixing arrays with "A".
 */
export function replacer(this: any, _key: string, value: any): any {
    if (Array.isArray(value)) {
        const { length } = value
        const array = new Array(length + 1)
        let o = 0
        array[o++] = 'A'
        for (let i = 0; i < length; i++) {
            array[o++] = value[i]
        }
        return array
    }

    if (typeof value === 'object' && value !== null) {
        const keys = Object.keys(value).sort()
        const { length } = keys
        const array = new Array(length * 2 + 1)
        let o = 0
        array[o++] = 'O'
        for (let i = 0; i < length; i += 1) {
            const k = keys[i]
            const v = value[k]
            const t = typeof v
            // Discard properties with unsupported values for compatibility with `JSON.stringify`.
            // See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify
            if (t !== 'undefined' && t !== 'function' && t !== 'symbol') {
                array[o++] = k
                array[o++] = v
            }
        }
        if (array.length !== o) {
            // Reduce the array length in case any properties were omitted.
            array.length = o
        }
        return array
    }

    return value
}
