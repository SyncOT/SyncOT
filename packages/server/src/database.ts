export interface DatabaseSnapshot {
    id: string
}

export interface DatabaseOperation {
    id: string
}

export interface Database {
    fetchSnapshot(id: string, version: number): Promise<DatabaseSnapshot>
    fetchOperations(
        id: string,
        startVersion?: number,
        endVersion?: number
    ): Promise<DatabaseOperation[]>
    submitOperation(): Promise<DatabaseSnapshot>
}
