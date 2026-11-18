// Inbox messages as pixel cards. New messages carry structured `data` (see the generators in
// franchise/newsroom, board-meetings, press-consequences, scouting, medical, contracts, market,
// draft-room, world and career-scenes); older saves only have plain text, so `cardData()`
// recovers the same structure from the title/body where it can and anything else falls back to
// ui/message-format. Pure string markup and DOM-free (tests run it in Node); the inbox passes a
// small context with lookups (players, logos, the coach's face). Styles: ui/message-cards.css.
import { pixelFace } from "./pixel-face.mjs";
import { formatMessage, inlineTone, unfold, metricDirection, metricTone } from "./message-format.mjs";

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fin = (n) => Number.isFinite(Number(n)) && n !== null && n !== "";
const num = (n, d = 0) => (fin(n) ? Number(n).toFixed(d) : "—");
const signed = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(Math.round(n * 10) / 10);
const clampN = (n, a, b) => Math.max(a, Math.min(b, n));

// Tone per metric lives in message-format (the plain formatter colours numbers the same way).
export { metricDirection, metricTone };
const parseNum = (s) => Number(String(s).replace(/[−–]/g, "-").replace(/[＋+]/g, ""));

/* ------------------------------------------------------------ text parsers (old saves) */
// "Lead. Changes: team morale +2, drama +7, Bo Nix: morale -6, trust -15." →
// { lead, groups: [{ name: "Team", rows: [{ label, delta }] }, { name: "Bo Nix", rows }] }
export function parseEffects(text) {
  const src = String(text ?? "");
  const at = src.search(/\b(?:Changes|What changed|Effects):\s/);
  if (at < 0) return null;
  const lead = src.slice(0, at).trim(),
    list = src.slice(at).replace(/^[^:]+:\s*/, "").replace(/\s*\.\s*$/, "");
  const groups = [];
  let group = null;
  for (const part of list.split(/,\s+/)) {
    const m = part.trim().match(/^(?:([^:]{2,40}):\s+)?(.+?)\s+([+＋−–-]?\d+(?:\.\d+)?)%?$/);
    if (!m) continue;
    const name = m[1]?.trim() || (group ? group.name : "Team");
    if (!group || group.name !== name) groups.push((group = { name, rows: [] }));
    const label = m[2].trim();
    group.rows.push({ label: label[0].toUpperCase() + label.slice(1), delta: parseNum(m[3]) });
  }
  return groups.length ? { lead, groups } : null;
}
// "Jordan Ellis · Gridiron Network. Answer one. Answer two." → { speaker, outlet, answers }.
// Old transcripts kept the two answers in one string; each scene has two prompts, so the
// sentences are shared out evenly between them.
export function parseTranscript(text) {
  const lines = String(text ?? "").trim().split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length > 1 && lines.slice(1).some((l) => /^A:\s/.test(l))) {
    const [speaker, outlet = ""] = lines[0].replace(/\.$/, "").split(/\s*·\s*/),
      questions = [],
      answers = [];
    for (const l of lines.slice(1)) {
      if (/^Q:\s/.test(l)) questions[answers.length] = l.slice(3).trim();
      else if (/^A:\s/.test(l)) answers.push(l.slice(3).trim().replace(/^["“]|["”]$/g, ""));
    }
    return { speaker, outlet, questions: Array.from({ length: answers.length }, (_, i) => questions[i] || ""), answers };
  }
  const m = String(text ?? "").trim().match(/^([^.·\n]{2,60}?)(?:\s*·\s*([^.\n]{2,60}?))?\.\s+([\s\S]+)$/);
  if (!m) return null;
  const rest = m[3].trim();
  let answers = rest.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  if (answers.length < 2) {
    const sentences = (rest.match(/[^.!?]+[.!?]+["”’]?|[^.!?]+$/g) || [rest]).map((x) => x.trim()).filter(Boolean);
    const cut = Math.ceil(sentences.length / 2);
    answers = sentences.length > 1 ? [sentences.slice(0, cut).join(" "), sentences.slice(cut).join(" ")] : sentences;
  }
  return { speaker: m[1].trim(), outlet: (m[2] || "").trim(), answers: answers.map((x) => x.replace(/^["“]|["”]$/g, "")) };
}
// Splits a body into a lead, "Heading:" sections of bullets and closing paragraphs.
function sections(body) {
  const out = { lead: [], parts: {}, tail: [] };
  const blocks = String(body ?? "").replace(/\r/g, "").split(/\n\s*\n/).flatMap((b) => unfold(b.trim()).split(/\n\s*\n/));
  let seen = false;
  for (const raw of blocks) {
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    const head = /:$/.test(lines[0]) && lines[0].length <= 40 && lines.length > 1 ? lines.shift().slice(0, -1) : "";
    const bullets = lines.filter((l) => /^[•\-*]\s+/.test(l)).map((l) => l.replace(/^[•\-*]\s+/, ""));
    if (head || bullets.length) {
      seen = true;
      out.parts[head || "Notes"] = bullets.length ? bullets : lines;
    } else (seen ? out.tail : out.lead).push(lines.join(" "));
  }
  return out;
}
const labelled = (line) => {
  const m = String(line).match(/^([A-Z][^:]{0,30}):\s+(.+)$/);
  return m ? [m[1].trim(), m[2].trim()] : [null, String(line).trim()];
};

/* ------------------------------------------------------------ what kind of message */
// Structured data on the message wins; otherwise recognise the frequent kinds by title/body.
export function cardData(m, ctx = {}) {
  if (!m) return null;
  if (m.data && typeof m.data === "object" && m.data.kind) return m.data;
  const title = String(m.title || ""),
    body = String(m.body || ""),
    summary = String(m.summary || "");
  if (/^Conversation:/.test(title)) {
    const t = parseTranscript(body);
    if (t) return { kind: "transcript", ...t, setting: /final whistle/i.test(title) ? "Postgame" : /lights come on/i.test(title) ? "Pregame" : "" };
  }
  const fx = parseEffects(body);
  if (fx) {
    const reaction = /reacts to your comments|Public promise/i.test(title) && fx.lead ? { playerId: m.playerId, text: fx.lead } : null;
    const claim = /^Earlier this week you said: "(.+?)"\.?\s/.exec(fx.lead)?.[1];
    return { kind: "effects", lead: reaction ? "" : claim ? "" : fx.lead, claim, reaction, groups: fx.groups.map((g, i) => (i > 0 && m.playerId && ctx.player?.(m.playerId)?.name === g.name ? { ...g, playerId: m.playerId } : g)) };
  }
  if (/^Medical update:|^Back in contention:|^Medical report$|^Injury aggravated$|^Cleared to return$|^Treatment decided$|^Medical staff decision$|^Surgical complication$/.test(title)) {
    const p = m.playerId ? ctx.player?.(m.playerId) : null,
      weeks = Number((summary.match(/(\d+) week/) || body.match(/out (\d+) weeks|(\d+)\s*weeks?\)/) || [])[1] ?? (body.match(/\((\d+) weeks\)/) || [])[1]),
      cleared = /Back in contention|Cleared to return/.test(title);
    return {
      kind: "injury",
      playerId: m.playerId || p?.id,
      name: p?.name || (title.split(": ")[1] || body.split(/[:.]/)[0]).trim(),
      pos: p?.pos,
      diagnosis: (summary.split(" · ")[0] !== summary ? summary.split(" · ")[0] : "") || p?.medical?.diagnosis || "",
      weeks: cleared ? 0 : fin(weeks) ? weeks : p?.injury ?? null,
      week: m.week,
      status: cleared ? "cleared" : /aggravated|complication/i.test(title) ? "setback" : "out",
      lead: /^Medical update:/.test(title) || cleared ? "" : body,
    };
  }
  if (/^Trade agreed$/.test(title)) {
    const t = body.match(/^(.+?) is exchanged for (.+?)\.$/) || body.match(/^(.+?) acquired from the (.+?) for (.+?)[.(]/);
    if (t) return t.length === 4 ? { kind: "transaction", type: "trade", incoming: [{ name: t[1] }], outgoing: [{ name: t[3] }], partner: t[2] } : { kind: "transaction", type: "trade", incoming: [{ name: t[2] }], outgoing: [{ name: t[1] }] };
    return { kind: "transaction", type: "trade", lead: body };
  }
  if (/^Contract extension agreed$/.test(title)) {
    const t = body.match(/^(.+?) commits to (\d+) additional seasons? from (\d{4})/);
    if (t) return { kind: "transaction", type: "extension", incoming: [{ name: t[1] }], terms: [{ label: "Added years", value: t[2] }, { label: "From", value: t[3] }] };
  }
  if (/^Free agent signed$/.test(title)) {
    const t = body.match(/^(.+?) accepted the (.+?) offer; \$([\d.]+)M annual base/);
    if (t) return { kind: "transaction", type: "signing", incoming: [{ name: t[1] }], terms: [{ label: "Base salary", value: `$${t[3]}M` }] };
  }
  if (/^Draft selection$/.test(title)) {
    const t = body.match(/^(.+?)(?: \(([A-Z]{1,4}), ([^)]+)\))? joins the franchise/);
    if (t) return { kind: "transaction", type: "draft", incoming: [{ name: t[1], pos: t[2], college: t[3] }] };
  }
  if (/^Player waived$/.test(title)) {
    const t = body.match(/^(.+?) enters waivers/);
    if (t) return { kind: "transaction", type: "waiver", outgoing: [{ name: t[1] }], lead: "Dead cap is retained in the ledger." };
  }
  if (/^Scouting report:/.test(title)) {
    const r = (re) => body.match(re);
    const ovr = r(/Overall ([\d–-]+) → ([\d–-]+)/), pot = r(/potential ([\d–-]+)/), conf = r(/Confidence (\d+)% → (\d+)%/), verdict = r(/Verdict: ([^.]+)\./);
    const list = (re) => (r(re)?.[1] || "").split(/,\s*/).filter((x) => x && x !== "not graded").map((x) => { const k = x.match(/^(.+?) ([\d–-]+)$/); return k ? { label: k[1], range: k[2] } : { label: x, range: "" }; });
    const who = r(/on (.+?) \(([A-Z]{1,4}), (\d+)\)/);
    return { kind: "scouting", playerId: m.playerId, scoutTeam: m.scoutTeam, name: who?.[1] || title.replace(/^Scouting report:\s*/, ""), pos: who?.[2], age: who?.[3], scout: m.source, before: ovr?.[1], ovr: ovr?.[2], pot: pot?.[1], verdict: verdict?.[1], strengths: list(/Strengths: ([^.]+)\./), concerns: list(/Concerns: ([^.]+)\./), confidence: conf ? [Number(conf[1]), Number(conf[2])] : null, exact: /match his true ratings/.test(body) };
  }
  if (/^Owner's expectations for/.test(title) || /^End-of-season review/.test(title)) {
    const s = sections(body),
      items = (s.parts.Targets || (s.parts.Notes && /review/i.test(title) ? s.parts.Notes : null) || []).map((x) => {
        const secondary = /\((secondary|optional)\)\s*$/i.test(x),
          done = /✓\s*$/.test(x),
          miss = /✗\s*$/.test(x),
          [label, progress] = labelled(x.replace(/\s*\((secondary|optional)\)\s*$/i, "").replace(/\s*[✓✗]\s*$/, ""));
        return { label: label || progress, progress: label ? progress : "", required: !secondary, state: done ? "done" : miss ? "missed" : "" };
      }),
      bands = (s.parts.Consequences || []).map((x) => { const [label, rest] = labelled(x); return { label: label || "", text: rest }; });
    const verdict = s.tail.find((x) => /^Verdict:/.test(x));
    return { kind: "targets", lead: s.lead.join(" "), items, bands, verdict: verdict?.replace(/^Verdict:\s*/, ""), note: s.tail.filter((x) => x !== verdict).join(" ") };
  }
  if (/^Checkpoint (met|missed)/.test(title)) {
    const t = body.match(/board meeting\. (.+?): (\d+) of (\d+) wins needed|board meeting\. (.+?): (\d+) young starters \(needed (\d+)\)/),
      sec = body.match(/Job security (\d+) → (\d+)/),
      fxs = [...body.matchAll(/(Owner patience|fan approval) ([+−–-]\d+)/gi)].map((x) => ({ label: x[1][0].toUpperCase() + x[1].slice(1), delta: parseNum(x[2]) }));
    if (t) return { kind: "checkpoint", met: /met/.test(title), measure: t[1] || t[4], value: Number(t[2] ?? t[5]), need: Number(t[3] ?? t[6]), unit: t[1] ? "wins" : "young starters", security: sec ? [Number(sec[1]), Number(sec[2])] : null, effects: fxs };
  }
  if (/^Board meeting:|^Captains ask for a team meeting/.test(title)) {
    const s = sections(body),
      lines = s.parts.Notes || [],
      why = [...s.lead, ...s.tail].find((x) => /^(Why now|What they raised):/.test(x));
    if (lines.length) return { kind: "meeting", lead: s.lead.filter((x) => x !== why).join(" "), facts: lines.flatMap(factsOf), reasons: why ? why.replace(/^[^:]+:\s*/, "").replace(/\.$/, "").split(/;\s*/) : [], note: s.tail.filter((x) => x !== why).join(" ") };
  }
  if (/^(A win for the franchise|A difficult result)$/.test(title)) {
    const t = body.match(/^(.+?) (\d+)[–-](\d+)\.?$/);
    if (t) return { kind: "score", name: t[1], us: Number(t[2]), them: Number(t[3]), team: m.team };
  }
  if (/^Practice standout:/.test(title)) {
    const g = summary.match(/([\d.]+)\s*\/\s*10/);
    return { kind: "training", playerId: m.playerId, grade: g ? Number(g[1]) : null, lead: "" };
  }
  if (/^Player meeting$/.test(title)) {
    const t = body.match(/^(.+?): (.+?)\. Morale ([+−–-]?\d+)\.?$/);
    if (t) return { kind: "effects", lead: `${t[2][0].toUpperCase()}${t[2].slice(1)}.`, groups: [{ name: t[1], rows: [{ label: "Morale", delta: parseNum(t[3]) }] }] };
  }
  return null;
}
// "Record: 2–5 after 7 games (target 10, on pace for 4.9)" / "Fan approval 41% · team morale 62% · drama 30"
function factsOf(line) {
  const [label, value] = labelled(line);
  if (label) return [{ label, value }];
  return value.split(/\s+·\s+/).map((x) => {
    const k = x.match(/^(.+?)\s+(-?[\d.]+%?)$/);
    return k ? { label: k[1][0].toUpperCase() + k[1].slice(1), value: k[2] } : { label: "", value: x };
  });
}

/* ------------------------------------------------------------ pixel parts */
const blocks = (lit, cells, tone = "") => `<span class="mc-blocks ${tone}" aria-hidden="true">${Array.from({ length: cells }, (_, i) => `<i${i < lit ? ' class="on"' : ""}></i>`).join("")}</span>`;
// Level meter 0..max as blocks, toned by how healthy the level is.
export const levelMeter = (v, { max = 100, cells = 10, tone } = {}) => {
  const n = fin(v) ? clampN(Math.round((v / max) * cells), 0, cells) : 0;
  return blocks(n, cells, tone || (v / max >= 0.65 ? "good" : v / max <= 0.4 ? "bad" : "warn"));
};
// Two-sided change meter: five cells each way from the centre, filled toward the change.
export function deltaMeter(delta, tone) {
  const d = Number(delta) || 0,
    n = d ? clampN(Math.ceil(Math.abs(d) / 3), 1, 5) : 0,
    cell = (side, i) => `<i${(side < 0 ? d < 0 && i >= 5 - n : d > 0 && i < n) ? ' class="on"' : ""}></i>`;
  return `<span class="mc-delta ${tone}" aria-hidden="true"><span>${Array.from({ length: 5 }, (_, i) => cell(-1, i)).join("")}</span><b></b><span>${Array.from({ length: 5 }, (_, i) => cell(1, i)).join("")}</span></span>`;
}
const WORD = { good: "Better", bad: "Worse", flat: "No change" };
export const toneChip = (label, delta) => {
  const t = metricTone(label, delta);
  return `<span class="mc-chip t-${t}">${fin(delta) && Number(delta) !== 0 ? signed(Number(delta)) : "0"}</span>`;
};
const chip = (text, tone = "") => (text ? `<span class="mc-tag${tone ? " t-" + tone : ""}">${esc(text)}</span>` : "");
const head = (title, aside = "", icon = "") => `<div class="mc-head">${icon ? `<span class="mc-glyph" aria-hidden="true">${icon}</span>` : ""}<h4>${esc(title)}</h4>${aside ? `<span class="mc-aside">${aside}</span>` : ""}</div>`;
const card = (kind, inner) => `<section class="mc-card mc-${kind}">${inner}</section>`;

function face(p, ctx, size = 44) {
  if (!p) return "";
  const live = p.id ? ctx.player?.(p.id) : p.name ? ctx.playerByName?.(p.name) : null;
  const who = live || (p.id || p.name ? { id: p.id || "msg-" + p.name, name: p.name, face: p.face } : null);
  if (!who) return "";
  return pixelFace(who, { size, team: live ? ctx.teamOf?.(live) ?? who.team ?? null : p.team ?? null });
}
const who = (p, ctx) => {
  const live = p?.id ? ctx.player?.(p.id) : p?.name ? ctx.playerByName?.(p.name) : null;
  return { ...(p || {}), ...(live ? { id: live.id, name: live.name, pos: live.realPosition || live.pos, ovr: live.ovr, age: live.age } : {}) };
};
const nameBtn = (p, text) => (p?.id ? `<button class="link mc-name" onclick="W.player('${esc(p.id)}')">${esc(text)}</button>` : `<b class="mc-name">${esc(text)}</b>`);

/* ------------------------------------------------------------ cards */
export function effectsCard(groups, ctx = {}, { title = "What changed" } = {}) {
  const rows = groups.flatMap((g) => g.rows || []);
  if (!rows.length) return "";
  const up = rows.filter((r) => metricTone(r.label, r.delta) === "good").length,
    down = rows.filter((r) => metricTone(r.label, r.delta) === "bad").length;
  const aside = `${up ? chip(`${up} better`, "good") : ""}${down ? chip(`${down} worse`, "bad") : ""}${!up && !down ? chip("No change", "flat") : ""}`;
  const group = (g) => {
    const p = g.playerId ? ctx.player?.(g.playerId) : null,
      label = p
        ? `<div class="mc-group mc-group-player">${face({ id: p.id }, ctx, 28)}${nameBtn(p, p.name)}<small>${esc(p.realPosition || p.pos || "")}</small></div>`
        : groups.length > 1 || g.name !== "Team" ? `<div class="mc-group">${esc(g.name)}</div>` : "";
    return `${label}<div class="mc-rows">${(g.rows || [])
      .map((r) => {
        const t = metricTone(r.label, r.delta),
          now = fin(r.value) ? r.value : p && /morale/i.test(r.label) ? p.morale : p && /trust/i.test(r.label) ? p.coachTrust : null;
        return `<div class="mc-row t-${t}"><span class="mc-row-label">${esc(r.label)}${fin(now) ? `<small>now ${num(now)}</small>` : ""}</span>${deltaMeter(r.delta, "t-" + t)}${toneChip(r.label, r.delta)}<span class="mc-word">${WORD[t]}</span></div>`;
      })
      .join("")}</div>`;
  };
  return card("effects", head(title, aside, "±") + `<div class="mc-body">${groups.map(group).join("")}</div>`);
}
export function quoteCard(q, ctx = {}, { label = "", faceHtml = "" } = {}) {
  if (!q?.text) return "";
  const p = q.playerId ? ctx.player?.(q.playerId) : null,
    name = q.name || p?.name || "";
  return `<figure class="mc-quote">${faceHtml || face(p ? { id: p.id } : name ? { name } : null, ctx, 48) || '<span class="mc-quote-mark" aria-hidden="true">“</span>'}<div><blockquote>${esc(q.text)}</blockquote>${name || label ? `<figcaption>${name ? nameBtn(p, name) : ""}${p ? `<small>${esc(p.realPosition || p.pos)}</small>` : ""}${label ? chip(label) : ""}</figcaption>` : ""}</div></figure>`;
}
export function transcriptCard(t, ctx = {}) {
  // The reporter wears the same pixel face as in the press-room scene (career-scenes: "reporter-jordan").
  const live = t.playerId ? ctx.player?.(t.playerId) : null,
    reporterId = t.reporterId || (/^Jordan Ellis/.test(t.speaker || "") ? "reporter-jordan" : "press-" + String(t.speaker || "reporter").toLowerCase().replace(/[^a-z]+/g, "-")),
    speakerFace = live ? pixelFace(live, { size: 40, team: ctx.teamOf?.(live) ?? ctx.team ?? null }) : pixelFace({ id: reporterId, name: t.speaker }, { size: 40 });
  const qs = Array.isArray(t.questions) ? t.questions : [],
    as = (Array.isArray(t.answers) ? t.answers : []).map((a) => (typeof a === "string" ? { text: a } : a)).filter((a) => a?.text),
    n = Math.max(qs.length, as.length);
  const coach = ctx.coachFace ? `<span class="mc-coach-face">${ctx.coachFace}</span>` : "";
  const pairs = Array.from({ length: n }, (_, i) =>
    `${qs[i] ? `<div class="mc-q"><span class="mc-key">Q${n > 1 ? i + 1 : ""}</span><p>${esc(qs[i])}</p></div>` : ""}${as[i] ? `<div class="mc-a">${coach}<div class="mc-a-copy"><span class="mc-a-who">${esc(ctx.coachName || "You")}${as[i].tone ? chip(as[i].tone) : ""}</span><blockquote>${esc(as[i].text)}</blockquote></div></div>` : ""}`,
  ).join("");
  return card(
    "transcript",
    `<div class="mc-head mc-press-head">${speakerFace}<span class="mc-press-who"><b>${esc(t.speaker || "Reporter")}</b><small>${esc(t.outlet || (live ? [live.realPosition || live.pos, "Private meeting"].filter(Boolean).join(" · ") : t.setting === "Private" ? "Private meeting" : ""))}</small></span>${t.setting ? chip(t.setting) : ""}</div><div class="mc-body mc-qa">${pairs || '<p class="mc-note">No answers were recorded.</p>'}</div>`,
  );
}
const BODY = [
  [/hamstring|quad|groin|calf|thigh|leg|fibula|tibia/i, "Leg", "leg"],
  [/knee|acl|mcl|pcl|meniscus/i, "Knee", "knee"],
  [/ankle|foot|toe|achilles|heel/i, "Ankle / foot", "foot"],
  [/shoulder|collarbone|clavicle|rotator|ac joint/i, "Shoulder", "shoulder"],
  [/concussion|head|jaw|eye|face/i, "Head", "head"],
  [/back|spine|lumbar/i, "Back", "torso"],
  [/hand|wrist|finger|thumb/i, "Hand", "hand"],
  [/rib|chest|pectoral|sternum|abdominal|oblique/i, "Chest", "torso"],
  [/hip|pelvis/i, "Hip", "hip"],
  [/elbow|arm|bicep|tricep|forearm/i, "Arm", "arm"],
  [/neck|stinger/i, "Neck", "head"],
];
export const bodyPart = (diagnosis) => BODY.find(([re]) => re.test(diagnosis || "")) || null;
// A 9×15 pixel figure with the injured area lit.
function bodyFigure(zone) {
  const parts = { head: [[3, 0, 3, 3]], torso: [[2, 3, 5, 5]], shoulder: [[1, 3, 2, 2], [6, 3, 2, 2]], arm: [[0, 4, 2, 5], [7, 4, 2, 5]], hand: [[0, 9, 2, 1], [7, 9, 2, 1]], hip: [[2, 8, 5, 1]], leg: [[2, 9, 2, 4], [5, 9, 2, 4]], knee: [[2, 11, 2, 1], [5, 11, 2, 1]], foot: [[2, 13, 2, 2], [5, 13, 2, 2]] };
  const base = [[3, 0, 3, 3], [2, 3, 5, 6], [0, 4, 2, 6], [7, 4, 2, 6], [2, 9, 2, 6], [5, 9, 2, 6]];
  const rect = ([x, y, w, h], cls) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="${cls}"/>`;
  return `<svg class="mc-figure" viewBox="0 0 9 15" width="36" height="60" shape-rendering="crispEdges" aria-hidden="true">${base.map((r) => rect(r, "b")).join("")}${(parts[zone] || []).map((r) => rect(r, "hit")).join("")}</svg>`;
}
export function injuryCard(d, ctx = {}) {
  const p = d.playerId ? ctx.player?.(d.playerId) : null,
    name = p?.name || d.name || "Player",
    pos = p?.realPosition || p?.pos || d.pos || "",
    diagnosis = d.diagnosis || p?.medical?.diagnosis || "",
    part = bodyPart(d.bodyPart) || bodyPart(diagnosis),
    cleared = d.status === "cleared",
    reported = cleared ? 0 : fin(d.weeks) ? Number(d.weeks) : fin(p?.injury) ? Number(p.injury) : null,
    // Weeks left now (the player's live record while he is still out), progress against the report.
    weeks = cleared ? 0 : fin(p?.injury) && p.injury > 0 && p.injury <= (reported ?? 99) ? Number(p.injury) : reported,
    total = fin(d.total) && d.total > 0 ? Number(d.total) : reported || 1,
    done = cleared ? total : clampN(total - (weeks ?? total), 0, total),
    back = fin(d.returnWeek) ? d.returnWeek : fin(reported) && fin(d.week) ? d.week + 1 + reported : null,
    status = cleared ? chip("Cleared", "good") : d.status === "setback" ? chip("Setback", "bad") : chip(weeks === 0 ? "Available" : "Out", weeks === 0 ? "warn" : "bad");
  return card(
    "injury",
    head(cleared ? "Return to play" : "Injury report", status, "+") +
      `<div class="mc-body mc-split"><div class="mc-ident">${face(p ? { id: p.id } : { name }, ctx, 56)}<div><span class="mc-ident-name">${nameBtn(p, name)}</span><small>${esc([pos, p?.age ? `Age ${p.age}` : ""].filter(Boolean).join(" · "))}</small><div class="mc-tags">${diagnosis ? chip(diagnosis, cleared ? "" : "bad") : ""}${part ? chip(part[1]) : ""}${d.treatment ? chip(d.treatment) : ""}</div></div>${bodyFigure(part?.[2])}</div>` +
      `<div class="mc-stats"><div class="mc-stat"><small>${cleared ? "Status" : "Weeks out"}</small><b>${cleared ? "Fit" : fin(weeks) ? weeks : "—"}</b>${!cleared && Array.isArray(d.estimate) && fin(d.estimate[0]) ? `<span class="mc-meter-note">Doctor: ${num(d.estimate[0])}–${num(d.estimate[1])} wks</span>` : !cleared && fin(reported) && reported !== weeks ? `<span class="mc-meter-note">${reported} at report</span>` : ""}</div><div class="mc-stat"><small>${cleared ? "Next step" : "Est. return"}</small><b>${cleared ? "Build load" : back ? `Wk ${back}` : "TBC"}</b></div><div class="mc-stat mc-stat-wide"><small>Recovery</small>${levelMeter(cleared ? 100 : (done / total) * 100, { tone: cleared ? "good" : "warn" })}<span class="mc-meter-note">${cleared ? "Complete" : `${Math.round((done / total) * 100)}%`}</span></div></div></div>`,
  );
}
const TX = { trade: ["Trade completed", "⇄"], signing: ["Free agent signed", "+"], extension: ["Contract extension", "✎"], draft: ["Draft selection", "★"], waiver: ["Player waived", "−"], tag: ["Franchise tag", "#"], release: ["Player released", "−"], offer: ["Trade offer", "?"] };
export function transactionCard(d, ctx = {}) {
  const [title, glyph] = TX[d.type] || ["Transaction", "⇄"];
  const person = (p) => {
    const q = who(p, ctx);
    const pick = /draft pick/i.test(q.pos || "");
    return `<div class="mc-person${pick ? " is-pick" : ""}">${pick ? '<span class="mc-pick" aria-hidden="true">PK</span>' : face(q.id ? { id: q.id } : q, ctx, 44)}<div><span class="mc-ident-name">${nameBtn(q.id ? q : null, q.name || "Player")}</span><small>${esc([q.pos, fin(q.age) ? `Age ${q.age}` : "", q.college].filter(Boolean).join(" · "))}</small></div>${fin(q.ovr) ? `<span class="mc-ovr"><small>OVR</small>${num(q.ovr)}</span>` : ""}</div>`;
  };
  const side = (label, list, tone) => (list?.length ? `<div class="mc-side"><span class="mc-side-label t-${tone}">${label}</span>${list.map(person).join("")}</div>` : "");
  const trade = d.type === "trade" || d.type === "offer";
  const people = trade
    ? `<div class="mc-swap">${side("Incoming", d.incoming, "good")}<span class="mc-swap-arrow" aria-hidden="true">⇄</span>${side("Outgoing", d.outgoing, "bad")}</div>`
    : `${(d.incoming || []).map(person).join("")}${(d.outgoing || []).map(person).join("")}`;
  const terms = (d.terms || []).filter((t) => t && t.value !== undefined && t.value !== null && t.value !== "").map((t) => `<div class="mc-term${t.tone ? " t-" + t.tone : ""}"><small>${esc(t.label)}</small><b>${esc(t.value)}</b></div>`).join("");
  return card("transaction", head(title, d.partner ? chip(d.partner) : "", glyph) + `<div class="mc-body">${people}${terms ? `<div class="mc-terms">${terms}</div>` : ""}${d.note ? `<p class="mc-note">${esc(d.note)}</p>` : ""}</div>`);
}
// A range bar on the 40–99 rating scale: the band of the estimate lit.
function rangeBar(range, { min = 40, max = 99, cells = 20 } = {}) {
  const [lo, hi] = String(range ?? "").split(/[–-]/).map(Number);
  if (!fin(lo)) return "";
  const top = fin(hi) ? hi : lo,
    a = Math.floor(((lo - min) / (max - min)) * cells),
    b = Math.ceil(((top - min) / (max - min)) * cells);
  return `<span class="mc-blocks mc-range" aria-hidden="true">${Array.from({ length: cells }, (_, i) => `<i${i >= a && i < Math.max(b, a + 1) ? ' class="on"' : ""}></i>`).join("")}</span>`;
}
export function scoutingCard(d, ctx = {}) {
  const p = who({ id: d.playerId, name: d.name, pos: d.pos, age: d.age }, ctx);
  const attr = (list, tone) => (list || []).map((a) => `<span class="mc-attr t-${tone}"><span>${esc(a.label)}</span><b>${esc(a.range)}</b></span>`).join("");
  const conf = Array.isArray(d.confidence) ? d.confidence : null;
  return card(
    "scouting",
    head("Scouting report", d.verdict ? chip(d.verdict, "good") : "", "◎") +
      `<div class="mc-body"><div class="mc-ident">${face(p.id ? { id: p.id } : p, ctx, 56)}<div><span class="mc-ident-name">${nameBtn(p.id ? p : null, p.name || "Prospect")}</span><small>${esc([p.pos, fin(p.age) ? `Age ${p.age}` : "", d.scout ? `Filed by ${d.scout}` : ""].filter(Boolean).join(" · "))}</small></div></div>` +
      `<div class="mc-grades"><div class="mc-grade"><small>Overall</small><b>${esc(d.ovr ?? "—")}</b>${rangeBar(d.ovr)}${d.before && d.before !== d.ovr ? `<span class="mc-meter-note">was ${esc(d.before)}</span>` : ""}</div><div class="mc-grade"><small>Potential</small><b>${esc(d.pot ?? "—")}</b>${rangeBar(d.pot)}</div>${conf ? `<div class="mc-grade"><small>Confidence</small><b>${num(conf[1])}%</b>${levelMeter(conf[1], { tone: "team" })}<span class="mc-meter-note">${conf[1] > conf[0] ? `+${conf[1] - conf[0]} from ${conf[0]}%` : ""}</span></div>` : ""}</div>` +
      `${d.strengths?.length ? `<div class="mc-attrs"><span class="mc-side-label t-good">Strengths</span>${attr(d.strengths, "good")}</div>` : ""}${d.concerns?.length ? `<div class="mc-attrs"><span class="mc-side-label t-bad">Concerns</span>${attr(d.concerns, "bad")}</div>` : ""}<p class="mc-note">${d.exact ? "Our grades now match his true ratings." : "Another report would narrow the ranges further."}</p></div>`,
  );
}
const STATE = { done: ["Met", "good"], on: ["On track", "good"], missed: ["Missed", "bad"], off: ["Behind", "bad"], risk: ["At risk", "warn"], at: ["At risk", "warn"], open: ["Open", ""] };
export function targetsCard(d) {
  const items = (d.items || [])
    .map((x) => {
      const st = STATE[x.state] || null;
      return `<div class="mc-target${st ? " t-" + st[1] : ""}"><div class="mc-target-top">${chip(x.required === false ? "Secondary" : "Required", x.required === false ? "" : "warn")}${st ? chip(st[0], st[1]) : ""}</div><b>${esc(x.label)}</b>${x.progress ? `<small>${esc(x.progress)}</small>` : ""}</div>`;
    })
    .join("");
  const bandTone = (l) => (/^exceed/i.test(l) ? "good" : /^meet/i.test(l) ? "warn" : /^miss/i.test(l) ? "bad" : "");
  const bands = (d.bands || []).map((b) => `<div class="mc-band"><span class="mc-tag t-${bandTone(b.label)}">${esc(b.label)}</span><span>${inlineTone(b.text)}</span></div>`).join("");
  const facts = (d.facts || []).map((f) => `<div class="mc-stat"><small>${esc(f.label)}</small><b>${esc(f.value)}</b></div>`).join("");
  return card(
    "targets",
    head(d.title || "Season targets", d.mandate ? chip(d.mandate + " mandate") : d.verdict ? chip(d.verdict, /exceed/i.test(d.verdict) ? "good" : /missed/i.test(d.verdict) ? "bad" : "warn") : "", "◆") +
      `<div class="mc-body">${facts ? `<div class="mc-stats">${facts}</div>` : ""}${items ? `<div class="mc-target-list">${items}</div>` : ""}${bands ? `<div class="mc-subhead">Consequences</div><div class="mc-bands">${bands}</div>` : ""}</div>`,
  );
}
export function checkpointCard(d, ctx = {}) {
  const met = !!d.met;
  const sec = Array.isArray(d.security) ? d.security : null;
  return card(
    "checkpoint",
    head("Board checkpoint", chip(met ? "Met" : "Missed", met ? "good" : "bad"), "◆") +
      `<div class="mc-body"><div class="mc-target t-${met ? "good" : "bad"}"><b>${esc(d.measure || "Agreed plan")}</b><div class="mc-progress">${blocks(clampN(Number(d.value) || 0, 0, Number(d.need) || 1), Math.max(1, Number(d.need) || 1), met ? "good" : "bad")}<span>${num(d.value)} of ${num(d.need)} ${esc(d.unit || "")}</span></div></div>${sec ? `<div class="mc-stats"><div class="mc-stat mc-stat-wide"><small>Job security</small><b>${num(sec[0])} → ${num(sec[1])}</b>${levelMeter(sec[1])}</div></div>` : ""}</div>`,
  ) + (d.effects?.length ? effectsCard([{ name: "Team", rows: d.effects }], ctx) : "");
}
export function meetingCard(d) {
  const meter = (f) => {
    const m = String(f.value).match(/^(\d+)%/);
    return m ? levelMeter(Number(m[1]), { tone: /drama/i.test(f.label) ? (Number(m[1]) >= 40 ? "bad" : "good") : undefined }) : "";
  };
  const facts = (d.facts || []).filter((f) => f.value !== undefined && f.value !== "").map((f) => `<div class="mc-stat"><small>${esc(f.label || "Note")}</small><b>${esc(f.value)}</b>${meter(f)}</div>`).join("");
  const reasons = (d.reasons || []).filter(Boolean).map((r) => `<li>${esc(r[0].toUpperCase() + r.slice(1))}</li>`).join("");
  return card("meeting", head(d.title || "The numbers", d.status ? chip(d.status, d.statusTone || "warn") : "", "▤") + `<div class="mc-body">${facts ? `<div class="mc-stats">${facts}</div>` : ""}${reasons ? `<div class="mc-subhead">${esc(d.reasonsLabel || "Why now")}</div><ul class="mc-reasons">${reasons}</ul>` : ""}</div>`);
}
export function scoreCard(d, ctx = {}) {
  const us = Number(d.us), them = Number(d.them);
  if (!fin(us) || !fin(them)) return "";
  const res = us > them ? ["Win", "good"] : us < them ? ["Loss", "bad"] : ["Tie", "warn"];
  const side = (t, label, score, mine) => `<div class="mc-team${mine ? " is-me" : ""}">${fin(t) && ctx.logo ? ctx.logo(t) : `<span class="mc-crest">${esc(String(label || "?").slice(0, 3).toUpperCase())}</span>`}<span>${esc(label || "Opponent")}</span><b>${score}</b></div>`;
  const mine = d.team ?? ctx.team,
    name = d.name || (fin(mine) && ctx.teamName ? ctx.teamName(mine) : "Your club"),
    opp = d.oppName || (fin(d.opp) && ctx.teamName ? ctx.teamName(d.opp) : "Opponent");
  return card("score", head("Final score", chip(res[0], res[1]) + (d.label ? chip(d.label) : ""), "▣") + `<div class="mc-body mc-scoreline">${side(mine, name, us, true)}<span class="mc-dash" aria-hidden="true">–</span>${side(d.opp, opp, them, false)}</div>`);
}
export function trainingCard(d, ctx = {}) {
  const p = d.playerId ? ctx.player?.(d.playerId) : null,
    g = Number(d.grade),
    ovr = fin(d.ovr) ? d.ovr : p?.ovr,
    attrs = (d.attributes || []).filter((a) => a && fin(a.delta) && a.delta !== 0);
  return card(
    "training",
    head("Practice report", fin(g) ? chip(g >= 8 ? "Standout" : g >= 7 ? "Strong" : "Steady", g >= 7 ? "good" : "warn") : "", "▲") +
      `<div class="mc-body mc-split"><div class="mc-ident">${face(p ? { id: p.id } : d.name ? { name: d.name } : null, ctx, 56)}<div><span class="mc-ident-name">${nameBtn(p, p?.name || d.name || "Player")}</span><small>${esc([p?.realPosition || p?.pos || d.pos, p?.age ? `Age ${p.age}` : ""].filter(Boolean).join(" · "))}</small>${d.reasons?.length ? `<div class="mc-tags">${d.reasons.map((r) => chip(r)).join("")}</div>` : ""}</div>${fin(ovr) ? `<span class="mc-ovr"><small>OVR</small>${num(ovr)}</span>` : ""}</div>` +
      `<div class="mc-stats"><div class="mc-stat mc-stat-wide"><small>Training grade</small><b>${fin(g) ? g.toFixed(1) : "—"}<span class="mc-of"> / 10</span></b>${fin(g) ? levelMeter(g * 10, { tone: g >= 7 ? "good" : "warn" }) : ""}</div>${fin(d.delta) ? `<div class="mc-stat"><small>Ability change</small><b class="mc-tone-${metricTone("ability", d.delta)}">${d.delta > 0 ? "+" : ""}${num(d.delta, 1)}</b></div>` : ""}${fin(d.form) ? `<div class="mc-stat"><small>Match form</small><b>${num(d.form, 1)}<span class="mc-of"> / 10</span></b></div>` : ""}${d.focus ? `<div class="mc-stat"><small>Focus</small><b>${esc(d.focus)}</b></div>` : ""}</div>` +
      `${attrs.length ? `<div class="mc-attrs"><span class="mc-side-label t-good">Moving</span>${attrs.map((a) => `<span class="mc-attr t-${metricTone(a.label, a.delta)}"><span>${esc(a.label)}</span><b>${a.delta > 0 ? "+" : ""}${Math.round(a.delta * 100) / 100}</b></span>`).join("")}</div>` : ""}</div>`,
  );
}

/* ------------------------------------------------------------ entry point */
// → { html, cards, coversPlayer }. `cards` is false when the plain formatter was used.
export function renderMessageBody(m, ctx = {}) {
  let d = null;
  try {
    d = cardData(m, ctx);
  } catch {
    d = null;
  }
  const lead = (t) => (t ? `<p class="mf-p mf-lead">${inlineTone(t)}</p>` : "");
  const note = (t) => (t ? `<p class="mf-p">${inlineTone(t)}</p>` : "");
  let html = "",
    covers = false;
  if (d) {
    switch (d.kind) {
      case "press":
      case "effects": {
        const claim = d.claim ? quoteCard({ text: `“${String(d.claim).replace(/^["“]+|["”]+$/g, "").replace(/([^.!?])$/, "$1.")}”`, name: ctx.coachName || "You" }, ctx, { label: "Your words", faceHtml: ctx.coachFace ? `<span class="mc-coach-face">${ctx.coachFace}</span>` : "" }).replace('class="mc-quote"', 'class="mc-quote mc-quote-coach"') : "";
        const reaction = d.reaction?.text ? quoteCard(d.reaction, ctx, { label: "Reaction" }) : "";
        html = lead(d.lead) + (d.claim ? `<p class="mf-p mf-lead">${esc(d.claimNote || "Earlier this week you said this. The result did not back it up.")}</p>` : "") + claim + reaction + effectsCard(d.groups || [], ctx) + note(d.note);
        covers = (d.groups || []).some((g) => g.playerId && g.playerId === m.playerId);
        break;
      }
      case "transcript":
        html = lead(d.lead) + transcriptCard(d, ctx);
        break;
      case "injury":
        html = lead(d.lead) + injuryCard(d, ctx) + note(d.note);
        covers = !!d.playerId && d.playerId === m.playerId;
        break;
      case "transaction":
        html = lead(d.lead) + transactionCard(d, ctx);
        break;
      case "scouting":
        html = lead(d.lead) + scoutingCard(d, ctx);
        break;
      case "targets":
        html = lead(d.lead) + targetsCard(d, ctx) + note(d.note);
        break;
      case "checkpoint":
        html = lead(d.lead) + checkpointCard(d, ctx) + note(d.note);
        break;
      case "meeting":
        html = lead(d.lead) + meetingCard(d, ctx) + note(d.note);
        break;
      case "score":
        html = lead(d.lead) + scoreCard(d, ctx);
        break;
      case "training":
        html = lead(d.lead) + trainingCard(d, ctx) + note(d.note ?? (m.body && !d.lead ? m.body : ""));
        covers = !!d.playerId && d.playerId === m.playerId;
        break;
      default:
        html = "";
    }
  }
  if (!html || /undefined|NaN/.test(html.replace(/<[^>]+>/g, " ").replace(/\b(?:id|class)="[^"]*"/g, ""))) return { html: formatMessage(m?.body), cards: false, coversPlayer: false, kind: null };
  return { html: `<div class="mf mc">${html}</div>`, cards: true, coversPlayer: covers, kind: d.kind };
}
// The inbox loads this stylesheet the first time a card renders.
export function loadMessageCardStyles() {
  if (typeof document !== "undefined" && typeof document.querySelector === "function" && !document.querySelector('link[href="ui/message-cards.css"]')) document.head?.insertAdjacentHTML?.("beforeend", '<link rel="stylesheet" href="ui/message-cards.css">');
}
