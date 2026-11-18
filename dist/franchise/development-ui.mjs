// Player development: a pixel progression board (OVR → POT tracks, direction, age curve and the
// individual plan for every player) and the per-player development card (Dev.player). Styles live
// in people.css. Presentation exposes direction only, never a numeric development delta.
import * as S from "./state.mjs";
import { ensureDevelopment, setDevelopmentPlan, FOCUSES, LOADS } from "./development.mjs";
import { progressionView, attributeLabel } from "./progression-view.mjs";
import { effectiveAttributes } from "./ratings.mjs";
import { pixelFace } from "../ui/pixel-face.mjs";
import * as SV from "../ui/status-visual.mjs";

const label = (s) => s.replace(/([A-Z])/g, " $1").trim();
const PAGE = 8;

// Age at which each position stops improving in the offseason (mirrors development.mjs); players
// hold their level for three seasons after it and then decline with age.
const PEAK = { QB: 29, RB: 25, WR: 27, TE: 28, OL: 29, DL: 28, LB: 27, CB: 26, S: 28, K: 32, P: 32 };
const KEY_ATTRS = {
  QB: ["throwPower", "throwAccuracyShort", "throwAccuracyMid", "throwAccuracyDeep", "awareness"],
  RB: ["speed", "carrying", "breakTackle", "agility", "acceleration"],
  WR: ["speed", "catching", "shortRouteRunning", "acceleration", "agility"],
  TE: ["catching", "runBlock", "passBlock", "awareness", "strength"],
  OL: ["passBlock", "runBlock", "strength", "awareness"],
  DL: ["tackle", "strength", "acceleration", "awareness"],
  LB: ["tackle", "awareness", "zoneCoverage", "speed"],
  CB: ["manCoverage", "zoneCoverage", "speed", "agility"],
  S: ["zoneCoverage", "tackle", "awareness", "speed"],
  K: ["kickAccuracy", "kickPower"],
  P: ["kickPower", "awareness"],
};
const FOCUS_NOTE = {
  Balanced: "All-round sharpness and fitness",
  Technique: "Hands, accuracy, blocking and tackling form",
  Athleticism: "Speed, burst and agility",
  DecisionMaking: "Reads, coverage and route timing",
  PositionSpecific: "The core skills of his position",
  Rehabilitation: "Conditioning and durability after injury",
};
const LOAD_NOTE = {
  Light: "Recovery first. Slower gains, fresh legs.",
  Normal: "Steady work alongside game preparation.",
  Intensive: "Faster gains, but fatigue and injury risk rise.",
};

// Where a player sits on his position's age curve. Pure; tested in test-coach-development.mjs.
export function ageCurve(p) {
  const peak = PEAK[p?.pos] || 28,
    age = Number(p?.age) || 25;
  if (age <= peak - 3) return { key: "rise", label: "Rising", hint: `Still growing · peaks around ${peak}`, peak };
  if (age <= peak) return { key: "rise", label: "Near peak", hint: `Last growth years · peaks at ${peak}`, peak };
  if (age <= peak + 3) return { key: "prime", label: "Prime", hint: `Holding his level until about ${peak + 3}`, peak };
  return { key: "decline", label: "Veteran", hint: `Age-related decline past ${peak + 3}`, peak };
}

// Block meter: whole squares, value mapped onto `n` blocks between lo and hi.
const blockCount = (v, lo, hi, n) => Math.max(0, Math.min(n, Math.round(((v - lo) / (hi - lo)) * n)));
export function progressTrack(ovr, pot, n = 20) {
  const a = blockCount(ovr, 40, 99, n),
    b = Math.max(a, blockCount(pot, 40, 99, n));
  return `<span class="pp-track" role="img" aria-label="Overall ${ovr} of potential ${pot}">${Array.from({ length: n }, (_, i) => `<i class="${i < a ? "on" : i < b ? "room" : ""}"></i>`).join("")}</span>`;
}
const blocks = (v, max = 99, n = 10, tone = "") =>
  `<span class="pp-blocks ${tone}" aria-hidden="true">${Array.from({ length: n }, (_, i) => `<i class="${i < Math.round((Math.max(0, Math.min(max, v)) / max) * n) ? "on" : ""}"></i>`).join("")}</span>`;
const trend = (v) =>
  `<span class="dv-trend ${v.direction}">${v.direction === "up" ? "▲" : v.direction === "down" ? "▼" : "■"} ${v.status}</span>`;
const curveStrip = (c) =>
  `<span class="dv-curve ${c.key}" title="${esc(c.hint)}"><span class="dv-curve-bar"><i class="rise"></i><i class="prime"></i><i class="decline"></i></span><b>${c.label}</b></span>`;

export function directionChips(p, limit = 5) {
  const v = progressionView(p);
  return (
    v.attributes
      .slice(0, limit)
      .map(
        (a) =>
          `<span class="development-direction ${a.direction}" aria-label="${esc(a.label)} ${a.direction === "up" ? "improving" : "declining"}">${esc(a.label)} ${a.arrow}</span>`,
      )
      .join("") || '<span class="muted">No attribute movement reported</span>'
  );
}

// Overall rating week by week as a stepped pixel line. Injury weeks are marked along the base.
function stepChart(p) {
  const h = (p.progression.history || []).filter((r) => Number.isFinite(r.ovr));
  if (h.length < 2)
    return `<div class="dv-chart dv-chart-empty"><b>Ability trend</b><p>The weekly trend appears after two coach reports. Reports follow each game week.</p></div>`;
  const W = 360,
    H = 120,
    pad = 18,
    vals = h.map((r) => r.ovr),
    lo = Math.min(...vals) - 1,
    hi = Math.max(...vals, Math.min(p.pot, Math.max(...vals) + 3)) + 1,
    x = (i) => pad + (i / (h.length - 1)) * (W - pad * 2),
    y = (v) => Math.round(H - 22 - ((v - lo) / (hi - lo)) * (H - 40));
  let d = `M${x(0)} ${y(vals[0])}`;
  for (let i = 1; i < h.length; i++) d += ` H${x(i)} V${y(vals[i])}`;
  const potY = y(Math.min(p.pot, hi)),
    grid = [lo + 1, Math.round((lo + hi) / 2), hi - 1].map((v) => `<line class="g" x1="${pad}" x2="${W - pad}" y1="${y(v)}" y2="${y(v)}"/><text x="2" y="${y(v) + 4}">${v}</text>`).join("");
  return `<div class="dv-chart"><div class="dv-chart-head"><b>Overall, week by week</b><small>${h.length} reports</small></div><svg viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges" role="img" aria-label="Overall rating across the last ${h.length} weekly reports">${grid}${p.pot <= hi ? `<line class="pot" x1="${pad}" x2="${W - pad}" y1="${potY}" y2="${potY}"/>` : ""}<path class="line" d="${d}"/>${h.map((r, i) => `<rect class="${r.injured ? "inj" : "pt"}" x="${x(i) - 3}" y="${r.injured ? H - 12 : y(vals[i]) - 3}" width="6" height="6"/>`).join("")}</svg><p class="dv-legend"><span class="l-line"></span>Overall <span class="l-pot"></span>Potential <span class="l-inj"></span>Injury week</p></div>`;
}

export function installDevelopmentUI({ views, isBusy }) {
  if (typeof document !== "undefined" && typeof document.querySelector === "function" && !document.querySelector('link[href="people.css"]'))
    document.head?.insertAdjacentHTML?.("beforeend", '<link rel="stylesheet" href="people.css">');
  let query = "",
    filter = "All",
    sort = "Overall",
    page = 0,
    selected = null,
    profileTab = "Plan",
    draft = null;
  const SORTS = {
    Overall: (a, b) => b.ovr - a.ovr,
    Upside: (a, b) => b.pot - b.ovr - (a.pot - a.ovr) || b.pot - a.pot,
    Youngest: (a, b) => a.age - b.age || b.pot - a.pot,
    Name: (a, b) => a.name.localeCompare(b.name),
  };
  const matches = (p, f) =>
    f === "All" || (f === "Rehabilitation" ? !!(p.injury || p.progression?.rehab) : progressionView(p).status === f);
  const items = () =>
    state.roster
      .filter((p) => `${p.name} ${p.pos}`.toLowerCase().includes(query.toLowerCase()))
      .filter((p) => matches(p, filter))
      .sort(SORTS[sort] || SORTS.Overall);
  function row(p) {
    const d = ensureDevelopment(p, state.year),
      v = progressionView(p),
      c = ageCurve(p),
      status = p.injury ? `<span class="dv-avail bad">Injured · ${p.injury}w</span>` : d.rehab ? '<span class="dv-avail warn">Return to play</span>' : '<span class="dv-avail good">Available</span>';
    return `<div class="dv-row" role="row"><button class="link dv-who" onclick="Dev.player('${p.id}')" aria-label="Open ${esc(p.name)}'s development plan">${pixelFace(p, { size: 38, team: state.team })}<span><b>${esc(p.name)}</b><small><em class="pp-pos">${esc(p.pos)}</em>${p.age} yrs${p.starter ? " · starter" : ""}</small></span></button><div class="dv-prog"><span class="dv-nums"><b>${p.ovr}</b><i>→</i><em>${p.pot}</em></span>${progressTrack(p.ovr, p.pot)}${trend(v)}</div><div class="development-directions">${directionChips(p, 3)}</div><div>${curveStrip(c)}</div><div class="dv-plan"><b>${esc(label(d.focus))}</b><span class="sv-mini" title="${esc(d.load)} load">${d.load === "Normal" ? "" : SV.chip(d.load, d.load === "Intensive" ? "warn" : "pending")}<small>Form</small>${Number.isFinite(d.form) ? `${SV.meter(d.form, 10, { cells: 5, tone: SV.toneFor(d.form, 7, 5), label: `Form ${d.form.toFixed(1)} of 10` })}<b>${d.form.toFixed(1)}</b>` : "<b>—</b>"}</span></div><div>${status}</div><button class="secondary small" onclick="Dev.player('${p.id}')">Plan ↗</button></div>`;
  }
  function rows() {
    const all = items();
    page = Math.min(page, Math.max(0, Math.ceil(all.length / PAGE) - 1));
    return (
      all
        .slice(page * PAGE, page * PAGE + PAGE)
        .map(row)
        .join("") || '<p class="pp-none">No players match this view. Clear the search or pick another filter.</p>'
    );
  }
  const segments = (values, current, method, notes = null) =>
    `<div class="pp-seg${notes ? " dv-tiles" : ""}" role="group">${values.map((v) => `<button class="${current === v ? "selected on" : ""}" aria-pressed="${v === current}" onclick="Dev.${method}('${v}')"><b>${esc(label(v))}</b>${notes ? `<small>${esc(notes[v] || "")}</small>` : ""}</button>`).join("")}</div>`;
  function attributeBars(p, d, v) {
    const now = effectiveAttributes(p) || {},
      moving = Object.fromEntries(v.attributes.map((a) => [a.key, a])),
      keys = [...new Set([...(KEY_ATTRS[p.pos] || ["awareness"]), ...(FOCUSES[d.focus] || []), ...v.attributes.map((a) => a.key)])].filter((k) => Number.isFinite(now[k])).slice(0, 10);
    if (!keys.length) return '<p class="pp-none">No attribute grades recorded.</p>';
    return `<div class="dv-attrs">${keys
      .map((k) => {
        const m = moving[k];
        return `<div class="dv-attr ${m ? m.direction : ""}"><span>${esc(attributeLabel(k))}</span>${blocks(now[k], 99, 12, now[k] >= 80 ? "good" : now[k] < 55 ? "warn" : "")}<b>${now[k]}</b><i aria-label="${m ? (m.direction === "up" ? "improving" : "declining") : "steady"}">${m ? m.arrow : ""}</i></div>`;
      })
      .join("")}</div>`;
  }
  function profile() {
    const p = state.roster.find((p) => p.id === selected);
    if (!p) return;
    const d = ensureDevelopment(p, state.year),
      v = progressionView(p),
      c = ageCurve(p),
      eligible = state.roster.filter((q) => q.id !== p.id && q.pos === p.pos && q.age >= p.age + 3).sort((a, b) => b.ovr - a.ovr),
      mentors = eligible.slice(0, 7),
      mentor = state.roster.find((q) => q.id === d.mentorId),
      picked = eligible.find((q) => q.id === draft.mentorId),
      report = d.lastReport,
      more = eligible.length - mentors.length,
      dirty = draft.focus !== d.focus || draft.load !== d.load || (draft.mentorId || null) !== (d.mentorId || null);
    if (picked && !mentors.includes(picked)) mentors[mentors.length - 1] = picked;
    const content =
      profileTab === "Plan"
        ? `<h3 class="pp-label">Training focus</h3>${segments(Object.keys(FOCUSES), draft.focus, "focus", FOCUS_NOTE)}<h3 class="pp-label">Workload</h3>${segments(Object.keys(LOADS), draft.load, "load", LOAD_NOTE)}<h3 class="pp-label">Position mentor <small>same position, 3+ years older${more > 0 ? ` · best ${mentors.length} of ${eligible.length} shown` : ""}</small></h3><div class="dv-mentors"><button class="${!draft.mentorId ? "selected on" : ""}" onclick="Dev.mentor('')"><span class="dv-nomentor">—</span><span>No mentor<small>Coaches only</small></span></button>${mentors.map((q) => `<button class="${draft.mentorId === q.id ? "selected on" : ""}" onclick="Dev.mentor('${q.id}')">${pixelFace(q, { size: 32, team: state.team })}<span>${esc(q.name)}<small>${q.age} yrs · ${q.pos} · ${q.ovr} OVR</small></span></button>`).join("") || '<p class="pp-none">No older teammate at his position.</p>'}</div><div class="dv-note">${p.injury ? "Medical clearance takes priority. Recovery limits training until he is fit." : draft.load === "Intensive" && p.fitness < 70 ? "Fatigue limits the benefit of intensive training right now." : "Balance meaningful snaps, individual work and recovery."}</div><div class="dv-save">${dirty ? '<span class="pp-chip warn">Unsaved changes</span>' : '<span class="pp-chip good">Plan saved</span>'}<button onclick="Dev.save('${p.id}')" ${isBusy() ? "disabled" : ""}>Save individual plan</button></div>`
        : profileTab === "Report"
          ? `<div class="dv-report">${stepChart(p)}<div><h3 class="pp-label">Key attributes</h3>${attributeBars(p, d, v)}</div></div><h3 class="pp-label">Coach’s latest report</h3><div class="dv-reasons">${(report?.reasons || ["Awaiting the next weekly assessment"]).map((x) => `<span>${esc(x)}</span>`).join("")}</div><p class="dv-foot">${report?.used ? "Competitive playing opportunity recorded this week." : "Competitive snaps and focused practice create opportunities for progress."}</p>`
          : `<div class="dv-ledger">${
              d.injuries
                .slice(0, 6)
                .map(
                  (i) =>
                    `<div class="${i.returned ? "" : "open"}"><span class="pp-chip ${i.returned ? "" : "bad"}">${i.returned ? "Healed" : "Active"}</span><b>${esc(label(i.bodyPart))} · ${esc(i.diagnosis)}</b><small>${i.year} · Week ${i.week + 1} · ${i.weeksMissed} weeks interrupted · ${i.returned ? "Returned week " + (i.returned.week + 1) : "Recovery in progress"}</small></div>`,
                )
                .join("") || '<p class="pp-none">No injuries recorded. A clean bill of health.</p>'
            }</div><p class="dv-foot">Major injuries can affect physical attributes. A managed return protects recovery and long-term development.</p>`;
    modal(
      `<div class="dv-card"><div class="dv-card-head">${pixelFace(p, { size: 76, team: state.team })}<div class="dv-card-id"><span class="pp-kicker">INDIVIDUAL DEVELOPMENT</span><h2>${esc(p.name)}</h2><p><em class="pp-pos">${esc(p.pos)}</em>${p.age} years · ${esc(p.development || "Normal")} development</p><div class="dv-card-chips">${trend(v)}${curveStrip(c)}</div></div><div class="dv-card-ovr"><span><b>${p.ovr}</b><small>OVR</small></span><i>→</i><span><b>${p.pot}</b><small>POT</small></span>${progressTrack(p.ovr, p.pot, 16)}<small class="dv-hint">${esc(c.hint)}</small></div><button class="icon-button dv-x" aria-label="Close development" onclick="closeModal()">×</button></div><div class="dv-metrics"><div><span>Training</span><b>${d.training?.toFixed(1) || "—"}</b>${blocks(d.training || 0, 10, 10)}</div><div><span>Match form</span><b>${d.form?.toFixed(1) || "—"}</b>${blocks(d.form || 0, 10, 10)}</div><div><span>Plan</span><b class="sm">${esc(label(d.focus))}</b><small>${esc(d.load)} load</small></div><div><span>Mentor</span><b class="sm">${mentor ? esc(mentor.name) : "None"}</b><small>${mentor ? mentor.age + " yrs · " + mentor.pos : "Coaches only"}</small></div></div><div class="dv-tabs">${segments(["Plan", "Report", "Medical"], profileTab, "tab")}</div><div class="dv-body">${content}</div><div class="modal-actions dv-actions"><button class="secondary" onclick="CI.rating('${p.id}')">Full attributes</button><button class="secondary" onclick="closeModal();CI.open('player','${p.id}')">Talk to him</button><button onclick="closeModal()">Done</button></div></div>`,
    );
  }
  const pager = (total) =>
    `<span id="development-count">${total} players</span><span id="development-page">Page ${page + 1}</span><button class="secondary small" id="development-prev" onclick="Dev.page(-1)" ${!page ? "disabled" : ""}>Previous</button><button class="secondary small" id="development-next" onclick="Dev.page(1)" ${(page + 1) * PAGE >= total ? "disabled" : ""}>Next</button>`;
  window.Dev = {
    query(v) {
      query = v;
      page = 0;
      document.getElementById("development-rows").innerHTML = rows();
      document.getElementById("development-count").textContent = items().length + " players";
      document.getElementById("development-page").textContent = "Page 1";
      document.getElementById("development-prev").disabled = true;
      document.getElementById("development-next").disabled = items().length <= PAGE;
    },
    filter(v) {
      filter = filter === v && v !== "All" ? "All" : v;
      page = 0;
      render();
    },
    sort(v) {
      sort = SORTS[v] ? v : "Overall";
      page = 0;
      render();
    },
    page(d) {
      page = Math.max(0, page + d);
      render();
    },
    player(id) {
      selected = id;
      const p = state.roster.find((p) => p.id === id);
      if (!p) return;
      const d = ensureDevelopment(p, state.year);
      draft = { focus: d.focus, load: d.load, mentorId: d.mentorId };
      profileTab = "Plan";
      profile();
    },
    tab(v) {
      profileTab = v;
      profile();
    },
    focus(v) {
      draft.focus = v;
      profile();
    },
    load(v) {
      draft.load = v;
      profile();
    },
    mentor(v) {
      draft.mentorId = v || null;
      profile();
    },
    save(id) {
      if (isBusy()) return;
      try {
        state = S.transact(state, (s) => setDevelopmentPlan(s, id, draft));
        save();
        render();
        profile();
        toast("Development plan saved.");
      } catch (e) {
        toast(e.message);
      }
    },
  };
  views.Development = () => {
    for (const p of state.roster) ensureDevelopment(p, state.year);
    const count = (f) => state.roster.filter((p) => matches(p, f)).length,
      f = state.franchise,
      club = f.clubs[state.team],
      staff = club.staff || [],
      coaching = staff.length ? Math.round(staff.reduce((n, c) => n + (c.rating || 0), 0) / staff.length) : 65,
      devSkill = f.userCoach?.attributes?.development,
      intensity = Math.round(f.preparation?.intensity ?? 50),
      body = rows(),
      total = items().length;
    const tile = (key, name, tone, sym) =>
      `<button class="link dv-count ${tone} ${filter === key ? "on" : ""}" aria-pressed="${filter === key}" onclick="Dev.filter('${key}')"><i>${sym}</i><b>${count(key)}</b><span>${name}</span></button>`;
    const influence = `<div class="dv-influence"><span class="pp-label">Coaching influence</span><div><span>Coaching staff</span>${blocks(coaching, 99, 10)}<b>${coaching}</b></div><div><span>Training facility</span>${blocks(club.stadium.training, 5, 5)}<b>Lv ${club.stadium.training}</b></div><div><span>Medical facility</span>${blocks(club.stadium.medical, 5, 5)}<b>Lv ${club.stadium.medical}</b></div>${Number.isFinite(devSkill) ? `<div><span>Your development</span>${blocks(devSkill, 20, 10)}<b>${devSkill}</b></div>` : ""}<div><span>Week intensity</span>${blocks(intensity, 100, 10, intensity > 70 ? "warn" : "")}<b>${intensity}</b></div><button class="secondary small" onclick="W.open('Medical')">Team preparation ↗</button></div>`;
    return `<div class="pp-page dv-page"><section class="pp-panel dv-head"><div class="dv-head-copy"><div class="dv-counts">${tile("Improving", "Improving", "good", "▲")}${tile("Stable", "Stable", "", "■")}${tile("Declining", "Declining", "bad", "▼")}${tile("Rehabilitation", "In recovery", "warn", "+")}</div></div>${influence}</section><section class="pp-panel dv-board"><div class="pp-bar"><input type="search" aria-label="Search development players" placeholder="Search player or position…" value="${esc(query)}" oninput="Dev.query(this.value)">${segments(["All", "Improving", "Stable", "Declining", "Rehabilitation"], filter, "filter")}<label class="pp-select"><span>Sort</span><select aria-label="Sort development board" onchange="Dev.sort(this.value)">${Object.keys(SORTS).map((k) => `<option ${k === sort ? "selected" : ""}>${k}</option>`).join("")}</select></label></div><div class="dv-grid" role="table" aria-label="Development board"><div class="dv-row dv-row-head" role="row"><span>Player</span><span>Overall / status</span><span>Attribute direction</span><span>Age curve</span><span>Plan</span><span>Availability</span><span></span></div><div id="development-rows">${body}</div></div><div class="pp-pager">${pager(total)}</div></section></div>`;
  };
}
