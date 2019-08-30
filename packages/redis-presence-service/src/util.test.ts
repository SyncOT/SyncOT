import { extractConnectionIds } from './util'

describe('extractConnectionIds', () => {
    test.each<[string, number[]]>([
        ['', []],
        ['id=5', [5]],
        [' id=5', [5]],
        ['id=5 ', [5]],
        ['id=567 ', [567]],
        [' id=5 ', [5]],
        ['id=5 id=6', [5]],
        ['id=5\nid=6', [5, 6]],
        ['id=5\nawd\n\nid=6\nasa', [5, 6]],
        ['id=5 dd adw a\n awd id=6 adw ad asd', [5, 6]],
        ['ID=5', []],
        ['id=x', []],
        ['id=', []],
        ['cid=5', []],
    ])('%#', (clientList, expectedResult) => {
        expect(extractConnectionIds(clientList)).toEqual(expectedResult)
    })
})
