import { AuthService } from '@syncot/auth'
import { Connection } from '@syncot/connection'
import { AnonymousAuthClient } from './authClient'

/**
 * Creates a new AuthService which allows full anonymous access.
 */
export function createAuthService(connection: Connection): AuthService {
    return new AnonymousAuthService(connection)
}

export class AnonymousAuthService extends AnonymousAuthClient
    implements AuthService {
    public mayReadDocument(): boolean {
        return this.hasUserId()
    }

    public mayWriteDocument(): boolean {
        return this.hasUserId()
    }

    public mayReadPresence(): boolean {
        return this.hasUserId()
    }

    public mayWritePresence(): boolean {
        return this.hasUserId()
    }
}
