import { Schema } from './content'

/**
 * An interface for all functionality which varies by content type.
 */
export interface ContentType {
    /**
     * Checks if `schema.data` is valid for the ProseMirror content type.
     * @param schema The schema to validate.
     * @returns An Error, if `schema` is invalid, otherwise `undefined`.
     */
    validateSchema(schema: Schema): Error | undefined
}
