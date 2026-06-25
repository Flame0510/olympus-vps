# Workspace — Multi-Workspace File Explorer

> **Status:** Active — `main` branch
> **Last updated:** 2026-06-25

---

## 1. Overview

The Workspace feature provides a unified file explorer for OpenClaw agent workspaces across
the VPS host and any Docker containers. Users can browse directories, read files, write
content, and navigate a recursive tree — all from the Olympus dashboard.

**Purpose:** Give operators direct access to agent workspace files (MEMORY.md, logs,
configurations, project files) without needing to SSH into the host or exec into containers.

---

## 2. Workspace Selector (UI)

The dashboard includes a **workspace selector** — a dropdown that lists all available
workspaces. Selecting one loads its file tree into the editor panel.

Available workspaces are grouped by type:

- **Host:** always one entry — the VPS host workspace (`vps`)
- **Containers:** one entry per running Docker container that has an `AGENT_ID` label

---

## 3. Available Workspaces

### VPS Host

| Property | Value |
|---|---|
| ID | `vps` |
| Label | `VPS Host (Nexus)` |
| Type | `host` |
| Root path | `/home/nexus/.openclaw/workspace/` |
| Access | `fs.readdirSync` / `fs.readFileSync` / `fs.writeFileSync` (direct filesystem) |

### Container Agents

Container workspaces are **auto-discovered** at runtime by querying Docker:

```
docker ps --filter label=AGENT_ID --format '{{.Names}}|{{.Label "AGENT_ID"}}'
```

| Property | Value |
|---|---|
| ID convention | `container-<containerName>` (e.g. `container-openclaw-atlas`) |
| Label | `<agentId> (<containerName>)` (e.g. `atlas (openclaw-atlas)`) |
| Type | `container` |
| Root path | `/root/.openclaw/workspace/` |
| Access | `docker exec` (shell commands over Docker socket) |

Only containers with the `AGENT_ID` Docker label appear — this prevents showing
infrastructure containers (Traefik, databases, etc.) that are not agent workspaces.

---

## 4. API Endpoints

### `GET /api/workspace?action=list`

List all available workspaces.

**Auth:** Bearer token, query param, `x-agent-token` header, or browser cookie

**Response:**
```json
{
  "workspaces": [
    { "id": "vps", "label": "VPS Host (Nexus)", "type": "host" },
    { "id": "container-openclaw-atlas", "label": "atlas (openclaw-atlas)", "type": "container" }
  ]
}
```

### `GET /api/workspace?workspace=<id>[&path=<path>][&tree=1]`

List files in a workspace, read a file, or return a recursive tree.

**Auth:** any auth method

**Query params:**
| Param | Default | Description |
|---|---|---|
| `workspace` | `vps` | Workspace ID |
| `path` | workspace root | Directory or file path to read |
| `tree=1` | — | When set, returns a recursive flat list of all entries |

**Response (directory listing):**
```json
{
  "workspace": "vps",
  "label": "VPS Host (Nexus)",
  "path": "/home/nexus/.openclaw/workspace",
  "type": "host",
  "files": [
    { "name": "config", "isDirectory": true, "isFile": false, "path": "..." },
    { "name": "SOUL.md", "isDirectory": false, "isFile": true, "path": "..." }
  ]
}
```

**Response (`tree=1` — recursive tree):**
```json
{
  "workspace": "vps",
  "label": "VPS Host (Nexus)",
  "path": "/home/nexus/.openclaw/workspace",
  "root": "/home/nexus/.openclaw/workspace",
  "type": "host",
  "entries": [
    { "name": "olympus-vps", "path": "/home/nexus/.openclaw/workspace/olympus-vps",
      "relPath": "olympus-vps", "type": "directory", "size": 0,
      "mtimeMs": 1750000000000, "isDirectory": true, "isFile": false },
    ...
  ],
  "tree": [ "...same items as entries..." ],
  "files": [ "...same items as entries..." ]
}
```

**Response (file read):** Same structure with a `content` field (string) instead of `files`.

### `PUT /api/workspace`

Write content to a workspace file.

**Auth:** any auth method

**Body:**
```json
{
  "workspace": "vps",
  "path": "/home/nexus/.openclaw/workspace/test.md",
  "content": "hello"
}
```

**Response:** `{ "ok": true }`

If `workspace` is omitted, defaults to `vps`.

---

## 5. Entry Sorting (Consistency Rule)

All directory listings and trees are sorted server-side by `compareWorkspaceEntries()`:

1. **Directories before files** — at every level of a nested path
2. **Alphabetical within each group** — directories sorted by name, then files sorted by name
3. **Recursive depth-first** — the same rule applies at every nesting level

This ordering is **always applied server-side** so the UI receives a consistent
sequence regardless of filesystem order (`readdir` order differs across platforms and
filesystems). Both host and container listings use the same comparator.

---

## 6. Host Workspace Implementation

- Uses `fs.readdirSync` / `fs.readFileSync` / `fs.writeFileSync` — real-time, no caching
- Paths are validated against `VPS_ROOT` (`/home/nexus/.openclaw/workspace/`) to prevent directory traversal
- Binary files (images, PDFs) are detected by extension (`BINARY_EXTENSIONS` set) and served inline
- Hidden files (starting with `.`) and `node_modules` are skipped in directory listings

---

## 7. Container Workspace Implementation

- Uses `docker exec` to run shell commands inside the container for listing, reading, and writing
- **Discovery** uses `execFileSync('docker', ['ps', ...])` with explicit arguments — this avoids
  shell quoting fragility compared to `execSync('docker ps ...')`
- **List directory:** `docker exec <name> ls -1Ap <dir>` (detects directories via trailing `/`)
- **File existence check:** `docker exec <name> test -d <path> && echo YES || echo NO`
- **File read:** `docker exec <name> cat <path>`
- **File write:** `docker exec -i <name> sh -c 'mkdir -p $(dirname <path>) && cat > <path>'` with content piped via heredoc
- Container root is scoped to `/root/.openclaw/workspace/` rather than the full
  container filesystem — this is intentional: it limits the editor to agent workspace
  files and prevents accidental editing of system files inside the container

---

## 8. Design Decisions

| Decision | Rationale |
|---|---|
| Server-side sorting | Filesystem `readdir` order is platform-dependent (e.g. ext4 vs overlayfs). Sorting server-side guarantees consistent ordering for the UI. |
| Container discovery via `AGENT_ID` | Avoids listing all containers (including Traefik, DBs, etc.) — only agent containers are relevant workspace targets. |
| `execFileSync` for `docker ps` | `execFileSync` passes arguments as an array, avoiding shell injection vulnerabilities and fragile quoting compared to `execSync('docker ps ...')` with string concatenation. |
| Container root at `/root/.openclaw/workspace/` | Prevents operators from accidentally reading/writing system files (e.g. `/etc/passwd`, `/bin/sh`) inside the container. The workspace root is the only exposed sandbox. |
| Real-time file reads (no caching) | Workspace files change frequently (agents write MEMORY.md, logs). Caching would require invalidation logic with little benefit — file reads are fast. |
| Flat tree with aliases (`entries`, `tree`, `files`) | Backward compatibility: older UI components expect `files` or `tree` keys; `entries` is the canonical name in the current codebase. |
