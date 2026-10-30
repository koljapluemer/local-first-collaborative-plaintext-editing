# Desktop manager

A Tauri 2 app that keeps local folders in sync with projects.

```sh
just desktop   # dev window
just build     # includes the bundle in desktop-manager/src-tauri/target/release/bundle/
```

Linux needs the usual Tauri dependencies (webkit2gtk-4.1, libsoup-3).

## Usage

1. Settings: set the sync server URL (for example `https://sync.example.org`), its create token if it has one (needed to share new folders, not to join links; only ever sent to this server), and the web editor URL.
2. **Share a folder**: pick a folder. It gets a new project ID and is imported.
3. **Keys**: each shared folder has one or more link keys, each with its own **Link** button that copies the link with that key. **New key** adds one. The label (e.g. who got the link) is stored only in this app. Removing a key only removes it from the list; links with it keep working (see [architecture](architecture.md#link)).
4. **Paste a link**: syncs an existing project into a folder of your choice. The pasted link's key becomes the folder's first key. Use an empty folder. If a file exists on both sides with different content, the disk version wins.

Folders sync only while the window is open. Sync resumes on the next start, and changes made in between are merged. The play/stop button pauses a folder. The trash button stops sharing and leaves the files on disk.

## Sync rules

- Synced: text and binary files of the supported types (see [architecture](architecture.md)), in all subfolders.
- Not synced: hidden files and folders, `node_modules`, `target`, `dist`, and `X.pdf` next to `X.typ` (compile output).
- A file deleted remotely is moved to `<app data>/trash/<docId>/<timestamp>/`. On Linux, app data is `~/.local/share/dev.take-my-typst.desktop`.
- Sync state lives in the webview's IndexedDB, keyed by project ID.

The sync engine (`src/lib/folderSync.ts`) is plain TypeScript behind a small `FolderFs` interface. Its tests (`pnpm test`) use an in-memory folder.
