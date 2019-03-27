import { strict as assert } from 'assert'

export function randomInteger(
    minInclusive: number,
    maxExclusive: number,
): number {
    assert.ok(
        Number.isSafeInteger(minInclusive),
        'Argument "minInclusive" must be a safe integer.',
    )
    assert.ok(
        Number.isSafeInteger(maxExclusive),
        'Argument "maxExclusive" must be a safe integer.',
    )
    assert.ok(
        minInclusive <= maxExclusive,
        'Argument "minInclusive" must be less or equal to argument "maxExclusive".',
    )

    return Math.floor(
        minInclusive + Math.random() * (maxExclusive - minInclusive),
    )
}
