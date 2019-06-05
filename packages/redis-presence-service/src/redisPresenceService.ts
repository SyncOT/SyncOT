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
import { decode, encode } from '@syncot/tson'
import { SyncOtEmitter, throwError } from '@syncot/util'
import { strict as assert } from 'assert'
import Redis from 'ioredis'
import { Duplex } from 'readable-stream'
import { PresenceStream } from './presenceStream'
import { defineRedisCommands, PresenceCommands } from './redisCommands'
import { EncodedPresence, PresenceServiceOptions } from './types'

export const requestNames = new Set([
    'submitPresence',
    'removePresence',
    'getPresenceBySessionId',
    'getPresenceByUserId',
    'getPresenceByLocationId',
    'streamPresenceBySessionId',
    'streamPresenceByLocationId',
    'streamPresenceByUserId',
])

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
        private readonly authService: AuthService,
        redis: Redis.Redis,
        private readonly redisSubscriber: Redis.Redis,
        options: PresenceServiceOptions,
    ) {
        super()

        assert.ok(
            this.connection && !this.connection.destroyed,
            'Argument "connection" must be a non-destroyed Connection.',
        )
        assert.ok(
            this.authService && !this.authService.destroyed,
            'Argument "authService" must be a non-destroyed AuthService.',
        )

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
                    options.presenceSizeLimit >= 3,
                'Argument "options.presenceSizeLimit" must be undefined or a safe integer >= 3.',
            )
            this.presenceSizeLimit = options.presenceSizeLimit
        }

        this.connection.registerService({
            instance: this,
            name: 'presence',
            requestNames,
        })

        this.redis = defineRedisCommands(redis)
        this.redis.on('ready', this.onReady)
        this.connection.on('destroy', this.onDestroy)
        this.authService.on('destroy', this.onDestroy)
        this.authService.on('inactive', this.onInactive)
    }

    public destroy(): void {
        if (this.destroyed) {
            return
        }

        this.redis.off('ready', this.onReady)
        this.connection.off('destroy', this.onDestroy)
        this.authService.off('destroy', this.onDestroy)
        this.authService.off('inactive', this.onInactive)

        this.ensureNoPresence()
        this.presenceStreams.forEach(stream => stream.destroy())
        this.presenceStreams.clear()
        super.destroy()
    }

    public async submitPresence(presence: Presence): Promise<void> {
        this.assertOk()
        throwError(validatePresence(presence))

        if (presence.sessionId !== this.authService.sessionId) {
            throw createPresenceError('Session ID mismatch.')
        }

        if (presence.userId !== this.authService.userId) {
            throw createPresenceError('User ID mismatch.')
        }

        const encodedPresence: EncodedPresence = [
            Buffer.from(presence.sessionId),
            Buffer.from(presence.userId),
            Buffer.from(presence.locationId),
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
        this.updateRedis()

        return
    }

    public async removePresence(): Promise<void> {
        this.assertNotDestroyed()
        // Explicit authentication is not needed because if the user is not authenticated,
        // then any existing presence is automatically removed and new presence cannot be
        // submitted. Consequently, the state of this service cannot be affected by an
        // unauthenticated user.
        this.ensureNoPresence()
    }

    public async getPresenceBySessionId(
        sessionId: string,
    ): Promise<Presence | null> {
        this.assertOk()

        try {
            const encodedPresence = await this.redis.presenceGetBySessionIdBuffer(
                sessionId as any,
            )
            return await this.decodePresence(encodedPresence)
        } catch (error) {
            throw createPresenceError(
                'Failed to load presence by sessionId.',
                error,
            )
        }
    }

    public async getPresenceByUserId(userId: string): Promise<Presence[]> {
        this.assertOk()

        try {
            const encodedPresenceArray = await this.redis.presenceGetByUserIdBuffer(
                userId as any,
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

    public async getPresenceByLocationId(
        locationId: string,
    ): Promise<Presence[]> {
        this.assertOk()

        try {
            const encodedPresenceArray = await this.redis.presenceGetByLocationIdBuffer(
                locationId as any,
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

    public async streamPresenceBySessionId(sessionId: string): Promise<Duplex> {
        this.assertOk()

        const channel = sessionIdKeyPrefix + sessionId
        const getPresence = async (): Promise<Presence[]> => {
            const presence = await this.getPresenceBySessionId(sessionId)
            return presence ? [presence] : []
        }
        const shouldAdd = (presence: Presence | null): presence is Presence =>
            !!presence
        return this.streamPresence(channel, getPresence, shouldAdd)
    }

    public async streamPresenceByUserId(userId: string): Promise<Duplex> {
        this.assertOk()
        const channel = userIdKeyPrefix + userId
        const getPresence = (): Promise<Presence[]> =>
            this.getPresenceByUserId(userId)
        const shouldAdd = (presence: Presence | null): presence is Presence =>
            !!presence && presence.userId === userId
        return this.streamPresence(channel, getPresence, shouldAdd)
    }

    public async streamPresenceByLocationId(
        locationId: string,
    ): Promise<Duplex> {
        this.assertOk()
        const channel = locationIdKeyPrefix + locationId
        const getPresence = (): Promise<Presence[]> =>
            this.getPresenceByLocationId(locationId)
        const shouldAdd = (presence: Presence | null): presence is Presence =>
            !!presence && presence.locationId === locationId
        return this.streamPresence(channel, getPresence, shouldAdd)
    }

    private async streamPresence(
        channel: string,
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

        const onMessage = async (_topic: string, id: string) => {
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
        }

        const onClose = () => {
            stream.resetPresence([])
        }

        resetPresence()
        const handle = setInterval(resetPresence, this.ttl * 1000)
        this.redis.setMaxListeners(this.redis.getMaxListeners() + 1)
        this.redis.on('ready', resetPresence)
        this.redis.on('close', onClose)
        subscriber.onChannel(channel, onMessage)
        this.presenceStreams.add(stream)

        stream.once('close', () => {
            clearInterval(handle)
            this.redis.off('ready', resetPresence)
            this.redis.off('close', onClose)
            this.redis.setMaxListeners(
                Math.max(this.redis.getMaxListeners() - 1, 0),
            )
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
        if (!this.authService.active) {
            throw createAuthError('No authenticated user.')
        }
    }

    private scheduleUpdateRedis(delaySeconds: number): void {
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
        /* istanbul ignore if */
        if (this.destroyed) {
            // It should not be possible to get here but check just in case.
            return
        }
        this.cancelUpdateRedis()

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
                this.scheduleUpdateRedis(0)
            } else {
                this.emitInSync()
                // Refresh 1 second before ttl has elapsed.
                this.scheduleUpdateRedis(this.ttl - 1)
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
        this.updateRedis()
    }

    private onInactive = (): void => {
        this.ensureNoPresence()
    }

    private onDestroy = (): void => {
        this.destroy()
    }

    private onReady = (): void => {
        this.updateRedis()
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
                locationId: encodedPresence[2].toString() as string,
                sessionId: encodedPresence[0].toString() as string,
                userId: encodedPresence[1].toString() as string,
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
}

function notNull(value: any): boolean {
    return value !== null
}

const sessionIdKeyPrefix = 'presence:sessionId='
const userIdKeyPrefix = 'presence:userId='
const locationIdKeyPrefix = 'presence:locationId='
