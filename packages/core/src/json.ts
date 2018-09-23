export type JsonValue = JsonPrimitive | JsonArray | JsonMap
export type JsonPrimitive = boolean | number | string | null
export interface JsonMap {
    [key: string]: JsonValue
}
export interface JsonArray extends Array<JsonValue> {}
