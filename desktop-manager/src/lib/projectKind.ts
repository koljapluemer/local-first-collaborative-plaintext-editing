import { extOf, type ProjectKind } from '@tmt/shared'

export function detectProjectKind(paths: string[]): ProjectKind | null {
  const typst = paths.some((path) => extOf(path) === 'typ')
  const markdown = paths.some((path) => ['md', 'markdown'].includes(extOf(path)))
  return typst === markdown ? null : markdown ? 'markdown' : 'typst'
}
