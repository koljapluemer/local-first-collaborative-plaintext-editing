# take-my-typst

Share a local Typst or Markdown project folder through a link and edit it together in the browser. Editing is local-first (Yjs). The server only relays and stores updates, so collaborators don't need to be online at the same time.

- `server/`: sync relay (Hocuspocus + SQLite) and blob store. Runs with Docker.
- `web-editor/`: static web app (CodeMirror + typst.ts, with PDF preview).
- `markdown-editor/`: independently deployed static app with collaborative Markdown, isolated CSS and HTML preview.
- `browser-client/`: browser-local Yjs, IndexedDB, awareness and blob transport shared by both editors.
- `desktop-manager/`: Tauri app that keeps a folder on disk in sync and copies the link.
- `shared/`: data model, link format and blob client, used by both apps.

```sh
just dev       # server on :1234 + web editor on :5173
just markdown-dev # server on :1234 + Markdown editor on :5174
just desktop   # Tauri app
just test
just deploy    # build server + both editors and run them on your host (doc/deploy.md)
```

Needs pnpm and [just](https://github.com/casey/just); `just` lists all recipes.

Docs: [architecture](doc/architecture.md) · [deploy](doc/deploy.md) · [Typst editor](doc/editor.md) · [Markdown editor](doc/markdown.md) · [desktop manager](doc/desktop.md)

## Kudos

This work is really just glued together from excellent prior art, please check the dependencies.
Thanks to [@timontrettin](https://github.com/timontrettin), who had the initial idea and advised me on many aspects. 
