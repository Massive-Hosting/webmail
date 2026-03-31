# Webmail

## Build & Test

```bash
# Backend
go build ./...
go test ./... -v
go vet ./...

# Frontend
cd web && npx tsc --noEmit && npx vite build

# All at once
just check
```

Use `just --list` to see all available targets.

## Deploy

### Standalone (Docker)
```bash
just docker-build
docker compose up
```

### Hosting platform (k3s)
Webmail deploys as part of the hosting platform. From `../hosting`:
```bash
just deploy-webmail
```
This builds the Docker image from `../webmail/Dockerfile`, imports it into k3s on the control plane VM, and restarts the `hosting-webmail` deployment.

To run migrations separately: `just migrate-webmail` (from `../hosting`).

### GitHub release
Tag with `v*` to trigger the release workflow which builds multi-arch Docker images and pushes to `ghcr.io/massive-hosting/webmail`.

## Conventions

- **Migrations**: Goose SQL files in `migrations/`. Auto-run on app startup.
- **Activities**: Methods on `*Activities` struct in `internal/activity/` — auto-registered by Temporal worker.
- **Workflows**: Package-level functions in `internal/workflow/` — manually registered in `internal/worker/worker.go`.
- **Handlers**: Struct with dependencies, created via `New*Handler()`, methods are HTTP handlers.
- **Routes**: Registered in `cmd/webmail-api/main.go` inside the chi router.
- **Frontend state**: Zustand for global state, TanStack Query for server state.
- **i18n**: All user-visible strings in `web/src/i18n/locales/{en,de,no}.json`.
- **Settings tabs**: Add to `ALL_TABS` + `SETTINGS_SEARCH_INDEX` in `settings-dialog.tsx`.
