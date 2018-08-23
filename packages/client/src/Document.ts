import { Connection } from './Connection'

export class Document {
    constructor(
        public connection: Connection,
        _collection: string,
        _id: string
    ) {}

    public destroy() {
        return
    }
}
