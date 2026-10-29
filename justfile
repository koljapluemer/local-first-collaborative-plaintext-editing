default:
    @just --list

# Server (:1234) + web editor (Vite), Ctrl-C stops both
dev: install
    #!/usr/bin/env bash
    trap 'kill 0' EXIT
    pnpm --filter @tmt/server dev &
    VITE_DEFAULT_SERVER="${VITE_DEFAULT_SERVER:-http://localhost:1234}" pnpm --filter @tmt/web-editor dev &
    wait

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
    cd desktop-manager && pnpm tauri build

# Run the server in Docker (detached)
serve:
    cd server && docker compose up -d --build
