import { Auth } from '@syncot/auth'
import { ContentBackend } from './backend'

/**
 * The interface for managing content.
 *
 * It extends ContentBackend by parameter validation and permission checks.
 */
export interface Content extends ContentBackend {
    /**
     * The Auth instance used for authentication and authorization.
     */
    readonly auth: Auth
}
