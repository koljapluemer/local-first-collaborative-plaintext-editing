import { describe, expect, it } from 'vitest'
import { detectProjectKind } from './projectKind'
describe('detectProjectKind', () => {
  it('detects unambiguous folders', () => { expect(detectProjectKind(['main.typ'])).toBe('typst'); expect(detectProjectKind(['README.md', 'a.png'])).toBe('markdown') })
  it('requires a choice for mixed and empty folders', () => { expect(detectProjectKind([])).toBeNull(); expect(detectProjectKind(['a.typ', 'a.md'])).toBeNull() })
})
