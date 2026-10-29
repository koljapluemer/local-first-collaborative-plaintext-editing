# Architecture

## Data model

Each project is one Y.Doc:

| key     | type                                  | contents                                                     |
| ------- | ------------------------------------- | ------------------------------------------------------------ |
| `files` | `Y.Map<path, Y.Text>`                 | text files: `.typ .bib .yml .yaml .csv .txt .json .toml .xml .md` |
| `blobs` | `Y.Map<path, {hash, size, mime}>`     | binaries: images, PDFs and fonts, referenced by sha256        |
| `meta`  | `Y.Map`                               | `main`: the entry file (fallback: `main.typ`, then the first `.typ`) |

Paths are relative and `/`-separated. Ignored: hidden files and folders, `node_modules`, `target`, `dist`. Types and rules are defined in `shared/src/schema.ts`.

Blob bytes are not stored in the CRDT. They are immutable and content-addressed:
- `PUT /blobs/<docId>/<sha256>`: the server checks the hash.
- `GET /blobs/<docId>/<sha256>`.

Clients cache the bytes locally (IndexedDB in the browser, the folder itself on desktop).

## Link

```
https://<editor>/#d=<docId>&s=<server-url>
```

`docId` is 128 random bits, base64url-encoded. Because the link puts it in the URL fragment, the static host never sees it. Anyone with the link can read and write, and there is no other access control. The code is in `shared/src/link.ts`.

## Local-first flow

- **Browser:**
  - The doc loads from IndexedDB (`y-indexeddb`) first, then connects to the server with `@hocuspocus/provider`.
  - Offline edits stay local and merge on reconnect.
  - Blobs added offline are queued and uploaded on reconnect.
- **Desktop:**
  - Same as the browser, plus a two-way folder sync (`desktop-manager/src/lib/folderSync.ts`).
  - For each text file it keeps a *base*: a doc replica whose text equals the file on disk.
  - A disk edit becomes a diff applied to the base, and the resulting CRDT update is merged into the doc. Edits made in another editor while the app was closed therefore merge with remote edits instead of overwriting them.
  - Remote changes are written to disk (write, then rename).
  - Remote deletions move the local file to the app's trash folder.
- **Server:**
  - Just another replica that is always online.
  - It merges updates and persists them to SQLite, and has no application logic.

## Compile

The web editor compiles the entry file to PDF with typst.ts in a Web Worker, about 400 ms after the last change. Details:
- Fonts are typst.ts' default text fonts, loaded from jsDelivr.
- `@preview/*` packages are fetched from packages.typst.org.
- The preview uses the browser's built-in PDF viewer.
