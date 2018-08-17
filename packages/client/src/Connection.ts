import { Document } from './Document'
import { Operation } from './Operation'
import { Snapshot } from './Snapshot'
import { Type } from './Type'

export class Connection {
    private types: { [key: string]: Type } = Object.create(null)

    public registerType(type: Type) {
        if (this.types[type.name]) {
            throw new Error(`Duplicate type name: ${type.name}`)
        }

        if (this.types[type.uri]) {
            throw new Error(`Duplicate type uri: ${type.uri}`)
        }

        this.types[type.name] = type
        this.types[type.uri] = type
    }

    public resolveType(nameOrUri: string): Type {
        return this.types[nameOrUri]
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
    ): Promise<Snapshot> {
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
    ): Promise<Operation[]> {
        return Promise.reject(new Error('Not implemented'))
    }

    /**
     * Submits an operation for the specified snapshot.
     *
     * @param snapshot The snapshot which the operation can be applied to.
     * @param operation The operation to apply.
     */
    public submitOperation(
        _snapshot: Snapshot,
        _operation: Operation
    ): Promise<void> {
        return Promise.reject(new Error('Not implemented'))
    }

    public createDocument(collection: string, id: string): Document {
        return new Document(this, collection, id)
    }
}
