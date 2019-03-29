import { toBuffer } from './buffer'

/**
 * The type of IDs used in SyncOT.
 */
export type Id = ArrayBuffer | string | number

/**
 * Returns true, if the specified value is an Id, otherwise returns false.
 */
export function isId(value: any): value is Id {
    const type = typeof value
    return (
        type === 'string' || type === 'number' || value instanceof ArrayBuffer
    )
}

/**
 * Returns true, if the two provided values are equal IDs, otherwise returns false.
 */
export function idEqual(value1: any, value2: any): boolean {
    const type = typeof value1

    if (type === 'string' || type === 'number') {
        return value1 === value2
    } else if (value1 instanceof ArrayBuffer && value2 instanceof ArrayBuffer) {
        return toBuffer(value1).compare(toBuffer(value2)) === 0
    } else {
        return false
    }
}
