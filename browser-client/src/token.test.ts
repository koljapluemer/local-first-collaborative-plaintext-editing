import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCreateToken, setCreateToken } from './token'

beforeEach(() => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  })
})

describe('create tokens', () => {
  it('normalizes server URLs and removes empty tokens', () => {
    setCreateToken('https://sync.example/', 'secret')
    expect(getCreateToken('https://sync.example')).toBe('secret')
    setCreateToken('https://sync.example', '')
    expect(getCreateToken('https://sync.example/')).toBe('')
  })
})
