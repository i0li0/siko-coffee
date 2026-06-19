# Sikō Rabbit — ASCII Art

The Sikō Coffee rabbit mark rendered as ASCII art (luminance-sampled from the vector logo).

## Files

| File | Size (cols×rows) | Use |
|---|---|---|
| `rabbit-large.txt`  | 96×54 | hero / splash, wide terminals |
| `rabbit-medium.txt` | 72×40 | default — READMEs, banners |
| `rabbit-small.txt`  | 44×25 | inline, CLI headers |
| `rabbit-tiny.txt`   | 28×16 | favicons-as-text, prompts |
| `rabbit-ascii.js`   | — | ES module: `import { SIKO_RABBIT_ASCII } from './rabbit-ascii.js'` |
| `rabbit-ascii.json` | — | all four sizes as JSON strings |
| `rabbit.svg`        | — | source vector used for sampling |

## Notes
- Use a **monospace** font. Recommended line-height: ~1.05.
- Each `.txt` is plain UTF-8 (ASCII-only glyphs: ` .:-=+*#%@`), safe to paste into code comments, terminals, or chat.
- For dark backgrounds, render with light text — the ramp already reads correctly inverted.

## Console banner example
\`\`\`js
import { SIKO_RABBIT_ASCII } from './rabbit-ascii.js';
console.log('%c' + SIKO_RABBIT_ASCII, 'font-family:monospace;line-height:1.05');
\`\`\`
