# Olympus Frontend Architecture

> **Last updated:** 2026-07-02

## Layering

Olympus UI should follow a layered architecture:

1. `app/*/page.tsx` — routing only.
2. `app/components/*Page*.tsx` — page composition and data orchestration.
3. `app/components/ui/*` — shared design-system primitives.
4. `lib/patterns/*` — domain/data patterns.
5. `lib/*` — infrastructure helpers and pure utilities.

Feature pages should not create new ad-hoc visual languages. Prefer `ui` primitives first.

## UI primitives

Current shared primitives:

- `Surface` — shared panel/card surface.
- `Metric` — metric card.
- `StatusCard` — health/check card.
- `Pill` — status labels.
- `Page` / `PageHeader` — full-page layout shell.
- `Skeleton` — loading placeholders.
- `Icons` (`EyeIcon`, `EyeOffIcon`) — shared SVG icon components (16/20px).
- `PasswordInput` — password input with inline show/hide toggle icon. Used in agents,
  gateway, config, login, and vault panels.

## GoF pattern mapping

Already used:

- **Observer + Singleton**: `EventBus` owns one SSE stream and fan-outs updates.
- **Factory**: `SessionFactory` / `EventFactory` normalize raw runtime data.
- **Adapter**: `ApiAdapter` converts raw API payloads to domain types.
- **Strategy + Composite**: `FilterStrategy` composes dashboard filtering.

Added UI-side discipline:

- **Factory-ish tone mapping**: `toneFromHealth()` maps domain health into UI tone.
- **Strategy-ish variants**: `Surface` variant/tone classes choose presentation without inline restyling.
- **Composition**: page-specific components compose primitives instead of duplicating card markup.

## Responsive system

Olympus uses Bootstrap v5 breakpoint categories as project-wide tokens, declared in `app/globals.css`:

- `--bp-sm: 576px`
- `--bp-md: 768px`
- `--bp-lg: 992px`
- `--bp-xl: 1200px`
- `--bp-xxl: 1400px`

Rules:

1. Prefer breakpoint tokens over raw pixel values.
2. New responsive behavior should map to Bootstrap categories (`sm`, `md`, `lg`, ...), not ad-hoc thresholds.
3. When an exception is needed, express it relative to a token and document why.

## Current responsive behaviors

- **Agents page**
  - below `lg` (`< 992px`) switches to stacked/mobile mode
  - shows one section at a time (`AGENTS` → `FILES + CONFIG` → `EDITOR`)
  - avoids split-column clipping on narrow, fold, and small-tablet devices
- **Mobile bottom nav**
  - active below `md`
  - item row centers from `sm` upward within the mobile range
- **PDF preview in Agents**
  - rendered in-page for mobile browsers instead of relying on the native iframe PDF viewer

## Request orchestration rule

For interactive pages that can change view/file/tab quickly:

1. Abort obsolete fetches with `AbortController`.
2. Guard against stale updates after `await` boundaries.
3. On navigation/context switch, kill in-flight requests before starting new ones.
4. Mobile layout changes must not wait on network completion.

## Migration rule

For every new/changed page:

1. No new one-off card styles unless justified.
2. Use `Surface`, `Metric`, `StatusCard`, `Pill`, `Page` where applicable.
3. Async data must render skeleton, not fake zero values.
4. Business logic stays in `lib`/API routes; UI consumes typed payloads.
5. If a pattern is introduced, name it and keep it in `lib/patterns` or `app/components/ui`.
