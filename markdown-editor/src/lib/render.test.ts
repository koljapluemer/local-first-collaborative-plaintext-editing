// @vitest-environment jsdom
import { getFiles } from '@tmt/shared'
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import type { Project } from './project'
import { renderMarkdown } from './render'

function project(): Project {
  const doc = new Y.Doc()
  getFiles(doc).set('document.md', new Y.Text())
  return { doc, link: { docId: 'A'.repeat(22), key: 'B'.repeat(11), server: 'https://sync.example' } } as Project
}

describe('renderMarkdown', () => {
  it('renders GFM and removes executable HTML', async () => {
    const result = await renderMarkdown(project(), 'document.md', '| A |\n| - |\n| x |\n<script>alert(1)</script><img src=x onerror=alert(1)>', '')
    expect(result.html).toContain('<table>')
    expect(result.html).not.toContain('script')
    expect(result.html).not.toContain('onerror')
  })

  it('keeps safe video markup and blocks external media', async () => {
    const result = await renderMarkdown(project(), 'document.md', '<video src="https://tracker.example/x.mp4" controls></video>', '')
    expect(result.html).toContain('<video controls="">')
    expect(result.html).not.toContain('tracker.example')
  })

  it('removes imports and external CSS URLs', async () => {
    const result = await renderMarkdown(project(), 'document.md', '# Hi', '@import "https://x"; .x { background: url(https://x/a.png) }')
    expect(result.css).not.toContain('@import')
    expect(result.css).not.toContain('https://x')
    expect(result.warnings).toContain('@import is not allowed in styles.css')
  })
})
