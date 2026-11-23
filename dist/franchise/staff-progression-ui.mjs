// Markup for staff progression (pure strings, works in Node tests; styles in fo-pixel.css, sp-*):
// age + trend badge + "why" line on staff cards, the last-review strip on the Coaching staff
// screen, and the Coach growth panel on Coach career.
import * as fp from "./fo-pixel.mjs";
import { staffTrend, coachGrowthLabel, niceAttr, staffDistribution } from "./staff-progression.mjs";
import { COACH_ATTRIBUTES, coachRating, COACH_ATTRIBUTE_CAP } from "./coach-profile.mjs";

const h = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "±0");
const fmt = (v) => (Number.isFinite(v) ? (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1) : "");

// ▲ +2 / ▼ −1 / ■ ±0 with the full reason list as a tooltip.
export function trendBadge(c, { label = true } = {}) {
  const t = staffTrend(c);
  if (!t) return `<span class="sp-trend new" title="No season review yet: ratings change at each training camp">NEW</span>`;
  const tone = t.delta > 0 ? "up" : t.delta < 0 ? "down" : "flat",
    arrow = t.delta > 0 ? "▲" : t.delta < 0 ? "▼" : "■",
    tip = `${t.year} review: ${signed(t.delta)}${t.reasons.length ? "\n" + t.reasons.map((r) => `• ${r.label}${r.value !== 1 || !c.userControlled ? ` (${fmt(r.value)})` : ""}`).join("\n") : ""}`;
  return `<span class="sp-trend ${tone}" title="${h(tip)}" aria-label="${h(`Rating change last season ${signed(t.delta)}`)}"><i aria-hidden="true">${arrow}</i>${label ? signed(t.delta) : ""}</span>`;
}
// One line of reasons (the biggest movers), truncated; the badge tooltip holds the full list.
export function whyLine(c) {
  const t = staffTrend(c);
  if (!t) return `<p class="sp-why muted">Rated at the next training camp: age, results and player development.</p>`;
  if (!t.reasons.length) return `<p class="sp-why muted">${t.year}: a steady year.</p>`;
  // Two biggest reasons as a tiny list (arrow, label, size); the badge tooltip has them all.
  const items = t.reasons.slice(0, 2).map((r) => {
    const tone = r.value > 0 ? "good" : r.value < 0 ? "bad" : "";
    return `<li class="${tone}"><i aria-hidden="true">${r.value > 0 ? "▲" : r.value < 0 ? "▼" : "■"}</i><span>${h(r.label)}</span>${c.userControlled ? "" : `<em>${fmt(r.value)}</em>`}</li>`;
  });
  return `<ul class="sp-why" aria-label="${h(`Why the rating moved in ${t.year}`)}" title="${h(t.reasons.map((r) => r.label).join(" · "))}">${items.join("")}</ul>`;
}
export const ageText = (c) => (Number.isInteger(c?.age) ? `Age ${c.age}` : "");

// Strip above the staff cards: how your staff moved at the last review, plus league retirements.
export function staffReviewStrip(s) {
  const f = s.franchise,
    club = f.clubs[s.team],
    staff = club.staff || [],
    last = Math.max(0, ...staff.map((c) => staffTrend(c)?.year || 0));
  const p = f.staffProgression;
  if (!last) {
    return `<div class="sp-strip"><span class="sp-strip-k">Staff reviews</span><span>Ratings move at every training camp: young coaches tend to rise, veterans to slip, and results and player development can beat the trend either way.</span></div>`;
  }
  const moved = staff.map((c) => ({ c, t: staffTrend(c) })).filter((x) => x.t?.year === last),
    up = moved.filter((x) => x.t.delta > 0).length,
    down = moved.filter((x) => x.t.delta < 0).length,
    best = moved.slice().sort((a, b) => b.t.delta - a.t.delta)[0],
    worst = moved.slice().sort((a, b) => a.t.delta - b.t.delta)[0],
    ages = staff.filter((c) => Number.isInteger(c.age)).map((c) => c.age),
    avgAge = ages.length ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : null,
    retired = (p?.retired || []).filter((r) => r.year === last),
    notable = retired.filter((r) => r.rating >= 85 || r.team === s.team);
  return `<div class="sp-strip"><span class="sp-strip-k">${last} review</span><span class="sp-stat up"><b>▲ ${up}</b> improved</span><span class="sp-stat down"><b>▼ ${down}</b> declined</span><span class="sp-stat"><b>${moved.length - up - down}</b> steady</span>${avgAge ? `<span class="sp-stat"><b>${avgAge}</b> avg age</span>` : ""}${best && best.t.delta > 0 ? `<span class="sp-note">Biggest riser <b>${h(best.c.name)}</b> ${signed(best.t.delta)}</span>` : ""}${worst && worst.t.delta < 0 ? `<span class="sp-note">Biggest drop <b>${h(worst.c.name)}</b> ${signed(worst.t.delta)}</span>` : ""}<span class="sp-note" title="${h(notable.map((r) => `${r.name} (${r.role}, ${r.age}, ${r.rating})`).join("\n"))}">${retired.length} retirement${retired.length === 1 ? "" : "s"} league-wide${notable.length ? ` · ${notable.length} notable` : ""}</span></div>`;
}

// Coach career: your attributes and season-by-season growth.
export function coachGrowthPanel(s) {
  const f = s.franchise,
    p = f.userCoach;
  if (!p?.attributes) return "";
  const g = f.coachGrowth?.history || [],
    last = g[0],
    rating = coachRating(p.attributes),
    role = ["OC", "DC"].includes(f.role) ? f.role : "HC",
    focus = role === "OC" ? "offense first" : role === "DC" ? "defense first" : "balanced across the staff";
  const attrs = `<div class="sp-attrs">${COACH_ATTRIBUTES.map((k) => {
    const v = Number(p.attributes[k]) || 0,
      d = last?.changes?.[k] || 0;
    return `<div class="sp-attr"><span>${niceAttr(k)}</span>${fp.blocks(v, COACH_ATTRIBUTE_CAP, 10, v >= 17 ? "good" : v <= 8 ? "warn" : "")}<b>${v}</b>${d ? `<em class="${d > 0 ? "up" : "down"}">${signed(d)}</em>` : "<em></em>"}</div>`;
  }).join("")}</div>`;
  const rows = g.slice(0, 4).map(
    (e) =>
      `<li><span class="sp-hist-y"><b>${e.year}</b><small>${h(e.record || "")} · age ${e.age}</small></span><span class="sp-hist-c"><b class="${Object.values(e.changes || {}).some((d) => d < 0) ? "down" : Object.keys(e.changes || {}).length ? "up" : ""}">${h(coachGrowthLabel(e.changes))}</b><small title="${h((e.reasons || []).join(" · "))}">${h((e.reasons || []).join(" · ") || "No growth this season")}</small></span><span class="sp-hist-r">${e.ratingBefore}<i>→</i><b>${e.ratingAfter}</b></span></li>`,
  );
  const body = `<div class="sp-growth-top">${fp.tile("Coach rating", rating, last ? `${signed(last.ratingAfter - last.ratingBefore)} last season` : "Mean attributes × 5", { tone: rating >= 75 ? "good" : "", meter: fp.blocks(rating, 100, 10, rating >= 75 ? "good" : "") })}${fp.tile("Age", p.age, `${g.length} season review${g.length === 1 ? "" : "s"}`)}</div>${attrs}${
    g.length
      ? `<ul class="sp-hist">${rows.join("")}</ul>${g.length > 4 ? `<p class="fp-note">${g.length - 4} earlier season${g.length - 4 === 1 ? "" : "s"} in your record.</p>` : ""}`
      : `<p class="fp-note sp-empty">Your first season review arrives at training camp. Winning beyond expectations, deep playoff runs and players improving under you earn attribute points; as ${h(role === "HC" ? "head coach" : role === "OC" ? "offensive coordinator" : "defensive coordinator")} growth leans ${focus}.</p>`
  }<p class="fp-note">Up to 3 points a season, attributes cap at 20. Late in a long career a bad year can cost a point. Job offers and contract talks use this rating.</p>`;
  return fp.panel({ kicker: "COACH GROWTH", title: "Season reviews", body, extra: last ? fp.chip(coachGrowthLabel(last.changes), Object.keys(last.changes).length ? "good" : "") : fp.chip("First review at camp"), cls: "sp-growth" });
}
export { staffDistribution };
