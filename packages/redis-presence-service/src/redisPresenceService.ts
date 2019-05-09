import { AuthService } from '@syncot/auth'
import { Connection } from '@syncot/connection'
import { createAuthError, createPresenceError } from '@syncot/error'
import { getRedisSubscriber } from '@syncot/ioredis-subscriber'
import {
    Presence,
    PresenceService,
    PresenceServiceEvents,
    validatePresence,
} from '@syncot/presence'
import { SessionManager } from '@syncot/session'
import { decode, encode } from '@syncot/tson'
import { Id, idEqual, isId, SyncOtEmitter, throwError } from '@syncot/util'
import { strict as assert } from 'assert'
import Redis from 'ioredis'
import { Duplex } from 'stream'
import { PresenceStream } from './presenceStream'
import { defineRedisCommands, PresenceCommands } from './redisCommands'
import { EncodedPresence, PresenceServiceOptions } from './types'

export class RedisPresenceService extends SyncOtEmitter<PresenceServiceEvents>
    implements PresenceService {
    private readonly redis: Redis.Redis & PresenceCommands
    private ttl: number = 60
    private presenceSizeLimit: number = 1024
    private encodedPresence: EncodedPresence | undefined = undefined
    private shouldStorePresence: boolean = false
    private updatingRedis: boolean = false
    private updateHandle: NodeJS.Timeout | undefined
    private modified: boolean = false
    private inSync: boolean = true
    private presenceStreams: Set<Duplex> = new Set()

    public constructor(
        private readonly connection: Connection,
        private readonly sessionService: SessionManager,
        private readonly authService: AuthService,
        redis: Redis.Redis,
        private readonly redisSubscriber: Redis.Redis,
        options: PresenceServiceOptions,
    ) {
        super()

        this.redis = defineRedisCommands(redis)

        if (typeof options.ttl !== 'undefined') {
            assert.ok(
                Number.isSafeInteger(options.ttl) && options.ttl >= 10,
                'Argument "options.ttl" must be undefined or a safe integer >= 10.',
            )
            this.ttl = options.ttl
        }

        if (typeof options.presenceSizeLimit !== 'undefined') {
            assert.ok(
                Number.isSafeInteger(options.presenceSizeLimit) &&
                    options.presenceSizeLimit >= 9,
                'Argument "options.presenceSizeLimit" must be undefined or a safe integer >= 9.',
            )
            this.presenceSizeLimit = options.presenceSizeLimit
        }

        this.connection.registerService({
            instance: this,
            name: 'presence',
            requestNames: new Set([
                'submitPresence',
                'removePresence',
                'getPresenceBySessionId',
                'getPresenceByUserId',
                'getPresenceByLocationId',
                'streamPresenceBySessionId',
                'streamPresenceByLocationId',
                'streamPresenceByUserId',
            ]),
        })

        this.authService.on('authEnd', this.onAuthEnd)
        this.sessionService.on('sessionInactive', this.onSessionInactive)
    }

    public destroy(): void {
        if (this.destroyed) {
            return
        }
        this.authService.off('authEnd', this.onAuthEnd)
        this.sessionService.off('sessionInactive', this.onSessionInactive)
        this.ensureNoPresence()
        this.presenceStreams.forEach(stream => stream.destroy())
        this.presenceStreams.clear()
        super.destroy()
    }

    public async submitPresence(presence: Presence): Promise<void> {
        this.assertOk()
        throwError(validatePresence(presence))

        const sessionId = this.sessionService.getSessionId()
        if (!idEqual(presence.sessionId, sessionId)) {
            throw createPresenceError('Session ID mismatch.')
        }

        const userId = this.authService.getUserId()
        if (!idEqual(presence.userId, userId)) {
            throw createPresenceError('User ID mismatch.')
        }

        const encodedPresence: EncodedPresence = [
            encode(presence.sessionId),
            encode(presence.userId),
            encode(presence.locationId),
            encode(presence.data),
            encode(Date.now()),
        ]
        const presenceSize =
            encodedPresence[0].length +
            encodedPresence[1].length +
            encodedPresence[2].length +
            encodedPresence[3].length +
            encodedPresence[4].length
        if (presenceSize > this.presenceSizeLimit) {
            throw createPresenceError('Presence size limit exceeded.')
        }

        if (!(await this.authService.mayWritePresence(presence))) {
            throw createAuthError(
                'Not authorized to submit this presence object.',
            )
        }

        this.encodedPresence = encodedPresence
        this.shouldStorePresence = true
        this.modified = true
        this.scheduleUpdateRedis()

        return
    }

    public async removePresence(): Promise<void> {
        // Explicit authentication is not needed because if the user is not authenticated,
        // then any existing presence is automatically removed and new presence cannot be
        // submitted. Consequently, the state of this service cannot be affected by an
        // unauthenticated user.
        this.ensureNoPresence()
    }

    public async getPresenceBySessionId(
        sessionId: Id,
    ): Promise<Presence | null> {
        this.assertOk()

        try {
            const encodedPresence = await this.redis.presenceGetBySessionIdBuffer(
                encode(sessionId),
            )
            return await this.decodePresence(encodedPresence)
        } catch (error) {
            throw createPresenceError(
                'Failed to load presence by sessionId.',
                error,
            )
        }
    }

    public async getPresenceByUserId(userId: Id): Promise<Presence[]> {
        this.assertOk()

        try {
            const encodedPresenceArray = await this.redis.presenceGetByUserIdBuffer(
                encode(userId),
            )
            return (await Promise.all(
                encodedPresenceArray.map(this.decodePresence),
            )).filter(notNull) as Presence[]
        } catch (error) {
            throw createPresenceError(
                'Failed to load presence by userId.',
                error,
            )
        }
    }

    public async getPresenceByLocationId(locationId: Id): Promise<Presence[]> {
        this.assertOk()

        try {
            const encodedPresenceArray = await this.redis.presenceGetByLocationIdBuffer(
                encode(locationId),
            )
            return (await Promise.all(
                encodedPresenceArray.map(this.decodePresence),
            )).filter(notNull) as Presence[]
        } catch (error) {
            throw createPresenceError(
                'Failed to load presence by locationId.',
                error,
            )
        }
    }

    public async streamPresenceBySessionId(sessionId: Id): Promise<Duplex> {
        this.assertOk()

        const channel = Buffer.concat([sessionIdKeyPrefix, encode(sessionId)])
        const getPresence = async (): Promise<Presence[]> => {
            const presence = await this.getPresenceBySessionId(sessionId)
            return presence ? [presence] : []
        }
        const shouldAdd = (presence: Presence | null): presence is Presence =>
            !!presence
        return this.streamPresence(channel, getPresence, shouldAdd)
    }

    public async streamPresenceByUserId(userId: Id): Promise<Duplex> {
        this.assertOk()
        const channel = Buffer.concat([userIdKeyPrefix, encode(userId)])
        const getPresence = (): Promise<Presence[]> =>
            this.getPresenceByUserId(userId)
        const shouldAdd = (presence: Presence | null): presence is Presence =>
            !!presence && idEqual(presence.userId, userId)
        return this.streamPresence(channel, getPresence, shouldAdd)
    }

    public async streamPresenceByLocationId(locationId: Id): Promise<Duplex> {
        this.assertOk()
        const channel = Buffer.concat([locationIdKeyPrefix, encode(locationId)])
        const getPresence = (): Promise<Presence[]> =>
            this.getPresenceByLocationId(locationId)
        const shouldAdd = (presence: Presence | null): presence is Presence =>
            !!presence && idEqual(presence.locationId, locationId)
        return this.streamPresence(channel, getPresence, shouldAdd)
    }

    private async streamPresence(
        channel: Buffer,
        getPresence: () => Promise<Presence[]>,
        shouldAdd: (presence: Presence | null) => presence is Presence,
    ): Promise<Duplex> {
        this.assertOk()

        const stream = new PresenceStream()
        const subscriber = getRedisSubscriber(this.redisSubscriber)

        const resetPresence = async () => {
            try {
                stream.resetPresence(await getPresence())
            } catch (error) {
                stream.resetPresence([])
                this.emitAsync('error', error)
            }
        }

        const onMessage = async (_topic: Buffer, encodedId: Buffer) => {
            try {
                const id = this.decodeSessionId(encodedId)
                try {
                    const presence = await this.getPresenceBySessionId(id)
                    if (shouldAdd(presence)) {
                        stream.addPresence(presence)
                    } else {
                        stream.removePresence(id)
                    }
                } catch (error) {
                    stream.removePresence(id)
                    this.emitAsync('error', error)
                }
            } catch (error) {
                this.emitAsync('error', error)
            }
        }

        const onClose = () => {
            stream.resetPresence([])
        }

        resetPresence()
        const handle = setInterval(resetPresence, this.ttl * 1000)
        this.redis.on('ready', resetPresence)
        this.redis.on('close', onClose)
        subscriber.onChannel(channel, onMessage)
        this.presenceStreams.add(stream)

        stream.once('close', () => {
            clearInterval(handle)
            this.redis.off('ready', resetPresence)
            this.redis.off('close', onClose)
            subscriber.offChannel(channel, onMessage)
            this.presenceStreams.delete(stream)
        })

        return stream
    }

    private assertOk(): void {
        this.assertNotDestroyed()
        this.assertAuthenticated()
    }

    private assertAuthenticated(): void {
        if (!this.authService.hasAuthenticatedUserId()) {
            throw createAuthError('No authenticated user.')
        }

        if (!this.sessionService.hasActiveSession()) {
            throw createAuthError('No active session.')
        }
    }

    private scheduleUpdateRedis(delaySeconds: number = 0): void {
        if (this.destroyed) {
            return
        }
        this.cancelUpdateRedis()
        this.updateHandle = setTimeout(() => {
            this.updateHandle = undefined
            this.updateRedis()
        }, Math.max(0, Math.floor(delaySeconds * 1000)))
    }

    private cancelUpdateRedis(): void {
        if (this.updateHandle) {
            clearTimeout(this.updateHandle)
            this.updateHandle = undefined
        }
    }

    private async updateRedis(): Promise<void> {
        if (this.updatingRedis || !this.encodedPresence) {
            return
        }

        const wasModified = this.modified

        try {
            this.updatingRedis = true

            if (this.modified) {
                this.emitOutOfSync()
                this.modified = false
            }

            if (this.shouldStorePresence) {
                await this.redis.presenceUpdate(
                    this.encodedPresence[0],
                    this.encodedPresence[1],
                    this.encodedPresence[2],
                    this.encodedPresence[3],
                    this.encodedPresence[4],
                    this.ttl,
                    wasModified ? 1 : 0,
                )
            } else if (wasModified) {
                await this.redis.presenceDelete(this.encodedPresence[0])
            }

            if (this.modified) {
                this.scheduleUpdateRedis()
            } else {
                this.emitInSync()
                if (this.encodedPresence) {
                    // Refresh after 90% of ttl has elapsed.
                    this.scheduleUpdateRedis(this.ttl - 1)
                }
            }
        } catch (error) {
            if (wasModified) {
                this.modified = true
            }
            this.emitAsync(
                'error',
                createPresenceError(
                    'Failed to sync presence with Redis.',
                    error,
                ),
            )
            // Retry after between 1 and 10 seconds.
            this.scheduleUpdateRedis(1 + Math.random() * 9)
        } finally {
            this.updatingRedis = false
        }
    }

    private emitInSync(): void {
        if (!this.inSync) {
            this.inSync = true
            this.emitAsync('inSync')
        }
    }

    private emitOutOfSync(): void {
        if (this.inSync) {
            this.inSync = false
            this.emitAsync('outOfSync')
        }
    }

    private ensureNoPresence(): void {
        if (this.shouldStorePresence) {
            this.shouldStorePresence = false
            this.modified = true
        }
        this.scheduleUpdateRedis()
    }

    private onAuthEnd = (): void => {
        this.ensureNoPresence()
    }

    private onSessionInactive = (): void => {
        this.ensureNoPresence()
    }

    private decodePresence = async (
        encodedPresence: EncodedPresence,
    ): Promise<Presence | null> => {
        if (
            encodedPresence[0] === null ||
            encodedPresence[1] === null ||
            encodedPresence[2] === null ||
            encodedPresence[3] === null ||
            encodedPresence[4] === null
        ) {
            return null
        }

        let presence: Presence

        try {
            presence = {
                data: decode(encodedPresence[3]),
                lastModified: decode(encodedPresence[4]) as number,
                locationId: decode(encodedPresence[2]) as Id,
                sessionId: decode(encodedPresence[0]) as Id,
                userId: decode(encodedPresence[1]) as Id,
            }

            throwError(validatePresence(presence))
        } catch (error) {
            throw createPresenceError('Invalid presence.', error)
        }

        if (!(await this.authService.mayReadPresence(presence))) {
            return null
        }

        return presence
    }

    private decodeSessionId(encodedSessionId: Buffer): Id {
        let id
        try {
            id = decode(encodedSessionId)
        } catch (error) {
            throw createPresenceError('Cannot decode sessionId.', error)
        }
        if (!isId(id)) {
            throw createPresenceError('Invalid sessionId.')
        }
        return id
    }
}

function notNull(value: any): boolean {
    return value !== null
}

const sessionIdKeyPrefix = Buffer.from('presence:sessionId=')
const userIdKeyPrefix = Buffer.from('presence:userId=')
const locationIdKeyPrefix = Buffer.from('presence:locationId=')
