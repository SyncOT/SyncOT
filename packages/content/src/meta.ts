/**
 * The type of metadata which can be attached to content entities.
 */
export interface Meta {
    /**
     * The ID of the user who created the entity.
     */
    user?: string | null
    /**
     * The timestamp at which the entity was created.
     */
    time?: number | null
    /**
     * The ID of the session which the entity was created in.
     */
    session?: string | null
    [key: string]: any
}
