import { Auth, createAuthError } from '@syncot/auth'
import { Connection } from '@syncot/connection'
import { assert, EmitterInterface, SyncOTEmitter } from '@syncot/util'
import { Duplex } from 'readable-stream'
import { Content } from './content'
import { Operation, validateOperation } from './operation'
import { requestNames } from './requestNames'
import { Schema, validateSchema } from './schema'
import { Snapshot } from './snapshot'
import { minVersion, maxVersion } from './limits'

/**
 * Events emitted by `ContentService`.
 */
export type ContentServiceEvents = {}

/**
 * The service interface for managing content.
 */
export interface ContentService
    extends Content,
        EmitterInterface<SyncOTEmitter<ContentServiceEvents>> {}

/**
 * The options expected by `createContentService`.
 */
export interface CreateContentServiceOptions {
    /**
     * The connection for communication with the ContentClient.
     */
    connection: Connection
    /**
     * The Auth service used to verify user permissions.
     */
    authService: Auth
    /**
     * The Content instance to use for managing content.
     */
    content: Content
    /**
     * The name of the service to register with the connection.
     * Default is `content`.
     */
    serviceName?: string
}

/**
 * Creates a new ContentService instance.
 */
export function createContentService({
    connection,
    authService,
    content,
    serviceName = 'content',
}: CreateContentServiceOptions): ContentService {
    return new Service(connection, authService, content, serviceName)
}

class Service
    extends SyncOTEmitter<ContentServiceEvents>
    implements ContentService {
    public constructor(
        private readonly connection: Connection,
        private readonly authService: Auth,
        private readonly content: Content,
        serviceName: string,
    ) {
        super()

        assert(
            this.connection && !this.connection.destroyed,
            'Argument "connection" must be a non-destroyed Connection.',
        )
        assert(
            this.authService && !this.authService.destroyed,
            'Argument "authService" must be a non-destroyed Auth service.',
        )
        assert(
            this.content && typeof this.content === 'object',
            'Argument "content" must be a Content instance.',
        )

        this.connection.registerService({
            instance: this,
            name: serviceName,
            requestNames,
        })

        this.connection.on('destroy', this.onDestroy)
        this.authService.on('destroy', this.onDestroy)
    }

    public destroy(): void {
        if (this.destroyed) return
        this.connection.off('destroy', this.onDestroy)
        this.authService.off('destroy', this.onDestroy)
        super.destroy()
    }

    public async registerSchema(schema: Schema): Promise<void> {
        this.assertOk()
        validateSchema(schema)

        return this.content.registerSchema({
            hash: schema.hash,
            type: schema.type,
            data: schema.data,
            meta: {
                ...schema.meta,
                session: this.authService.sessionId,
                time: Date.now(),
                user: this.authService.userId,
            },
        })
    }

    public async getSchema(key: string): Promise<Schema | null> {
        this.assertOk()

        assert(typeof key === 'string', 'Argument "key" must be a string.')

        return this.content.getSchema(key)
    }

    public async getSnapshot(
        type: string,
        id: string,
        version: number,
    ): Promise<Snapshot> {
        this.assertOk()

        assert(typeof type === 'string', 'Argument "type" must be a string.')
        assert(typeof id === 'string', 'Argument "id" must be a string.')
        assert(
            Number.isInteger(version) &&
                version >= minVersion &&
                version <= maxVersion,
            `Argument "version" must be an integer between minVersion (inclusive) and maxVersion (inclusive).`,
        )

        if (!(await this.authService.mayReadContent(type, id)))
            throw createAuthError('Not authorized.')

        return this.content.getSnapshot(type, id, version)
    }

    public async submitOperation(operation: Operation): Promise<void> {
        this.assertOk()
        validateOperation(operation)

        if (
            !(await this.authService.mayWriteContent(
                operation.type,
                operation.id,
            ))
        )
            throw createAuthError('Not authorized.')

        return this.content.submitOperation({
            key: operation.key,
            type: operation.type,
            id: operation.id,
            version: operation.version,
            schema: operation.schema,
            data: operation.data,
            meta: {
                ...operation.meta,
                session: this.authService.sessionId,
                time: Date.now(),
                user: this.authService.userId,
            },
        })
    }

    public async streamOperations(
        type: string,
        id: string,
        versionStart: number,
        versionEnd: number,
    ): Promise<Duplex> {
        this.assertOk()

        assert(typeof type === 'string', 'Argument "type" must be a string.')
        assert(typeof id === 'string', 'Argument "id" must be a string.')
        assert(
            Number.isInteger(versionStart) &&
                versionStart >= minVersion &&
                versionStart <= maxVersion,
            'Argument "versionStart" must be an integer between minVersion (inclusive) and maxVersion (inclusive).',
        )
        assert(
            Number.isInteger(versionEnd) &&
                versionEnd >= minVersion &&
                versionEnd <= maxVersion + 1,
            'Argument "versionEnd" must be an integer between minVersion (inclusive) and maxVersion (exclusive).',
        )

        if (!(await this.authService.mayReadContent(type, id)))
            throw createAuthError('Not authorized.')

        return this.content.streamOperations(type, id, versionStart, versionEnd)
    }

    private onDestroy = (): void => {
        this.destroy()
    }

    private assertOk(): void {
        this.assertNotDestroyed()
        this.assertAuthenticated()
    }

    private assertAuthenticated(): void {
        if (!this.authService.active) {
            throw createAuthError('Not authenticated.')
        }
    }
}
