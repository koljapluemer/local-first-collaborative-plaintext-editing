# Deploy

One Docker image runs the sync server and serves the built web editor at `/`. Editor, WebSocket and blobs therefore share one origin.

## Server

```sh
just serve     # = cd server && docker compose up -d --build
```

The server listens on `:1234`. It stores data in `server/data/`: `docs.sqlite` and `blobs/`.

| env            | default                    |                                  |
| -------------- | -------------------------- | -------------------------------- |
| `PORT`         | `1234`                     |                                  |
| `DATA_DIR`     | `/data`                    | `./data` when not run in Docker  |
| `MAX_BLOB_MB`  | `25`                       | max upload size; larger uploads get 413 |
| `CREATE_TOKEN` | unset                      | needed to create docs ([architecture](architecture.md#link)); unset = anyone can, with a warning at startup |
| `EDITOR_DIR`   | `/repo/web-editor/dist` in Docker | built editor served at `/`; unset = no editor |

Endpoints:
- WebSocket `/sync` (any path works)
- `PUT|GET /blobs/<docId>/<sha256>`; `PUT` to an unknown doc needs `Authorization: Bearer <CREATE_TOKEN>` (else 403)
- `GET /health`
- everything else: the web editor. `.br`/`.gz` files built next to each asset are served when the client accepts them. `assets/*` is cached as immutable, `index.html` is `no-cache`.

An editor served over https needs `wss://`, so put TLS in front. A minimal Caddyfile:

```
typst.example.org {
	reverse_proxy localhost:1234
}
```

Backup: copy `data/`.

## Next to an existing reverse proxy

`just deploy` builds the image locally, copies it over ssh (no registry, nothing is built on the host), and runs it with `deploy/compose.yaml`. That compose file publishes no ports. Instead it joins the Docker network of a reverse proxy that already runs on the host (here: Caddy from another Compose project), which reaches it as `tmt:1234`.

One-time setup. In the commands below, `$DEPLOY_HOST` and `$DEPLOY_DIR` stand for the values from `deploy.env` (step 1):

1. Locally: `cp deploy.env.example deploy.env` and fill in the following values. `deploy.env` is gitignored.
   - `DEPLOY_HOST`: ssh target, e.g. `deploy@203.0.113.10`. The user must be in the `docker` group.
   - `DEPLOY_DIR`: directory on the host, relative to the ssh user's home.
   - `PUBLIC_URL`: the https URL the editor and server will have. This is baked into the editor as the default server. Without a domain, use [sslip.io](https://sslip.io): `typst.203-0-113-10.sslip.io` resolves to `203.0.113.10`.
2. On the host, create the directory and its `.env`:
   ```sh
   mkdir -p "$DEPLOY_DIR/data"
   printf 'CREATE_TOKEN=%s\nPROXY_NETWORK=%s\n' "$(openssl rand -base64 24)" "<proxy network>" > "$DEPLOY_DIR/.env"
   ```
   `docker network ls` shows the proxy's network; for a Compose project it is usually `<project>_default`.
3. Add a site to the proxy's Caddyfile:
   ```
   typst.203-0-113-10.sslip.io {
   	reverse_proxy tmt:1234
   }
   ```
   Then restart the proxy container (`docker compose restart caddy`), and check `docker compose logs caddy` for the certificate. Use a restart, not `caddy reload`: when the Caddyfile is bind-mounted as a single file, editors that replace the file leave the container seeing the old one. The restart briefly interrupts the other sites behind that proxy.
4. `just deploy`. It finishes with a request to `$PUBLIC_URL/health`.
5. Enter the token (`ssh $DEPLOY_HOST cat $DEPLOY_DIR/.env`) in the desktop settings and in the editor's "New empty project" form. Set the desktop "Web editor" URL to `PUBLIC_URL`.

After that, `just deploy` again ships a new version, and `just deploy-logs` follows the logs. Backup: copy `$DEPLOY_DIR/data` on the host.

Resources: the container uses about 140 MB of RAM. Each deploy transfers the whole image (about 120 MB gzipped).

## Web editor elsewhere

The editor can also be served from any static host:

```sh
cd web-editor
VITE_DEFAULT_SERVER=https://typst.example.org pnpm build
```

Serve `web-editor/dist/`. The build uses relative asset paths, so a subpath works too. Links carry their server in `s=`. `VITE_DEFAULT_SERVER` is only the default for links without `s=` and for "New empty project".

The compiler wasm is about 28 MB (7 MB brotli, 11 MB gzip). Enable compression on the static host.
