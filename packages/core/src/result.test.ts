import { Result } from './result'

test('Result.ok', () => {
    const result = Result.ok(5)

    expect(result.isOk()).toBe(true)
    expect(result.isFail()).toBe(false)
    expect(result.getValue()).toBe(5)
    expect(() => result.getError()).toThrowError()
})

test('Result.fail', () => {
    const error = new Error('Test')
    const result = Result.fail(error)

    expect(result.isOk()).toBe(false)
    expect(result.isFail()).toBe(true)
    expect(() => result.getValue()).toThrowError()
    expect(result.getError()).toBe(error)
})

describe('all', () => {
    test('succeeds on all ok', () => {
        const result = Result.all([
            Result.ok(5),
            Result.ok('abc'),
            Result.ok(false)
        ])

        expect(result.isOk()).toBe(true)
        expect(result.getValue()).toEqual([ 5, 'abc', false ])
    })

    test('fails on the first error', () => {
        const error1 = new Error('test1')
        const error2 = new Error('test2')
        const result = Result.all([
            Result.ok(5),
            Result.fail(error1),
            Result.fail(error2)
        ])

        expect(result.isFail()).toBe(true)
        expect(result.getError()).toBe(error1)
    })
})

describe('then', () => {
    test('Result.ok and only ok callback', () => {
        const result = Result.ok(5).then(value => value + 2)

        expect(result.isOk()).toBe(true)
        expect(result.getValue()).toBe(7)
    })

    test('Result.ok and ok callback raturns a value', () => {
        const onFail = jest.fn()
        const result = Result.ok(5).then(value => value + 2, onFail)

        expect(result.isOk()).toBe(true)
        expect(result.getValue()).toBe(7)
        expect(onFail).not.toBeCalled()
    })

    test('Result.ok and ok callback raturns an ok', () => {
        const onFail = jest.fn()
        const result = Result.ok(5).then(value => Result.ok(value + 2), onFail)

        expect(result.isOk()).toBe(true)
        expect(result.getValue()).toBe(7)
        expect(onFail).not.toBeCalled()
    })

    test('Result.ok and ok callback throws', () => {
        const onFail = jest.fn()
        const error = new Error('test')
        const result = Result.ok(5).then(() => { throw error }, onFail)

        expect(result.isFail()).toBe(true)
        expect(result.getError()).toBe(error)
        expect(onFail).not.toBeCalled()
    })

    test('Result.ok and ok callback returns a fail', () => {
        const onFail = jest.fn()
        const error = new Error('test')
        const result = Result.ok(5).then(() => Result.fail(error), onFail)

        expect(result.isFail()).toBe(true)
        expect(result.getError()).toBe(error)
        expect(onFail).not.toBeCalled()
    })

    test('Result.fail and only ok callback', () => {
        const onOk = jest.fn()
        const error = new Error('test')
        const result = Result.fail(error).then(onOk)

        expect(result.isFail()).toBe(true)
        expect(result.getError()).toBe(error)
        expect(onOk).not.toBeCalled()
    })

    test('Result.fail and fail callback raturns a value', () => {
        const onOk = jest.fn()
        const error = new Error('test')
        const result = Result.fail(error).then(onOk, () => 7)

        expect(result.isOk()).toBe(true)
        expect(result.getValue()).toBe(7)
        expect(onOk).not.toBeCalled()
    })

    test('Result.fail and fail callback raturns an ok', () => {
        const onOk = jest.fn()
        const error = new Error('test')
        const result = Result.fail(error).then(onOk, () => Result.ok(7))

        expect(result.isOk()).toBe(true)
        expect(result.getValue()).toBe(7)
        expect(onOk).not.toBeCalled()
    })

    test('Result.fail and fail callback throws', () => {
        const onOk = jest.fn()
        const error1 = new Error('test1')
        const error2 = new Error('test2')
        const result = Result.fail(error1).then(onOk, () => { throw error2 })

        expect(result.isFail()).toBe(true)
        expect(result.getError()).toBe(error2)
        expect(onOk).not.toBeCalled()
    })

    test('Result.fail and fail callback returns a fail', () => {
        const onOk = jest.fn()
        const error1 = new Error('test1')
        const error2 = new Error('test2')
        const result = Result.fail(error1).then(onOk, () => Result.fail(error2))

        expect(result.isFail()).toBe(true)
        expect(result.getError()).toBe(error2)
        expect(onOk).not.toBeCalled()
    })
})

describe('catch', () => {
    test('Result.ok', () => {
        const onFail = jest.fn()
        const result = Result.ok(7).catch(onFail)

        expect(result.isOk()).toBe(true)
        expect(result.getValue()).toBe(7)
        expect(onFail).not.toBeCalled()
    })

    test('Result.fail and callback raturns a value', () => {
        const error = new Error('test')
        const result = Result.fail(error).catch(() => 7)

        expect(result.isOk()).toBe(true)
        expect(result.getValue()).toBe(7)
    })

    test('Result.fail and callback throws', () => {
        const error1 = new Error('test1')
        const error2 = new Error('test2')
        const result = Result.fail(error1).catch(() => { throw error2 })

        expect(result.isFail()).toBe(true)
        expect(result.getError()).toBe(error2)
    })

    test('Result.fail and callback returns a fail', () => {
        const error1 = new Error('test1')
        const error2 = new Error('test2')
        const result = Result.fail(error1).catch(() => Result.fail(error2))

        expect(result.isFail()).toBe(true)
        expect(result.getError()).toBe(error2)
    })
})
