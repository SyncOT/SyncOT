import { Auth, createAuthError } from '@syncot/auth'
import { Connection } from '@syncot/connection'
import { assert } from '@syncot/util'
import { Duplex } from 'readable-stream'
import { ContentBackend } from './backend'
import { Content } from './content'
import { Operation, validateOperation } from './operation'
import { requestNames } from './requestNames'
import { Schema, validateSchema } from './schema'
import { Snapshot } from './snapshot'
import { minVersion, maxVersion } from './limits'

/**
 * The options expected by `createContentService`.
 */
export interface CreateContentServiceOptions {
    /**
     * The connection for communication with the ContentClient.
     */
    connection: Connection
    /**
     * The Auth instance used for authentication and authorization.
     */
    auth: Auth
    /**
     * The ContentBackend instance to use for managing content.
     */
    contentBackend: ContentBackend
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
    auth,
    contentBackend,
    serviceName = 'content',
}: CreateContentServiceOptions): Content {
    return new Service(connection, auth, contentBackend, serviceName)
}

class Service implements Content {
    public constructor(
        private readonly connection: Connection,
        public readonly auth: Auth,
        private readonly contentBackend: ContentBackend,
        serviceName: string,
    ) {
        assert(
            this.connection && typeof this.connection === 'object',
            'Argument "connection" must be an object.',
        )
        assert(
            this.auth && typeof this.auth === 'object',
            'Argument "auth" must be an object.',
        )
        assert(
            this.contentBackend && typeof this.contentBackend === 'object',
            'Argument "contentBackend" must be an object.',
        )

        this.connection.registerService({
            instance: this,
            name: serviceName,
            requestNames,
        })
    }

    public async registerSchema(schema: Schema): Promise<void> {
        this.assertAuthenticated()
        validateSchema(schema)

        return this.contentBackend.registerSchema({
            hash: schema.hash,
            type: schema.type,
            data: schema.data,
            meta: {
                ...schema.meta,
                session: this.auth.sessionId,
                time: Date.now(),
                user: this.auth.userId,
            },
        })
    }

    public async getSchema(key: string): Promise<Schema | null> {
        this.assertAuthenticated()

        assert(typeof key === 'string', 'Argument "key" must be a string.')

        return this.contentBackend.getSchema(key)
    }

    public async getSnapshot(
        type: string,
        id: string,
        version: number,
    ): Promise<Snapshot> {
        this.assertAuthenticated()

        assert(typeof type === 'string', 'Argument "type" must be a string.')
        assert(typeof id === 'string', 'Argument "id" must be a string.')
        assert(
            Number.isInteger(version) &&
                version >= minVersion &&
                version <= maxVersion,
            `Argument "version" must be an integer between minVersion (inclusive) and maxVersion (inclusive).`,
        )

        if (!(await this.auth.mayReadContent(type, id)))
            throw createAuthError('Not authorized.')

        return this.contentBackend.getSnapshot(type, id, version)
    }

    public async submitOperation(operation: Operation): Promise<void> {
        this.assertAuthenticated()
        validateOperation(operation)

        if (!(await this.auth.mayWriteContent(operation.type, operation.id)))
            throw createAuthError('Not authorized.')

        return this.contentBackend.submitOperation({
            key: operation.key,
            type: operation.type,
            id: operation.id,
            version: operation.version,
            schema: operation.schema,
            data: operation.data,
            meta: {
                ...operation.meta,
                session: this.auth.sessionId,
                time: Date.now(),
                user: this.auth.userId,
            },
        })
    }

    public async streamOperations(
        type: string,
        id: string,
        versionStart: number,
        versionEnd: number,
    ): Promise<Duplex> {
        this.assertAuthenticated()

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

        if (!(await this.auth.mayReadContent(type, id)))
            throw createAuthError('Not authorized.')

        return this.contentBackend.streamOperations(
            type,
            id,
            versionStart,
            versionEnd,
        )
    }

    private assertAuthenticated(): void {
        if (!this.auth.active) {
            throw createAuthError('Not authenticated.')
        }
    }
}
