import { sep } from '@tauri-apps/api/path'
import { copyFile, exists, mkdir, readDir, readFile, remove, rename, writeFile } from '@tauri-apps/plugin-fs'
import { isIgnored } from '@tmt/shared'
import type { FolderFs } from './folderSync'

/** FolderFs backed by the Tauri fs plugin. Removed files go to `trashDir`. */
export function tauriFs(root: string, trashDir: string): FolderFs {
  const s = sep()
  const abs = (base: string, rel: string) => (rel ? base + s + rel.split('/').join(s) : base)
  const parent = (p: string) => p.slice(0, p.lastIndexOf(s))

  async function walk(rel: string, out: string[]) {
    for (const e of await readDir(abs(root, rel))) {
      const path = rel ? `${rel}/${e.name}` : e.name
      if (isIgnored(path)) continue
      if (e.isDirectory) await walk(path, out)
      else if (e.isFile) out.push(path)
    }
    return out
  }

  return {
    list: () => walk('', []),
    read: (path) => readFile(abs(root, path)),
    async write(path, bytes) {
      const target = abs(root, path)
      await mkdir(parent(target), { recursive: true })
      // Write-then-rename so editors and the watcher never see a half-written file.
      const tmp = `${target}.tmt-tmp`
      await writeFile(tmp, bytes)
      await rename(tmp, target)
    },
    async trash(path) {
      const src = abs(root, path)
      if (!(await exists(src))) return
      const dest = abs(trashDir, `${new Date().toISOString().replace(/[:.]/g, '-')}/${path}`)
      await mkdir(parent(dest), { recursive: true })
      try {
        await rename(src, dest)
      } catch {
        // different file system
        await copyFile(src, dest)
        await remove(src)
      }
    },
  }
}
