import { AuthService } from '@syncot/auth'
import { Connection } from '@syncot/core'
import { AnonymousAuthClient } from './authClient'

/**
 * Creates a new AuthService which allows full anonymous access.
 */
export function createAuthService(connection: Connection): AuthService {
    return new AnonymousAuthService(connection)
}

export class AnonymousAuthService extends AnonymousAuthClient
    implements AuthService {
    public async mayReadDocument(): Promise<boolean> {
        return this.hasUserId()
    }

    public async mayWriteDocument(): Promise<boolean> {
        return this.hasUserId()
    }

    public async mayReadPresence(): Promise<boolean> {
        return this.hasUserId()
    }

    public async mayWritePresence(): Promise<boolean> {
        return this.hasUserId()
    }
}
