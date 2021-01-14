import { PlaceholderNames } from '..'

test('names', () => {
    expect(PlaceholderNames.blockBranch).toBe('placeholderBlockBranch')
    expect(PlaceholderNames.blockLeaf).toBe('placeholderBlockLeaf')
    expect(PlaceholderNames.inlineBranch).toBe('placeholderInlineBranch')
    expect(PlaceholderNames.inlineLeaf).toBe('placeholderInlineLeaf')
    expect(PlaceholderNames.mark).toBe('placeholderMark')
})
