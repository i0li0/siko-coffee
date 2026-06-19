# Page override — Admin panel (`/admin/**`)

Overrides `design-system/MASTER.md` for the protected admin area.

## Palette
Use **Palette B (cool-gray monochrome)** exclusively — `--admin-*` tokens. The warm
amber palette belongs to the public site and must not leak here.

## Priorities (differ from marketing site)
- **Clarity & density over cinema.** No hero animations, no canvas layers, no smooth-scroll
  flourishes. Admins want fast, legible data.
- **Forms & feedback** are first-class — follow the skill's §8 rules:
  visible labels (not placeholder-only), inline validation on blur, error below the field,
  loading→success/error on submit, confirm before destructive actions, focus first invalid field.
- **Tables/charts** (chart.js / react-chartjs-2): show legends, tooltips on interact,
  empty-data states, locale-aware number formatting, and a sortable/accessible fallback.
- **Destructive actions** (delete product/blend, logout) use `--admin-danger` and are
  spatially separated from normal actions.

## Keep
- `prefers-reduced-motion` contract (same as MASTER).
- Visible `:focus-visible` rings — especially important for keyboard-driven admin work.
