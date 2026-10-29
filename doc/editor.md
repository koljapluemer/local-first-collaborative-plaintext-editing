# Web editor

```sh
just dev    # server on :1234 (data in server/data) + editor on :5173
```

`just dev` sets `VITE_DEFAULT_SERVER=http://localhost:1234` unless it is already set. You can also copy `.env.example` to `.env` instead.

## Usage

- Open a link, or create a new empty project on the landing page.
- File menu (top left):
  - Switch, create, rename or delete files.
  - Set the entry file (star).
  - Upload files. Drag-and-drop onto the editor works too.
- Top right: sync status, collaborator count (click to change your name), copy link, download PDF.
- On narrow screens, Editor and Preview are tabs.
- Compile errors are listed under the editor. Click one to jump to the line.

## Limits

- Uploads above 5 MB get a warning. The client refuses uploads above 25 MB, and the server enforces `MAX_BLOB_MB`.
- The preview reloads on every successful compile, so the browser's PDF viewer may reset its scroll position. If the compile fails, the last good PDF stays.
- Browsers without an inline PDF viewer (for example Android Chrome) get an "Open PDF" button instead.
- Renaming a text file copies its content into a new entry, so concurrent edits made during the rename are lost.

## Code

- `src/lib/project.ts`: Y.Doc, IndexedDB persistence and the provider.
- `src/lib/blobs.ts`: blob cache and upload queue.
- `src/lib/compiler.ts` and `src/typst.worker.ts`: compilation.
- `src/lib/toast.ts`: the single toast pattern (`useToast()`).
