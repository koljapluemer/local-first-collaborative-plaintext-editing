import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import {
  applyTextDiff,
  buildLink,
  classify,
  getFiles,
  getMeta,
  isIgnored,
  mainFile,
  newDocId,
  normalizePath,
  parseLink,
  sha256Hex,
  syncUrl,
} from './index'

describe('link', () => {
  it('round-trips', () => {
    const docId = newDocId()
    expect(docId).toMatch(/^[A-Za-z0-9_-]{22}$/)
    const url = buildLink('https://edit.example/', { docId, server: 'https://sync.example/' })
    expect(url).toBe(`https://edit.example/#d=${docId}&s=https%3A%2F%2Fsync.example`)
    expect(parseLink(url)).toEqual({ docId, server: 'https://sync.example' })
    expect(parseLink(`#d=${docId}`, 'http://localhost:1234')).toEqual({ docId, server: 'http://localhost:1234' })
  })
  it('rejects garbage', () => {
    expect(parseLink('#d=short&s=https://x')).toBeNull()
    expect(parseLink(`#d=${newDocId()}&s=ftp://x`)).toBeNull()
    expect(parseLink(`#d=${newDocId()}`)).toBeNull()
  })
  it('derives ws url', () => {
    expect(syncUrl('https://a.b/')).toBe('wss://a.b/sync')
    expect(syncUrl('http://localhost:1234')).toBe('ws://localhost:1234/sync')
  })
})

describe('schema', () => {
  it('classifies', () => {
    expect(classify('main.typ')).toBe('text')
    expect(classify('refs/lit.BIB')).toBe('text')
    expect(classify('img/a.PNG')).toBe('blob')
    expect(classify('a.exe')).toBeNull()
    expect(classify('Makefile')).toBeNull()
  })
  it('ignores', () => {
    expect(isIgnored('.git/config')).toBe(true)
    expect(isIgnored('a/node_modules/x.typ')).toBe(true)
    expect(isIgnored('.hidden.typ')).toBe(true)
    expect(isIgnored('chapters/one.typ')).toBe(false)
  })
  it('normalises paths', () => {
    expect(normalizePath('./a//b.typ')).toBe('a/b.typ')
    expect(normalizePath('a\\b.typ')).toBe('a/b.typ')
    expect(normalizePath('../x.typ')).toBeNull()
    expect(normalizePath('')).toBeNull()
  })
  it('picks main file', () => {
    const doc = new Y.Doc()
    expect(mainFile(doc)).toBeNull()
    getFiles(doc).set('b.typ', new Y.Text())
    getFiles(doc).set('a.typ', new Y.Text())
    expect(mainFile(doc)).toBe('a.typ')
    getFiles(doc).set('main.typ', new Y.Text())
    expect(mainFile(doc)).toBe('main.typ')
    getMeta(doc).set('main', 'b.typ')
    expect(mainFile(doc)).toBe('b.typ')
  })
})

describe('applyTextDiff', () => {
  it('reaches target over random edits', () => {
    const doc = new Y.Doc()
    const t = doc.getText('t')
    const alphabet = 'ab c\nüé='
    let s = ''
    for (let i = 0; i < 300; i++) {
      const chars = [...s]
      const at = Math.floor(Math.random() * (chars.length + 1))
      const del = Math.floor(Math.random() * 4)
      const ins = Array.from({ length: Math.floor(Math.random() * 5) }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
      chars.splice(at, del, ins)
      s = chars.join('')
      applyTextDiff(t, s)
      expect(t.toString()).toBe(s)
    }
  })

  it('merges concurrent offline edits from disk and remote', () => {
    const a = new Y.Doc()
    const b = new Y.Doc()
    getFiles(a).set('main.typ', new Y.Text('Hello world\n'))
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
    applyTextDiff(getFiles(a).get('main.typ')!, 'Hello brave world\n')
    applyTextDiff(getFiles(b).get('main.typ')!, 'Hello world!\nBye\n')
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b))
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
    const ta = getFiles(a).get('main.typ')!.toString()
    expect(ta).toBe(getFiles(b).get('main.typ')!.toString())
    expect(ta).toBe('Hello brave world!\nBye\n')
  })
})

describe('sha256Hex', () => {
  it('hashes', async () => {
    expect(await sha256Hex(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
})
