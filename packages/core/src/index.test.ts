import * as index from './index'
import * as type from './type'

test('exports', () => {
    expect(index.createTypeManager).toBe(type.createTypeManager)
})
