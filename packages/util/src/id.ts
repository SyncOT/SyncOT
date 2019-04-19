/**
 * The type of IDs used in SyncOT.
 */
export type Id = Buffer | string | number

/**
 * Returns true, if the specified value is an Id, otherwise returns false.
 */
export function isId(value: any): value is Id {
    const type = typeof value
    return type === 'string' || type === 'number' || Buffer.isBuffer(value)
}

/**
 * Returns true, if the two provided values are equal IDs, otherwise returns false.
 */
export function idEqual(value1: any, value2: any): boolean {
    const type = typeof value1

    if (type === 'string' || type === 'number') {
        return value1 === value2
    } else if (Buffer.isBuffer(value1) && Buffer.isBuffer(value2)) {
        return value1.equals(value2)
    } else {
        return false
    }
}
