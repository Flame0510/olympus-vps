# Olympus Design System

Source of truth: `app/design-system.ts` + CSS tokens in `app/globals.css`.

---

## Responsive breakpoints

Centralized in `app/design-system.ts` as `Breakpoint` object and exposed via the `useResponsive(key)` hook.

| Token | Value | Used by |
|-------|-------|---------|
| `Breakpoint.sm` | 576px | Mobile bottom nav centering |
| `Breakpoint.md` | 768px | Dashboard, Lineage, SessionDrawer, Providers |
| `Breakpoint.lg` | 992px | Agents (dense/fold devices), Crons, Plugins/Skills |
| `Breakpoint.xl` | 1200px | Reserved |
| `Breakpoint.xxl` | 1400px | Reserved |

### CSS tokens (globals.css)

```css
--bp-sm: 576px;
--bp-md: 768px;
--bp-lg: 992px;
--bp-xl: 1200px;
--bp-xxl: 1400px;
```

Use the CSS custom property in `@media` queries, not raw pixel values.

### React hook

```ts
import { useResponsive, Breakpoint } from '../design-system';

const isNarrow = useResponsive('md');  // true when ≤767px
const isFoldable = useResponsive('lg'); // true when ≤991px
```

The hook uses `matchMedia` (passive, zero-CPU) and returns `boolean`.

---

## Current page behaviors

| Page | Breakpoint | Behaviour when active |
|------|-----------|----------------------|
| Agents | `lg` (992px) | Single-column stacked: AGENTS → FILES+CONFIG → EDITOR |
| Crons | `lg` (992px) | Tab navigation: jobs / runs |
| Plugins/Skills | `lg` (992px) | Sidebar → Detail step |
| Providers | `md` (768px) | Tab navigation: providers / details |
| Dashboard | `md` (768px) | Mobile header nav |
| Lineage | `md` (768px) | Mobile tab: graph / feed |
| SessionDrawer | `md` (768px) | Full-width drawer / compact |
