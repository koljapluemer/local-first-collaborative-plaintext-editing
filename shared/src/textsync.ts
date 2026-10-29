import diff from 'fast-diff'
import type * as Y from 'yjs'

/**
 * Applies the minimal set of inserts/deletes turning `ytext` into `target`.
 * Must be called inside a transaction if an origin is wanted.
 */
export function applyTextDiff(ytext: Y.Text, target: string): boolean {
  const current = ytext.toString()
  if (current === target) return false
  let pos = 0
  for (const [op, str] of diff(current, target)) {
    if (op === diff.EQUAL) pos += str.length
    else if (op === diff.DELETE) ytext.delete(pos, str.length)
    else {
      ytext.insert(pos, str)
      pos += str.length
    }
  }
  return true
}
