import { adjectives, animals, uniqueNamesGenerator } from 'unique-names-generator'
const NAME_KEY = 'tmt:user-name'
export const randomName = () => uniqueNamesGenerator({ dictionaries: [adjectives, animals], separator: '-', style: 'lowerCase' })
export const loadName = () => localStorage.getItem(NAME_KEY) || randomName()
export const saveName = (name: string) => localStorage.setItem(NAME_KEY, name)
export const awarenessUser = (name: string, key: string) => ({ name, color: `#${Array.from(key).reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 0).toString(16).padStart(6, '0').slice(-6)}`, colorLight: '#88888833' })
