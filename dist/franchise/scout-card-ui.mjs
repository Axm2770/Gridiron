// The scouting card: one place to judge a player and act on him. It shows what your staff
// actually know (ranges until scouted), his ceiling in plain words, his value, how he fits your
// roster and whether the relevant window is open, then offers the next step: request a report,
// open trade talks or open contract talks. Every unavailable action says why.
import * as S from "./state.mjs";
import * as K from "../ui/kit.mjs";
import { locate, scoutRange, attributeRanges, potentialLabel, draftProjection, reportBlocker, requestReport, REPORT_DAYS } from "./scouting.mjs";
import { scoutedTradeValue, pickEquivalent, marketWindows, depthRank, marketValue, signingFactors, tradeBlockers, teamMode } from "./market.mjs";
import { offerBlockers } from "./contracts.mjs";
import { positionalNeed } from "./recruiting-pipeline.mjs";
import { onTheClock } from "./draft-room.mjs";
import { pixelFace } from "../ui/pixel-face.mjs";

const e = K.escapeHTML;
const STARTERS = { QB: 1, RB: 1, WR: 3, TE: 1, OL: 5, DL: 4, LB: 3, CB: 3, S: 2, K: 1, P: 1 };
const clubTable = () => (typeof clubs !== "undefined" ? clubs : globalThis.clubs);
const clubLabel = (t) => (t === -1 ? "Free agent" : t === -2 ? "Draft prospect" : `${clubTable()?.[t]?.[1] ?? ""} ${clubTable()?.[t]?.[2] ?? `Team ${t + 1}`}`.trim());
const money = (cents) => `$${(cents / S.MILLION).toFixed(1)}M`;
const range = (r) => (r[0] === r[1] ? String(r[0]) : `${r[0]}–${r[1]}`);
const attrName = (k) => k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());

// How the player would slot into your roster, judged on your staff's estimate.
export function teamFit(s, p, view) {
  const rank = depthRank(s, { ...p, ovr: view.estimate }, s.team),
    starters = STARTERS[p.pos] ?? 2,
    need = positionalNeed(s, p.pos),
    role = rank <= starters ? `Would start (#${rank} ${p.pos})` : rank <= starters + 2 ? `Rotation (#${rank} ${p.pos})` : `Depth (#${rank} ${p.pos})`,
    fills = need.need !== "Depth" ? `Fills a ${need.need.toLowerCase()} need: ${need.have}/${need.want} healthy ${p.pos}s` : `${need.have} healthy ${p.pos}s already`;
  return { rank, starters, role, need, fills, good: rank <= starters || need.need === "High" };
}

const action = (label, onclick, block, primary = false) =>
  `<div class="scout-action sc-act"><button class="${primary ? "" : "secondary"}" ${block ? "disabled" : ""} onclick="${e(onclick)}">${e(label)}</button>${block ? `<small><b>${e(block.reason)}</b>${block.fix ? ` ${e(block.fix)}` : ""}</small>` : ""}</div>`;
// A rating as 12 pixel blocks: solid up to what is certain, hatched across the scouted range.
const rangeBar = (lo, hi, n = 12) => {
  const a = Math.round((lo / 99) * n),
    b = Math.max(a, Math.round((hi / 99) * n));
  return `<span class="sc-range" aria-hidden="true">${Array.from({ length: n }, (_, i) => `<i class="${i < a ? "on" : i < b ? "fog" : ""}"></i>`).join("")}</span>`;
};
const loadStyles = () => {
  if (typeof document !== "undefined" && typeof document.querySelector === "function" && !document.querySelector('link[href="people.css"]'))
    document.head?.insertAdjacentHTML?.("beforeend", '<link rel="stylesheet" href="people.css">');
};

export function scoutCardHTML(s, id) {
  const where = locate(s, id);
  if (!where) return `<div class="scout-card sc-card"><p class="pp-none">This player is no longer in the league.</p><div class="sc-actions"><button onclick="closeModal()">Close</button></div></div>`;
  const { p, team } = where,
    own = team === s.team,
    view = scoutRange(s, p, team),
    fit = own ? null : teamFit(s, p, view),
    windows = marketWindows(s),
    attrs = attributeRanges(s, p, team)
      .slice(0, 10),
    c = s.franchise.contracts[p.id],
    year = S.financeYear(s);
  const knowledge = view.exact
    ? K.chip(own ? "Your player: exact ratings" : "Fully scouted: true ratings", "good")
    : view.pending
      ? K.chip(`Report due ${view.pending.due} (${view.pending.scout})`, "warn")
      : K.chip(`Scouted ${view.confidence}%: estimates only`, "warn");
  let value;
  const projection = team === -2 ? draftProjection(s, p) : null;
  if (projection) value = ["Your board", `#${projection.rank} of ${s.prospects.length}`, `Projected round ${Math.min(7, projection.round)}${projection.round > 7 ? " or undrafted" : ""}, on your scouts' grades`];
  else if (team === -1) value = ["Market value", `${money(marketValue(p))}/yr`, `Asking ${money(Math.round(p.salary * S.MILLION))}/yr · pull to you ×${signingFactors(s, p, s.team).total}`];
  else {
    const v = scoutedTradeValue(s, p, team === s.team ? s.team : team, team);
    value = ["Trade value", v.exact ? `${v.estimate} pts` : `${v.low}–${v.high} pts`, pickEquivalent(v.estimate)];
  }
  const stats = [
    ["Overall", view.label, view.exact ? "Exact" : `Range from ${view.confidence}% confidence`],
    ["Potential", range(view.pot), projection ? projection.label : potentialLabel(view)],
    value,
  ];
  if (fit) stats.push(["Fit with you", fit.role, fit.fills]);
  if (c && team >= 0) stats.push(["Contract", money(S.capHit(c, year)), `${Math.max(0, c.start + c.years - year)} year(s) left${c.noTrade ? " · no-trade clause" : ""}`]);
  const actions = [];
  if (!own) {
    const rb = reportBlocker(s, id);
    if (!view.exact) actions.push(action(`Request scouting report (${REPORT_DAYS} days)`, `Scout.request('${id}')`, rb));
  }
  if (team >= 0 && !own) {
    const block = tradeBlockers(s, { partner: team, give: [], get: [id] }).find((b) => !/at least one|active roster would be|short of cap space/.test(b.reason));
    actions.push(action("Trade for him", `Ops.tradeFor('${id}',${team})`, block, true));
  }
  if (team === -1) {
    const block = offerBlockers(s, id)[0];
    actions.push(action("Offer a contract", `closeModal();Neg.open('${id}')`, block, true));
  }
  if (team === -2) {
    const pick = onTheClock(s),
      mine = pick && pick.team === s.team && s.franchise.draft?.year === s.year;
    actions.push(action("Draft him", `Scout.draft('${id}')`, mine ? null : { reason: windows.draft.open ? "You are not on the clock." : `The draft is closed. ${windows.draft.detail}`, fix: windows.draft.open ? "Use Draft room → Draft day to run picks to your turn." : null }, true));
  }
  if (own) actions.push(action("Open contract", `closeModal();F.contract('${id}')`, null));
  const win = team === -2 ? windows.draft : team === -1 ? windows.freeAgency : own ? null : windows.trade,
    winName = team === -2 ? "Draft" : team === -1 ? "Free agency" : "Trades";
  const conf = Math.round(view.confidence ?? 100),
    tile = ([label, value, sub]) => `<div class="sc-tile"><small>${e(label)}</small><b>${e(value)}</b><span>${e(sub)}</span></div>`;
  return `<div class="scout-card sc-card"><div class="sc-card-head">${pixelFace(p, { size: 72, team: team >= 0 ? team : null })}<div class="sc-card-id"><span class="pp-kicker">SCOUTING REPORT · ${e(clubLabel(team).toUpperCase())}</span><h2>${e(p.name)}</h2><p><em class="pp-pos">${e(p.pos)}</em>${p.age} yrs${p.college ? ` · ${e(p.college)}` : ""}${team >= 0 && !own ? ` · ${e(teamMode(s, team))} club` : ""}</p>${knowledge}</div><div class="sc-card-ovr ${view.exact ? "" : "fog"}"><b>${e(view.label)}</b><small>OVR</small><span class="sc-card-conf"><span class="pp-blocks ${conf >= 100 ? "good" : conf >= 50 ? "" : "warn"}">${Array.from({ length: 10 }, (_, i) => `<i class="${i < Math.round(conf / 10) ? "on" : ""}"></i>`).join("")}</span>${conf}% known</span></div><button class="icon-button sc-x" onclick="closeModal()" aria-label="Close scouting report">×</button></div><div class="sc-card-tiles">${stats.slice(1).map(tile).join("")}</div>${win ? `<p class="scout-window sc-window ${win.open ? "open" : "closed"}"><i></i><b>${winName}: ${e(win.status)}.</b> ${e(win.detail)}</p>` : ""}<div class="sc-card-body"><span class="pp-label">Graded attributes <small>${view.exact ? "true ratings" : "hatched = still uncertain"}</small></span><div class="scout-attrs sc-attrs">${attrs.map((a) => `<div><span>${e(attrName(a.key))}</span>${a.value != null ? rangeBar(a.value, a.value) : rangeBar(a.lo, a.hi)}<b class="${a.value == null ? "ops-fogged fog" : ""}">${a.value ?? range([a.lo, a.hi])}</b></div>`).join("") || '<p class="pp-none">No attribute grades recorded.</p>'}</div></div><div class="scout-actions sc-actions">${actions.join("")}</div><p class="scout-note sc-note">${view.exact ? "These are his true ratings." : `Ranges always contain his true ratings. Each report adds about 35% confidence; at 100% you see the real numbers. Trade estimates use these ranges.`}</p></div>`;
}

export function installScoutCard({ isBusy }) {
  loadStyles();
  let open = null;
  const show = (id) => {
    open = id;
    modal(scoutCardHTML(state, id));
  };
  window.Scout = {
    open: show,
    request(id) {
      if (isBusy()) return toast("Wait for the simulation to finish.");
      try {
        let r;
        state = S.transact(state, (s) => (r = requestReport(s, id)));
        save();
        render();
        toast(`${r.scout} will file a report on ${r.name} by ${r.due}. It arrives in your Inbox.`);
        show(id);
      } catch (err) {
        toast(err.message);
      }
    },
    draft(id) {
      closeModal();
      window.Ops?.pick?.(id);
    },
    refresh() {
      if (open && document.getElementById("modal")?.open && document.querySelector("#modal .scout-card")) show(open);
    },
  };
}

