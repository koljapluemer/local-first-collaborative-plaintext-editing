# Markdown editor

```sh
just markdown-dev # sync server on :1234, editor on :5174
```

Each project is a folder with one selected `.md` or `.markdown` entry. New projects contain `document.md` and `styles.css`; supporting text files, images and videos use the same file menu and local-first synchronization as Typst projects.

On desktop the Source and Preview panes start open and Styles starts collapsed. Each pane can be collapsed independently, but the last pane stays open. The choice is remembered per project. On narrow screens the panes become Source, Preview and Styles tabs.

The preview supports GFM and sanitized inline HTML. A project video can be embedded with `<video src="media/demo.mp4" controls></video>`. Supported video extensions are `.mp4`, `.m4v`, `.webm`, `.ogv` and `.mov`; actual playback depends on browser codec support. Media paths are relative to the entry file. External media, scripts, event handlers, frames, objects and embeds are blocked. External HTTP(S) links remain links.

`styles.css` only affects the isolated preview. `@import` and external `url(...)` values are removed; relative asset URLs are loaded from the project. Invalid CSS leaves the last successfully rendered preview in place and reports the error in the preview.

Uploads retain the shared limits: warning above 5 MB and rejection above 25 MB.

## Standalone deployment

Build static files directly:

```sh
VITE_DEFAULT_SERVER=https://sync.example.org pnpm --filter @tmt/markdown-editor build
```

Serve `markdown-editor/dist` from any static host, with SPA fallback to `index.html`. Or build the independent container from the repository root:

```sh
docker build -f markdown-editor/Dockerfile \
  --build-arg VITE_DEFAULT_SERVER=https://sync.example.org \
  -t take-my-markdown .
docker run --rm -p 8080:8080 take-my-markdown
```

The sync server already permits the cross-origin WebSocket and blob requests used by a separate editor origin. Set both editor URLs in the desktop manager so copied links use the correct frontend.
