export class Snapshot {
    constructor(
        public collection: string,
        public id: string,
        public version: number,
        public type: string = '',
        public data?: undefined | null | object | number | string | boolean
    ) {}
}
