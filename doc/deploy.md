# Deploy

## Server

```sh
just serve     # = cd server && docker compose up -d --build
```

The server listens on `:1234`. It stores data in `server/data/`: `docs.sqlite` and `blobs/`.

| env           | default  |                                  |
| ------------- | -------- | -------------------------------- |
| `PORT`        | `1234`   |                                  |
| `DATA_DIR`    | `/data`  | `./data` when not run in Docker  |
| `MAX_BLOB_MB` | `25`     | max upload size; larger uploads get 413 |

Endpoints:
- WebSocket `/sync` (any path works)
- `PUT|GET /blobs/<docId>/<sha256>`
- `GET /health`

An editor served over https needs `wss://`, so put TLS in front. A minimal Caddyfile:

```
sync.example.org {
	reverse_proxy localhost:1234
}
```

Backup: copy `data/`.

## Web editor

```sh
cd web-editor
VITE_DEFAULT_SERVER=https://sync.example.org pnpm build
```

Serve `web-editor/dist/` from any static host. The build uses relative asset paths, so a subpath works too. Links carry their server in `s=`. `VITE_DEFAULT_SERVER` is only the default for links without `s=` and for "New empty project".

The compiler wasm is about 28 MB (11 MB gzipped). Enable compression on the static host.
