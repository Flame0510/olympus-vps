# Olympus Frontend Architecture

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

## Migration rule

For every new/changed page:

1. No new one-off card styles unless justified.
2. Use `Surface`, `Metric`, `StatusCard`, `Pill`, `Page` where applicable.
3. Async data must render skeleton, not fake zero values.
4. Business logic stays in `lib`/API routes; UI consumes typed payloads.
5. If a pattern is introduced, name it and keep it in `lib/patterns` or `app/components/ui`.
