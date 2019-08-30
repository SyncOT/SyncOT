export function notNull(value: any): boolean {
    return value !== null
}

export const sessionPrefix = 'presence:sessionId='
export const userPrefix = 'presence:userId='
export const locationPrefix = 'presence:locationId='
export const connectionPrefix = 'presence:connectionId='
export const connectionsKey = 'connections'

export const whenEvent = (event: string) => (emitter: {
    once: (event: string, callback: () => any) => any
}) => new Promise(resolve => emitter.once(event, resolve))
export const whenData = whenEvent('data')
export const whenClose = whenEvent('close')
export const whenError = whenEvent('error')

/**
 * Returns a Set of connection IDs
 * obtained by parsing the string returned by the `CLIENT LIST` Redis command.
 */
export function extractConnectionIds(clientList: string): number[] {
    const connectionIds: number[] = []
    clientList.split('\n').forEach(line => {
        const match = /(?:^| )id=(\d+)(?: |$)/.exec(line)
        if (match) {
            connectionIds.push(parseInt(match[1], 10))
        }
    })
    return connectionIds
}
