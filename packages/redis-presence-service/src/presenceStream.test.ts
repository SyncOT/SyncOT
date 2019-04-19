import { Presence } from '@syncot/presence'
import { Clock, install as installClock, InstalledClock } from 'lolex'
import { PresenceStream } from './presenceStream'

const now = 12345
let clock: InstalledClock<Clock>

let loadPresence: () => Promise<Presence[]>
const ttl = 10
let presenceStream: PresenceStream

beforeEach(() => {
    clock = installClock({ now })
    loadPresence = jest.fn().mockResolvedValue([])
    presenceStream = new PresenceStream(loadPresence, ttl)
})

afterEach(() => {
    clock.uninstall()
    presenceStream.destroy()
})

test('ttl validation', () => {
    const errorMatcher = expect.objectContaining({
        message: 'Argument "pollingInterval" must be a safe integer >= 10.',
        name: 'AssertionError [ERR_ASSERTION]',
    })
    expect(() => new PresenceStream(loadPresence, 9)).toThrow(errorMatcher)
    expect(() => new PresenceStream(loadPresence, 10.5)).toThrow(errorMatcher)
    expect(() => new PresenceStream(loadPresence, Infinity)).toThrow(
        errorMatcher,
    )
})

test('loadPresence scheduling', () => {
    expect(loadPresence).toHaveBeenCalledTimes(1)

    clock.tick(ttl * 1000 - 1)
    expect(loadPresence).toHaveBeenCalledTimes(1)
    clock.tick(1)
    expect(loadPresence).toHaveBeenCalledTimes(2)

    clock.tick(ttl * 1000 - 1)
    expect(loadPresence).toHaveBeenCalledTimes(2)
    clock.tick(1)
    expect(loadPresence).toHaveBeenCalledTimes(3)

    clock.tick(ttl * 1000)
    expect(loadPresence).toHaveBeenCalledTimes(4)
})
