// Runs the fix buttons that ui/notice.mjs renders for blockers (see franchise/blockers.mjs for the
// fix kinds). Costly or destructive fixes (release, restructure, practice squad) open a confirm
// dialog that states the cap effect first; navigation fixes open the right screen and tab. Every
// mutation goes through F.action, which saves and re-renders, so the blocker list updates.
import * as S from "./state.mjs";
import * as C from "./contracts.mjs";
import { releaseSavings, releaseDeadMoney, restructurePlan, moneyText } from "./blockers.mjs";
import { notice, noticeText } from "../ui/notice.mjs";

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Every kind a blocker can offer, and the global handler it relies on (checked by tests).
export const FIX_HANDLERS = {
  release: "F.action('cut')",
  waive: "F.action('cut')",
  restructure: "F.action('restructure')",
  practice: "F.action('move')",
  open: "W.open",
  player: "W.player",
  contract: "F.contract",
  matchday: "W.open",
  quicksim: "MD.start",
  dealRemove: "Ops.asset",
  freeAgents: "Ops.sub",
};

// A fix back from a button's data attributes.
export function readFix(el) {
  const d = el?.dataset || {};
  return { kind: d.fix, playerId: d.id, id: d.asset, route: d.route, tab: d.tab, amount: d.amount !== undefined ? Number(d.amount) : undefined, side: d.side, pos: d.pos, after: d.after || "" };
}

// The career lives in a script-scope global (not on window), so read it by name when not given.
const current = (g) => g.state ?? (typeof state !== "undefined" ? state : undefined);
const STATUS = { active: "active roster", practice: "practice squad", ir: "injured reserve", elevated: "elevated" };
const playerOf = (s, id) => s?.roster?.find((p) => p.id === id);
const dataAttrs = (fix) =>
  `data-fix="${esc(fix.kind)}" data-id="${esc(fix.playerId)}"${fix.amount !== undefined ? ` data-amount="${esc(fix.amount)}"` : ""}${fix.after ? ` data-after="${esc(fix.after)}"` : ""}`;
const dialog = (title, body, fix, confirm, danger = false, blocked = false) =>
  `<h2>${esc(title)}</h2>${body}<div class="modal-actions"><button type="button" class="secondary" ${dataAttrs(fix)} onclick="Fix.cancel(this)">${blocked ? "Back" : "Cancel"}</button><button type="button" class="${danger ? "gd-danger" : ""}" ${blocked ? "disabled" : ""} ${dataAttrs(fix)} onclick="Fix.confirm(this)">${esc(confirm)}</button></div>`;

// The confirm dialog for a costly fix, or null when the player or contract is gone.
export function confirmHTML(s, fix) {
  const p = playerOf(s, fix.playerId),
    c = p && s.franchise.contracts[p.id];
  if (!p) return null;
  if (fix.kind === "release" || fix.kind === "waive") {
    const saves = releaseSavings(s, c),
      dead = releaseDeadMoney(s, c);
    let ok = true,
      why = "";
    try {
      S.transact(s, (x) => C.cut(x, p.id, false));
    } catch (err) {
      ok = false;
      why = err.message;
    }
    const facts = notice({
      tone: ok ? "warn" : "bad",
      title: ok ? `Frees ${moneyText(saves)} of cap space${!p.status || p.status === "active" ? " and one active roster spot" : ""}.` : "This release can't be completed right now.",
      detail: ok
        ? `${dead > 0 ? `${moneyText(dead)} of dead money (prorated bonus and guarantees) stays on this season's cap.` : "No dead money: nothing guaranteed is left on his deal."} He goes on waivers, where other clubs can claim him.`
        : `${why || "Your role doesn't allow it."} Clear cap space another way first, for example a restructure in Contracts.`,
    });
    return dialog(`Release ${p.name}?`, `<p class="gd-fix-who">${esc(p.pos)} · ${p.ovr} OVR · age ${p.age} · ${STATUS[p.status || "active"] || esc(p.status)} · cap charge ${moneyText(S.capHit(c, S.financeYear(s)))}</p>${facts}`, fix, `Release ${p.name}`, true, !ok);
  }
  if (fix.kind === "restructure") {
    const plan = restructurePlan(s, c),
      amount = plan && Math.min(plan.amount, fix.amount || plan.amount);
    if (!plan || !amount) return null;
    const perYear = Math.ceil(amount / plan.term),
      frees = amount - perYear;
    return dialog(
      `Restructure ${p.name}?`,
      `<p class="gd-fix-who">${esc(p.pos)} · ${p.ovr} OVR · cap charge ${moneyText(S.capHit(c, S.financeYear(s)))}</p>${notice({
        tone: "warn",
        title: `Frees ${moneyText(frees)} of cap space this season.`,
        detail: `${moneyText(amount)} of his base salary becomes a signing bonus spread over ${plan.term} years, so each later season carries about ${moneyText(perYear)} more. His contract can't be reviewed again for 14 days.`,
      })}`,
      { ...fix, amount },
      "Restructure",
    );
  }
  if (fix.kind === "practice")
    return dialog(
      `Move ${p.name} to the practice squad?`,
      `<p class="gd-fix-who">${esc(p.pos)} · ${p.ovr} OVR · age ${p.age}</p>${notice({
        tone: "info",
        title: "Frees one active roster spot.",
        detail: `His salary this season drops to the $0.4M practice-squad rate. You can elevate him for a game or return him to the active roster from his profile.`,
      })}`,
      fix,
      "Move to practice squad",
    );
  return null;
}

// Navigation and inline fixes; costly ones open confirmHTML first.
export function runFix(fix, g = globalThis) {
  const close = () => g.closeModal?.();
  switch (fix.kind) {
    case "release":
    case "waive":
    case "restructure":
    case "practice": {
      const html = confirmHTML(current(g), fix);
      if (!html) return g.toast?.("That player is no longer on your roster.");
      return g.modal(html);
    }
    case "open":
      close();
      return g.W.open(fix.route, fix.tab || undefined);
    case "player":
      return g.W.player(fix.playerId);
    case "contract":
      close();
      return g.F.contract(fix.playerId);
    case "matchday":
      close();
      return g.W.open("Matchday");
    case "quicksim":
      close();
      g.W.open("Matchday");
      return g.MD?.start?.("final");
    case "dealRemove":
      return g.Ops.asset(fix.side, fix.id, false);
    case "freeAgents":
      close();
      g.W.open("Market");
      if (fix.pos) g.Ops.mk("fa", "pos", fix.pos);
      return g.Ops.sub("market", "agents");
    default:
      return g.toast?.("That fix is not available here.");
  }
}

// After a confirmed fix (or a cancel) inside another dialog, reopen it so its blockers refresh.
function reopen(after, g) {
  const [kind, id] = String(after || "").split(":");
  if (kind === "neg" && id && g.Neg?.open) return g.Neg.open(id, "free");
  if (kind === "contract" && id && g.F?.contract) return g.F.contract(id);
}

export function confirmFix(fix, g = globalThis) {
  const p = playerOf(current(g), fix.playerId),
    name = p?.name || "Player",
    before = S.capLedger(current(g)).room;
  let ok = false;
  if (fix.kind === "release" || fix.kind === "waive") ok = g.F.action("cut", fix.playerId, false);
  else if (fix.kind === "restructure") ok = g.F.action("restructure", fix.playerId, (fix.amount / S.MILLION).toFixed(2));
  else if (fix.kind === "practice") ok = g.F.action("move", fix.playerId, "practice");
  if (!ok) return false;
  g.closeModal?.();
  const freed = Math.max(0, S.capLedger(current(g)).room - before),
    // Precise for small amounts: a $0.04M restructure must not read "$0.0M".
    amount = `$${(freed / S.MILLION).toFixed(freed < 0.1 * S.MILLION ? 2 : 1)}M`;
  g.toast?.(
    fix.kind === "practice"
      ? `${name} moved to the practice squad. One active roster spot is open.`
      : fix.kind === "restructure"
        ? `${name}'s contract restructured. ${amount} of cap space freed this season.`
        : `${name} released. ${amount} of cap space freed.`,
  );
  reopen(fix.after, g);
  return true;
}

// Toasts in the notice voice: the first sentence bold, the rest lighter, longer ones stay longer.
function installToast(g) {
  if (!g.document || g.toast?.gdNotice) return;
  let timer = null;
  const prev = g.toast;
  const upgraded = function (message) {
    const el = g.document.getElementById("toast");
    if (!el) return prev?.(message);
    const text = String(message ?? ""),
      { title, detail } = noticeText(text);
    el.innerHTML = `<b>${esc(title)}</b>${detail ? `<span>${esc(detail)}</span>` : ""}`;
    el.classList.toggle("gd-toast-two", !!detail);
    el.style.display = "block";
    // A modal dialog sits in the top layer, above any z-index: a plain toast fired from inside a
    // dialog (a refused offer, a blocked kickoff) showed up blurred behind the backdrop. As a
    // manual popover the toast joins the top layer above whatever dialog is open now.
    try {
      if (typeof el.showPopover === "function") {
        if (!el.popover) el.popover = "manual";
        if (el.matches(":popover-open")) el.hidePopover();
        el.showPopover();
      }
    } catch {}
    clearTimeout(timer);
    timer = setTimeout(() => {
      el.style.display = "none";
      try {
        if (el.matches?.(":popover-open")) el.hidePopover();
      } catch {}
    }, Math.min(9000, 3000 + Math.max(0, text.length - 50) * 40));
  };
  upgraded.gdNotice = true;
  g.toast = upgraded;
}

export function installFixes(g = globalThis) {
  if (!g.window || g.Fix) return;
  g.Fix = {
    run: (el) => runFix(readFix(el), g),
    confirm: (el) => confirmFix(readFix(el), g),
    cancel(el) {
      const fix = readFix(el);
      g.closeModal?.();
      reopen(fix.after, g);
    },
  };
  installToast(g);
}
installFixes();
