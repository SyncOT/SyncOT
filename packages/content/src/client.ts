import { AuthClient } from '@syncot/auth'
import { Connection } from '@syncot/connection'
import { assert, EmitterInterface, SyncOTEmitter } from '@syncot/util'
import { Duplex } from 'readable-stream'
import { Content, SubmitOperationOptions } from './content'
import { Operation } from './operation'
import { requestNames } from './requestNames'
import { Schema } from './schema'
import { ContentService } from './service'
import { Snapshot } from './snapshot'

/**
 * Events emitted by `ContentClient`.
 */
export interface ContentClientEvents {
    /**
     * When an error occurs.
     */
    error: Error
    /**
     * When the ContentClient becomes able to communicate with the ContentService.
     */
    active: void
    /**
     * When the ContentClient stops being able to communicate with the ContentService.
     */
    inactive: void
}

/**
 * The client interface for managing content.
 */
export interface ContentClient
    extends Content,
        EmitterInterface<SyncOTEmitter<ContentClientEvents>> {
    /**
     * Indicates if the ContentClient is able to communicate with the ContentService.
     */
    readonly active: boolean
    /**
     * The read-only `sessionId` from the AuthClient, exposed here for convenience.
     * It is `undefined` if, and only if, `active` is `false`.
     */
    readonly sessionId: string | undefined
    /**
     * The read-only `userId` from the AuthClient, exposed here for convenience.
     * It is `undefined` if, and only if, `active` is `false`.
     */
    readonly userId: string | undefined
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
     * The AuthClient used for authentication and authorization.
     */
    authClient: AuthClient
}

/**
 * Creates a ContentClient.
 */
export function createContentClient({
    connection,
    authClient,
    serviceName = 'content',
}: CreateContentClientOptions): ContentClient {
    return new Client(connection, authClient, serviceName)
}

class Client
    extends SyncOTEmitter<ContentClientEvents>
    implements ContentClient {
    public active: boolean = false
    public sessionId: string | undefined = undefined
    public userId: string | undefined = undefined
    private readonly contentService: ContentService

    public constructor(
        private readonly connection: Connection,
        private readonly authClient: AuthClient,
        serviceName: string,
    ) {
        super()

        assert(
            this.connection && !this.connection.destroyed,
            'Argument "connection" must be a non-destroyed Connection.',
        )
        assert(
            this.authClient && !this.authClient.destroyed,
            'Argument "authClient" must be a non-destroyed AuthClient.',
        )

        this.connection.registerProxy({
            name: serviceName,
            requestNames,
        })
        this.contentService = this.connection.getProxy(
            serviceName,
        ) as ContentService

        this.connection.on('destroy', this.onDestroy)
        this.authClient.on('destroy', this.onDestroy)
        this.authClient.on('active', this.updateActive)
        this.authClient.on('inactive', this.updateActive)
        this.updateActive()
    }

    public destroy(): void {
        if (this.destroyed) {
            return
        }
        this.connection.off('destroy', this.onDestroy)
        this.authClient.off('destroy', this.onDestroy)
        this.authClient.off('active', this.updateActive)
        this.authClient.off('inactive', this.updateActive)
        super.destroy()
    }

    public registerSchema(schema: Schema): Promise<void> {
        return this.contentService.registerSchema(schema)
    }

    public async getSchema(key: string): Promise<Schema | null> {
        return this.contentService.getSchema(key)
    }

    public getSnapshot(
        type: string,
        id: string,
        version?: number | null | undefined,
    ): Promise<Snapshot | null> {
        return this.contentService.getSnapshot(type, id, version)
    }

    public submitOperation(
        operation: Operation,
        options?: SubmitOperationOptions,
    ): Promise<void> {
        return this.contentService.submitOperation(operation, options)
    }

    public streamOperations(
        type: string,
        id: string,
        versionStart?: number | null | undefined,
        versionEnd?: number | null | undefined,
    ): Promise<Duplex> {
        return this.contentService.streamOperations(
            type,
            id,
            versionStart,
            versionEnd,
        )
    }

    private onDestroy = (): void => {
        this.destroy()
    }

    private updateActive = (): void => {
        if (this.active === this.authClient.active) {
            return
        }

        if (this.authClient.active) {
            this.active = true
            this.sessionId = this.authClient.sessionId
            this.userId = this.authClient.userId
            this.emitAsync('active')
        } else {
            this.active = false
            this.sessionId = undefined
            this.userId = undefined
            this.emitAsync('inactive')
        }
    }
}
