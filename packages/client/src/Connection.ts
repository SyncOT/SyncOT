import { Document } from './Document'
import { Type } from './type'

export class Connection {
    private types: { [key: string]: Type } = Object.create(null)

    public registerType(type: Type) {
        if (this.types[type.name]) {
            throw new Error(`Duplicate type: ${type.name}`)
        }

        this.types[type.name] = type
    }

    public getType(name: string): Type {
        return this.types[name]
    }

    /**
     * Fetches a snapshot of a single document at the specified version, or at the latest version.
     *
     * @param collection Collection name.
     * @param id Document id.
     * @param version The required snapshot version. If undefined, fetches the latest snapshot.
     */
    public fetchSnapshot(
        _collection: string,
        _id: string,
        _version?: number
    ): Promise<void> {
        return Promise.reject(new Error('Not implemented'))
    }

    /**
     * Fetches a list of operations for the specified range of versions.
     *
     * @param collection Collection name.
     * @param id Document id.
     * @param startVersion The version number of the first operation (inclusive).
     * @param endVersion The version number of the last operation (exclusive). If omitted, there's no upper limit.
     */
    public fetchOperations(
        _collection: string,
        _id: string,
        _startVersion: number = 0,
        _endVersion?: number
    ): Promise<void> {
        return Promise.reject(new Error('Not implemented'))
    }

    /**
     * Submits an operation for the specified snapshot.
     *
     * @param snapshot The snapshot which the operation can be applied to.
     * @param operation The operation to apply.
     */
    public submitOperation(_snapshot: void, _operation: void): Promise<void> {
        return Promise.reject(new Error('Not implemented'))
    }

    public createDocument(collection: string, id: string): Document {
        return new Document(this, collection, id)
    }
}
