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
- **Notices** (warnings, blockers, errors, hints): use `ui/notice.mjs`, never a long single-weight sentence. `notice({ title, detail, tone, actions, fixes })` renders a bold headline (the problem) over a lighter detail line (the explanation) and buttons; `blockerNotice(b)` / `noticeList(list, { label })` render blockers; `textNotice(err.message)` turns a thrown error into a notice and adds buttons for advice like "in Contracts" or "on the Squad screen". Every proposed fix gets a button: blockers return structured `fixes` (`release`, `restructure`, `practice`, `waive`, `open`, `quicksim`, `matchday`, `dealRemove`, `freeAgents`) that `franchise/fixes.mjs` runs. Costly fixes confirm first with their cap effect (dead money, cap freed) and go through `F.action`, which re-renders so the blocker list updates. Toasts use the same voice (first sentence bold).

## Navigation conventions

- Every screen is a route opened with `W.open(route, tab?)`; retired names go in `ROUTE_ALIASES`, and retired screens that now open something else (e.g. "Careers & saves" opens the career library) go in `ROUTE_ACTIONS`.
- **The sidebar is the single way between screens.** Order: Club overview, Inbox, Matchday, News & social (no heading), then the groups Team, Recruitment, Front office and League (`NAV_GROUPS` in `franchise/presentation.mjs`), with Settings pinned at the bottom above the coach card. Do not add tab strips, "Open in …" links or hub tabs that repeat sidebar destinations; sub-tabs are only for views within one screen (Medical | Training, Market's Trade builder | Offers | Free agents, Calendar's Fixtures | Head-to-head | Calendar, Draft room | Scout network | Watchlist pipeline). Club overview is just the dashboard.
- Sidebar look (pixel theme, `ui/pixel.css` "Sidebar" block): 12×12 pixel glyphs from `ui/pixel-icons.mjs` (`pixelIcon(name)`, crisp-edged SVG), Pixelify group headings with a stepped caret and dotted rule, an accent bar plus raised fill on the active entry, and pixel chips for counts (pending inbox decisions, injuries) and LIVE. Labels are one line with an ellipsis and a tooltip.
- **The desktop sidebar never scrolls.** `fitNavigation()` lowers `--nav-scale` (rows, icons, gaps, type; labels never under 11px) until `#nav` fits, then hides the wordmark, and only then folds groups that don't hold the current screen (bottom first; folded state isn't saved). Groups the player folds are remembered (`gridiron-nav-closed`). The dev panel's Checks → Check routes reports "Sidebar fits". The slide-in menu under 900px may scroll.
- Viewport scale: on desktop windows under ~840px tall or ~1380px wide, `#app` is zoomed to `--ui-scale` (0.96, or 0.92 under 780px tall) so dashboards show more at once. Matchday and any screen with a canvas or the 3D stadium are never zoomed.
- The header breadcrumb (club / section / page, with ← Back) is the only "where am I" line. Under it, every screen gets a compact title bar (`#app > .title-row.gd-titlebar`, written by the render wrapper in `franchise/presentation.mjs`): the page name (`h1`, Pixelify, with a club-coloured pixel block) on the left and, on the right, real per-screen actions (e.g. Tactics → "Enter matchday") plus the `?` help button (`W.help()`). Page names come from `descriptions` in that file.
- No eyebrows, taglines, role badges or "Jump to" link rows in the title bar, and no hero banners that repeat the page name or describe the page. A screen starts with its real content (numbers, filters, lists). Explain a mechanic in one short line only where it matters; otherwise use a tooltip, the glossary or the `?` help.
- Moving between screens is the sidebar, ← Back and Ctrl+K search (the breadcrumb's club crumb opens Club overview; its group crumb is plain text); link to a related screen from the panel where the user needs it (e.g. "Inbox →" on a panel header), not from a generic row.
- Layout: `main` clips horizontal overflow (the sidebar is fixed, so a sideways-scrolling page used to slide under it), content is centred at max 1800px on wide screens, and below 900px the sidebar becomes the slide-in menu (`W.mobile()`). Wide tables scroll inside their own panel on phones, never the page.
- Add a line of help for every new route to `SCREEN_HELP` in `ui/tutorial-content.mjs`. `test-tutorials.mjs` fails if a sidebar route has none.
- Player names link to the player hub: `W.player(id, team)`.

## Glossary tooltips

Labels whose text matches a term in `GLOSSARY` (`ui/tutorial-content.mjs`) get a dotted underline and a definition on hover or focus. To explain a new term everywhere it appears, add it there rather than writing one-off tooltips.
