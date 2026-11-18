// Medical & training screens (sidebar "Medical & training" and the Hub's Medical/Training tabs):
// the pixel treatment room and the weekly practice planner. Views only; every mutation goes
// through state.transact (Ops.* for the existing actions, Med.* for the screen's own controls).
// Styles live in medical.css, loaded once beside the design system.
import * as S from "./state.mjs";
import * as K from "../ui/kit.mjs";
import { medicalBoard, treatmentOutlook, recommendedTreatment, physioCandidates, ensureMedical, TREATMENTS } from "./medical.mjs";
import { DAYS, BLOCKS, TEMPLATES, DRILLS, POSITION_MOVES, ensureTraining, weekPlan, summarizeSchedule, nextLevels, setSchedule, efficiency } from "./training.mjs";
import { ensurePlayerRatings } from "./ratings.mjs";
import { movePlayer } from "./personnel.mjs";
import { pixelFace } from "../ui/pixel-face.mjs";
import * as SV from "../ui/status-visual.mjs";
import { pageOf } from "./market-view.mjs";
import { ROOM_PAGE, LOG_PAGE, JOINTS, WEAR_RISK, CONDITION_RISK, ROOM_FILTERS, ROOM_SORTS, roomEntries, filterRoom, roomCounts, squadHealth, returnWeek, practiceLoad, intensityBand, INTENSITY_BANDS, unitReadiness, medicalLog } from "./medical-view.mjs";

const e = K.escapeHTML;
const money = (cents) => `${cents < 0 ? "-" : ""}$${(Math.abs(cents) / S.MILLION).toFixed(Math.abs(cents) >= S.MILLION * 10 ? 1 : 2)}M`;
const attrName = (k) => k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
const pct = (x) => `${Math.round(x * 100)}%`;
const signed = (n) => `${n > 0 ? "+" : ""}${n}`;
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const ui = { filter: "hurt", sort: "weeks", page: 0, logPage: 0, day: 0, indGroup: "all", indPage: 0 };
const IND_PAGE = 8;

function styles() {
  if (typeof document !== "undefined" && typeof document.querySelector === "function" && !document.querySelector('link[href="medical.css"]')) document.head?.insertAdjacentHTML?.("beforeend", (document.querySelector('link[href="market.css"]') ? "" : '<link rel="stylesheet" href="market.css">') + '<link rel="stylesheet" href="medical.css">');
}

/* ----------------------------------------------------------------- pixel bits */

// Block meter: n square cells, `value` of `max` filled, coloured by tone.
function blocks(value, max = 100, n = 10, tone = "accent", label = "") {
  const on = Math.max(0, Math.min(n, Math.round((Number(value) / max) * n)));
  return `<span class="mt-blocks mt-${tone}" role="img" aria-label="${e(label || `${Math.round(value)} of ${max}`)}">${Array.from({ length: n }, (_, i) => `<i${i < on ? ' class="on"' : ""}></i>`).join("")}</span>`;
}
const toneUp = (v, good = 75, bad = 55) => (v >= good ? "good" : v <= bad ? "bad" : "warn");
const toneDown = (v, warn = 20, bad = 40) => (v >= bad ? "bad" : v >= warn ? "warn" : "good");

// 11×21 pixel body. Regions are [x, y, w, h] cells; L/R are as seen on screen.
const BODY = {
  head: [[4, 0, 3, 3]],
  neck: [[5, 3, 1, 1]],
  shoulderL: [[1, 4, 2, 2]],
  shoulderR: [[8, 4, 2, 2]],
  chest: [[3, 4, 5, 3]],
  back: [[3, 7, 5, 3]],
  armL: [[1, 6, 2, 4]],
  armR: [[8, 6, 2, 4]],
  handL: [[1, 10, 2, 1]],
  handR: [[8, 10, 2, 1]],
  hips: [[3, 10, 5, 1]],
  thighL: [[3, 11, 2, 4]],
  thighR: [[6, 11, 2, 4]],
  kneeL: [[3, 15, 2, 1]],
  kneeR: [[6, 15, 2, 1]],
  shinL: [[3, 16, 2, 3]],
  shinR: [[6, 16, 2, 3]],
  ankleL: [[3, 19, 2, 1]],
  ankleR: [[6, 19, 2, 1]],
  footL: [[2, 20, 3, 1]],
  footR: [[6, 20, 3, 1]],
};
const PART_REGIONS = { head: ["head"], chest: ["chest"], back: ["back"], body: ["chest", "back"], shoulder: ["shoulder"], hand: ["hand"], hamstring: ["thigh"], knee: ["knee"], ankle: ["ankle"], foot: ["foot"] };
export const PART_LABEL = { head: "Head", chest: "Chest", back: "Back", body: "Torso", shoulder: "Shoulder", hand: "Hand", hamstring: "Hamstring", knee: "Knee", ankle: "Ankle", foot: "Foot" };
const sideOf = (id) => ([...String(id)].reduce((n, ch) => n + ch.charCodeAt(0), 0) % 2 ? "L" : "R");

// marks: { regionKey: toneClass }. A region without L/R suffix in PART_REGIONS expands to one side
// (injury) or both (wear).
function bodySVG(marks, { width = 44, label = "" } = {}) {
  const rects = Object.entries(BODY)
    .map(([key, rs]) => rs.map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="${marks[key] ? `mt-b-${marks[key]}` : "mt-b"}"/>`).join(""))
    .join("");
  return `<svg class="mt-body" viewBox="0 0 11 21" width="${width}" height="${Math.round((width * 21) / 11)}" shape-rendering="crispEdges" role="img" aria-label="${e(label)}">${rects}</svg>`;
}
function injuryMarks(part, id) {
  const marks = {},
    side = sideOf(id);
  for (const r of PART_REGIONS[part] || PART_REGIONS.body) {
    if (BODY[r]) marks[r] = "hurt";
    else marks[r + side] = "hurt";
  }
  return marks;
}
function wearMarks(wear) {
  const marks = {};
  for (const j of JOINTS) {
    const t = toneDown(wear[j] ?? 0);
    for (const r of PART_REGIONS[j]) {
      if (BODY[r]) marks[r] = t;
      else (marks[r + "L"] = t), (marks[r + "R"] = t);
    }
  }
  return marks;
}

// 8×8 session glyphs ("X" ink, "o" highlight).
const GLYPHS = {
  Off: ["..XXXX..", ".XX.....", "XX......", "XX....o.", "XX...ooo", "XX....o.", ".XX.....", "..XXXX.."],
  Recovery: ["...XX...", "...XX...", "...XX...", "XXXXXXXX", "XXXXXXXX", "...XX...", "...XX...", "...XX..."],
  Film: ["XXXXXXXX", "X......X", "X..o...X", "X..oo..X", "X..ooo.X", "X..oo..X", "X..o...X", "XXXXXXXX"],
  Walkthrough: ["........", "...X....", "..XoX...", "..XXX...", ".XXoXX..", ".XXXXX..", "XXXXXXX.", "XXXXXXX."],
  Install: ["..XXXX..", "XXX..XXX", "X......X", "X.o..o.X", "X..oo..X", "X..oo..X", "X.o..o.X", "XXXXXXXX"],
  Padded: ["..XXXX..", ".XXXXXX.", "XXXXXXXX", "XXXX.o.o", "XXXX.ooo", "XXX..o.o", ".XX.....", "........"],
  Conditioning: ["....XXX.", "...XXX..", "..XXX...", ".XXXXXX.", "....XXX.", "...XXX..", "..XX....", ".X......"],
  Game: ["........", "..XXXX..", ".XXXXXX.", "XoXoXoXX", "XXXXXXXX", ".XXXXXX.", "..XXXX..", "........"],
};
function glyph(name, size = 24) {
  const g = GLYPHS[name] || GLYPHS.Off;
  let rects = "";
  g.forEach((row, y) => [...row].forEach((ch, x) => ch !== "." && (rects += `<rect x="${x}" y="${y}" width="1" height="1"${ch === "o" ? ' class="mt-g-hi"' : ""}/>`)));
  return `<svg class="mt-glyph" viewBox="0 0 8 8" width="${size}" height="${size}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}
const blockTone = (b) => (b.intensity <= 10 ? "good" : b.intensity <= 45 ? "accent" : b.intensity < 80 ? "warn" : "bad");

const panel = (title, body, { cls = "", action = "", id = "" } = {}) =>
  `<section class="mt-panel ${cls}"${id ? ` id="${id}"` : ""}><div class="mt-head"><h2>${title}</h2>${action}</div>${body}</section>`;
const seg = (items, active, call, label) =>
  `<div class="mk-seg mt-seg" role="tablist" aria-label="${e(label)}">${items.map(([id, text]) => `<button class="link ${id === active ? "on" : ""}" role="tab" aria-selected="${id === active}" onclick="${e(call.replace("$id", id))}">${text}</button>`).join("")}</div>`;
const pager = (pg, call) =>
  pg.pages > 1
    ? `<div class="mk-pager mt-pager"><button class="secondary small" ${pg.page === 0 ? "disabled" : ""} onclick="${call}(${pg.page - 1})">◀ Prev</button><span>${pg.from}–${pg.to} of ${pg.total} · page ${pg.page + 1}/${pg.pages}</span><button class="secondary small" ${pg.page >= pg.pages - 1 ? "disabled" : ""} onclick="${call}(${pg.page + 1})">Next ▶</button></div>`
    : "";
const nameLink = (p) => `<button class="link mt-name" onclick="W.player('${p.id}')" title="Open ${e(p.name)}'s profile"><span>${e(p.name)}</span></button>`;

/* --------------------------------------------------------------------- medical */

function healthStrip(h, counts) {
  const wearRows = JOINTS.map((j) => `<li><span>${PART_LABEL[j]}</span>${blocks(h.wear[j], 100, 5, toneDown(h.wear[j]), `${PART_LABEL[j]} wear ${h.wear[j]}`)}<b>${h.wear[j]}</b></li>`).join("");
  const hotNote = h.hot.length ? `${plural(h.hot.length, "player")} at ${WEAR_RISK}+ wear · worst ${e(h.hot[0].p.name)} (${e(PART_LABEL[h.hot[0].part] || h.hot[0].part)} ${h.hot[0].wear})` : "No joint is wearing down. Light practice weeks keep it that way.";
  const tile = (n, label, tone, filter) => `<button class="link mt-count mt-${n ? tone : "none"}" onclick="Med.filter('${filter}')" title="Show ${label.toLowerCase()} in the treatment room"><b>${n}</b><small>${label}</small></button>`;
  return `<section class="mt-panel mt-health" aria-label="Squad health">
    <div class="mt-hcell"><span class="mt-cap">Availability</span><b class="mt-big mt-t-${toneUp(h.availability, 90, 80)}">${h.availability}%</b>${blocks(h.availability, 100, 10, toneUp(h.availability, 90, 80), `Availability ${h.availability}%`)}<small>${h.available} of ${h.total} rostered players can play</small></div>
    <div class="mt-hcell mt-counts">${tile(counts.out, "Out", "bad", "out")}${tile(counts.questionable, "Playing hurt", "warn", "questionable")}${tile(counts.ir, "On IR", "bad", "ir")}${tile(counts.risk, "At risk", "warn", "risk")}</div>
    <div class="mt-hcell"><span class="mt-cap">Condition</span><b class="mt-big mt-t-${toneUp(h.condition, 85, 70)}">${h.condition}%</b>${blocks(h.condition, 100, 10, toneUp(h.condition, 85, 70), `Average condition ${h.condition}%`)}<small>${h.fatigued ? `${plural(h.fatigued, "player")} under ${CONDITION_RISK}% condition` : "Nobody is running on empty"}</small></div>
    <div class="mt-hcell mt-wear">${bodySVG(wearMarks(h.wear), { width: 40, label: `Squad joint wear. Hot spot: ${PART_LABEL[h.hotspot]}` })}<div><span class="mt-cap">Joint wear · squad average</span><ul class="mt-wear-list">${wearRows}</ul><small title="${e(hotNote)}">${hotNote}</small></div></div>
  </section>`;
}

function optionCard(c, o, recommended) {
  const risk = o.playsNow ? o.aggravateRisk : o.reinjuryRisk,
    tone = risk >= 0.25 ? "bad" : risk >= 0.12 ? "warn" : "good",
    lt = o.longTerm ? Object.entries(o.longTerm.attrs || {}).map(([k, v]) => `${attrName(k)} ${v}`).join(", ") || "Small rating loss" : null,
    back = (state.week ?? 0) + o.weeksOut + 1,
    rec = o.option === recommended;
  return `<button class="link mt-opt ${rec ? "mt-rec" : ""}" onclick="Ops.treat('${c.playerId}','${o.option}')">
    <span class="mt-opt-head"><b>${e(o.label)}</b>${rec ? '<em class="mt-ribbon">Staff pick</em>' : ""}</span>
    <span class="mt-opt-time"><big>${o.playsNow ? "Plays now" : `${o.weeksOut} wk${o.weeksOut === 1 ? "" : "s"}`}</big><small>${o.playsNow ? "Available this week" : `Range ${o.estimate[0]}–${o.estimate[1]} · back ${back > (state.schedule?.length || 18) ? "next season" : `wk ${back}`}`}</small></span>
    <span class="mt-opt-risk"><small>${o.playsNow ? "Worse injury, each game" : "Re-injury after return"}</small>${blocks(risk * 100, 50, 10, tone)}<b class="mt-t-${tone}">${pct(risk)}</b></span>
    <span class="mt-opt-tags">${K.chip(o.trust >= 0 ? `Trust +${o.trust}` : `Trust ${o.trust}`, o.trust >= 0 ? "good" : o.trust <= -8 ? "bad" : "warn")}${o.cost ? K.chip(money(o.cost)) : K.chip("No cost")}${o.preferred ? K.chip("His choice", "good") : ""}</span>
    ${lt ? `<small class="mt-opt-note mt-t-bad">Long-term: ${e(lt)}</small>` : ""}${o.note ? `<small class="mt-opt-note">${e(o.note)}</small>` : ""}
  </button>`;
}

const PREF = { play: "I want to play through it, coach.", patient: "Let's take the time and get it right.", surgery: "Whatever fixes it properly." };

function decisionsPanel(decisions) {
  if (!decisions.length) return "";
  const cases = decisions
    .map((c) => {
      const p = c.player,
        rec = recommendedTreatment(state, c);
      return `<article class="mt-case" id="mt-case-${e(p.id)}"><div class="mt-case-top">${pixelFace(p, { size: 52, team: state.team })}<div class="mt-case-id">${nameLink(p)}<small><span class="mk-pos">${e(p.pos)}</span>${p.ovr} OVR · ${p.age} yrs</small><b class="mt-case-dx">${e(c.label)}</b><small>Diagnosis: ${c.estimate[0]}–${c.estimate[1]} weeks · ${e(c.tier)}</small></div>${bodySVG(injuryMarks(c.part, p.id), { width: 34, label: `${PART_LABEL[c.part] || c.part} injury` })}<p class="mt-quote">“${e(PREF[c.preference])}”</p></div><div class="mt-opts">${c.options.map((o) => optionCard(c, treatmentOutlook(state, c, o), rec)).join("")}</div></article>`;
    })
    .join("");
  return panel(`Treatment decisions <span class="mt-badge">${decisions.length}</span>`, `<div class="mt-cases">${cases}</div>`, { cls: "mt-decisions", action: `<small class="mt-head-note">Undecided cases follow the staff pick after the next game.</small>` });
}

function roomCard(x) {
  const { p, c, status } = x,
    canMove = S.allowed?.(state, "roster") !== false && !state.live,
    weeks = p.injury || 0;
  let mid;
  if (status.key === "risk") {
    mid = `<div class="mt-rc-dx"><b>Wearing down</b><small>${x.joint.wear >= WEAR_RISK ? `${e(PART_LABEL[x.joint.part] || x.joint.part)} wear ${x.joint.wear}` : "Joints fine"} · condition ${x.condition}%</small></div><div class="mt-rc-meter"><span class="mt-cap">Wear</span>${blocks(x.joint.wear, 100, 8, toneDown(x.joint.wear), `Worst joint wear ${x.joint.wear}`)}<b>${x.joint.wear}</b></div><div class="mt-rc-meter"><span class="mt-cap">Cond.</span>${blocks(x.condition, 100, 8, toneUp(x.condition, 85, 70), `Condition ${x.condition}%`)}<b>${x.condition}%</b></div>`;
  } else if (status.key === "questionable") {
    const agg = TREATMENTS[c.treatment]?.aggravate ?? 0;
    mid = `<div class="mt-rc-dx"><b>${e(c.label)}</b><small>${e(TREATMENTS[c.treatment]?.label ?? "Playing through")}</small></div><div class="mt-rc-meter"><span class="mt-cap">Risk</span>${blocks(agg * 100, 50, 8, agg >= 0.25 ? "bad" : "warn", `Aggravation risk ${pct(agg)} per game`)}<b>${pct(agg)}</b></div><small class="mt-rc-back">Plays this week · ${c.weeksPlayed || 0}/${c.trueWeeks} weeks managed</small>`;
  } else {
    const dx = c?.label || p.medical?.diagnosis || "Injury",
      plan = status.key === "decision" ? "Treatment decision needed" : TREATMENTS[c?.treatment]?.label || (p.status === "ir" ? "Injured reserve" : "Rest & rehab");
    mid = `<div class="mt-rc-dx"><b>${e(dx)}</b><small>${e(plan)}</small></div><div class="mt-rc-meter"><span class="mt-cap">Out</span>${blocks(Math.min(weeks, 8), 8, 8, weeks >= 6 ? "bad" : weeks >= 3 ? "warn" : "accent", `${weeks} weeks out`)}<b>${weeks} wk</b></div><small class="mt-rc-back">${x.back ? `Expected back: <b>${x.back.label}</b>` : "Cleared to return"}${p.status === "ir" ? ` · IR eligible wk ${(p.irReturnWeek ?? 0) + 1}` : ""}</small>`;
  }
  const part = status.key === "risk" ? null : c?.part || p.medical?.bodyPart || "body",
    figure = part ? bodySVG(injuryMarks(part, p.id), { width: 30, label: `${PART_LABEL[part] || part} injury` }) : bodySVG(wearMarks(p.wear || {}), { width: 30, label: "Joint wear" });
  const irReady = p.status === "ir" && !(p.injury > 0) && (p.irReturnWeek ?? 0) <= state.week;
  const actions = [
    status.key === "decision" ? `<button class="small" onclick="Med.toCase('${p.id}')">Decide treatment</button>` : "",
    p.injury > 0 && p.status !== "ir" && status.key !== "decision" ? `<button class="secondary small" ${canMove ? "" : `disabled title="${state.live ? "Roster moves wait until the game ends" : "Your role cannot make roster moves"}"`} onclick="Med.ir('${p.id}')" title="Frees a roster spot; he must stay on IR at least four weeks">Move to IR</button>` : "",
    irReady ? `<button class="secondary small" ${canMove ? "" : "disabled"} onclick="Med.activate('${p.id}')">Activate</button>` : "",
    `<button class="secondary small" onclick="Dev.player('${p.id}')" title="Individual plan, workload and medical history">${status.key === "risk" ? "Workload" : "Rehab plan"}</button>`,
  ].join("");
  return `<article class="mt-rc mt-rc-${status.key}"><div class="mt-rc-top">${pixelFace(p, { size: 40, team: state.team })}<span class="mt-rc-id">${nameLink(p)}<small><span class="mk-pos">${e(p.pos)}</span>${p.ovr} OVR${p.starter ? " · starter" : ""}</small></span><span class="mt-status mt-${status.tone}">${status.label}</span></div><div class="mt-rc-body">${figure}<div class="mt-rc-info">${mid}</div></div><div class="mt-rc-foot">${actions}</div></article>`;
}

function roomPanel(entries, counts) {
  const list = filterRoom(entries, ui.filter, ui.sort),
    pg = pageOf(list, ui.page, ROOM_PAGE);
  ui.page = pg.page;
  const filters = seg(ROOM_FILTERS.map(([id, label]) => [id, `${label} <i>${counts[id] ?? 0}</i>`]), ui.filter, "Med.filter('$id')", "Treatment room filter");
  const sort = `<label class="mt-sort"><span>Sort</span><select aria-label="Sort the treatment room" onchange="Med.sort(this.value)">${ROOM_SORTS.map(([k, v]) => `<option value="${k}" ${k === ui.sort ? "selected" : ""}>${v}</option>`).join("")}</select></label>`;
  const empty = {
    hurt: "The treatment room is empty. Every player on the 53 is available.",
    out: "Nobody is out injured.",
    questionable: "Nobody is playing through an injury.",
    ir: "Nobody is on injured reserve.",
    risk: `No healthy player is past ${WEAR_RISK} joint wear or under ${CONDITION_RISK}% condition.`,
  }[ui.filter];
  const body = pg.items.length ? `<div class="mt-room-grid">${pg.items.map(roomCard).join("")}</div>${pager(pg, "Med.page")}` : `<p class="mk-none">${empty}</p>`;
  return panel("Treatment room", `<div class="mt-room-tools">${filters}${sort}</div>${body}`, { cls: "mt-room" });
}

function staffPanel(d) {
  const rehab = Math.round(Math.max(0, d.recoveryBonus) * 50),
    prevent = Math.round(Math.max(0, d.prevention) * 100);
  const row = (tag, name, sub, meters) => `<div class="mt-staff"><span class="mt-staff-tag">${tag}</span><div class="mt-staff-main"><b>${e(name)}</b><small>${sub}</small>${meters}</div></div>`;
  const m = (label, v) => `<div class="mt-rc-meter"><span class="mt-cap">${label}</span>${blocks(v, 100, 10, toneUp(v, 75, 55), `${label} ${v}`)}<b>${v}</b></div>`;
  return panel(
    "Medical staff",
    `${row("DR", d.doctor.vacant ? "No team doctor" : d.doctor.name, d.doctor.vacant ? `<button class="link mt-inline" onclick="W.open('Staff')">Hire a head of medical in Staff →</button>` : "Head of medical · diagnosis and surgery", m("Diagnosis", d.doctor.diagnosis))}
    ${row("PT", d.physio.name, "Lead physiotherapist", m("Recovery", d.physio.recovery) + m("Prevention", d.physio.prevention))}
    <div class="mt-dept"><span><b>Lvl ${d.facilities}</b><small>Medical facilities</small></span><span><b>−${rehab}%</b><small>Rehab time</small></span><span><b>−${prevent}%</b><small>Re-injury risk</small></span></div>
    <p class="mk-note">The doctor narrows diagnosis ranges and improves surgery; the physio speeds rehab and prevents setbacks. Facilities add to both.</p>`,
    { cls: "mt-staffpanel" },
  );
}

function physioPanel(d) {
  const pool = physioCandidates(state),
    cash = state.franchise.clubs[state.team]?.cash ?? 0,
    delta = (v, cur) => `<em class="mt-t-${v > cur ? "good" : v < cur ? "bad" : "none"}">${signed(v - cur)}</em>`;
  const cards = pool
    .map((x) => {
      const afford = cash >= x.salary;
      return `<div class="mt-hire"><span class="mt-staff-tag">PT</span><div class="mt-staff-main"><b>${e(x.name)}</b><span class="sv-mini-stack">${[["Recovery", x.recovery, d.physio.recovery], ["Prevention", x.prevention, d.physio.prevention]].map(([l, v, cur]) => `<span class="sv-mini"><small>${l}</small>${SV.meter(v, 100, { cells: 6, tone: SV.toneFor(v, 75, 55), label: `${l} ${v}` })}<b>${v}</b>${delta(v, cur)}</span>`).join("")}</span></div><button class="small ${x.recovery + x.prevention > d.physio.recovery + d.physio.prevention ? "" : "secondary"}" ${afford ? "" : 'disabled title="The club cannot cover this salary"'} onclick="Ops.physio('${x.id}')">Hire · ${money(x.salary)}</button></div>`;
    })
    .join("");
  return panel("Physio market", pool.length ? `<div class="mt-hires">${cards}</div><p class="mk-note">Hiring replaces your lead physio. Cash ${money(cash)}. New candidates each year.</p>` : `<p class="mk-none">No candidates left this year. New physios become available next season.</p>`, { cls: "mt-physio" });
}

function logPanel() {
  const all = medicalLog(state),
    pg = pageOf(all, ui.logPage, LOG_PAGE);
  ui.logPage = pg.page;
  const tone = (t) => (/aggravated|complication/i.test(t) ? "bad" : /Cleared/.test(t) ? "good" : /report|IR|Roster/i.test(t) ? "warn" : "none");
  const items = pg.items.map((x) => `<li class="mt-log-${tone(x.title)}"><span class="mt-wk">W${(x.week ?? 0) + 1}</span><span><b>${e(x.title === "Roster designation" ? "Moved to IR" : x.title)}</b><small>${e(x.title === "Roster designation" ? String(x.body).replace(/ moved to ir.$/, " placed on injured reserve.") : x.body)}</small></span></li>`).join("");
  return panel("Medical log", all.length ? `<ul class="mt-log">${items}</ul>${pager(pg, "Med.logPage")}` : `<p class="mk-none">Diagnoses, treatment decisions and returns are logged here as the season goes on.</p>`, { cls: "mt-logpanel" });
}

export function medicalView() {
  styles();
  const b = medicalBoard(state),
    m = ensureMedical(state),
    entries = roomEntries(state, m.cases),
    counts = roomCounts(entries),
    h = squadHealth(state);
  return `<div class="mt-page mt-medical">${healthStrip(h, counts)}${decisionsPanel(b.decisions)}<div class="mt-grid"><div class="mt-main">${roomPanel(entries, counts)}</div><div class="mt-side">${staffPanel(b.department)}${physioPanel(b.department)}</div></div>${logPanel()}</div>`;
}

/* -------------------------------------------------------------------- training */

const GAME_DAY = "Sun";

function weekStrip(t, plan) {
  const tiles = DAYS.map((day, i) => {
    const key = t.schedule[i],
      b = BLOCKS[key] ?? BLOCKS.Off,
      tone = blockTone(b);
    return `<button class="link mt-day mt-${tone} ${ui.day === i ? "on" : ""}" aria-pressed="${ui.day === i}" onclick="Med.day(${i})" title="Change ${day}'s session"><span class="mt-day-name">${day}</span>${glyph(key, 28)}<b>${e(b.label)}</b>${blocks(b.intensity, 100, 5, tone, `Load ${b.intensity}`)}<small>Fatigue ${signed(b.fatigue)}</small></button>`;
  }).join("");
  const game = `<div class="mt-day mt-game"><span class="mt-day-name">${GAME_DAY}</span>${glyph("Game", 28)}<b>Game day</b><span class="mt-blocks"></span><small>${state.live ? "Live now" : "Kickoff"}</small></div>`;
  const presets = Object.entries(TEMPLATES)
    .map(([name, sched]) => ({ name, plan: summarizeSchedule(sched), on: sched.every((x, i) => x === t.schedule[i]) }))
    .sort((a, b) => a.plan.intensity - b.plan.intensity);
  const presetBar = `<div class="mt-presets" role="group" aria-label="Week presets, lightest first"><span class="mt-cap">Presets · light → heavy</span>${presets.map((x) => `<button class="link mt-preset ${x.on ? "on" : ""}" aria-pressed="${x.on}" onclick="Ops.template('${e(x.name)}')"><b>${e(x.name)}</b><small>Intensity ${x.plan.intensity} · growth ×${x.plan.development}</small></button>`).join("")}</div>`;
  return panel("Practice week", `${presetBar}<div class="mt-week" role="group" aria-label="This week's sessions. Choose a day to change it.">${tiles}${game}</div>`, { cls: "mt-weekpanel", action: `<small class="mt-head-note">${plural(plan.restDays, "rest day")} · at least one is required</small>` });
}

function palette(t, plan) {
  const i = Math.max(0, Math.min(DAYS.length - 1, ui.day)),
    current = t.schedule[i];
  const cards = Object.entries(BLOCKS)
    .map(([key, b]) => {
      const sched = t.schedule.map((x, j) => (j === i ? key : x)),
        next = summarizeSchedule(sched),
        noRest = next.restDays === 0,
        on = key === current,
        di = next.intensity - plan.intensity,
        tone = blockTone(b);
      const stats = [
        ["Load", b.intensity],
        ["Fatigue", signed(b.fatigue)],
        ["Scheme", b.familiarity ? `+${b.familiarity}` : "—"],
        ["Growth", b.development ? `+${b.development}` : "—"],
      ]
        .map(([k, v]) => `<span><small>${k}</small><b>${v}</b></span>`)
        .join("");
      return `<button class="link mt-block mt-${tone} ${on ? "on" : ""}" ${noRest && !on ? 'disabled title="The week needs at least one recovery or off day"' : ""} aria-pressed="${on}" onclick="Ops.day(${i},'${key}')">${glyph(key, 26)}<span class="mt-block-main"><b>${e(b.label)}</b><span class="mt-block-stats">${stats}</span><small>${on ? "Current session" : noRest ? "Would leave no rest day" : `Week intensity ${next.intensity} (${signed(di)}) · injury risk ${next.risk}`}</small></span></button>`;
    })
    .join("");
  return panel(`${DAYS[i]} session`, `<div class="mt-blocks-list">${cards}</div>`, { cls: "mt-palette", action: `<small class="mt-head-note">Pick a day above, then a session</small>` });
}

function effectsPanel(t, plan) {
  const applied = state.franchise.preparation?.intensity ?? plan.intensity,
    medLvl = state.franchise.clubs[state.team]?.stadium?.medical ?? 1,
    load = practiceLoad(plan.intensity, medLvl),
    next = nextLevels(t, plan),
    band = intensityBand(plan.intensity);
  const bands = INTENSITY_BANDS.map(([min, label], k) => {
    const max = INTENSITY_BANDS[k + 1]?.[0] ?? 101;
    return `<span class="${plan.intensity >= min && plan.intensity < max ? "on" : ""}" style="flex:${max - min}">${label}</span>`;
  }).join("");
  const row = (label, value, meter, note, tone = "") => `<li><span class="mt-eff-k">${label}</span>${meter}<b class="${tone ? `mt-t-${tone}` : ""}">${value}</b>${note ? `<small>${note}</small>` : ""}</li>`;
  const mismatch =
    Math.round(applied) !== plan.intensity
      ? `<div class="mt-callout"><b>Practice is still running at ${Math.round(applied)}</b><small>This plan works out to ${plan.intensity}. Apply it so wear, condition and injury risk follow the schedule.</small><button class="small" onclick="Med.apply()">Apply plan</button></div>`
      : "";
  return panel(
    "This week's effect",
    `<div class="mt-int"><div class="mt-int-top"><span class="mt-cap">Intensity</span><b class="mt-big">${plan.intensity}</b><em>${band}</em></div><div class="mt-int-bar" aria-hidden="true">${bands}<i style="left:${plan.intensity}%"></i></div></div>${mismatch}
    <ul class="mt-eff">
      ${row("Injury risk", plan.risk, blocks(plan.risk, 4, 8, plan.risk >= 2.5 ? "bad" : plan.risk >= 1.2 ? "warn" : "good"), `${load.injuryChance}% practice-injury chance per player`, plan.risk >= 2.5 ? "bad" : plan.risk >= 1.2 ? "warn" : "good")}
      ${row("Fatigue", signed(plan.fatigue), blocks(Math.max(0, plan.fatigue + 30), 60, 8, plan.fatigue > 10 ? "bad" : plan.fatigue > 0 ? "warn" : "good"), `Condition ${signed(load.condition)} per week toward 100%`, plan.fatigue > 10 ? "bad" : plan.fatigue > 0 ? "warn" : "good")}
      ${row("Joint wear", `${signed(load.wear)}/wk`, blocks(Math.max(0, load.wear + 8), 13, 8, load.wear > 0 ? "bad" : "good"), load.wear > 0 ? "Each joint wears down this week" : "Joints recover this week", load.wear > 0 ? "bad" : "good")}
      ${row("Growth", `×${plan.development}`, blocks(plan.development, 5, 8, "accent"), "Attribute growth from drills and targets")}
      ${row("Scheme", `${t.familiarity}→${next.familiarity}`, blocks(next.familiarity, 100, 8, toneUp(next.familiarity, 70, 45)), "Familiarity after this week", next.familiarity > t.familiarity ? "good" : next.familiarity < t.familiarity ? "bad" : "")}
      ${row("Readiness", `${t.readiness}→${next.readiness}`, blocks(next.readiness, 100, 8, toneUp(next.readiness, 70, 45)), "Game-day sharpness after this week", next.readiness > t.readiness ? "good" : next.readiness < t.readiness ? "bad" : "")}
      ${row("Morale", signed(plan.morale), blocks(plan.morale + 4, 8, 8, plan.morale >= 1 ? "good" : plan.morale <= -1 ? "bad" : "accent"), Math.abs(plan.morale) >= 1 ? (plan.morale > 0 ? "A balanced week lifts the room" : "A gruelling week drains the room") : "No effect on the locker room")}
    </ul>`,
    { cls: "mt-effects" },
  );
}

function unitsPanel() {
  const rows = unitReadiness(state)
    .map((u) => `<li><span class="mk-pos">${u.unit}</span><span class="mt-u-n">${u.healthy}/${u.total}<small>fit</small></span>${blocks(u.condition, 100, 10, toneUp(u.condition, 85, 70), `${u.unit} condition ${u.condition}%`)}<b>${u.total ? `${u.condition}%` : "—"}</b><small class="mt-u-note">${[u.injured ? `${u.injured} hurt` : "", u.fatigued ? `${u.fatigued} tired` : "", u.wear >= WEAR_RISK / 2 ? `wear ${u.wear}` : ""].filter(Boolean).join(" · ") || "Ready"}</small></li>`)
    .join("");
  return panel("Unit readiness", `<ul class="mt-units">${rows}</ul><p class="mk-note">Condition is the healthy players' average. Tired players (under ${CONDITION_RISK}%) recover faster on light weeks.</p>`, { cls: "mt-unitpanel" });
}

function drillsPanel(t) {
  const side = (s) => {
    const current = t.drills[s],
      def = DRILLS[s][current];
    return `<div class="mt-drill"><span class="mt-cap">${s === "offense" ? "Offense" : "Defense"} emphasis</span><div class="mt-drill-opts">${Object.keys(DRILLS[s]).map((k) => `<button class="link ${k === current ? "on" : ""}" aria-pressed="${k === current}" onclick="Ops.drill('${s}','${e(k)}')">${e(k)}</button>`).join("")}</div><small>${def.positions.join(", ")} work on ${def.attrs.map(attrName).join(", ")}</small></div>`;
  };
  return panel(
    "Unit drills",
    `${side("offense")}${side("defense")}<ul class="mt-tradeoffs"><li><b>Film, walkthrough, install</b> build scheme familiarity and readiness at low risk.</li><li><b>Padded and conditioning</b> grow attributes fastest but add fatigue, joint wear and injury risk.</li><li><b>Recovery and days off</b> restore condition. Coordinators, facilities and scheme fit scale growth.</li></ul>`,
    { cls: "mt-drillpanel" },
  );
}

function individualPlans() {
  const OFF = ["QB", "RB", "WR", "TE", "OL"];
  const groups = [
    ["all", "All"],
    ["offense", "Offense"],
    ["defense", "Defense"],
    ["targets", "With a target"],
    ["learning", "Learning a position"],
  ];
  const keep = {
    all: () => true,
    offense: (p) => OFF.includes(p.pos),
    defense: (p) => !OFF.includes(p.pos),
    targets: (p) => !!p.progression?.target,
    learning: (p) => p.positionChange && p.positionChange.familiarity < 100,
  }[ui.indGroup] || (() => true);
  const list = state.roster.filter((p) => !p.injury && p.status !== "ir" && keep(p)).sort((a, b) => b.pot - b.ovr - (a.pot - a.ovr) || b.ovr - a.ovr),
    pg = pageOf(list, ui.indPage, IND_PAGE);
  ui.indPage = pg.page;
  const rows = pg.items
    .map((p) => {
      const r = ensurePlayerRatings(p),
        attrs = Object.keys(r.attributes || {}),
        target = p.progression?.target ?? "",
        moves = POSITION_MOVES[p.pos] || [],
        eff = efficiency(state, p),
        head = Math.max(0, (p.pot ?? p.ovr) - p.ovr),
        learning = p.positionChange && p.positionChange.familiarity < 100;
      return `<li class="mt-ind">${pixelFace(p, { size: 36, team: state.team })}<span class="mt-ind-id">${nameLink(p)}<small><span class="mk-pos">${e(p.pos)}</span>${p.age} yrs${learning ? ` · learning ${e(p.positionChange.to)} ${p.positionChange.familiarity}%` : ""}</small></span><span class="mt-ind-grow"><small>${p.ovr} → ${p.pot}</small>${blocks(Math.min(head, 20), 20, 10, head >= 10 ? "good" : head >= 4 ? "accent" : "none", `${head} points of headroom`)}</span><span class="mt-ind-eff" title="Coordinator, facilities and scheme fit"><small>Efficiency</small><b class="mt-t-${eff >= 1 ? "good" : eff < 0.9 ? "bad" : "warn"}">×${eff}</b></span><select aria-label="Training target for ${e(p.name)}" onchange="Ops.target('${p.id}',this.value)"><option value="">Team drills only</option>${attrs.map((a) => `<option value="${a}" ${a === target ? "selected" : ""}>${attrName(a)}</option>`).join("")}</select>${moves.length ? `<select aria-label="Position change for ${e(p.name)}" onchange="if(this.value)Ops.position('${p.id}',this.value)"><option value="">Keep at ${p.pos}</option>${moves.map((m) => `<option value="${m}">Move to ${m}</option>`).join("")}</select>` : `<span class="mt-ind-none">No position moves</span>`}</li>`;
    })
    .join("");
  return panel(
    "Individual development",
    `<div class="mt-room-tools">${seg(groups, ui.indGroup, "Med.ind('$id')", "Filter players")}<small class="mt-head-note">Most headroom first. Injured players rejoin after rehab.</small></div>${rows ? `<ul class="mt-inds">${rows}</ul>${pager(pg, "Med.indPage")}` : `<p class="mk-none">No healthy players match this filter.</p>`}<p class="mk-note">A target attribute gets double reps on top of unit drills. Position moves cost about 6 rating now and are earned back as familiarity grows.</p>`,
    { cls: "mt-indpanel" },
  );
}

export function trainingView(subTabs = "") {
  styles();
  const t = ensureTraining(state),
    plan = weekPlan(state),
    toolbar = subTabs ? `<div class="mt-toolbar">${subTabs}</div>` : "";
  return `<div class="mt-page mt-training">${toolbar}${weekStrip(t, plan)}<div class="mt-grid mt-grid-train"><div class="mt-main">${palette(t, plan)}</div><div class="mt-side">${effectsPanel(t, plan)}</div></div><div class="mt-grid mt-grid-units"><div class="mt-main">${unitsPanel()}</div><div class="mt-side">${drillsPanel(t)}</div></div></div>`;
}

export function trainingPlayersView(subTabs = "") {
  styles();
  return `<div class="mt-page mt-training">${subTabs ? `<div class="mt-toolbar">${subTabs}</div>` : ""}${individualPlans()}</div>`;
}

/* --------------------------------------------------------------------- actions */

export function installMedical({ isBusy }) {
  const mutate = (fn, message) => {
    if (isBusy()) return;
    try {
      let result;
      state = S.transact(state, (s) => (result = fn(s)));
      save();
      render();
      const text = message?.(result);
      if (text) toast(text);
    } catch (err) {
      toast(err.message);
    }
  };
  const view = (fn) => (...args) => {
    fn(...args);
    render();
  };
  window.Med = {
    filter: view((f) => ((ui.filter = f), (ui.page = 0))),
    sort: view((k) => ((ui.sort = k), (ui.page = 0))),
    page: view((n) => (ui.page = Number(n) || 0)),
    logPage: view((n) => (ui.logPage = Number(n) || 0)),
    day: view((i) => (ui.day = Number(i) || 0)),
    ind: view((g) => ((ui.indGroup = g), (ui.indPage = 0))),
    indPage: view((n) => (ui.indPage = Number(n) || 0)),
    toCase(id) {
      const el = document.getElementById(`mt-case-${id}`);
      el?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      el?.querySelector?.(".mt-opt")?.focus?.({ preventScroll: true });
    },
    ir: (id) => mutate((s) => (movePlayer(s, id, "ir"), s.roster.find((p) => p.id === id)), (p) => `${p.name} placed on injured reserve`),
    activate: (id) => mutate((s) => (movePlayer(s, id, "active"), s.roster.find((p) => p.id === id)), (p) => `${p.name} activated from injured reserve`),
    apply: () => mutate((s) => setSchedule(s, [...ensureTraining(s).schedule]), (p) => `Practice plan applied · intensity ${p.intensity}`),
  };
}
