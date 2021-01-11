/**
 * Determines if 2 things are deep strict equal.
 * It checks arrays and objects recursively.
 * It compares only own properties of objects.
 *
 * WARNING: It can throw a stack overflow error on cyclical references.
 */
export function equal(a: any, b: any): boolean {
    if (a === b) return true

    if (Array.isArray(a)) {
        if (!Array.isArray(b)) return false
        if (a.length !== b.length) return false
        for (let i = 0; i < a.length; i++) {
            if (!equal(a[i], b[i])) return false
        }
        return true
    }
    if (Array.isArray(b)) return false

    if (typeof a === 'object' && a !== null) {
        if (typeof b !== 'object' || b === null) return false
        const keys = Object.keys(a)
        if (Object.keys(b).length !== keys.length) return false
        for (const key of keys)
            if (!Object.prototype.hasOwnProperty.call(b, key)) return false

        for (const key of keys) if (!equal(a[key], b[key])) return false
        return true
    }

    return false
}
