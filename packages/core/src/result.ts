export class Result<T> {
    public static ok<U>(value: U): Result<U> {
        return new Result(undefined as never, value)
    }

    public static fail<U>(error: Error): Result<U> {
        return new Result<U>(error, undefined as never)
    }

    public static all<U1, U2, U3, U4, U5, U6, U7, U8, U9, U10>(
        results: [
            Result<U1>,
            Result<U2>,
            Result<U3>,
            Result<U4>,
            Result<U5>,
            Result<U6>,
            Result<U7>,
            Result<U8>,
            Result<U9>,
            Result<U10>
        ],
    ): Result<[U1, U2, U3, U4, U5, U6, U7, U8, U9, U10]>
    public static all<U1, U2, U3, U4, U5, U6, U7, U8, U9>(
        results: [
            Result<U1>,
            Result<U2>,
            Result<U3>,
            Result<U4>,
            Result<U5>,
            Result<U6>,
            Result<U7>,
            Result<U8>,
            Result<U9>
        ],
    ): Result<[U1, U2, U3, U4, U5, U6, U7, U8, U9]>
    public static all<U1, U2, U3, U4, U5, U6, U7, U8>(
        results: [
            Result<U1>,
            Result<U2>,
            Result<U3>,
            Result<U4>,
            Result<U5>,
            Result<U6>,
            Result<U7>,
            Result<U8>
        ],
    ): Result<[U1, U2, U3, U4, U5, U6, U7, U8]>
    public static all<U1, U2, U3, U4, U5, U6, U7>(
        results: [
            Result<U1>,
            Result<U2>,
            Result<U3>,
            Result<U4>,
            Result<U5>,
            Result<U6>,
            Result<U7>
        ],
    ): Result<[U1, U2, U3, U4, U5, U6, U7]>
    public static all<U1, U2, U3, U4, U5, U6>(
        results: [
            Result<U1>,
            Result<U2>,
            Result<U3>,
            Result<U4>,
            Result<U5>,
            Result<U6>
        ],
    ): Result<[U1, U2, U3, U4, U5, U6]>
    public static all<U1, U2, U3, U4, U5>(
        results: [Result<U1>, Result<U2>, Result<U3>, Result<U4>, Result<U5>],
    ): Result<[U1, U2, U3, U4, U5]>
    public static all<U1, U2, U3, U4>(
        results: [Result<U1>, Result<U2>, Result<U3>, Result<U4>],
    ): Result<[U1, U2, U3, U4]>
    public static all<U1, U2, U3>(
        results: [Result<U1>, Result<U2>, Result<U3>],
    ): Result<[U1, U2, U3]>
    public static all<U1, U2>(
        results: [Result<U1>, Result<U2>],
    ): Result<[U1, U2]>
    public static all<U>(results: Array<Result<U>>): Result<U[]> {
        const values = new Array<U>(results.length)

        for (let i = 0, l = results.length; i < l; ++i) {
            const result = results[i]

            if (result.isFail()) {
                return result as any
            }

            values[i] = results[i].getValue()
        }

        return Result.ok(values)
    }

    private constructor(
        private readonly error: Error,
        private readonly value: T,
    ) {}

    public isOk(): boolean {
        return !this.error
    }

    public isFail(): boolean {
        return !!this.error
    }

    public getValue(): T {
        if (this.error) {
            throw new Error('Not Ok')
        }
        return this.value
    }

    public getError(): Error {
        if (this.error) {
            return this.error
        }
        throw new Error('Not Fail')
    }

    public then<U>(
        okHandler: (value: T) => U | Result<U>,
        failHandler?: (error: Error) => U | Result<U>,
    ): Result<U> {
        try {
            if (this.error) {
                if (failHandler) {
                    const result = failHandler(this.error)
                    return result instanceof Result ? result : Result.ok(result)
                } else {
                    return this as any
                }
            } else {
                const result = okHandler(this.value)
                return result instanceof Result ? result : Result.ok(result)
            }
        } catch (error) {
            return Result.fail(error)
        }
    }

    public catch(failHandler: (error: Error) => T | Result<T>): Result<T> {
        if (!this.error) {
            return this
        }
        try {
            const result = failHandler(this.error)
            return result instanceof Result ? result : Result.ok(result)
        } catch (error) {
            return Result.fail(error)
        }
    }
}
