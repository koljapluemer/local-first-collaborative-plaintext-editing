# take-my-typst

Share a local Typst project folder through a link and edit it together in the browser. Editing is local-first (Yjs). The server only relays and stores updates, so collaborators don't need to be online at the same time.

- `server/`: sync relay (Hocuspocus + SQLite) and blob store. Runs with Docker.
- `web-editor/`: static web app (CodeMirror + typst.ts, with PDF preview).
- `desktop-manager/`: Tauri app that keeps a folder on disk in sync and copies the link.
- `shared/`: data model, link format and blob client, used by both apps.

```sh
just dev       # server on :1234 + web editor on :5173
just desktop   # Tauri app
just test
```

Needs pnpm and [just](https://github.com/casey/just); `just` lists all recipes.

Docs: [architecture](doc/architecture.md) · [deploy](doc/deploy.md) · [web editor](doc/editor.md) · [desktop manager](doc/desktop.md)

MIT © Kolja Sam Pluemer
