// Consolidated screens: Schedule & calendar (fixtures, head-to-head, calendar), League snapshot
// and Records & milestones (champions, record book, Hall of Fame, awards). Installed after the
// screens it absorbs so their views can be reused as tabs.
import * as M from "./matchups.mjs";
import { ensureRecordBook, RECORD_FIELDS } from "./records.mjs";
import { ensureOffice } from "./newsroom.mjs";
import { ensureCalendar } from "./calendar-core.mjs";
import { fixtures } from "./front-office.mjs";
import { icon, ROUTE_ALIASES, crumbLabel } from "./presentation.mjs";
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
const resultChip = (r) =>
  `<span class="nav-result ${r === "W" ? "win" : r === "L" ? "loss" : "tie"}">${r}</span>`;
const panel = (title, body, extra = "") =>
  `<section class="panel f-panel nav-panel"><div class="panel-head"><h2>${title}</h2>${extra}</div><div class="pad">${body}</div></section>`;
const tabBar = (route, active) =>
  `<div class="nav-tabs segmented" role="tablist">${TABS[route]
    .map(
      (t) =>
        `<button role="tab" class="${t === active ? "active" : ""}" aria-selected="${t === active}" onclick="Nav.setTab('${route}','${t}');render()">${t}</button>`,
    )
    .join("")}</div>`;
const fullName = (t) => clubs[t]?.slice(1, 3).join(" ") || "—";
export function installNavigationUI({ views, heritage, getSection, isBusy }) {
  const tabs = {},
    original = {
      calendar: views.Calendar,
      records: views.Records,
      awards: views.Awards,
      hall: views["Hall of Fame"],
      league: views["League desk"],
    };
  let rival = null;
  const holidayRunning = () =>
    isBusy() || ensureCalendar(state).session?.status === "running";
  const current = (route) => {
    if (route === "Calendar" && holidayRunning()) return "Calendar";
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
      tabs.Calendar = "Head-to-head";
      if (getSection() === "Calendar") render();
      else W.open("Calendar", "Head-to-head");
    },
  };
  // ---------- Schedule & calendar ----------
  function defaultRival() {
    const next = fixtures(state).find((r) => !r.done && !r.bye);
    if (next) return next.opponent;
    return M.headToHeadTable(state, state.team)[0]?.opp ?? (state.team + 1) % 32;
  }
  function headToHeadView() {
    const opp = Number.isInteger(rival) && rival !== state.team ? rival : defaultRival(),
      h = M.headToHead(state, state.team, opp),
      table = M.headToHeadTable(state, state.team),
      options = clubs
        .map((c, i) =>
          i === state.team
            ? ""
            : `<option value="${i}" ${i === opp ? "selected" : ""}>${esc(c[1] + " " + c[2])}</option>`,
        )
        .join("");
    const summary = h.games.length
      ? `<div class="nav-h2h-stats"><div><small>All-time</small><b>${record(h.allTime)}</b><span>${h.allTime.pf}–${h.allTime.pa} points</span></div><div><small>Last ${Math.min(5, h.games.length)}</small><b>${record(h.recent)}</b><span>${h.games
          .slice(0, 5)
          .map((g) => resultChip(g.result))
          .join("")}</span></div><div><small>Playoffs</small><b>${record(h.playoffs)}</b><span>${h.playoffs.wins + h.playoffs.losses + h.playoffs.ties} meetings</span></div><div><small>Streak</small><b>${h.streak ? h.streak.result + h.streak.count : "—"}</b><span>${h.last ? `Last met ${h.last.year} · ${stage(h.last)}` : ""}</span></div></div>`
      : `<p class="subtitle">No meetings with the ${esc(clubs[opp][2])} yet in this career. Results are recorded from every game you play.</p>`;
    const meetings = h.games.length
      ? `<div class="scroll f-table"><table><thead><tr><th>Season</th><th>Stage</th><th>Venue</th><th>Result</th><th>Score</th></tr></thead><tbody>${h.games
          .map(
            (g) =>
              `<tr><td>${g.year}</td><td>${stage(g)}</td><td>${g.home ? "Home" : "Away"}</td><td>${resultChip(g.result)}</td><td class="numeric"><b>${g.pf}–${g.pa}</b></td></tr>`,
          )
          .join("")}</tbody></table></div>`
      : "";
    const all = table.length
      ? `<div class="scroll f-table"><table data-table-filtered="true"><thead><tr><th>Opponent</th><th>Meetings</th><th>Record</th><th>Points</th><th>Last meeting</th><th>Streak</th></tr></thead><tbody>${table
          .map(
            (r) =>
              `<tr class="${r.opp === opp ? "me" : ""}"><td><button class="link nav-team-link" onclick="Nav.rival(${r.opp})">${logo(r.opp)}<span>${esc(fullName(r.opp))}</span></button></td><td>${r.games.length}</td><td><b>${record(r.allTime)}</b></td><td>${r.allTime.pf}–${r.allTime.pa}</td><td>${r.last.year} ${stage(r.last)} · ${resultChip(r.last.result)} ${r.last.pf}–${r.last.pa}</td><td>${r.streak.result}${r.streak.count}</td></tr>`,
          )
          .join("")}</tbody></table></div>`
      : `<p class="subtitle">Every opponent you face appears here with your all-time record.</p>`;
    return `<div class="nav-h2h">${panel(
      `${logo(state.team)} ${esc(clubs[state.team][2])} vs ${logo(opp)} ${esc(clubs[opp][2])}`,
      `${summary}${meetings}`,
      `<label class="nav-select">Opponent <select aria-label="Head-to-head opponent" onchange="Nav.rival(this.value)">${options}</select></label>`,
    )}${panel("Against every opponent", all, `<small>${table.length} opponents met</small>`)}</div>`;
  }
  views.Calendar = () => {
    const tab = current("Calendar");
    const body =
      tab === "Head-to-head"
        ? headToHeadView()
        : tab === "Calendar"
          ? original.calendar()
          : calendar();
    return tabBar("Calendar", tab) + body;
  };
  // ---------- League snapshot ----------
  function standings() {
    const divisions = new Map();
    clubs.forEach((c, i) => {
      if (!divisions.has(c[3])) divisions.set(c[3], []);
      divisions.get(c[3]).push(i);
    });
    const rank = (ids) =>
      ids.slice().sort((a, b) => {
        const x = state.teams[a],
          y = state.teams[b];
        return y.w - x.w || y.pf - y.pa - (x.pf - x.pa) || x.l - y.l;
      });
    return `<div class="nav-standings">${[...divisions.entries()]
      .map(
        ([name, ids]) =>
          `<div class="nav-division"><h3>${esc(name)}</h3><table><thead><tr><th>Team</th><th>W–L</th><th>Diff</th></tr></thead><tbody>${rank(
            ids,
          )
            .map((t) => {
              const r = state.teams[t],
                diff = r.pf - r.pa;
              return `<tr class="${t === state.team ? "me" : ""}"><td><button class="link nav-team-link" onclick="Nav.rival(${t})" title="Head-to-head with ${esc(fullName(t))}">${logo(t)}<span>${esc(clubs[t][0])}</span></button></td><td><b>${r.w}–${r.l}${r.t ? "–" + r.t : ""}</b></td><td class="${diff > 0 ? "positive" : diff < 0 ? "negative" : ""}">${diff > 0 ? "+" : ""}${diff}</td></tr>`;
            })
            .join("")}</tbody></table></div>`,
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
        return `<div class="nav-leader"><h3>${statLabel(k)}</h3>${top
          .map(
            (r, i) =>
              `<button class="nav-leader-row" onclick="W.player('${esc(r.id)}',${r.team})"><span>${i + 1}</span><b>${esc(r.name)}</b><small>${esc(clubs[r.team]?.[0] || "")} · ${esc(r.pos)}</small><strong>${number(r.stats[k])}</strong></button>`,
          )
          .join("")}</div>`;
      })
      .join("");
    return (
      blocks ||
      `<p class="subtitle">League leaders appear after the first regular-season round.</p>`
    );
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
    const club = e.to ?? e.from;
    return `<tr class="${e.from === state.team || e.to === state.team ? "me" : ""}"><td><small>${when(e)}</small></td><td><span class="tx-type tx-${e.type}">${TRANSACTION_TYPES[e.type]}</span></td><td>${club !== null ? logo(club) : ""}</td><td><button class="link" onclick="W.player('${esc(e.playerId)}',${e.to ?? e.from ?? state.team})"><b>${esc(e.name)}</b></button> <small>${esc(e.pos || "")}${Number.isFinite(e.ovr) ? " · " + e.ovr + " OVR" : ""}</small><div class="tx-line">${esc(describeTransaction(e, teamName, team))}</div></td><td><small>${esc(contractText(e))}</small></td></tr>`;
  };
  const txFilter = { team: "mine", type: "all", year: "all" };
  window.Nav.txFilter = (key, value) => {
    txFilter[key] = value;
    render();
  };
  function transactionsView() {
    recordTransactions(state);
    const team =
        txFilter.team === "mine" ? state.team : txFilter.team === "all" ? null : Number(txFilter.team),
      all = transactionsFor(state, {
        team,
        type: txFilter.type === "all" ? null : txFilter.type,
        year: txFilter.year === "all" ? null : Number(txFilter.year),
      }),
      years = [...new Set(transactionsFor(state).map((e) => e.year))].sort((a, b) => b - a),
      shown = all.slice(0, 200),
      option = (v, label, cur) => `<option value="${v}" ${String(cur) === String(v) ? "selected" : ""}>${esc(label)}</option>`;
    const filters = `<div class="tx-filters"><label class="nav-select">Club <select aria-label="Club" onchange="Nav.txFilter('team',this.value)">${option("mine", "My club", txFilter.team)}${option("all", "Whole league", txFilter.team)}${clubs
      .map((c, i) => (i === state.team ? "" : option(i, c[1] + " " + c[2], txFilter.team)))
      .join("")}</select></label><label class="nav-select">Type <select aria-label="Transaction type" onchange="Nav.txFilter('type',this.value)">${option("all", "All moves", txFilter.type)}${Object.entries(TRANSACTION_TYPES)
      .map(([k, v]) => option(k, v, txFilter.type))
      .join("")}</select></label><label class="nav-select">Season <select aria-label="Season" onchange="Nav.txFilter('year',this.value)">${option("all", "All seasons", txFilter.year)}${years
      .map((y) => option(y, y, txFilter.year))
      .join("")}</select></label></div>`;
    const body = shown.length
      ? `<div class="scroll f-table"><table class="tx-table"><thead><tr><th>When</th><th>Move</th><th></th><th>Player</th><th>Contract</th></tr></thead><tbody>${shown
          .map((e) => txRow(e, team))
          .join("")}</tbody></table></div>${all.length > shown.length ? `<p class="subtitle">Showing the latest 200 of ${all.length} moves. Narrow the filters to see older ones.</p>` : ""}`
      : `<p class="subtitle">No moves match these filters yet. Signings, trades, waiver claims, draft picks, releases and retirements are recorded here from the moment this save first opens this screen or plays a week.</p>`;
    return panel(
      "Transactions",
      filters + body,
      `<small>${all.length} move${all.length === 1 ? "" : "s"}</small>`,
    );
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
      .slice(0, 8);
    if (recent.length)
      return `<div class="nav-moves">${recent
        .map(
          (e) =>
            `<article><span class="eyebrow">${when(e)} · ${TRANSACTION_TYPES[e.type]}</span><b>${esc(describeTransaction(e, teamName))}</b>${e.contract ? `<p>${esc(contractText(e))}</p>` : ""}</article>`,
        )
        .join("")}</div><button class="link" onclick="W.open('League desk','Transactions')">All transactions ${icon("arrow")}</button>`;
    const moves = ensureOffice(state)
      .stories.filter((a) =>
        /\b(sign|signs|signed|signing|trade|traded|release|released|waive|waived|extension|extends|acquire|acquired|draft|drafted|claims?|cut)\b/i.test(
          a.title + " " + (a.body || ""),
        ),
      )
      .slice(0, 8);
    return moves.length
      ? `<div class="nav-moves">${moves
          .map(
            (a) =>
              `<article><span class="eyebrow">${a.year} · ${a.week ? "Week " + a.week : "Offseason"} · ${esc(a.source || "League")}</span><b>${esc(a.title)}</b>${a.body ? `<p>${esc(a.body)}</p>` : ""}</article>`,
          )
          .join("")}</div><button class="link" onclick="W.open('News')">All league news ${icon("arrow")}</button>`
      : `<p class="subtitle">Signings, trades and releases around the league appear here.</p>`;
  }
  const snapshotView = () =>
    `<div class="nav-snapshot"><div class="nav-snapshot-main">${panel(
      `Standings · ${state.year}`,
      standings(),
      `<button class="link" onclick="W.open('Calendar','Head-to-head')">Head-to-head ${icon("arrow")}</button>`,
    )}</div><div class="nav-snapshot-side">${panel(
      "League leaders",
      leaders(),
      `<button class="link" onclick="W.open('Statistics')">Statistics ${icon("arrow")}</button>`,
    )}${panel("Notable transactions", transactions())}</div></div>${
      original.league
        ? `<details class="nav-more"><summary>Developing stories, supporter pulse and league meeting <span>⌄</span></summary>${original.league()}</details>`
        : ""
    }`;
  views["League desk"] = () => {
    const tab = current("League desk");
    return tabBar("League desk", tab) + (tab === "Transactions" ? transactionsView() : snapshotView());
  };
  // ---------- Records & milestones ----------
  function championsView() {
    const list = M.championshipList(state, clubs),
      counts = M.titleCounts(list).slice(0, 8);
    const rows = list
      .map((c) => {
        const notes = [
          c.record && `${c.record} regular season`,
          Number.isFinite(c.pointsFor) && `${c.pointsFor} PF / ${c.pointsAgainst} PA`,
          c.seasonMvp && `Season MVP: ${c.seasonMvp}`,
        ].filter(Boolean);
        return `<tr class="${c.winner === state.team ? "me" : ""}"><td><b>${c.year}</b></td><td>${c.winner >= 0 ? logo(c.winner) : ""} <b>${esc(c.winnerName)}</b></td><td>${c.runnerUp !== null && c.runnerUp >= 0 ? logo(c.runnerUp) + " " : ""}${esc(c.runnerUpName || "—")}</td><td class="numeric">${c.score ? `<b>${c.score[0]}–${c.score[1]}</b>` : "—"}</td><td>${esc(c.mvp || "—")}</td><td><small>${esc(notes.join(" · ") || (c.kind === "career" ? "" : "Historical record"))}</small></td></tr>`;
      })
      .join("");
    return `${panel(
      "Most titles",
      `<div class="nav-title-counts">${counts
        .map(
          ([t, n]) =>
            `<span>${logo(t)}<b>${n}</b><small>${esc(clubs[t][0])}</small></span>`,
        )
        .join("")}</div>`,
    )}${panel(
      "Super Bowl winners",
      `<div class="scroll f-table"><table><thead><tr><th>Season</th><th>Champion</th><th>Runner-up</th><th>Score</th><th>Game MVP</th><th>Key stats</th></tr></thead><tbody>${rows}</tbody></table></div><p class="subtitle nav-note">Career seasons include the final score, runner-up and the champion's season. Earlier seasons list the champion and, where recorded, the game MVP.</p>`,
      `<small>${list.length} championships</small>`,
    )}`;
  }
  function hallRows() {
    const simulated = (state.franchise.hall || []).map((p) => ({
      id: p.id,
      name: p.name,
      role: p.pos,
      classYear: p.year,
      teamIds: [p.team],
      stats: p.totals || {},
      note: p.inducted ? "Inducted" : `Eligible ${p.year}`,
      career: true,
    }));
    return [
      ...simulated,
      ...(heritage?.legends || []).map((l) => ({
        ...l,
        note: l.achievements?.[0] || l.headline || "",
      })),
    ].sort((a, b) => (b.classYear || 0) - (a.classYear || 0));
  }
  function hallView() {
    const rows = hallRows()
      .map((p) => {
        const stats = Object.entries(p.stats || {})
          .filter(([, v]) => Number.isFinite(v) && v > 0)
          .slice(0, 3)
          .map(
            ([k, v]) =>
              `<span><b>${number(v)}</b> <small>${esc(statLabel(k))}</small></span>`,
          )
          .join("");
        const teams =
          p.teamIds
            ?.map((t) => clubs[t]?.[0])
            .filter(Boolean)
            .join(" · ") ||
          p.team ||
          "";
        return `<tr><td><button class="link" onclick="Expansion?.legend('${esc(p.id)}')"><b>${esc(p.name)}</b></button><small>${esc(p.category === "Coaches" ? "Coach" : p.role || "")}${p.career ? " · This career" : ""}</small></td><td>${p.classYear || "—"}</td><td>${esc(teams)}</td><td class="nav-hof-stats">${stats || "—"}</td><td><small>${esc(p.note || "")}</small></td></tr>`;
      })
      .join("");
    return `${panel(
      "Hall of Fame",
      `<div class="scroll f-table"><table><thead><tr><th>Name</th><th>Class</th><th>Teams</th><th>Career numbers</th><th>Distinction</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No inductees recorded.</td></tr>'}</tbody></table></div>`,
      `<small>${hallRows().length} members</small>`,
    )}${original.hall ? `<details class="nav-more"><summary>Legends gallery and retired numbers <span>⌄</span></summary>${original.hall()}</details>` : ""}`;
  }
  views.Records = () => {
    const tab = current("Records");
    const body =
      tab === "Record book"
        ? original.records()
        : tab === "Hall of Fame"
          ? hallView()
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
        `<div class="nav-fixture-h2h"><span class="eyebrow">HEAD-TO-HEAD</span><div class="hub-health-row"><span>All-time record</span><b>${h.games.length ? record(h.allTime) : "First meeting"}</b></div>${h.last ? `<div class="hub-health-row"><span>Last meeting</span><b>${h.last.year} ${stage(h.last)} · ${h.last.result} ${h.last.pf}–${h.last.pa}</b></div>` : ""}<button class="secondary small" onclick="closeModal();Nav.rival(${r.opponent})">Full head-to-head ${icon("arrow")}</button></div>`,
      );
    };
  }
  // Keep the game log current for saves loaded mid-season.
  const previousRender = render;
  render = function () {
    if (state?.franchise) M.ensureMatchups(state);
    previousRender();
  };
  return { crumbLabel };
}
