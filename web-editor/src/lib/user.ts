import { adjectives, animals, uniqueNamesGenerator } from 'unique-names-generator'

const KEY = 'tmt:name'

const COLORS = ['#e11d48', '#d97706', '#16a34a', '#0891b2', '#2563eb', '#7c3aed', '#c026d3', '#ea580c']

/** e.g. "brave-otter" */
export function randomName(): string {
  return uniqueNamesGenerator({ dictionaries: [adjectives, animals], separator: '-', length: 2, style: 'lowerCase' })
}

/** The stored name; on first visit a random one is generated and stored. */
export function loadName(): string {
  let name = ''
  try {
    name = localStorage.getItem(KEY) ?? ''
  } catch {
    /* private mode */
  }
  if (!name) {
    name = randomName()
    saveName(name)
  }
  return name
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

export function awarenessUser(name: string, key: string) {
  const color = colorFor(name)
  return { name, key, color, colorLight: `${color}33` }
}
