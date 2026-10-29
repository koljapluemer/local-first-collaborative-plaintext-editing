const KEY = 'tmt:name'

const COLORS = ['#e11d48', '#d97706', '#16a34a', '#0891b2', '#2563eb', '#7c3aed', '#c026d3', '#ea580c']

export function loadName(): string {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveName(name: string) {
  try {
    localStorage.setItem(KEY, name)
  } catch {
    /* private mode */
  }
}

export function colorFor(name: string): string {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) | 0
  return COLORS[Math.abs(h) % COLORS.length]
}

export function awarenessUser(name: string) {
  const color = colorFor(name)
  return { name: name || 'anonymous', color, colorLight: `${color}33` }
}
