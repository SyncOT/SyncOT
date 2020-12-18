/**
 * The type of metadata which can be attached to content entities.
 */
export interface Meta {
    /**
     * The ID of the user who created the entity.
     */
    readonly user?: string | null
    /**
     * The timestamp at which the entity was created.
     */
    readonly time?: number | null
    /**
     * The ID of the session which the entity was created in.
     */
    readonly session?: string | null
    /**
     * Any other metadata.
     */
    readonly [key: string]: any
}
