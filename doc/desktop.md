# Desktop manager

A Tauri 2 app that keeps local folders in sync with projects.

```sh
just desktop   # dev window
just build     # includes the bundle in desktop-manager/src-tauri/target/release/bundle/
```

Linux needs the usual Tauri dependencies (webkit2gtk-4.1, libsoup-3).

## Usage

1. Settings: set the sync server URL (for example `https://sync.example.org`) and the web editor URL.
2. **Share a folder**: pick a folder. It gets a new project ID and is imported.
3. **Link**: copies the capability link to send to someone.
4. **Paste a link**: syncs an existing project into a folder of your choice. Use an empty folder. If a file exists on both sides with different content, the disk version wins.

Folders sync only while the window is open. Sync resumes on the next start, and changes made in between are merged. The play/stop button pauses a folder. The trash button stops sharing and leaves the files on disk.

## Sync rules

- Synced: text and binary files of the supported types (see [architecture](architecture.md)), in all subfolders.
- Not synced: hidden files and folders, `node_modules`, `target`, `dist`, and `X.pdf` next to `X.typ` (compile output).
- A file deleted remotely is moved to `<app data>/trash/<docId>/<timestamp>/`. On Linux, app data is `~/.local/share/dev.take-my-typst.desktop`.
- Sync state lives in the webview's IndexedDB, keyed by project ID.

The sync engine (`src/lib/folderSync.ts`) is plain TypeScript behind a small `FolderFs` interface. Its tests (`pnpm test`) use an in-memory folder.
