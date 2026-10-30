// The sync server's create token, remembered per server. Only needed to create projects.
const key = (server: string) => `tmt:create-token:${server}`

export function getCreateToken(server: string): string {
  try {
    return localStorage.getItem(key(server)) ?? ''
  } catch {
    return '' /* private mode */
  }
}

export function setCreateToken(server: string, token: string) {
  try {
    if (token) localStorage.setItem(key(server), token)
    else localStorage.removeItem(key(server))
  } catch {
    /* private mode */
  }
}
