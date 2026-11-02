import * as Y from 'yjs'
import { getBlobs, getFiles, getMeta, normalizePath } from './schema'

export function createTextFile(doc: Y.Doc, path: string, content = ''): boolean {
  const normalized = normalizePath(path)
  if (!normalized || getFiles(doc).has(normalized) || getBlobs(doc).has(normalized)) return false
  getFiles(doc).set(normalized, new Y.Text(content))
  return true
}

export function renameProjectFile(doc: Y.Doc, from: string, to: string): boolean {
  const normalized = normalizePath(to)
  if (!normalized || getFiles(doc).has(normalized) || getBlobs(doc).has(normalized)) return false
  let changed = false
  doc.transact(() => {
    const text = getFiles(doc).get(from)
    const blob = getBlobs(doc).get(from)
    if (text) {
      getFiles(doc).set(normalized, new Y.Text(text.toString()))
      getFiles(doc).delete(from)
      changed = true
    } else if (blob) {
      getBlobs(doc).set(normalized, blob)
      getBlobs(doc).delete(from)
      changed = true
    }
    if (changed && getMeta(doc).get('entry') === from) getMeta(doc).set('entry', normalized)
    if (changed && getMeta(doc).get('main') === from) getMeta(doc).set('main', normalized)
  })
  return changed
}

export function deleteProjectFile(doc: Y.Doc, path: string): boolean {
  const changed = getFiles(doc).has(path) || getBlobs(doc).has(path)
  doc.transact(() => {
    getFiles(doc).delete(path)
    getBlobs(doc).delete(path)
  })
  return changed
}
