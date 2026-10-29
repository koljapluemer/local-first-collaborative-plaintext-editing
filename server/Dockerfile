# Build context: repository root (see docker-compose.yml)
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
WORKDIR /repo/server
ENV PORT=1234 DATA_DIR=/data MAX_BLOB_MB=25
VOLUME /data
EXPOSE 1234
CMD ["node_modules/.bin/tsx", "src/index.ts"]
