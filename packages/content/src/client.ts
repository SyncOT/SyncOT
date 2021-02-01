import { Auth } from '@syncot/auth'
import { Connection } from '@syncot/connection'
import { assert } from '@syncot/util'
import { Duplex } from 'readable-stream'
import { ContentBackend } from './backend'
import { Operation } from './operation'
import { requestNames } from './requestNames'
import { Schema } from './schema'
import { ContentService } from './service'
import { Snapshot } from './snapshot'

/**
 * The client interface for managing content.
 */
export interface ContentClient extends ContentBackend {
    /**
     * The Auth instance used for authentication and authorization.
     */
    readonly auth: Auth
}

/**
 * Options expected by `createContentClient`.
 */
export interface CreateContentClientOptions {
    /**
     * A `Connection` instance for communication with a `ContentService`.
     */
    connection: Connection
    /**
     * The name of the `ContentService` on the `connection`.
     * Default is `'content'`.
     */
    serviceName?: string
    /**
     * The Auth instance to use for authentication and authorization.
     */
    auth: Auth
}

/**
 * Creates a ContentClient.
 */
export function createContentClient({
    connection,
    auth: authClient,
    serviceName = 'content',
}: CreateContentClientOptions): ContentClient {
    return new Client(connection, authClient, serviceName)
}

class Client implements ContentClient {
    private readonly proxy: ContentService

    public constructor(
        private readonly connection: Connection,
        public readonly auth: Auth,
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

        this.proxy = this.connection.registerProxy({
            name: serviceName,
            requestNames,
        }) as ContentService
    }

    public registerSchema(schema: Schema): Promise<void> {
        return this.proxy.registerSchema(schema)
    }

    public getSchema(key: string): Promise<Schema | null> {
        return this.proxy.getSchema(key)
    }

    public getSnapshot(
        type: string,
        id: string,
        version: number,
    ): Promise<Snapshot> {
        return this.proxy.getSnapshot(type, id, version)
    }

    public submitOperation(operation: Operation): Promise<void> {
        return this.proxy.submitOperation(operation)
    }

    public streamOperations(
        type: string,
        id: string,
        versionStart: number,
        versionEnd: number,
    ): Promise<Duplex> {
        return this.proxy.streamOperations(type, id, versionStart, versionEnd)
    }
}
