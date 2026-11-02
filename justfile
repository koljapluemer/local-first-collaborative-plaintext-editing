default:
    @just --list

# Server (:1234) + web editor (Vite), Ctrl-C stops both
dev: install
    #!/usr/bin/env bash
    trap 'kill 0' EXIT
    pnpm --filter @tmt/server dev &
    VITE_DEFAULT_SERVER="${VITE_DEFAULT_SERVER:-http://localhost:1234}" pnpm --filter @tmt/web-editor dev &
    wait

# Sync server (:1234) + Markdown editor (:5174)
markdown-dev: install
    #!/usr/bin/env bash
    trap 'kill 0' EXIT
    pnpm --filter @tmt/server dev &
    VITE_DEFAULT_SERVER="${VITE_DEFAULT_SERVER:-http://localhost:1234}" pnpm --filter @tmt/markdown-editor dev -- --port 5174 &
    wait

markdown-build: install
    pnpm --filter @tmt/markdown-editor build

# Desktop manager (Tauri dev window)
desktop: install
    cd desktop-manager && pnpm tauri dev

install:
    pnpm install --prefer-offline

test: install
    pnpm -r test

# Typecheck and build everything, including the desktop bundle
build: install
    pnpm -r typecheck
    pnpm --filter @tmt/web-editor build
    pnpm --filter @tmt/markdown-editor build
    cd desktop-manager && pnpm tauri build

# Run the server in Docker (detached)
serve:
    cd server && docker compose up -d --build

# Build the image (server + web editor) locally and run it on DEPLOY_HOST (needs deploy.env, see doc/deploy.md)
deploy:
    #!/usr/bin/env bash
    set -euo pipefail
    source deploy.env
    docker build -f server/Dockerfile --build-arg VITE_DEFAULT_SERVER="$PUBLIC_URL" -t take-my-typst:latest .
    docker save take-my-typst:latest | gzip | ssh "$DEPLOY_HOST" 'gunzip | docker load'
    scp deploy/compose.yaml "$DEPLOY_HOST:$DEPLOY_DIR/compose.yaml"
    ssh "$DEPLOY_HOST" "cd $DEPLOY_DIR && docker compose up -d && docker image prune -f"
    for i in $(seq 30); do curl -fsS "$PUBLIC_URL/health" >/dev/null 2>&1 && break; sleep 2; done
    curl -fsS "$PUBLIC_URL/health" && echo " $PUBLIC_URL"

# Follow the deployed server's logs
deploy-logs:
    #!/usr/bin/env bash
    source deploy.env
    ssh "$DEPLOY_HOST" "cd $DEPLOY_DIR && docker compose logs -f --tail 100"
