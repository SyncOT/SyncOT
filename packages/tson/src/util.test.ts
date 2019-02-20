import { createTsonError } from './util'

test('create an error', () => {
    const error = createTsonError('abc')
    expect(error).toBeInstanceOf(Error)
    expect(error.propertyIsEnumerable('name')).toBe(false)
    expect(error.name).toBe('TsonError')
    expect(error.message).toBe('abc')
})
