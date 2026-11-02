# Architecture

## Data model

Each project is one Y.Doc:

| key     | type                                  | contents                                                     |
| ------- | ------------------------------------- | ------------------------------------------------------------ |
| `files` | `Y.Map<path, Y.Text>`                 | text files: `.typ .bib .yml .yaml .csv .txt .json .toml .xml .md` |
| `blobs` | `Y.Map<path, {hash, size, mime}>`     | binaries: images, PDFs and fonts, referenced by sha256        |
| `meta`  | `Y.Map`                               | project `kind`, schema version and `entry` path |

Paths are relative and `/`-separated. Ignored: hidden files and folders, `node_modules`, `target`, `dist`. Types and rules are defined in `shared/src/schema.ts`.

Projects have kind `typst` or `markdown`. Documents created before kinds were introduced are Typst projects and may still use the legacy `main` metadata key. New Markdown projects start with `document.md` and `styles.css`. The two frontends reject the other kind rather than changing it.

Blob bytes are not stored in the CRDT. They are immutable and content-addressed:
- `PUT /blobs/<docId>/<sha256>`: the server checks the hash. Uploads to a doc that does not exist on the server yet need the create token (see [Link](#link)).
- `GET /blobs/<docId>/<sha256>`.

Clients cache the bytes locally (IndexedDB in the browser, the folder itself on desktop).

## Link

```
https://<editor>/#d=<docId>&k=<key>&s=<server-url>
```

`docId` is 128 random bits, base64url-encoded. Because the link puts it in the URL fragment, the static host never sees it. Anyone with the link can read and write, and there is no other access control. The code is in `shared/src/link.ts`.

Creating a doc is restricted: if the server has a `CREATE_TOKEN`, a doc it does not know yet (not in SQLite and not loaded) is only accepted from a client that sends that token (Hocuspocus `token`, or `Authorization: Bearer` on blob uploads). Joining an existing doc needs only the link, so collaborators never see the token. The project owner enters it once: in the desktop settings, or in the editor's "New empty project" form, which stores it per server in `localStorage`. A project created offline reaches the server only when its creator first syncs with the token; until then, opening its link fails with "not on the server yet".

`key` is 64 random bits and tells links to the same project apart, e.g. one per person. It is required, but it is not access control: the server never sees or checks it, and the `docId` alone grants access, so keys cannot be revoked. The editor shows an identicon of the key (`keyAvatar`) and sends the key in its awareness state.

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
- The preview renders the PDF to canvases with pdf.js (`pdfjs-dist`), so it works the same in every browser, including mobile.

## Markdown rendering

The Markdown frontend renders GFM to sanitized HTML locally. Its collaborative `styles.css` is parsed, stripped of imports and external resources, and applied inside a Shadow DOM so it cannot style the application. Project-relative images, video sources, posters and CSS assets resolve through the same content-addressed blob cache. There is no Markdown server-side renderer or PDF pipeline.
