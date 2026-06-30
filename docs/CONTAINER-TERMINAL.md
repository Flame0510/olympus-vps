# Container Terminal — WebSocket PTY

> **Status:** Active — `main` branch
> **Last updated:** 2026-06-30

---

## Overview

Olympus provides an interactive web-based terminal for Docker containers.
It connects to any container with `AGENT_ID` label, spawning a real PTY session
via `node-pty` and streaming I/O over a dedicated WebSocket server.

```
Browser (xterm-compatible DOM terminal)
  │  WebSocket wss://olympus/containers/terminal/{id}
  ▼
terminal-ws-server.js (port 3741, proxied by Traefik)
  │  node-pty
  ▼
docker exec -it {containerId} env TERM=xterm-256color bash
  │
  ▼
Container Shell (bash, interactive, full PTY)
```

## Architecture

### Two-process model

| Process          | Port  | Role |
|------------------|-------|------|
| `olympus-next`   | 3740  | Next.js app (pages, API routes, auth) |
| `olympus-terminal-ws` | 3741 | Standalone WebSocket server for terminal sessions |

The terminal server is a separate process managed by PM2. It was isolated from
the Next.js app to avoid event-loop contention during high-throughput I/O (fast
`seq`, `cat` on large files, interactive shell sessions).

### Traefik routing

```
/containers/terminal/{id}          → Next.js (page serving TerminalClient)
/api/terminal-ws?id={containerId}  → WebSocket proxy → ws://127.0.0.1:3741
```

### Data flow

1. User opens `/containers/terminal/openclaw-atlas`
2. `page.tsx` renders `<TerminalClient containerId="openclaw-atlas" />`
3. `TerminalClient` opens a WebSocket to `/api/terminal-ws?id=openclaw-atlas`
4. `terminal-ws-server.js` receives connection, spawns a PTY via node-pty:
   ```
   docker exec -it openclaw-atlas env TERM=xterm-256color bash
   ```
5. PTY output streams → WebSocket → browser (DOM terminal)
6. User keystrokes → WebSocket → PTY stdin

## Terminal Client (Browser)

### Why not xterm.js?

The first implementation used **xterm.js** (v5.3.0) with both **canvas** and
**DOM** renderers. Both suffered from:

- **Black screen on large output** — the canvas renderer went blank when
  hundreds of lines were received in a single burst. The DOM renderer
  (xterm.addons.dom) had the same issue under load.
- **Broken scrolling** — xterm.js manages its own scrollback buffer internally,
  but the canvas never grew, so native browser scrolling didn't exist. Mouse
  wheel scrolling often failed or produced visual artifacts.
- **CSS conflicts** — the parent app sets `html, body { overflow: hidden }`,
  which interfered with xterm.js viewport calculation. Multiple workarounds
  (`position: fixed`, `minHeight: 0`, `height: 100dvh`) didn't fully resolve
  layout instability.
- **Selection issues** — xterm.js intercepts mouse events for its own
  selection system, making it hard to copy text natively.

### Custom DOM terminal (current)

The current terminal replaces xterm.js entirely with a plain HTML structure:

```
┌─────────────────────────────────┐
│  Top bar (44px, container info) │
├─────────────────────────────────┤
│                                 │
│  Output area (div, overflow:auto│
│  white-space: pre-wrap)         │
│                                 │
│  root@hostname:~# ls -la        │
│  total 12                       │
│  drwxr-xr-x ...                 │
│  -rw-r--r-- ...                 │
│                                 │
│  root@hostname:~# █             │
├─────────────────────────────────┤
│  (hidden <textarea> for input)  │
└─────────────────────────────────┘
```

Key design decisions:

| Decision | Rationale |
|---|---|
| **`<textarea>` hidden off-screen** | Captures all keystrokes including Tab, Arrows, Ctrl+letter. No focus/IME issues. Single-line only (no Enter for newlines). |
| **`<div>` output area** | Native browser scrolling (`overflow: auto`). Normal text selection (copy/paste with Cmd+C). Render millions of lines without black screen. |
| **`white-space: pre-wrap`** | Preserves ANSI-visible indentation and spacing while wrapping long lines. |
| **Last output line + input inline** | The cursor and text being typed appear on the same line as the last prompt from the server, simulating a real terminal feel. |
| **`requestAnimationFrame` auto-scroll** | After every buffer update, scrolls to bottom. Smooth, native scroll behavior. |

### Input handling

- **Hidden `<textarea>`** captures all keyboard input
- `value` + `onChange` → React state `currentInput`
- On `Enter` → command sent to WebSocket, input cleared
- `Arrows` → local command history (client-side array)
- `Tab` → `\t` sent to server (bash autocomplete)
- `Ctrl+C/L/D/U` → respective control characters sent to server
- **Multi-line paste** → split by `\n`, each line sent as a separate command

### Pending command flash fix

When the user presses Enter, `currentInput` is immediately cleared.
However, the server echoes the command back with a newline + new prompt.
Between the clear and the server echo, there is a visible frame where the
input line appears blank.

**Fix:** A `pendingCmdRef` ref holds the last submitted command string.
The rendering logic uses:

```ts
const showInput = pendingCmdRef.current ? pendingCmdRef.current : currentInput;
```

`pendingCmdRef` is reset as soon as any server output arrives (the echo),
so the command text stays visible without flicker.

### ANSI parsing (color rendering)

The terminal now includes a real ANSI parser (`parseAnsi()`) that converts
SGR (Select Graphic Rendition) escape sequences into styled `<span>`
elements:

| Feature | Supported |
|---|---|
| Foreground colors 30-37 (normal) | ✅ |
| Foreground colors 90-97 (bright) | ✅ |
| Background colors 40-47 | ✅ |
| Background colors 100-107 (bright) | ✅ |
| Bold (1) | ✅ `fontWeight: 700` |
| Dim (2) | ✅ `opacity: 0.6` |
| Italic (3) | ✅ |
| Underline (4) | ✅ |
| Reset (0) | ✅ clears all styles |
| Bracketed paste `[?2004h/l` | 🚫 stripped |
| Non-SGR CSI (cursor, erase) | 🚫 stripped |
| OSC sequences (title, clipboard) | 🚫 stripped |

**Implementation:**

```ts
type AnsiStyle = {
  fg?: string;          // CSS color
  bg?: string;          // CSS background-color
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
};
type Segment = { text: string; style: AnsiStyle };
```

The parser walks the raw ANSI string character by character. When it
encounters `\x1b[`, it reads until `m` to get SGR parameters. Each
parameter (e.g. `31` for red foreground) is translated into a color
from the ANSI color map. All non-SGR escape sequences (cursor movement,
erase display, bracketed paste) are silently stripped.

The raw PTY output is kept in state as-is (with ANSI), split by `\n`,
and each line is passed through `RenderAnsi` which uses `useMemo` to
avoid re-parsing on every render.

**Color palette** follows the One Dark theme used by the UI:

| Code | Color | Hex |
|---|---|---|
| 30/90 (black) | Dark gray | `#1d1d1d` / `#5c6370` |
| 31/91 (red) | Soft red | `#e06c75` |
| 32/92 (green) | Soft green | `#98c379` |
| 33/93 (yellow) | Amber | `#d19a66` |
| 34/94 (blue) | Soft blue | `#61afef` |
| 35/95 (magenta) | Purple | `#c678dd` |
| 36/96 (cyan) | Teal | `#56b6c2` |
| 37/97 (white) | Light gray / white | `#abb2bf` / `#ffffff` |

### Legacy: ANSI stripping (pre-color support)

The original implementation stripped all ANSI sequences, keeping only
visible text. This was replaced by the parser above on 2026-06-25.

## Terminal Server (`terminal-ws-server.js`)

### Dependencies

- **ws** (WebSocket server)
- **node-pty** (pseudo-terminal for child processes)

### Session lifecycle

1. WebSocket connection established with `?id=openclaw-atlas`
2. `node-pty` spawns `docker exec -it {containerId} bash` with:
   - `name: 'xterm-256color'`
   - `cols: 80, rows: 30` (initial, resized on client fit)
3. PTY `onData` → WebSocket `send`
4. WebSocket `message` → PTY `write`
5. Idle timeout: 30 minutes (reset on any client input)
6. On disconnect or `exit` command → cleanup child process, close socket

### Resize handling

The client sends a JSON message when the terminal dimensions change:

```json
{ "type": "resize", "cols": 120, "rows": 40 }
```

The server calls `term.resize(cols, rows)` to update the PTY dimensions.
This ensures commands like `top`, `less`, `vim` use the correct viewport.

### Chunked output

PTY output is buffered and flushed every 10ms to avoid overwhelming the
browser's DOM renderer with a single giant chunk. If the buffer exceeds
2000 characters, it is flushed immediately in sub-chunks.

This was added because `seq 1 10000` or `cat` on a large file would
send 100KB+ in one frame, causing the browser to freeze.

### Why node-pty over `spawn('script')` or `unbuffer`?

Earlier attempts used:

- `spawn('docker exec -i ...')` — no PTY, commands had no echo, no history,
  no tab completion
- `spawn('script', ['-q', '-c', 'docker exec -i ...'])` — created a PTY but
  output was fully buffered and never appeared until the process exited
- `spawn('unbuffer', ['-p', 'docker exec -i ...'])` — same buffering issue

`node-pty` is the only reliable way to create a real PTY and get
line-buffered or character-buffered I/O in real-time.

## File Structure

```
app/containers/terminal/
├── [id]/
│   ├── page.tsx               # Next.js page (auth-protected)
│   └── TerminalClient.tsx     # Client-side terminal component
terminal-ws-server.js           # WebSocket PTY server (PM2-managed)
ecosystem.config.js             # PM2 config for both processes
```

## Known Limitations

- **No full-screen TUI support** — `vim`, `top`, `nano`, `htop` will
  not render correctly because cursor positioning sequences are stripped.
  These tools require a proper xterm-compatible terminal.
- **Single session per connection** — no multiplexing, no tabs.
  Each WebSocket connection spawns one PTY.
- **No WebGL renderer** — DOM rendering is CPU-bound for very fast output.
  In practice, up to ~500 lines/sec is smooth.

## Future Improvements

- [ ] Detect TUI applications and fall back to xterm.js WebGL renderer
- [ ] Terminal multiplexer (multiple tabs, split panes)
- [ ] Download session log as text file
- [ ] Paste confirmation dialog for multi-line pastes
- [ ] Dark/light theme toggle
