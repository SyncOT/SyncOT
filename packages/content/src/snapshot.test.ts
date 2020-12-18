import { createBaseSnapshot } from '.'

describe('createBaseSnapshot', () => {
    test.each([
        ['', ''],
        ['type-1', ''],
        ['', 'id-1'],
        ['type-1', 'id-1'],
    ])('type=%p, id=%p', (type, id) => {
        expect(createBaseSnapshot(type, id)).toStrictEqual({
            key: '',
            type,
            id,
            version: 0,
            schema: '',
            data: null,
            meta: null,
        })
    })
})
