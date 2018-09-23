export function never(message?: string): never {
    throw new Error(message || 'Should never happen')
}
