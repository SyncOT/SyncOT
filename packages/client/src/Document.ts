import { Connection } from './Connection'
import { Snapshot } from './Snapshot'

export class Document {
    public snapshot: Snapshot

    constructor(public connection: Connection, collection: string, id: string) {
        this.snapshot = new Snapshot(collection, id, 0)
    }

    public destroy() {
        return
    }
}
