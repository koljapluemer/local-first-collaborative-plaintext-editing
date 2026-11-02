import { trimSlash } from '@tmt/shared'

const key = (server: string) => `tmt:create-token:${trimSlash(server)}`

export function getCreateToken(server: string): string {
  return localStorage.getItem(key(server)) ?? ''
}

export function setCreateToken(server: string, token: string): void {
  token ? localStorage.setItem(key(server), token) : localStorage.removeItem(key(server))
}
