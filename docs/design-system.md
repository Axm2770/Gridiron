# Design system

Gridiron Director has one visual identity: a dark, retro football-management look with hard pixel frames, a readable pixel face for titles and a clean sans-serif for everything you read closely. The pixel theme is on by default (`body.gd-pixel`). Players can switch to the classic glass look in Settings → Interface.

New screens should follow these rules automatically if they use the tokens and components below.

## Where things live

| File | Role |
| --- | --- |
| `dist/ui/design-system.css` | Tokens (`--gd-*`) and the base components (`gd-card`, `gd-stat`, `gd-tabs`, `gd-chip`, …). |
| `dist/ui/pixel.css` | The pixel theme. It redefines the tokens on `body.gd-pixel` and squares off every surface. It loads last. |
| `dist/ui/kit.mjs` | String-template components that emit design-system markup: `card`, `stat`, `stats`, `tabs`, `chip`, `meter`, `row`, `empty`, `link`. |
| `dist/ui/navigation.css` | Breadcrumbs, related links, tab bars, the player hub and the Transactions log. |
| `dist/ui/tutorial.css` | Guided tours, the Help & tutorials centre and glossary tooltips. |
| `dist/ui/dialogs.css` | Dialogs in the pixel kit: the player profile (`gp-*`), the hover snapshot, plain dialogs framed by `frameDialog()` in `franchise/presentation.mjs` (`gd-dlg-*` header bar, body, sticky action row), the Ctrl+K palette, toast and update banner. |

## Tokens

Use tokens, never hex values, in new CSS.

| Token | Use |
| --- | --- |
| `--gd-bg`, `--gd-bg-2` | Page backgrounds. |
| `--gd-surface`, `--gd-surface-strong` | Cards and panels; dialogs and overlays use the strong one. |
| `--gd-border`, `--gd-border-strong` | Dividers; outlines of interactive or raised elements. |
| `--gd-text`, `--gd-text-2`, `--gd-text-3` | Primary text, secondary text and captions/metadata. |
| `--gd-accent` | The one highlight colour: primary buttons, active tabs, focus rings, progress. |
| `--gd-good`, `--gd-warn`, `--gd-bad` | Status only: positive, needs attention, negative. |
| `--team`, `--team-rgb` | The career club's colour, set per career. |
| `--gd-radius`, `--gd-radius-sm` | Corners (0 in the pixel theme). |
| `--gd-shadow` | Raised surfaces (a hard 4px offset in the pixel theme). |
| `--gd-display` | Titles: `h1`, `h2`, headline numbers. Pixelify Sans in the pixel theme. |
| `--gd-body` | Everything else: body text, tables, labels, buttons. DM Sans. |

The pixel theme also maps the older variable families (`--bg`, `--panel`, `--line`, `--muted`, `--lime`, `--text`, `--office-*`, `--mint`, `--amber`, `--coral`, …) onto these tokens, so older screens share the palette. Don't add new variable families; add a `--gd-*` token if one is genuinely missing.

## Typography

- **Page title (`h1`)**: display face, uppercase, 24–34px.
- **Panel title (`h2`)**: display face, 16–20px.
- **Card heading (`h3`, `.gd-card-head h3`)**: body face, 11–13px, uppercase, letter-spaced, `--gd-text-2`.
- **Body and tables**: body face, 13–14px, line-height 1.5.
- **Captions (`small`, `.eyebrow`)**: body face, never under 11px.

Don't introduce other fonts. Bundled fonts live in `dist/assets/fonts` (SIL OFL 1.1).

## Components

Prefer `kit.mjs` over hand-written markup:

```js
import * as K from "../ui/kit.mjs";
K.card({ title: "Cap position", span: 6, body: K.stats([["Cap room", "$31M"], ["Dead money", "$0M"]]) });
K.tabs([["all", "All"], ["mine", "My club"]], active, "Screen.tab('$id')");
K.chip("Starter", "good");
K.empty("No moves yet.");
```

- **Buttons**: `<button>` is primary, `class="secondary"` for secondary actions, `class="small"` in dense rows, `class="link"` for inline navigation. One primary button per group.
- **Tabs**: `.segmented` or `K.tabs`, with `role="tab"` and `aria-selected`.
- **Tables**: wrap in `.scroll.f-table`; put numbers in `td.numeric`; highlight your club's row with `tr.me`.
- **Status**: `K.chip(text, "good" | "warn" | "bad")` (classes `gd-chip gd-good` etc.); colour is never the only signal, so always add a word.
- **Empty states** say what will appear and when ("Signings appear here after the first market day").
- **Blocked actions** say why and how to fix it (see `franchise/blockers.mjs`).

## Navigation conventions

- Every screen is a route opened with `W.open(route, tab?)`; retired names go in `ROUTE_ALIASES`.
- The header breadcrumb (club / section / page, with ← Back) is the only "where am I" line. Under it, every screen gets a compact title bar (`#app > .title-row.gd-titlebar`, written by the render wrapper in `franchise/presentation.mjs`): the page name (`h1`, Pixelify, with a club-coloured pixel block) on the left and, on the right, real per-screen actions (e.g. Tactics → "Enter matchday") plus the `?` help button (`W.help()`). Page names come from `descriptions` in that file.
- No eyebrows, taglines, role badges or "Jump to" link rows in the title bar, and no hero banners that repeat the page name or describe the page. A screen starts with its real content (numbers, filters, lists). Explain a mechanic in one short line only where it matters; otherwise use a tooltip, the glossary or the `?` help.
- Moving between screens is the sidebar, the breadcrumb and Ctrl+K search; link to a related screen from the panel where the user needs it (e.g. "Inbox →" on a panel header), not from a generic row.
- Layout: `main` clips horizontal overflow (the sidebar is fixed, so a sideways-scrolling page used to slide under it), content is centred at max 1800px on wide screens, and below 900px the sidebar becomes the slide-in menu (`W.mobile()`). Wide tables scroll inside their own panel on phones, never the page.
- Add a line of help for every new route to `SCREEN_HELP` in `ui/tutorial-content.mjs`. `test-tutorials.mjs` fails if a sidebar route has none.
- Player names link to the player hub: `W.player(id, team)`.

## Glossary tooltips

Labels whose text matches a term in `GLOSSARY` (`ui/tutorial-content.mjs`) get a dotted underline and a definition on hover or focus. To explain a new term everywhere it appears, add it there rather than writing one-off tooltips.
