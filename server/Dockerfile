# Build context: repository root (see docker-compose.yml)
FROM node:24-slim AS editor
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY web-editor/package.json web-editor/
COPY browser-client/package.json browser-client/
COPY shared/package.json shared/
RUN pnpm install --frozen-lockfile --filter @tmt/web-editor...
COPY tsconfig.base.json ./
COPY shared shared
COPY browser-client browser-client
COPY web-editor web-editor
# Default sync server for "New empty project"; the deploy sets it to the public URL.
ARG VITE_DEFAULT_SERVER=
RUN pnpm --filter @tmt/web-editor build
# Precompress so the server never compresses the ~28 MB compiler wasm per request.
RUN node -e "\
  const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'); \
  for (const f of fs.readdirSync('web-editor/dist', { recursive: true })) { \
    const p = path.join('web-editor/dist', f); \
    if (!/\.(wasm|js|mjs|css|html|svg|json)$/.test(p)) continue; \
    const b = fs.readFileSync(p); \
    fs.writeFileSync(p + '.br', zlib.brotliCompressSync(b)); \
    fs.writeFileSync(p + '.gz', zlib.gzipSync(b, { level: 9 })); \
  }"

FROM node:24-slim AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY server/package.json server/
COPY shared/package.json shared/
RUN pnpm install --frozen-lockfile --filter @tmt/server --prod
COPY server/src server/src

FROM node:24-slim
WORKDIR /repo
COPY --from=build /repo /repo
COPY --from=editor /repo/web-editor/dist /repo/web-editor/dist
WORKDIR /repo/server
ENV PORT=1234 DATA_DIR=/data MAX_BLOB_MB=25 EDITOR_DIR=/repo/web-editor/dist
VOLUME /data
EXPOSE 1234
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:1234/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node_modules/.bin/tsx", "src/index.ts"]
