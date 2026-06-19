# Sikō Coffee — Design System (MASTER)

> Source of truth for UI/UX decisions. Generated with the **UI/UX Pro Max** skill
> (`ui-ux-pro-max`) on 2026-06-18, then **hand-tuned to the real codebase** — the
> skill's raw auto-recommendation (Liquid Glass / light background / amber accent)
> was NOT adopted because it contradicts this product's established dark aesthetic
> and Vercel performance budget. See `## How this was produced` at the bottom.

Hierarchical retrieval: when building a specific area, check `design-system/pages/<area>.md`
first; if it exists its rules **override** this file, otherwise use this file.

---

## Product context

- **Type**: Specialty / decaf coffee brand site + small e-commerce (Stripe checkout) + admin panel.
- **Stack**: Next.js 16 (App Router) · React 19 · Tailwind CSS v4 · GSAP + Lenis + canvas. Hosted on Vercel (Speed Insights + Analytics active).
- **Brand concept**: 思考・試行・至高・嗜好 ("think, try, pursue, savor"). Tagline: 「暗闇の向こうに、光がある。」 Dark, cinematic, quiet, craft-driven.
- **Mascot**: 「シコうさ」 (dot/pixel rabbit) — see `PixelRabbit.tsx`.

---

## Two palettes (INTENTIONAL — do not "unify")

This product runs **two distinct dark palettes**. The marketing site is warm; the admin
panel is cool-gray. Keep them separate; do not migrate one to the other.

### A. Public / marketing site — Warm amber on near-black
Defined in `src/app/globals.css :root`.

| Token | HEX / value | Use |
|---|---|---|
| `--bg` | `#080600` | base background |
| `--bg2` | `#0f0d00` | secondary background |
| `--surface` | `#1c1900` | cards / raised |
| `--amber` | `#D4A017` | accent / links / emphasis |
| `--amber2` | `#8B6914` | sub-accent ⚠ low contrast (see audit) |
| `--amber3` | `#4A3808` | deep accent |
| `--cream` | `#E8E0D0` | primary text |
| `--dim` | `rgba(232,224,208,0.45)` | muted text ⚠ borderline contrast |
| `--faint` | `rgba(232,224,208,0.14)` | borders / hairlines |

### A2. /shop blend flow — Warm gold, scoped under `.ss-root`
`src/app/shop/shop.css` redefines its own brand tokens **inside `.ss-root`** so they don't
clash with the main site. It's a warmer gold variant of palette A — keep it scoped there.

| Token | HEX / value | Use |
|---|---|---|
| `--ss-bg` | `#07070f` | shop background |
| `--ss-gold` | `#c8a96e` | accent (also the shop focus-ring color) |
| `--ss-gold2` | `#a07840` | sub-accent |
| `--ss-cream` | `#f0ebe0` | text |

### B. Admin panel — Cool-gray monochrome on near-black
Defined in `src/app/globals.css :root` (admin-prefixed) + components.

| Token | HEX / value | Use |
|---|---|---|
| `--admin-sidebar-bg` | `#0d0d14` | sidebar |
| `--admin-card-bg` | `#0f0f1a` | cards |
| `--admin-border` | `rgba(240,235,224,0.08)` | borders |
| `--admin-accent` | `#B8BEC8` | accent / links |
| `--admin-danger` | `#e05555` | destructive |
| `--admin-success` | `#6aaa3a` | success |
| `--admin-warning` | `#c8963a` | warning |

**Rule**: never hardcode hex in components — reference the CSS variable or a Tailwind
arbitrary value pointing at it (`text-[var(--amber)]`).

---

## Typography

| Role | Family (next/font) | Notes |
|---|---|---|
| Display / serif | Cormorant Garamond (`--font-cormorant`) | hero, menu item names; weights 300/400 |
| Body / JP | IBM Plex Sans JP (`--font-sans`) | weights 200/300/400 |
| Mono / labels | IBM Plex Mono (`--font-mono`) | CLI motifs, prices, en captions |
| Serif alt | IBM Plex Serif (`--font-ibm-serif`) | preload:false |

- Type scale uses `clamp()` for fluid sizing — keep this pattern.
- **⚠ Body weight 200 is too thin** for JP body text on a dark background (readability +
  perceived-contrast risk). Prefer **≥300 for body, ≥400 for any small/important text.**
- Prices / numeric columns: keep mono (tabular feel) — already done in `Menu.tsx`.

---

## Motion (a strength — preserve it)

- `prefers-reduced-motion` is honored in **both** CSS (`globals.css`) and JS
  (`useScrollAnimations.ts`, `StarsCanvas.tsx`, `TerminalLoader.tsx` skip GSAP/Lenis/canvas loops).
  **Any new animation MUST keep this contract.**
- Durations: micro-interactions 150–300ms, hero/reveal timelines ≤1.3s (cinematic, deliberate).
- Easing: `power2/3.out` for entrances. Avoid `linear` for UI transitions.
- Budget: animate 1–2 key elements per view. Multiple full-screen canvases (Stars/Smoke)
  already push the main-thread budget — do not add more always-on canvas layers.

---

## Effects & style

- Aesthetic = dark, filmic, restrained (CLI/terminal motifs, faint amber glow, subtle grain/scanlines).
- **Not** glassmorphism / liquid-glass (perf + contrast cost). Backdrop-blur only with purpose (dismissable overlays), never decorative.
- Icons: **SVG only** (inline SVG / Lucide-style strokes). No emoji as structural icons. Keep one stroke width per layer.
- Elevation: use `--surface` + hairline borders (`--faint`), not heavy shadows.

---

## Non-negotiable UX rules (web-relevant subset of the skill)

1. **Contrast ≥ 4.5:1** for body text, ≥3:1 for large/UI glyphs. Verify amber-on-black pairs.
2. **Visible focus ring** on every interactive element (`:focus-visible`). Never `outline:none` without a replacement.
3. **No dead controls** — anything that looks tappable must do something or not look tappable.
4. **Touch targets ≥ 44px** (expand hit area for small icons).
5. **Color is never the only signal** — pair with icon/text/weight.
6. **Reserve space** for async/media (width/height or aspect-ratio) to keep CLS < 0.1.
7. **One primary CTA per view**; secondary actions visually subordinate.

---

## Anti-patterns to AVOID (specific to this repo)

- Don't adopt the skill's default "Liquid Glass + light mode + #A16207" recommendation.
- Don't unify the two palettes.
- Don't hardcode hex in TSX (use tokens).
- Don't add body text below ~13px or at font-weight 200.
- Don't introduce hover-only affordances without a touch fallback.
- Don't add new always-on full-screen canvas/animation layers.

---

## How this was produced

```bash
# The skill is a knowledge plugin (no npm dependency). Re-run anytime:
SK=~/.claude/plugins/cache/ui-ux-pro-max-skill/ui-ux-pro-max/2.5.0/.claude/skills/ui-ux-pro-max
python3 "$SK/scripts/search.py" "<query>" --design-system -p "siko-coffee"
python3 "$SK/scripts/search.py" "<keyword>" --domain ux      # accessibility, animation, loading...
python3 "$SK/scripts/search.py" "<keyword>" --domain react   # Next.js performance
python3 "$SK/scripts/search.py" "<keyword>" --domain color   # palettes
python3 "$SK/scripts/search.py" "<keyword>" --domain typography
```

**Caveat**: the skill is React-Native/mobile-app biased (its only `--stack` is
`react-native`; checklists assume native concepts like safe-areas/hitSlop/Dynamic Type).
Treat those as partially applicable; for this web project rely on `--domain ux|react|web|color|typography`.
