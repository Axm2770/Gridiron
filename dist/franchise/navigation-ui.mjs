// Consolidated screens: Schedule & calendar (fixtures, head-to-head, calendar), League snapshot
// and Records & milestones (champions, record book, Hall of Fame, awards). Installed after the
// screens it absorbs so their views can be reused as tabs. Styles: league.css (pixel season strip,
// standings boards, rivalry cards, trophy wall) on top of navigation.css.
import * as M from "./matchups.mjs";
import { ensureRecordBook, RECORD_FIELDS } from "./records.mjs";
import { ensureOffice } from "./newsroom.mjs";
import { ensureCalendar, addDays, seasonAnchor } from "./calendar-core.mjs";
import { fixtures, fixtureSummary } from "./front-office.mjs";
import { icon, ROUTE_ALIASES, crumbLabel } from "./presentation.mjs";
import { playoffPicture, rankTeams, recentForm, streak, MARK_LABELS } from "./league-table.mjs";
import { pixelFace } from "../ui/pixel-face.mjs";
import { teamColors } from "../presentation/pixel-art.mjs";
import {
  recordTransactions,
  transactionsFor,
  describeTransaction,
  TRANSACTION_TYPES,
} from "./transactions.mjs";
const TABS = {
  Calendar: ["Fixtures", "Head-to-head", "Calendar"],
  Records: ["Champions", "Record book", "Hall of Fame", "Awards"],
  "League desk": ["Snapshot", "Transactions"],
};
const TX_PAGE = 20;
const number = (n) =>
  Number.isFinite(n) ? Number(n).toLocaleString("en-US") : "—";
const statLabels = {
  ...RECORD_FIELDS,
  attempts: "Attempts",
  completions: "Completions",
  tackles: "Tackles",
  games: "Games",
};
const statLabel = (k) =>
  statLabels[k] ||
  k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
const stage = (g) =>
  g.phase === "season"
    ? `Week ${g.week + 1}`
    : g.final
      ? "Championship"
      : `Playoffs R${g.week + 1}`;
const record = (t) => `${t.wins}–${t.losses}${t.ties ? "–" + t.ties : ""}`;
const wl = (r) => `${r.w}–${r.l}${r.t ? "–" + r.t : ""}`;
const resultChip = (r) =>
  `<span class="nav-result ${r === "W" ? "win" : r === "L" ? "loss" : "tie"}">${r}</span>`;
const tabBar = (route, active) =>
  `<div class="nav-tabs segmented" role="tablist">${TABS[route]
    .map(
      (t) =>
        `<button role="tab" class="${t === active ? "active" : ""}" aria-selected="${t === active}" onclick="Nav.setTab('${route}','${t}');render()">${t}</button>`,
    )
    .join("")}</div>`;
const fullName = (t) => clubs[t]?.slice(1, 3).join(" ") || "—";
const shortDate = (iso) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
const STAGE_SHORT = { "Wild Card": "WC", Divisional: "DIV", Conference: "CONF", Championship: "FINAL" };

// ---------- Pixel building blocks (league.css) ----------
const lgPanel = (title, body, extra = "", cls = "") =>
  `<section class="lg-panel ${cls}"><div class="lg-head"><h2>${title}</h2>${extra ? `<div class="lg-head-extra">${extra}</div>` : ""}</div><div class="lg-body">${body}</div></section>`;
// A club logo in a framed pixel tile tinted with the club's colours.
function crest(t, size = 32) {
  if (!(t >= 0) || !clubs[t]) return `<span class="lg-crest empty" style="--sz:${size}px" aria-hidden="true">?</span>`;
  let c = { primary: "", secondary: "" };
  try {
    c = teamColors(t);
  } catch {}
  return `<span class="lg-crest" style="--sz:${size}px;--club:${c.primary};--club-2:${c.secondary}">${logo(t)}</span>`;
}
const block = (r, text = r) =>
  `<span class="lg-res ${r === "W" ? "w" : r === "L" ? "l" : "t"}">${text}</span>`;
const form = (list) =>
  `<span class="lg-form" aria-label="Form ${list.join(" ") || "none"}">${list.map((r) => `<i class="${r === "W" ? "w" : r === "L" ? "l" : "t"}"></i>`).join("")}</span>`;
function paginate(rows, page, size) {
  const pages = Math.max(1, Math.ceil(rows.length / size)),
    p = Math.max(0, Math.min(page || 0, pages - 1));
  return {
    rows: rows.slice(p * size, p * size + size),
    page: p,
    pages,
    total: rows.length,
    from: rows.length ? p * size + 1 : 0,
    to: Math.min(rows.length, (p + 1) * size),
  };
}
const pager = (pg, key) =>
  pg.pages > 1
    ? `<div class="lg-pager"><button type="button" class="secondary small" ${pg.page <= 0 ? "disabled" : ""} onclick="Nav.page('${key}',${pg.page - 1})" aria-label="Previous page">◀ Prev</button><span>${pg.from}–${pg.to} of ${pg.total}</span><button type="button" class="secondary small" ${pg.page >= pg.pages - 1 ? "disabled" : ""} onclick="Nav.page('${key}',${pg.page + 1})" aria-label="Next page">Next ▶</button></div>`
    : "";
const seg = (items, value, code) =>
  `<div class="lg-seg" role="group">${items
    .map(([k, label]) => `<button type="button" class="link ${String(k) === String(value) ? "on" : ""}" aria-pressed="${String(k) === String(value)}" onclick="${code}('${k}')">${label}</button>`)
    .join("")}</div>`;
// Pixel trophy (12×12 sprite) for the champions wall.
const TROPHY = ["..########..", "############", "#.########.#", "#.########.#", ".##########.", "..########..", "...######...", ".....##.....", ".....##.....", "....####....", "...######...", "...######..."];
const trophyPath = (shine) =>
  TROPHY.flatMap((row, y) => [...row].map((c, x) => (c === "#" && (x === 3 && y > 0 && y < 6) === shine ? `M${x} ${y}h1v1h-1z` : ""))).join("");
const TROPHY_SVG = `<svg class="lg-trophy" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="${trophyPath(false)}"/><path fill="#fff" fill-opacity=".55" d="${trophyPath(true)}"/></svg>`;
function findPlayer(id, team) {
  if (!id || !state?.franchise) return null;
  const list = (t) => (t === state.team ? state.roster : state.franchise.clubs?.[t]?.players) || [];
  if (Number.isInteger(team) && team >= 0) {
    const p = list(team).find((p) => p.id === id);
    if (p) return p;
  }
  for (let t = 0; t < 32; t++) {
    const p = list(t).find((p) => p.id === id);
    if (p) return p;
  }
  return (state.agents || []).find((p) => p.id === id) || null;
}
const face = (id, name, team, size) =>
  pixelFace(findPlayer(id, team) || { id: id || name || "player", name }, { size, team: Number.isInteger(team) && team >= 0 ? team : null });

export function installNavigationUI({ views, heritage, getSection, isBusy }) {
  if (typeof document !== "undefined" && !document.querySelector?.('link[href="league.css"]'))
    document.head?.insertAdjacentHTML?.("beforeend", '<link rel="stylesheet" href="league.css">');
  const tabs = {},
    pages = {},
    original = {
      calendar: views.Calendar,
      records: views.Records,
      awards: views.Awards,
      hall: views["Hall of Fame"],
      league: views["League desk"],
    };
  let rival = null,
    fxScope = "All",
    champ = { team: "All", kind: "All" };
  const holidayRunning = () =>
    isBusy() || ensureCalendar(state).session?.status === "running";
  const current = (route) => {
    // A running simulation shows the Calendar tab and stays there when it pauses, so the
    // paused banner (reason, fix link, Resume) is what the player sees.
    if (route === "Calendar" && holidayRunning()) return (tabs.Calendar = "Calendar");
    if (route === "Calendar" && tabs.Calendar === undefined && ensureCalendar(state).session?.status === "paused") return "Calendar";
    return TABS[route]?.includes(tabs[route]) ? tabs[route] : TABS[route]?.[0];
  };
  window.Nav = {
    setTab(route, tab) {
      if (!TABS[route]) return;
      tabs[route] = tab ?? TABS[route][0];
    },
    // Breadcrumb label for the active tab (null on the default tab).
    tabLabel(route) {
      const t = TABS[route] && current(route);
      return t && t !== TABS[route][0] ? t : null;
    },
    rival(team) {
      rival = Number(team);
      pages.meet = 0;
      tabs.Calendar = "Head-to-head";
      if (getSection() === "Calendar") render();
      else W.open("Calendar", "Head-to-head");
    },
    page(key, n) {
      pages[key] = Math.max(0, Number(n) || 0);
      render();
    },
    fixture(key) {
      window.Hub?.fixture?.(key);
    },
    fxScope(v) {
      fxScope = v;
      render();
    },
    champ(key, v) {
      champ[key] = v;
      pages.champ = 0;
      render();
    },
  };
  // ---------- Schedule & calendar ----------
  const gameDate = (week) => addDays(seasonAnchor(state.year), (week - 1) * 7 + 6);
  function defaultRival() {
    const next = fixtures(state).find((r) => !r.done && !r.bye);
    if (next) return next.opponent;
    return M.headToHeadTable(state, state.team)[0]?.opp ?? (state.team + 1) % 32;
  }
  function weekTile(r, next) {
    const label = r.stage === "Regular season" ? "WK " + r.week : STAGE_SHORT[r.stage] || "POST";
    if (r.bye)
      return `<div class="lg-wk bye" title="Week ${r.week}: bye week"><span class="lg-wk-n">${label}</span><span class="lg-wk-bye">BYE</span><span class="lg-wk-res">Rest</span></div>`;
    const o = r.opponent,
      isNext = r === next,
      title = `${r.stage === "Regular season" ? "Week " + r.week : r.stage}: ${r.home ? "vs" : "at"} ${fullName(o)}${r.done ? ` · ${r.result} ${r.for}–${r.against}` : ""}`;
    return `<button type="button" class="link lg-wk ${r.done ? "res-" + r.result.toLowerCase() : ""} ${isNext ? "next" : ""} ${r.home ? "home" : "away"}" onclick="Nav.fixture('${esc(r.key)}')" title="${esc(title)}"><span class="lg-wk-n">${label}</span>${crest(o, 30)}<span class="lg-wk-ha">${r.home ? "vs" : "@"} ${esc(clubs[o][0])}</span><span class="lg-wk-res">${r.done ? `${r.result} ${r.for}-${r.against}` : isNext ? "NEXT" : r.stage === "Regular season" ? shortDate(gameDate(r.week)).replace(/^\w+, /, "") : "TBD"}</span></button>`;
  }
  function nextGameCard(next, sum) {
    if (!next)
      return lgPanel(
        "Season complete",
        `<div class="lg-done">${TROPHY_SVG}<div><b>${sum.wins}–${sum.losses}${sum.ties ? "–" + sum.ties : ""}</b><p>Every scheduled fixture has been played. The playoff picture and final standings are on the League snapshot.</p><button class="secondary small" onclick="W.open('League desk')">League snapshot ${icon("arrow")}</button></div></div>`,
        "",
        "lg-nextgame",
      );
    const o = next.opponent,
      me = state.teams[state.team],
      them = state.teams[o],
      h = M.headToHead(state, state.team, o),
      when = next.stage === "Regular season" ? shortDate(gameDate(next.week)) : next.stage,
      venue = next.home ? esc(state.franchise.clubs?.[state.team]?.stadium?.name || "Home") : `At ${esc(clubs[o][1])}`;
    const side = (t, r, tag) =>
      `<div class="lg-vs-side">${crest(t, 64)}<b>${esc(clubs[t][2])}</b><small>${tag} · ${wl(r)}</small>${form(recentForm(state, t))}</div>`;
    return lgPanel(
      `Next game · ${next.stage === "Regular season" ? "Week " + next.week : esc(next.stage)}`,
      `<div class="lg-vs">${side(state.team, me, "You")}<div class="lg-vs-mid"><strong>${next.home ? "VS" : "@"}</strong><small>${esc(when)}</small><span>${venue}</span></div>${side(o, them, next.home ? "Visitors" : "Hosts")}</div><dl class="lg-facts"><div><dt>Head-to-head</dt><dd>${h.games.length ? record(h.allTime) : "First meeting"}</dd></div><div><dt>Their points diff</dt><dd>${them.pf - them.pa > 0 ? "+" : ""}${them.pf - them.pa}</dd></div><div><dt>Their streak</dt><dd>${streak(recentForm(state, o, 17)) || "—"}</dd></div></dl><div class="lg-actions"><button onclick="W.open('Matchday')">Go to matchday ${icon("arrow")}</button><button class="secondary" onclick="Nav.fixture('${esc(next.key)}')">Match details</button><button class="secondary" onclick="Nav.rival(${o})">Head-to-head</button></div>`,
      `<span class="lg-chip ${next.home ? "good" : ""}">${next.home ? "HOME" : "AWAY"}</span>`,
      "lg-nextgame",
    );
  }
  function seasonCard(all, sum) {
    const div = Math.floor(state.team / 4),
      ids = rankTeams(state, [0, 1, 2, 3].map((i) => div * 4 + i)),
      pos = ids.indexOf(state.team) + 1,
      diff = sum.pf - sum.pa,
      f = recentForm(state, state.team);
    return lgPanel(
      `${state.year} season`,
      `<div class="lg-kpis"><div><small>Record</small><b>${sum.wins}–${sum.losses}${sum.ties ? "–" + sum.ties : ""}</b></div><div><small>Points</small><b>${sum.pf}<i>–</i>${sum.pa}</b></div><div><small>Diff</small><b class="${diff > 0 ? "good" : diff < 0 ? "bad" : ""}">${diff > 0 ? "+" : ""}${diff}</b></div><div><small>Left</small><b>${sum.remaining}</b></div></div><div class="lg-formline"><small>Last ${f.length || 5}</small>${f.length ? form(f) : "<em>No games yet</em>"}<small>${streak(f) ? "Streak " + streak(f) : ""}</small></div><div class="lg-mini-div"><h3>${esc(clubs[state.team][3])} · ${pos}${["st", "nd", "rd", "th"][Math.min(pos, 4) - 1]}</h3>${ids
        .map(
          (t, i) =>
            `<button class="link lg-row ${t === state.team ? "me" : ""}" onclick="W.club(${t})" title="${esc(fullName(t))} · club profile"><span class="lg-pos">${i + 1}</span>${crest(t, 22)}<span class="lg-name"><b>${esc(clubs[t][2])}</b></span><span class="lg-wl">${wl(state.teams[t])}</span>${form(recentForm(state, t))}</button>`,
        )
        .join("")}</div>`,
      `<button class="link" onclick="W.open('League desk')">Standings ${icon("arrow")}</button>`,
      "lg-season",
    );
  }
  function bracket() {
    const rounds = state.playoffs?.rounds || [];
    if (!rounds.length) return "";
    const names = ["Wild Card", "Divisional", "Conference", "Championship"],
      side = (t, g, k) => {
        const won = g.score && g.score[k] > g.score[1 - k];
        return `<div class="lg-br-team ${won ? "won" : g.score ? "lost" : ""} ${t === state.team ? "me" : ""}">${crest(t, 22)}<b>${esc(clubs[t]?.[0] || "—")}</b><span>${g.score ? g.score[k] : ""}</span></div>`;
      };
    return lgPanel(
      "Playoff bracket",
      `<div class="lg-bracket">${rounds
        .map(
          (games, i) =>
            `<div class="lg-br-round"><h3>${names[i] || "Round " + (i + 1)}</h3>${games.map((g) => `<div class="lg-br-game">${side(g.a, g, 0)}${side(g.b, g, 1)}</div>`).join("")}</div>`,
        )
        .join("")}</div>`,
      `<small>Seven clubs per conference; the top seed has a bye</small>`,
    );
  }
  function fixturesView() {
    const all = fixtures(state),
      sum = fixtureSummary(all),
      next = all.find((r) => !r.done && !r.bye),
      strip = all.filter((r) => r.stage === "Regular season" || !r.bye),
      rows = all.filter(
        (r) =>
          fxScope === "All" ||
          (fxScope === "Upcoming" && !r.done) ||
          (fxScope === "Results" && r.done) ||
          (fxScope === "Home" && r.home) ||
          (fxScope === "Away" && r.home === false),
      );
    const row = (r) => {
      if (r.bye)
        return `<div class="lg-fx bye"><span class="lg-fx-wk">WK ${r.week}</span><span class="lg-crest empty" style="--sz:26px">—</span><span class="lg-fx-main"><b>Bye week</b><small>Recover, prepare, reset</small></span><span class="lg-chip">REST</span></div>`;
      const o = r.opponent;
      return `<button type="button" class="link lg-fx ${r === next ? "next" : ""}" onclick="Nav.fixture('${esc(r.key)}')"><span class="lg-fx-wk">${r.stage === "Regular season" ? "WK " + r.week : STAGE_SHORT[r.stage] || "POST"}</span>${crest(o, 26)}<span class="lg-fx-main"><b>${r.home ? "vs" : "@"} ${esc(fullName(o))}</b><small>${r.stage === "Regular season" ? shortDate(gameDate(r.week)) : esc(r.stage)} · ${wl(state.teams[o])}</small></span>${r.done ? `<span class="lg-fx-score">${block(r.result)}<b>${r.for}–${r.against}</b></span>` : `<span class="lg-chip ${r === next ? "accent" : ""}">${r === next ? "UP NEXT" : r.home ? "HOME" : "AWAY"}</span>`}</button>`;
    };
    return `<div class="lg-page">${lgPanel(
      `${state.year} season strip`,
      `<div class="lg-strip" style="--n:${Math.max(1, strip.length)}">${strip.map((r) => weekTile(r, next)).join("")}</div><div class="lg-legend"><span>${block("W")} Win</span><span>${block("L")} Loss</span><span><i class="lg-key next"></i> Next game</span><span><i class="lg-key home"></i> Home</span><span>Select a week for the matchup and box score.</span></div>`,
      `<small>${all.filter((r) => !r.bye && r.stage === "Regular season").length} games · ${sum.remaining} to play</small>`,
      "lg-strip-panel",
    )}<div class="lg-split">${nextGameCard(next, sum)}${seasonCard(all, sum)}</div>${lgPanel(
      "Fixture list",
      `<div class="lg-toolbar">${seg(["All", "Upcoming", "Results", "Home", "Away"].map((x) => [x, x]), fxScope, "Nav.fxScope")}</div>${rows.length ? `<div class="lg-fx-list">${rows.map(row).join("")}</div>` : `<p class="lg-none">No fixtures in this view. Choose All to see the whole season.</p>`}`,
      `<small>${rows.length} shown</small>`,
    )}${bracket()}</div>`;
  }
  function headToHeadView() {
    const opp = Number.isInteger(rival) && rival !== state.team && clubs[rival] ? rival : defaultRival(),
      h = M.headToHead(state, state.team, opp),
      table = M.headToHeadTable(state, state.team),
      options = clubs
        .map((c, i) =>
          i === state.team
            ? ""
            : `<option value="${i}" ${i === opp ? "selected" : ""}>${esc(c[1] + " " + c[2])}</option>`,
        )
        .join("");
    const lead = h.allTime.wins - h.allTime.losses,
      banner = `<div class="lg-rivalry" style="--club-a:${teamColors(state.team).primary};--club-b:${teamColors(opp).primary}"><div class="lg-rv-side">${crest(state.team, 72)}<b>${esc(clubs[state.team][2])}</b><small>${wl(state.teams[state.team])} this season</small></div><div class="lg-rv-mid"><small>ALL-TIME</small><strong>${h.games.length ? record(h.allTime) : "0–0"}</strong><span>${h.games.length ? (lead > 0 ? "You lead the series" : lead < 0 ? `The ${esc(clubs[opp][2])} lead` : "Series level") : "No meetings yet"}</span><label class="lg-rv-pick">Opponent <select aria-label="Head-to-head opponent" onchange="Nav.rival(this.value)">${options}</select></label></div><div class="lg-rv-side">${crest(opp, 72)}<b>${esc(clubs[opp][2])}</b><small>${wl(state.teams[opp])} this season</small></div></div>`;
    const stats = h.games.length
      ? `<div class="lg-kpis lg-rv-kpis"><div><small>Last ${Math.min(5, h.games.length)}</small><b>${record(h.recent)}</b>${form(h.games.slice(0, 5).map((g) => g.result).reverse())}</div><div><small>Points</small><b>${h.allTime.pf}<i>–</i>${h.allTime.pa}</b><span>${h.games.length} meeting${h.games.length === 1 ? "" : "s"}</span></div><div><small>Playoffs</small><b>${record(h.playoffs)}</b><span>${h.playoffs.wins + h.playoffs.losses + h.playoffs.ties} postseason</span></div><div><small>Streak</small><b>${h.streak ? h.streak.result + h.streak.count : "—"}</b><span>${h.last ? `Last met ${h.last.year} · ${stage(h.last)}` : ""}</span></div></div>`
      : `<p class="lg-none">No meetings with the ${esc(clubs[opp][2])} yet in this career. Results are recorded from every game you play.</p>`;
    const mp = paginate(h.games, pages.meet, 8);
    pages.meet = mp.page;
    const meetings = h.games.length
      ? `<div class="lg-meetings">${mp.rows
          .map(
            (g) =>
              `<div class="lg-meet ${g.result === "W" ? "w" : g.result === "L" ? "l" : "t"}"><span class="lg-meet-yr">${g.year}</span><span class="lg-meet-stage">${stage(g)}</span><span class="lg-chip">${g.home ? "HOME" : "AWAY"}</span>${block(g.result)}<b>${g.pf}–${g.pa}</b></div>`,
          )
          .join("")}</div>${pager(mp, "meet")}`
      : "";
    const rp = paginate(table, pages.rivals, 12);
    pages.rivals = rp.page;
    const all = table.length
      ? `<div class="lg-rivals">${rp.rows
          .map(
            (r) =>
              `<button type="button" class="link lg-rival ${r.opp === opp ? "on" : ""}" onclick="Nav.rival(${r.opp})">${crest(r.opp, 40)}<span class="lg-rival-main"><b>${esc(clubs[r.opp][2])}</b><small>${r.games.length} meeting${r.games.length === 1 ? "" : "s"} · ${r.allTime.pf}–${r.allTime.pa}</small></span><span class="lg-rival-rec"><strong>${record(r.allTime)}</strong><span>${block(r.last.result)} ${r.last.pf}–${r.last.pa}</span></span></button>`,
          )
          .join("")}</div>${pager(rp, "rivals")}`
      : `<p class="lg-none">Every opponent you face appears here with your all-time record.</p>`;
    return `<div class="lg-page nav-h2h">${lgPanel(`Rivalry · ${esc(clubs[state.team][2])} vs ${esc(clubs[opp][2])}`, banner + stats + meetings, "", "lg-rv-panel")}${lgPanel("Against every opponent", all, `<small>${table.length} opponents met</small>`)}</div>`;
  }
  views.Calendar = () => {
    const tab = current("Calendar");
    const body =
      tab === "Head-to-head"
        ? headToHeadView()
        : tab === "Calendar"
          ? original.calendar()
          : fixturesView();
    return tabBar("Calendar", tab) + body;
  };
  // ---------- League snapshot ----------
  function standings(pic) {
    const board = (d) => {
      const ids = rankTeams(state, [0, 1, 2, 3].map((i) => d * 4 + i)),
        seeds = pic.conferences[Math.floor(d / 4)].seeds;
      return `<div class="lg-div"><h3>${esc(clubs[d * 4][3])}</h3>${ids
        .map((t, i) => {
          const r = state.teams[t],
            diff = r.pf - r.pa,
            mark = pic.marks[t],
            seed = seeds.indexOf(t) + 1;
          return `<button type="button" class="link lg-row ${t === state.team ? "me" : ""} ${seed ? "in" : ""}" onclick="W.club(${t})" title="${esc(fullName(t))}${seed ? ` · seed ${seed}` : ""}${mark ? " · " + MARK_LABELS[mark] : ""}"><span class="lg-pos">${i + 1}</span>${crest(t, 22)}<span class="lg-name"><b>${esc(clubs[t][2])}</b></span><span class="lg-wl">${wl(r)}</span><span class="lg-diff ${diff > 0 ? "good" : diff < 0 ? "bad" : ""}">${diff > 0 ? "+" : ""}${diff}</span>${form(recentForm(state, t))}<span class="lg-mark ${mark || ""}">${mark || ""}</span></button>`;
        })
        .join("")}</div>`;
    };
    return `<div class="lg-standings">${[0, 1]
      .map((c) => `<div class="lg-conf"><h3 class="lg-conf-name">${c ? "NFC" : "AFC"}</h3><div class="lg-divs">${[0, 1, 2, 3].map((d) => board(c * 4 + d)).join("")}</div></div>`)
      .join("")}</div><div class="lg-legend"><span><i class="lg-key in"></i> In playoff position</span><span><b class="lg-mark y">y</b> ${MARK_LABELS.y}</span><span><b class="lg-mark x">x</b> ${MARK_LABELS.x}</span><span><b class="lg-mark e">e</b> ${MARK_LABELS.e}</span><span>Select a club for its profile.</span></div>`;
  }
  function picture(pic) {
    const slot = (t, seed) =>
      `<button type="button" class="link lg-seed ${t === state.team ? "me" : ""}" onclick="W.club(${t})" title="${esc(fullName(t))}"><i>${seed}</i>${crest(t, 30)}<span><b>${esc(clubs[t][0])}</b><small>${wl(state.teams[t])}</small></span></button>`;
    return `<div class="lg-picture">${pic.conferences
      .map(
        (c) =>
          `<div class="lg-pic-row"><span class="lg-pic-conf">${c.conference ? "NFC" : "AFC"}</span><div class="lg-seeds">${c.seeds.map((t, i) => slot(t, i + 1)).join("")}</div>${pic.final ? "" : `<div class="lg-hunt"><small>In the hunt</small>${c.hunt.map((t) => `<button type="button" class="link lg-hunt-team" onclick="W.club(${t})" title="${esc(fullName(t))}">${crest(t, 22)}<b>${esc(clubs[t][0])}</b><small>${wl(state.teams[t])}</small></button>`).join("")}</div>`}</div>`,
      )
      .join("")}</div>`;
  }
  function leaders() {
    const rows = Object.values(
      ensureRecordBook(state).regularTotals[state.year] || {},
    );
    const cats = [
      "passYards",
      "rushYards",
      "recYards",
      "passTD",
      "sacks",
      "defInterceptions",
    ];
    const blocks = cats
      .map((k) => {
        const top = rows
          .filter((r) => (r.stats[k] || 0) > 0)
          .sort((a, b) => b.stats[k] - a.stats[k])
          .slice(0, 3);
        if (!top.length) return "";
        const [first, ...rest] = top;
        return `<div class="lg-leader"><h3>${statLabel(k)}</h3><button type="button" class="link lg-leader-top" onclick="W.player('${esc(first.id)}',${first.team})">${face(first.id, first.name, first.team, 48)}<span><b>${esc(first.name)}</b><small>${crest(first.team, 16)} ${esc(clubs[first.team]?.[0] || "")} · ${esc(first.pos)}</small></span><strong>${number(first.stats[k])}</strong></button>${rest
          .map(
            (r, i) =>
              `<button type="button" class="link lg-leader-row" onclick="W.player('${esc(r.id)}',${r.team})"><span class="lg-pos">${i + 2}</span>${face(r.id, r.name, r.team, 24)}<b>${esc(r.name)}</b><small>${esc(clubs[r.team]?.[0] || "")}</small><strong>${number(r.stats[k])}</strong></button>`,
          )
          .join("")}</div>`;
      })
      .join("");
    return blocks
      ? `<div class="lg-leaders">${blocks}</div>`
      : `<p class="lg-none">League leaders appear after the first regular-season round.</p>`;
  }
  // ---------- Transactions ----------
  const teamName = (t) => clubs[t]?.[2] || `Team ${t + 1}`;
  const when = (e) =>
    `${e.year} · ${e.phase === "season" ? `Week ${(e.week ?? 0) + 1}` : e.phase === "playoffs" ? "Playoffs" : "Offseason"}`;
  const contractText = (e) =>
    e.contract
      ? `${e.contract.years} yr${e.contract.years === 1 ? "" : "s"} · $${(e.contract.capHit / 1e8).toFixed(2)}M cap hit · through ${e.contract.through}`
      : "";
  const txRow = (e, team = null) => {
    const club = e.to ?? e.from,
      owner = Number.isInteger(club) ? club : null;
    return `<article class="lg-tx ${e.from === state.team || e.to === state.team ? "me" : ""}"><span class="lg-tx-when"><b>${e.phase === "season" ? "WK " + ((e.week ?? 0) + 1) : e.phase === "playoffs" ? "POST" : "OFF"}</b><small>${e.year}</small></span><span class="tx-type tx-${e.type}">${TRANSACTION_TYPES[e.type]}</span>${owner !== null ? crest(owner, 28) : `<span class="lg-crest empty" style="--sz:28px">FA</span>`}${face(e.playerId, e.name, owner, 36)}<span class="lg-tx-main"><span><button class="link lg-tx-name" onclick="W.player('${esc(e.playerId)}',${e.to ?? e.from ?? state.team})">${esc(e.name)}</button> <small>${esc(e.pos || "")}${Number.isFinite(e.ovr) ? " · " + e.ovr + " OVR" : ""}</small></span><span class="tx-line">${esc(describeTransaction(e, teamName, team))}</span></span><small class="lg-tx-deal">${esc(contractText(e))}</small></article>`;
  };
  const txFilter = { team: "mine", type: "all", year: "all" };
  window.Nav.txFilter = (key, value) => {
    txFilter[key] = value;
    pages.tx = 0;
    render();
  };
  function transactionsView() {
    recordTransactions(state);
    const team =
        txFilter.team === "mine" ? state.team : txFilter.team === "all" ? null : Number(txFilter.team),
      year = txFilter.year === "all" ? null : Number(txFilter.year),
      scoped = transactionsFor(state, { team, year }),
      all = txFilter.type === "all" ? scoped : scoped.filter((e) => e.type === txFilter.type),
      years = [...new Set(transactionsFor(state).map((e) => e.year))].sort((a, b) => b - a),
      pg = paginate(all, pages.tx, TX_PAGE),
      option = (v, label, cur) => `<option value="${v}" ${String(cur) === String(v) ? "selected" : ""}>${esc(label)}</option>`,
      count = (k) => scoped.filter((e) => e.type === k).length;
    pages.tx = pg.page;
    const chips = `<div class="lg-typechips" role="group" aria-label="Transaction type">${[["all", "All moves", scoped.length], ...Object.entries(TRANSACTION_TYPES).map(([k, v]) => [k, v, count(k)])]
      .filter(([k, , n]) => k === "all" || n || txFilter.type === k)
      .map(([k, v, n]) => `<button type="button" class="link lg-typechip tx-${k} ${txFilter.type === k ? "on" : ""}" aria-pressed="${txFilter.type === k}" onclick="Nav.txFilter('type','${k}')">${esc(v)} <b>${n}</b></button>`)
      .join("")}</div>`;
    const filters = `<div class="tx-filters lg-toolbar"><label class="nav-select">Club <select aria-label="Club" onchange="Nav.txFilter('team',this.value)">${option("mine", "My club", txFilter.team)}${option("all", "Whole league", txFilter.team)}${clubs
      .map((c, i) => (i === state.team ? "" : option(i, c[1] + " " + c[2], txFilter.team)))
      .join("")}</select></label><label class="nav-select">Season <select aria-label="Season" onchange="Nav.txFilter('year',this.value)">${option("all", "All seasons", txFilter.year)}${years
      .map((y) => option(y, y, txFilter.year))
      .join("")}</select></label></div>${chips}`;
    const body = pg.total
      ? `<div class="lg-tx-list">${pg.rows.map((e) => txRow(e, team)).join("")}</div>${pager(pg, "tx")}`
      : `<p class="lg-none">No moves match these filters yet. Signings, trades, waiver claims, draft picks, releases and retirements are recorded here from the moment this save first opens this screen or plays a week.</p>`;
    return `<div class="lg-page">${lgPanel(
      "Transactions",
      filters + body,
      `<small>${all.length} move${all.length === 1 ? "" : "s"}</small>`,
    )}</div>`;
  }
  window.Nav.playerMoves = (id) => {
    const rows = transactionsFor(state, { playerId: id });
    return rows.length
      ? `<h3 class="profile-subhead">Transaction history</h3><ul class="tx-player">${rows
          .map((e) => `<li><small>${when(e)}</small> ${esc(describeTransaction(e, teamName))}${e.contract ? ` <small>· ${esc(contractText(e))}</small>` : ""}</li>`)
          .join("")}</ul>`
      : "";
  };
  function transactions() {
    recordTransactions(state);
    const recent = transactionsFor(state)
      .filter((e) => e.type !== "retired")
      .slice(0, 6);
    if (recent.length)
      return `<div class="lg-moves">${recent
        .map(
          (e) =>
            `<div class="lg-move"><span class="tx-type tx-${e.type}">${TRANSACTION_TYPES[e.type]}</span>${Number.isInteger(e.to ?? e.from) ? crest(e.to ?? e.from, 22) : ""}<span><b>${esc(describeTransaction(e, teamName))}</b><small>${when(e)}${e.contract ? " · " + esc(contractText(e)) : ""}</small></span></div>`,
        )
        .join("")}</div>`;
    const moves = ensureOffice(state)
      .stories.filter((a) =>
        /\b(sign|signs|signed|signing|trade|traded|release|released|waive|waived|extension|extends|acquire|acquired|draft|drafted|claims?|cut)\b/i.test(
          a.title + " " + (a.body || ""),
        ),
      )
      .slice(0, 6);
    return moves.length
      ? `<div class="lg-moves">${moves
          .map(
            (a) =>
              `<div class="lg-move"><span class="tx-type">${esc(a.source || "League")}</span><span><b>${esc(a.title)}</b><small>${a.year} · ${a.week ? "Week " + a.week : "Offseason"}</small></span></div>`,
          )
          .join("")}</div>`
      : `<p class="lg-none">Signings, trades and releases around the league appear here.</p>`;
  }
  const snapshotView = () => {
    const pic = playoffPicture(state);
    return `<div class="lg-page">${lgPanel(
      pic.final ? `Postseason field · ${state.year}` : `Playoff picture · if the season ended today`,
      picture(pic),
      `<small>Seven seeds per conference · top seed has a bye</small>`,
    )}${lgPanel(
      `Standings · ${state.year}`,
      standings(pic),
      `<button class="link" onclick="W.open('Calendar','Head-to-head')">Head-to-head ${icon("arrow")}</button>`,
    )}<div class="lg-split lg-split-wide">${lgPanel(
      "League leaders",
      leaders(),
      `<button class="link" onclick="W.open('Statistics')">Statistics ${icon("arrow")}</button>`,
    )}${lgPanel("Notable transactions", transactions(), `<button class="link" onclick="W.open('League desk','Transactions')">All transactions ${icon("arrow")}</button>`)}</div>${
      original.league
        ? `<details class="nav-more lg-more"><summary>Developing stories, supporter pulse and league meeting <span>⌄</span></summary>${original.league()}</details>`
        : ""
    }</div>`;
  };
  views["League desk"] = () => {
    const tab = current("League desk");
    return tabBar("League desk", tab) + (tab === "Transactions" ? transactionsView() : snapshotView());
  };
  // ---------- Records & milestones ----------
  function championsView() {
    const list = M.championshipList(state, clubs),
      counts = M.titleCounts(list).slice(0, 8),
      shown = list.filter(
        (c) =>
          (champ.team === "All" || c.winner === Number(champ.team)) &&
          (champ.kind === "All" || (champ.kind === "career" ? c.kind === "career" : c.kind !== "career")),
      ),
      pg = paginate(shown, pages.champ, 12),
      mine = list.filter((c) => c.winner === state.team).length;
    pages.champ = pg.page;
    const shelf = counts
      .map(
        ([t, n]) =>
          `<button type="button" class="link lg-shelf ${t === state.team ? "me" : ""}" onclick="Nav.champ('team','${t}')" title="${esc(fullName(t))}: ${n} titles">${crest(t, 40)}<span><b>${esc(clubs[t][2])}</b><span class="lg-cups">${TROPHY_SVG.repeat(Math.min(n, 8))}${n > 8 ? `<em>+${n - 8}</em>` : ""}</span></span><strong>${n}</strong></button>`,
      )
      .join("");
    const card = (c) => {
      const notes = [
        c.record && `${c.record} regular season`,
        Number.isFinite(c.pointsFor) && `${c.pointsFor} PF / ${c.pointsAgainst} PA`,
        c.seasonMvp && `Season MVP: ${c.seasonMvp}`,
      ].filter(Boolean);
      return `<article class="lg-champ ${c.winner === state.team ? "me" : ""} ${c.kind === "career" ? "career" : ""}"><div class="lg-champ-head"><strong>${c.year}</strong>${c.kind === "career" ? `<span class="lg-chip accent">THIS CAREER</span>` : TROPHY_SVG}</div><div class="lg-champ-team">${crest(c.winner, 44)}<span><small>Champions</small><b>${esc(c.winnerName)}</b></span></div><div class="lg-champ-final">${c.score ? `<b>${c.score[0]}–${c.score[1]}</b>` : ""}${c.runnerUpName ? `<span>${c.runnerUp !== null && c.runnerUp >= 0 ? crest(c.runnerUp, 18) : ""} over ${esc(c.runnerUpName)}</span>` : ""}</div><div class="lg-champ-foot">${c.mvp ? `<span>Game MVP · <b>${esc(c.mvp)}</b></span>` : ""}${notes.length ? `<small>${esc(notes.join(" · "))}</small>` : !c.mvp ? `<small>${c.kind === "career" ? "" : "Historical record"}</small>` : ""}</div></article>`;
    };
    const teamsWithTitles = [...new Set(list.map((c) => c.winner).filter((t) => t >= 0))].sort((a, b) => clubs[a][2].localeCompare(clubs[b][2]));
    return `<div class="lg-page">${lgPanel(
      "Trophy wall · most titles",
      `<div class="lg-shelves">${shelf}</div>`,
      `<small>${mine ? `${esc(clubs[state.team][2])}: ${mine} title${mine === 1 ? "" : "s"}` : "Select a club to see its titles"}</small>`,
    )}${lgPanel(
      "Super Bowl winners",
      `<div class="lg-toolbar">${seg([["All", "Every season"], ["career", "This career"], ["historical", "Historical"]], champ.kind, "Nav.champKind")}<label class="nav-select">Champion <select aria-label="Champion franchise" onchange="Nav.champ('team',this.value)"><option value="All">Every franchise</option>${teamsWithTitles.map((t) => `<option value="${t}" ${String(champ.team) === String(t) ? "selected" : ""}>${esc(fullName(t))}</option>`).join("")}</select></label></div>${pg.total ? `<div class="lg-champs">${pg.rows.map(card).join("")}</div>${pager(pg, "champ")}` : `<p class="lg-none">No championships match. Choose Every season or another franchise.</p>`}<p class="lg-note">Career seasons include the final score, runner-up and the champion's season. Earlier seasons list the champion and, where recorded, the game MVP.</p>`,
      `<small>${list.length} championships</small>`,
    )}</div>`;
  }
  window.Nav.champKind = (v) => window.Nav.champ("kind", v);
  views.Records = () => {
    const tab = current("Records");
    const body =
      tab === "Record book"
        ? original.records()
        : tab === "Hall of Fame"
          ? original.hall()
          : tab === "Awards"
            ? original.awards()
            : championsView();
    return tabBar("Records", tab) + body;
  };
  views.Archives = () => views.Records();
  // ---------- Retired routes and cross-links ----------
  const previousGo = go;
  go = function (v) {
    if (ROUTE_ALIASES[v]) return W.open(v);
    return previousGo(v);
  };
  if (window.Hub?.fixture) {
    const fixture = window.Hub.fixture;
    window.Hub.fixture = function (key) {
      fixture(key);
      const r = fixtures(state).find((r) => r.key === key),
        host = document.querySelector(".hub-fixture-modal");
      if (!r || r.bye || !host) return;
      const h = M.headToHead(state, state.team, r.opponent);
      host.insertAdjacentHTML(
        "beforeend",
        `<div class="nav-fixture-h2h"><span class="eyebrow">HEAD-TO-HEAD</span><div class="hub-health-row"><span>All-time record</span><b>${h.games.length ? record(h.allTime) : "First meeting"}</b></div>${h.last ? `<div class="hub-health-row"><span>Last meeting</span><b>${h.last.year} ${stage(h.last)} · ${h.last.result} ${h.last.pf}–${h.last.pa}</b></div>` : ""}<button class="secondary small" onclick="closeModal();Nav.rival(${r.opponent})">Full head-to-head ${icon("arrow")}</button> <button class="secondary small" onclick="W.club(${r.opponent})">${esc(clubs[r.opponent][2])} profile ${icon("arrow")}</button></div>`,
      );
    };
  }
  // Any standalone player name on a screen (a cell or bold label that is exactly the name)
  // opens that player's profile, so every list links to the player hub without per-screen code.
  function linkPlayerNames() {
    const app = document.getElementById("app");
    if (!app || !state?.franchise) return;
    const byName = new Map();
    for (let t = 0; t < 32; t++)
      for (const p of (t === state.team ? state.roster : state.franchise.clubs[t]?.players) || [])
        if (!byName.has(p.name)) byName.set(p.name, [p.id, t]);
    for (const p of state.agents || []) if (!byName.has(p.name)) byName.set(p.name, [p.id, -1]);
    app.querySelectorAll("td, b, strong").forEach((el) => {
      if (el.dataset.playerLink || el.children.length || el.closest("button, a, [onclick], .player-name-link")) return;
      const hit = byName.get(el.textContent.trim());
      if (!hit) return;
      el.dataset.playerLink = "1";
      el.classList.add("player-name-link");
      el.dataset.linkId = hit[0];
      el.dataset.linkTeam = hit[1];
      el.setAttribute("role", "link");
      el.setAttribute("tabindex", "0");
      el.title = "Open player profile";
    });
  }
  const openLinked = (e) => {
    const el = e.target.closest?.(".player-name-link[data-player-link]");
    if (!el || (e.type === "keydown" && e.key !== "Enter")) return;
    e.preventDefault();
    W.player(el.dataset.linkId, Number(el.dataset.linkTeam));
  };
  document.addEventListener("click", openLinked);
  document.addEventListener("keydown", openLinked);
  // Keep the game log current for saves loaded mid-season.
  const previousRender = render;
  render = function () {
    if (state?.franchise) M.ensureMatchups(state);
    previousRender();
    linkPlayerNames();
  };
  return { crumbLabel };
}
