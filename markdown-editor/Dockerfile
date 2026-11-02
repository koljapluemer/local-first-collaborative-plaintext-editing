# Build from the repository root: docker build -f markdown-editor/Dockerfile .
FROM node:24-slim AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY markdown-editor/package.json markdown-editor/
COPY browser-client/package.json browser-client/
COPY shared/package.json shared/
RUN pnpm install --frozen-lockfile --filter @tmt/markdown-editor...
COPY tsconfig.base.json ./
COPY shared shared
COPY browser-client browser-client
COPY markdown-editor markdown-editor
ARG VITE_DEFAULT_SERVER=
RUN pnpm --filter @tmt/markdown-editor build

FROM nginx:1.29-alpine
COPY markdown-editor/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/markdown-editor/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
