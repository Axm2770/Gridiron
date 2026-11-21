// Postgame report dialog (match.js postgameReport): a pixel scoreboard, quarter line, paired stat bars
// and key plays as cards, instead of a plain box score and a run-on sentence of highlights.
// postgameModel() is pure (tested in test-postgame-report.mjs); postgameHTML() renders it.

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

const STATS = [
  ["yards", "Total yards"],
  ["pass", "Passing yards"],
  ["rush", "Rushing yards"],
  ["first", "First downs"],
  ["turnovers", "Turnovers", true],
  ["plays", "Plays"],
];
const TAGS = [
  [/TOUCHDOWN/i, "TD"],
  [/INTERCEPT/i, "INT"],
  [/FUMBLE/i, "FUM"],
  [/SAFETY/i, "SAF"],
  [/FIELD GOAL (IS )?GOOD|FIELD GOAL\b(?!.*(NO GOOD|MISSED))/i, "FG"],
  [/SACK/i, "SACK"],
];

/**
 * m: state.lastMatch ({ a, b, score, periodScores, stats, events, plays }); a is the home side.
 * club(t) → { abbr, name } for a club index; user: the career club index.
 */
export function postgameModel(m, { club = (t) => ({ abbr: `T${t + 1}`, name: `Team ${t + 1}` }), user = -1 } = {}) {
  const sides = [m.a, m.b].map((t, k) => ({ team: t, ...club(t), score: num(m.score?.[k]), home: k === 0, user: t === user }));
  const [home, away] = sides,
    winner = home.score === away.score ? -1 : home.score > away.score ? 0 : 1,
    periods = (m.periodScores || []).map((q, i) => ({ label: i < 4 ? `Q${i + 1}` : `OT${i > 4 ? i - 3 : ""}`, home: num(q?.[0]), away: num(q?.[1]) }));
  const compare = STATS.filter(([k]) => m.stats?.[0]?.[k] != null || m.stats?.[1]?.[k] != null).map(([key, label, lowerBetter]) => {
    const h = num(m.stats?.[0]?.[key]),
      a = num(m.stats?.[1]?.[key]),
      max = Math.max(h, a, 1);
    return { key, label, home: h, away: a, homePct: Math.round((h / max) * 100), awayPct: Math.round((a / max) * 100), better: h === a ? -1 : (h > a) !== !!lowerBetter ? 0 : 1 };
  });
  const userSide = sides.findIndex((x) => x.user);
  return {
    home,
    away,
    winner,
    overtime: periods.length > 4,
    result: userSide < 0 ? null : winner < 0 ? "TIE" : winner === userSide ? "WIN" : "LOSS",
    periods,
    compare,
    plays: keyPlays(m.events || [], sides),
    total: num(m.plays),
  };
}

// Highlights in game order, deduplicated, with the scoring side resolved from "Team 17:" or "DAL:" prefixes.
export function keyPlays(events, sides, limit = 6) {
  const seen = new Set(),
    out = [];
  for (const ev of [...events].reverse()) {
    if (!ev?.highlight) continue;
    let text = String(ev.text || "").trim(),
      side = -1;
    const pre = /^(?:Team (\d+)|([A-Z]{2,4}))\s*:?\s+/.exec(text);
    if (pre) {
      const idx = pre[1] ? sides.findIndex((s) => s.team === Number(pre[1]) - 1) : sides.findIndex((s) => s.abbr === pre[2]);
      if (idx >= 0 || pre[1]) {
        side = idx;
        text = text.slice(pre[0].length);
      }
    }
    text = text
      .replace(/\s*Extra point good\.?/i, "")
      .replace(/^makes? a (\d+)-yard field goal!?/i, "$1-yard field goal is good!")
      .replace(/\s+/g, " ")
      .trim();
    text = text.charAt(0).toUpperCase() + text.slice(1);
    if (!text) continue;
    const key = `${ev.time}|${side}|${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const tag = TAGS.find(([re]) => re.test(text))?.[1] || "";
    // Sentence case for engine shouting ("INTERCEPTED!" → "Intercepted!").
    text = text.replace(/\b([A-Z]{4,})\b/g, (w) => w[0] + w.slice(1).toLowerCase());
    out.push({ time: ev.time || "", side, abbr: side >= 0 ? sides[side].abbr : "", text, tag });
  }
  return out.slice(-limit);
}

export function postgameHTML(md, { logo = () => "", actions = "", phase = "final" } = {}) {
  const half = phase === "half";
  const team = (s, k) =>
    `<div class="pg-team ${md.winner === k ? "win" : ""} ${s.user ? "me" : ""}">${logo(s.team)}<span><b>${esc(s.name)}</b><small>${s.home ? "Home" : "Away"}${s.user ? " · your club" : ""}</small></span></div>`;
  // At halftime the chip reads the state of play instead of a result.
  const halfChip = md.result ? { WIN: "LEADING", LOSS: "TRAILING", TIE: "TIED" }[md.result] : "",
    resultChip = md.result ? `<span class="pg-result ${half ? { WIN: "win", LOSS: "loss", TIE: "tie" }[md.result] : md.result.toLowerCase()}">${half ? halfChip : md.result}</span>` : "";
  const quarters = `<table class="pg-quarters"><thead><tr><th>Team</th>${md.periods.map((p) => `<th>${p.label}</th>`).join("")}<th>${half ? "Half" : "Final"}</th></tr></thead><tbody>${[
    [md.home, "home", 0],
    [md.away, "away", 1],
  ]
    .map(([s, k, i]) => `<tr class="${s.user ? "me" : ""}"><td>${esc(s.abbr)}</td>${md.periods.map((p) => `<td>${p[k]}</td>`).join("")}<td class="${md.winner === i ? "win" : ""}">${s.score}</td></tr>`)
    .join("")}</tbody></table>`;
  const bars = md.compare
    .map(
      (c) =>
        `<div class="pg-stat"><b class="${c.better === 0 ? "lead" : ""}">${c.home}</b><span class="pg-bar l"><i style="width:${c.homePct}%"></i></span><small>${esc(c.label)}</small><span class="pg-bar r"><i style="width:${c.awayPct}%"></i></span><b class="${c.better === 1 ? "lead" : ""}">${c.away}</b></div>`,
    )
    .join("");
  const plays = md.plays.length
    ? md.plays
        .map(
          (p) =>
            `<li class="pg-play ${p.side >= 0 && [md.home, md.away][p.side]?.user ? "me" : ""}"><time>${esc(p.time)}</time>${p.abbr ? `<span class="pg-abbr">${esc(p.abbr)}</span>` : ""}<span class="pg-text">${esc(p.text)}</span>${p.tag ? `<em class="pg-tag ${p.tag.toLowerCase()}">${p.tag}</em>` : ""}</li>`,
        )
        .join("")
    : `<li class="pg-play empty"><span class="pg-text">No scoring plays or turnovers recorded.</span></li>`;
  return `<div class="pg-report${half ? " pg-half" : ""}"><div class="pg-head"><span class="pg-kicker">${half ? "Halftime report · End of Q2" : `Postgame report · Final${md.overtime ? " / OT" : ""}`}</span>${resultChip}</div><div class="pg-board">${team(md.home, 0)}<div class="pg-score"><b class="${md.winner === 0 ? "win" : ""}">${md.home.score}</b><i>–</i><b class="${md.winner === 1 ? "win" : ""}">${md.away.score}</b></div>${team(md.away, 1)}</div>${quarters}<div class="pg-cols"><section class="pg-box"><h4>Team stats <small>${esc(md.home.abbr)} · ${esc(md.away.abbr)}</small></h4><div class="pg-stats">${bars}</div></section><section class="pg-box"><h4>${half ? "First-half plays" : "Key plays"} <small>${md.total} snaps</small></h4><ol class="pg-plays">${plays}</ol></section></div>${actions ? `<div class="modal-actions pg-actions">${actions}</div>` : ""}</div>`;
}

const halftimeShown = new Set();
/** The halftime card for the live match; repeat=false shows it only once per game. */
export function halftimeReport(win = globalThis, { repeat = true } = {}) {
  const st = typeof state !== "undefined" ? state : win.state; // eslint-disable-line no-undef
  const table = typeof clubs !== "undefined" ? clubs : win.clubs || []; // eslint-disable-line no-undef
  const m = st?.live;
  if (!m?.halftime || typeof win.modal !== "function") return false;
  const key = `${st.year}-${st.week}-${m.a}-${m.b}`;
  if (!repeat && halftimeShown.has(key)) return false;
  halftimeShown.add(key);
  // Only the first two quarters have been played.
  const firstHalf = { ...m, periodScores: (m.periodScores || []).slice(0, 2) };
  const md = postgameModel(firstHalf, { club: (t) => ({ abbr: table[t]?.[0] || `T${t + 1}`, name: table[t]?.[2] || table[t]?.[1] || `Team ${t + 1}` }), user: st.team });
  const actions = `<button class="secondary" onclick="closeModal()">Back to the sideline</button><button onclick="closeModal();halftimeTalk()">Enter the locker room →</button>`;
  win.modal(postgameHTML(md, { logo: (t) => (typeof win.logo === "function" ? win.logo(t, "pg-logo") : ""), actions, phase: "half" }));
  return true;
}
/** Called after each matchday render: pops the halftime card once, after any open dialog closes. */
export function maybeShowHalftime(win = globalThis, tries = 0) {
  const st = typeof state !== "undefined" ? state : win.state; // eslint-disable-line no-undef
  const m = st?.live;
  if (!m?.halftime || halftimeShown.has(`${st.year}-${st.week}-${m.a}-${m.b}`)) return;
  if (win.document?.querySelector?.("dialog[open], .px-scene, .gd-cine")) {
    if (tries < 40) win.setTimeout?.(() => maybeShowHalftime(win, tries + 1), 500);
    return;
  }
  halftimeReport(win, { repeat: false });
}

/** Replace match.js's postgameReport with the pixel version (the classic one stays as the fallback). */
export function installPostgameReport(win = globalThis) {
  const classic = win.postgameReport;
  win.halftimeReport = () => halftimeReport(win);
  win.postgameReport = function postgameReport() {
    // game.js declares `state` and `clubs` as script-scope globals (not window properties).
    const st = typeof state !== "undefined" ? state : win.state; // eslint-disable-line no-undef
    const table = typeof clubs !== "undefined" ? clubs : win.clubs || []; // eslint-disable-line no-undef
    const m = st?.lastMatch;
    if (!m || typeof win.modal !== "function") return classic?.();
    try {
      const md = postgameModel(m, { club: (t) => ({ abbr: table[t]?.[0] || `T${t + 1}`, name: table[t]?.[2] || table[t]?.[1] || `Team ${t + 1}` }), user: st.team });
      const actions = `<button class="secondary" onclick="closeModal()">Close report</button>${st.interviewPending ? `<button onclick="postInterview()">Attend press conference →</button>` : `<button onclick="closeModal();go('Media room')">Media room →</button>`}`;
      win.modal(postgameHTML(md, { logo: (t) => (typeof win.logo === "function" ? win.logo(t, "pg-logo") : ""), actions }));
    } catch (error) {
      console.error("Postgame report:", error);
      classic?.();
    }
  };
}
