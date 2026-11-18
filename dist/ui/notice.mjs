// Notices: one shared look for warnings, blockers, errors, hints and empty states. A bold headline
// (the problem) over a lighter detail line (the explanation), with buttons that fix it or open the
// place to fix it. Markup only: franchise/fixes.mjs installs the `Fix` handler the buttons call.
//
//   notice({ title, detail, tone: "bad" | "warn" | "info" | "good", actions, fixes, after })
//   blockerNotice(b)    a blocker from franchise/blockers.mjs ({ reason, fix, fixes })
//   noticeText(text)    splits a long sentence-run into { title, detail } at the first sentence
//
// actions are plain buttons: { label, onclick, primary?, title?, disabled? }. fixes are structured
// fix options ({ kind, label, playerId, route, tab, amount, side, id, pos }); `after` names what to
// reopen once a fix that left the current dialog has run (e.g. "neg:<playerId>").
const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const GLYPH = { bad: "!", warn: "!", info: "i", good: "✓" };

// "Problem. Explanation and more." → { title: "Problem.", detail: "Explanation and more." }.
// Splits only at a sentence end followed by a capital, so "$0.1M" or "e.g." stay intact.
export function noticeText(text) {
  const s = String(text ?? "").trim(),
    m = s.match(/^(.+?[.!?:])\s+([A-Z"'(\d$][\s\S]*)$/);
  return m && m[1].length >= 8 ? { title: m[1], detail: m[2] } : { title: s, detail: "" };
}

const DATA = { kind: "fix", playerId: "id", id: "asset", route: "route", tab: "tab", amount: "amount", side: "side", pos: "pos" };
export function fixButton(fix, { primary = false, after = "", small = true } = {}) {
  if (!fix?.kind || !fix.label) return "";
  const attrs = Object.entries(DATA)
    .filter(([k]) => fix[k] !== undefined && fix[k] !== null && fix[k] !== "")
    .map(([k, a]) => ` data-${a}="${esc(fix[k])}"`)
    .join("");
  return `<button type="button" class="gd-btn ${small ? "small" : ""} ${primary ? "gd-primary" : "secondary"} gd-fix"${attrs}${after ? ` data-after="${esc(after)}"` : ""} title="${esc(fix.title || fix.label)}" onclick="Fix.run(this)">${esc(fix.label)}</button>`;
}

const actionButton = (a, primary) =>
  `<button type="button" class="gd-btn small ${a.primary ?? primary ? "gd-primary" : "secondary"}" ${a.disabled ? "disabled" : ""} ${a.title ? `title="${esc(a.title)}"` : ""} onclick="${esc(a.onclick)}">${esc(a.label)}</button>`;

export function notice({ title, detail = "", tone = "warn", actions = [], fixes = [], after = "", cls = "", role, html = "" } = {}) {
  if (!title && !detail) return "";
  // One primary button: an action flagged primary leads; otherwise the first fix does.
  const lead = actions.some((a) => a.primary),
    fixHTML = fixes.map((f, i) => fixButton(f, { primary: i === 0 && !lead, after })),
    actionHTML = actions.map((a, i) => actionButton(a, !fixes.length && i === 0)),
    buttons = (lead ? [...actionHTML, ...fixHTML] : [...fixHTML, ...actionHTML]).filter(Boolean).join("");
  const r = role || (tone === "bad" ? "alert" : "status");
  return `<div class="gd-notice gd-notice-${tone} ${cls}" role="${r}"><span class="gd-notice-icon" aria-hidden="true">${GLYPH[tone] || "!"}</span><div class="gd-notice-text">${title ? `<b>${esc(title)}</b>` : ""}${detail ? `<span>${esc(detail)}</span>` : ""}${html}</div>${buttons ? `<div class="gd-notice-actions">${buttons}</div>` : ""}</div>`;
}

// A blocker's reason can run two sentences ("Trading is closed. Trades pause while…"): the first is
// the headline, the rest joins the fix in the detail line.
export function blockerNotice(b, opts = {}) {
  if (!b) return "";
  const { title, detail } = noticeText(b.reason);
  return notice({ title, detail: [detail, b.fix].filter(Boolean).join(" "), fixes: b.fixes || textFixes(b.fix), tone: "bad", ...opts });
}

// Navigation fixes read from plain advice ("…in Contracts", "…on the Squad screen", "Open inbox"),
// for messages that come from thrown errors rather than structured blockers.
const ROUTE_WORDS = [
  [/\bin Contracts\b|\bContracts screen\b|\bResolve his contract\b/i, { route: "Contracts", label: "Open Contracts" }],
  [/\bSquad screen\b|\bon the Squad\b|\bpractice squad first\b|\bWaive a player\b/i, { route: "Roster", label: "Open Squad" }],
  [/\bDepth chart\b|\bGame plan\b|\bset a starter\b/i, { route: "Game plan", label: "Open Tactics" }],
  [/\binbox\b/i, { route: "Inbox", label: "Open Inbox" }],
  [/\bhire (?:a|an)\b|\bin Staff\b|\bCoaching staff\b/i, { route: "Staff", label: "Open Coaching staff" }],
  [/\bMedical\b|\binjured reserve\b/i, { route: "Medical", label: "Open Medical" }],
  [/\bDraft room\b/i, { route: "Draft", label: "Open Draft room" }],
  [/\bBoardroom\b|\bthe board\b/i, { route: "Boardroom", label: "Open Boardroom" }],
  [/\bfree agen(?:t|cy)\b|\bsign one\b/i, { kind: "freeAgents", label: "Open Free agents" }],
];
export function textFixes(text, { except = "" } = {}) {
  const s = String(text ?? ""),
    out = [];
  if (/quick-sim|live game|game is in progress|Finish the live/i.test(s)) out.push({ kind: "quicksim", label: "Quick-sim the game" }, { kind: "matchday", label: "Go to Matchday" });
  for (const [re, fix] of ROUTE_WORDS) if (re.test(s) && fix.route !== except && !out.some((f) => f.route && f.route === fix.route)) out.push({ kind: "open", ...fix });
  return out.slice(0, 3);
}

// A stack of blockers, optionally under a small label ("Can't be proposed yet").
export function noticeList(list, { label = "", after = "", tone = "bad", cls = "" } = {}) {
  if (!list?.length) return "";
  return `<div class="gd-notices ${cls}">${label ? `<p class="gd-notices-label">${esc(label)}</p>` : ""}${list.map((b) => (b.reason !== undefined ? blockerNotice(b, { after, tone }) : notice({ tone, after, ...b }))).join("")}</div>`;
}

// A thrown error or plain warning string as a notice, with navigation fixes read from its advice.
export const textNotice = (text, opts = {}) => (text ? notice({ ...noticeText(text), tone: "bad", fixes: textFixes(text, opts), ...opts }) : "");

// Empty states in the same voice: what will appear, and when.
export const emptyNotice = (title, detail = "", actions = []) => notice({ title, detail, tone: "info", actions, cls: "gd-notice-empty" });
