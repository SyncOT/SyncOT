import { Auth } from '@syncot/auth'
import { Connection } from '@syncot/connection'
import { assert } from '@syncot/util'
import { Duplex } from 'readable-stream'
import { Content } from './content'
import { Operation } from './operation'
import { requestNames } from './requestNames'
import { Schema } from './schema'
import { Snapshot } from './snapshot'

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
    auth,
    serviceName = 'content',
}: CreateContentClientOptions): Content {
    return new Client(connection, auth, serviceName)
}

class Client implements Content {
    private readonly proxy: Content

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
        }) as Content
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
