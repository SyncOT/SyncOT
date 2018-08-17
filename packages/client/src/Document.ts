import { Connection } from './Connection'
import { Snapshot } from './Snapshot'

export class Document {
    snapshot: Snapshot

    constructor(public connection: Connection, collection: string, id: string) {
        this.snapshot = new Snapshot(collection, id, 0)
    }

    destroy() {}
}
