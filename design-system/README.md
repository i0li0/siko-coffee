# design-system/

UI/UX source of truth for Sikō Coffee, seeded by the **UI/UX Pro Max** skill and
hand-tuned to this codebase.

| File | Purpose |
|---|---|
| `MASTER.md` | Global source of truth (palettes, type, motion, UX rules, anti-patterns). |
| `pages/<area>.md` | Per-area overrides. `pages/admin.md` exists. Override beats MASTER. |
| `ux-audit-2026-06-18.md` | Latest accessibility/UX audit of the public site. |

## Retrieval rule
When building area X: read `pages/x.md` if it exists (it overrides), else use `MASTER.md`.

## Regenerate / extend with the skill
The skill is a knowledge plugin (no dependency in `package.json`):
```bash
SK=~/.claude/plugins/cache/ui-ux-pro-max-skill/ui-ux-pro-max/2.5.0/.claude/skills/ui-ux-pro-max
python3 "$SK/scripts/search.py" "specialty coffee dark minimal" --design-system -p "siko-coffee"
python3 "$SK/scripts/search.py" "form validation feedback" --domain ux
```
Do **not** blindly paste its raw output — reconcile against the established dark brand and
Vercel performance budget (it tends to suggest light-mode glassmorphism). See MASTER.md.
