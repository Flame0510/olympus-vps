# Olympus Dashboard

Olympus is a monitoring and operations dashboard for OpenClaw-based agent systems.

It tracks sessions, lineage, costs, workspace state, provider configuration, and live operational health from one UI.

## Highlights

- Live session and lineage monitoring
- Cost reporting by session, model, and time range
- Workspace browser/editor with markdown and PDF support
- Agent, provider, and gateway configuration screens
- Embedded assistant UI and real-time event streams
- System health and cron visibility

## Run From Source

```bash
git clone https://github.com/Flame0510/olympus-vps.git
cd olympus-vps
npm install
npm run dev
```

Development runs on `http://localhost:3720`.

For a production build:

```bash
npm run build
npm run start
```

Production defaults to port `3740`. The standalone terminal WebSocket server uses port `3741`.

## Key Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3720` in dev, `3740` in `npm start` | HTTP port for the dashboard |
| `OLYMPUS_PASSWORD` | — | Dashboard login password |
| `OLYMPUS_JWT_SECRET` | — | Secret used to sign dashboard auth cookies |
| `OLYMPUS_TOKEN` | `olympus2026` | Bearer token accepted by protected API routes |
| `OPENCLAW_BIN` | `/usr/bin/openclaw` | OpenClaw CLI path used by backend routes |

## Documentation

- [AGENTS.md](./AGENTS.md) — repo rules and required reading order
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — system architecture and component layout
- [docs/CONTAINER-TERMINAL.md](./docs/CONTAINER-TERMINAL.md) — terminal WebSocket/PTy implementation
- [docs/FRONTEND-ARCHITECTURE.md](./docs/FRONTEND-ARCHITECTURE.md) — frontend structure and design decisions
- [docs/dev/API-REFERENCE.md](./docs/dev/API-REFERENCE.md) — backend route reference
- [docs/dev/DATABASE.md](./docs/dev/DATABASE.md) — SQLite schema and storage notes
- [docs/dev/GATEWAY.md](./docs/dev/GATEWAY.md) — provider sync and agent model configuration
- [docs/dev/PROVIDERS.md](./docs/dev/PROVIDERS.md) — provider login and key handling
- [docs/dev/WORKSPACE.md](./docs/dev/WORKSPACE.md) — workspace APIs and editor behavior

## License

MIT
