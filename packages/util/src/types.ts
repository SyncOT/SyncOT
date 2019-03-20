/**
 * Keeps only public properties.
 * See https://github.com/Microsoft/TypeScript/issues/471#issuecomment-381842426
 */
export type Interface<T> = { [P in keyof T]: T[P] }
