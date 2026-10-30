import * as S from "./state.mjs";
import * as K from "./career-systems.mjs";
import * as R from "./records.mjs";
import * as A from "./awards.mjs";
import * as E from "./world-events.mjs";
import * as Jobs from "./career-jobs.mjs";
import * as C from "./contracts.mjs";
import { CharacterStage, appearanceFor } from "./character-stage.mjs";
import { playerFace, previewAttributes } from "./player-ui.mjs";
import { icon } from "./presentation.mjs";
const arg = (v) => esc(JSON.stringify(v));
const money = (n) =>
  "$" +
  (n / S.MILLION).toLocaleString("en-US", { maximumFractionDigits: 1 }) +
  "M";
const number = (n) =>
  Number.isFinite(n)
    ? n.toLocaleString("en-US", { maximumFractionDigits: 1 })
    : "—";
const name = (t) => (clubs[t] ? clubs[t][1] + " " + clubs[t][2] : "League");
const tag = (text, tone = "") =>
  `<span class="exp-tag ${tone}">${esc(text)}</span>`;
const empty = (title, text = "") =>
  `<div class="exp-empty">${icon("target")}<h3>${esc(title)}</h3><p>${esc(text)}</p></div>`;
const panel = (title, body, extra = "") =>
  `<section class="exp-panel"><div class="exp-panel-head"><h3>${title}</h3>${extra}</div>${body}</section>`;
const hero = (eyebrow, title, text, extra = "") =>
  `<section class="exp-hero"><div><span class="eyebrow">${eyebrow}</span><h2>${title}</h2><p>${text}</p></div>${extra}</section>`;
const options = (items, value) =>
  items
    .map((x) => {
      const [k, v] = Array.isArray(x) ? x : [x, x];
      return `<option value="${esc(k)}" ${String(k) === String(value) ? "selected" : ""}>${esc(v)}</option>`;
    })
    .join("");
const teamOptions = () => [
  ["All", "All franchises"],
  ...clubs.map((c, i) => [String(i), c[0] + " · " + c[2]]),
];
const metrics = {
  ...R.RECORD_FIELDS,
  Games: "Games",
  games: "Games",
  passYards: "Passing yards",
  passTD: "Passing touchdowns",
  rushYards: "Rushing yards",
  rushTD: "Rushing touchdowns",
  recYards: "Receiving yards",
  recTD: "Receiving touchdowns",
  receptions: "Receptions",
  defInterceptions: "Interceptions",
  sacks: "Sacks",
  wins: "Wins",
  titles: "Championships",
  points: "Points",
};
export function installExpansionUI({ views, isBusy, heritage }) {
  let stage = null,
    record = {
      entity: "Player",
      scope: "season",
      team: "All",
      query: "",
      page: 0,
    },
    hof = { team: "All", kind: "All", query: "", page: 0 },
    award = "MVP",
    awardYear = null,
    contractFilter = {
      query: "",
      position: "All",
      status: "All",
      sort: "Cap charge",
      page: 0,
    };
  const blocked = (area) =>
    isBusy() || !!state.live || (area && !S.allowed(state, area));
  const disabled = (area) => (blocked(area) ? "disabled" : "");
  const segments = (items, value, code) =>
    `<div class="exp-segments">${items.map((x) => `<button class="${x === value ? "active" : ""}" aria-pressed="${x === value}" onclick="${code}(${arg(x)})">${esc(x)}</button>`).join("")}</div>`;
  const stats = (items) =>
    `<div class="exp-stats">${items.map(([label, value, sub]) => `<div><small>${label}</small><b>${value}</b><span>${sub || ""}</span></div>`).join("")}</div>`;
  const dispose = () => {
    stage?.dispose();
    stage = null;
  };
  const previousModal = modal,
    previousClose = closeModal;
  modal = function (html) {
    dispose();
    document.getElementById("modal").classList.remove("exp-dialog");
    previousModal(html);
  };
  closeModal = function () {
    dispose();
    document.getElementById("modal").classList.remove("exp-dialog");
    previousClose();
  };
  document.getElementById("modal").addEventListener("close", dispose);
  function update(fn, after) {
    if (isBusy()) {
      toast("Wait for the calendar to finish advancing.");
      return false;
    }
    try {
      state = S.transact(state, fn);
      save();
      render();
      after?.();
      return true;
    } catch (e) {
      toast(e.message);
      return false;
    }
  }
  function mountStage(subject, board = false, shot = 0) {
    try {
      stage = new CharacterStage(document.getElementById("exp-stage"), {
        scene: "office",
        shot,
        coach: {
          ...appearanceFor({
            id: "coach-" + state.team,
            appearance: state.franchise.userCoach?.appearance,
          }),
          outfit: "Suit",
        },
        player: { ...appearanceFor(subject), outfit: "Suit" },
        extras: board
          ? [
              appearanceFor({
                id: "finance-director",
                appearance: { outfit: "Suit", jacket: "#27394b" },
              }),
            ]
          : [],
      });
      stage.camera.fov = 40;
      stage.target.set(shot ? 0.45 : 0, 1.18, -0.2);
      stage.camera.position.set(shot ? 0.85 : 0.1, 1.75, 5.3);
      stage.camera.lookAt(stage.target);
      stage.camera.updateProjectionMatrix();
    } catch (e) {
      document.getElementById("exp-stage").innerHTML =
        `<div class="exp-room-fallback">${icon("building")}<b>Executive meeting room</b></div>`;
    }
  }
  function scene({
    eyebrow,
    title,
    speaker,
    line,
    body,
    subject,
    board = false,
    shot = 0,
  }) {
    pauseAuto();
    window.broadcast?.stop();
    modal(
      `<div class="exp-scene"><div class="exp-scene-header"><span>${icon("briefcase")}${esc(eyebrow)}</span><button class="icon-button" aria-label="Close meeting" onclick="closeModal()">×</button></div><div class="exp-scene-layout"><section class="exp-cinema"><div id="exp-stage"></div><div class="exp-location"><span>FRONT OFFICE / PRIVATE MEETING</span><h2>${esc(title)}</h2><p>${esc(name(state.team))}</p></div></section><section class="exp-dialogue"><span class="eyebrow">${esc(speaker)}</span><blockquote>${esc(line)}</blockquote>${body}</section></div></div>`,
    );
    document.getElementById("modal").classList.add("exp-dialog");
    mountStage(subject, board, shot);
  }
  function contractsView() {
    const year = S.financeYear(state),
      cap = S.capLedger(state),
      list = state.roster
        .map((p) => ({ p, c: state.franchise.contracts[p.id] }))
        .filter(
          ({ p, c }) =>
            c &&
            !c.ended &&
            (contractFilter.query === "" ||
              p.name
                .toLowerCase()
                .includes(contractFilter.query.toLowerCase())) &&
            (contractFilter.status === "All" ||
              p.status === contractFilter.status) &&
            (contractFilter.position === "All" ||
              p.pos === contractFilter.position),
        );
    list.sort((a, b) =>
      contractFilter.sort === "Name"
        ? a.p.name.localeCompare(b.p.name)
        : contractFilter.sort === "Expiry"
          ? a.c.start + a.c.years - (b.c.start + b.c.years) || b.p.ovr - a.p.ovr
          : S.capHit(b.c, year) - S.capHit(a.c, year),
    );
    const pages = Math.max(1, Math.ceil(list.length / 8));
    contractFilter.page = Math.max(0, Math.min(contractFilter.page, pages - 1));
    return `<div class="exp-workspace">${hero("FRONT OFFICE / FINANCIAL PLANNING", "Build the roster. Protect the future.", "Review commitments, meet player representatives and plan the next contract cycle.", tag("Hard cap", "blue"))}${stats(
      [
        ["Cap limit", money(cap.limit)],
        ["Committed", money(cap.used)],
        ["Available", money(cap.room)],
        ["Dead money", money(cap.dead || 0)],
      ],
    )}<div class="exp-toolbar"><input aria-label="Search contracts" type="search" value="${esc(contractFilter.query)}" placeholder="Search player contracts…" onchange="Expansion.contractFilter('query',this.value)"><label class="exp-select">Position<select aria-label="Contract position" onchange="Expansion.contractFilter('position',this.value)">${options(["All", ...new Set(state.roster.map((p) => p.pos))], contractFilter.position)}</select></label><label class="exp-select">Registration<select aria-label="Contract registration" onchange="Expansion.contractFilter('status',this.value)">${options(
      [
        ["All", "All registrations"],
        ["active", "Active"],
        ["practice", "Practice squad"],
        ["ir", "Injured reserve"],
      ],
      contractFilter.status,
    )}</select></label>${segments(["Cap charge", "Expiry", "Name"], contractFilter.sort, "Expansion.contractSort")}</div>${panel(
      "Contract ledger",
      `<div class="exp-contract-table"><table><thead><tr><th>Player</th><th>Agreement</th><th>Cap charge</th><th>Guaranteed base</th><th>Actions</th></tr></thead><tbody>${
        list
          .slice(contractFilter.page * 8, contractFilter.page * 8 + 8)
          .map(({ p, c }) => {
            const i = Math.max(0, year - c.start),
              days = K.cooldownRemaining(state, "Contract review", p.id);
            return `<tr><td><button class="exp-contract-player" ${previewAttributes(p, state.team)} onclick="W.player(${arg(p.id)},${state.team})">${playerFace(p)}<span><b>${esc(p.name)}</b><small>${p.realPosition || p.pos} · ${p.ovr} OVR · ${esc(p.status)}</small></span></button></td><td><b>${c.start}–${c.start + c.years - 1}</b><small>${c.noTrade ? "No-trade clause" : c.voidYears ? c.voidYears + " void years" : Math.max(0, c.start + c.years - year) + " years remaining"}</small></td><td><strong>${money(S.capHit(c, year))}</strong></td><td>${money(c.guarantees.slice(i).reduce((n, v) => n + v, 0))}<small>${days ? `Review in ${days} days` : "Available for review"}</small></td><td><div class="exp-contract-actions"><button class="secondary small" onclick="F.contract(${arg(p.id)})">Structure</button><button class="small" onclick="Expansion.extension(${arg(p.id)})" ${disabled("finance") || days || year < c.start || year >= c.start + c.years ? "disabled" : ""}>Extend</button><button class="exp-text-button" onclick="F.release(${arg(p.id)})" ${disabled("roster")}>Waive</button></div></td></tr>`;
          })
          .join("") || '<tr><td colspan="5">No matching contracts.</td></tr>'
      }</tbody></table></div><div class="exp-pagination exp-panel-footer"><span>${list.length} contracts</span><button class="secondary small" onclick="Expansion.contractPage(-1)" ${contractFilter.page === 0 ? "disabled" : ""}>Previous</button><b>${contractFilter.page + 1} / ${pages}</b><button class="secondary small" onclick="Expansion.contractPage(1)" ${contractFilter.page >= pages - 1 ? "disabled" : ""}>Next</button></div>`,
    )}${panel(
      "Forward commitments",
      `<div class="exp-forward-grid">${[year + 1, year + 2, year + 3]
        .map((y) => {
          const l = S.capLedger(state, state.team, y);
          return `<div><span class="eyebrow">${y} SEASON</span><b>${money(l.room)} <small>projected room</small></b><div class="exp-cap-bar"><i style="width:${Math.max(0, Math.min(100, (l.used / l.limit) * 100))}%"></i></div><p>${money(l.used)} committed · ${money(l.limit)} limit</p></div>`;
        })
        .join("")}</div>`,
    )}</div>`;
  }

  function careerView() {
    const f = K.ensureCareerSystems(state),
      rep = f.coachReputation,
      perks = K.coachPerks(state),
      rifts = f.relationshipRifts.filter((r) => r.active);
    K.generateJobOffers(state);
    return `<div class="exp-workspace">${hero("COACHING CAREER / DOSSIER", esc(state.coach.name || "Your coaching career"), "Every decision builds a reputation. Results, development and relationships shape the opportunities ahead.", `<div class="exp-rep-orb"><b>${number(rep.value)}</b><span>${perks.label}</span></div>`)}${stats(
      [
        ["Standing", perks.label],
        [
          "Recruitment appeal",
          rep.value >= 60
            ? "Attractive"
            : rep.value < 40
              ? "Under pressure"
              : "Balanced",
        ],
        [
          "Contract leverage",
          rep.value >= 75
            ? "Strong"
            : rep.value >= 60
              ? "Improved"
              : "Standard",
        ],
        ["Active rifts", rifts.length],
      ],
    )}<div class="exp-two-col">${panel(
      "Reputation ledger",
      `<div class="exp-list">${
        rep.ledger
          .slice(0, 10)
          .map(
            (r) =>
              `<div class="exp-record-row"><span class="exp-event ${r.delta > 0 ? "positive" : "negative"}">${r.delta > 0 ? "↗" : "↘"}</span><span><b>${esc(r.reason)}</b><small>${r.year} W${r.week + 1} · ${esc(r.category)}</small></span>${tag(r.delta > 0 ? "Respect earned" : "Trust affected", r.delta > 0 ? "green" : "red")}</div>`,
          )
          .join("") ||
        empty(
          "Your story is ahead of you",
          "Adapt your tactics, develop talent and deliver on commitments.",
        )
      }</div>`,
    )}${panel("Relationships & trust", rifts.map((r) => `<div class="exp-rift"><div><b>${esc(r.name)}</b>${tag(r.severity >= 3 ? "Strained" : "Needs attention", "red")}</div><p>${esc(r.reason)}</p><button class="secondary small" onclick="${state.roster.some((p) => p.id === r.personId) ? `CI.open('player',${arg(r.personId)})` : `CI.open('staff')`}">Meet privately →</button></div>`).join("") || empty("A united building", "There are no unresolved relationship rifts."))}</div>${panel(
      "Head-coaching opportunities",
      `<div class="exp-job-grid">${
        rep.jobOffers
          .filter((o) => o.year === state.year)
          .map(
            (o) =>
              `<article><div>${logo(o.team)}${tag(o.prestige, "blue")}</div><h3>${esc(name(o.team))}</h3><p>Head coach · ${money(o.salary)} annually</p>${tag(o.status, o.status === "offered" ? "green" : "")}<div>${["invited", "interview"].includes(o.status) ? `<button onclick="Expansion.job(${arg(o.id)})" ${disabled()}>${o.status === "interview" ? "Resume interview" : "Attend interview"}</button>` : o.status === "offered" ? `<button onclick="Expansion.job(${arg(o.id)})" ${disabled()}>Review written offer →</button>` : ""}</div></article>`,
          )
          .join("") ||
        empty(
          "Build your next opportunity",
          "Offseason interest grows from 65 reputation. Higher standing attracts stronger teams.",
        )
      }</div>`,
    )}</div>`;
  }
  function recordsView() {
    const b = R.ensureRecordBook(state),
      rows = Object.values(b.records).filter(
        (r) =>
          r.entity === record.entity &&
          r.scope === record.scope &&
          (record.team === "All"
            ? r.id.startsWith(record.entity === "Coach" ? "coach:" : "league:")
            : r.id.startsWith(`team:${record.team}:`)) &&
          (r.name + " " + r.label)
            .toLowerCase()
            .includes(record.query.toLowerCase()),
      );
    const pages = Math.max(1, Math.ceil(rows.length / 9));
    record.page = Math.max(0, Math.min(record.page, pages - 1));
    return `<div class="exp-workspace">${hero("COMPETITION / RECORD BOOK", "The marks that endure.", "Track game, season and career records — and the players and coaches closing in.", tag(state.year + " season", "gold"))}<div class="exp-toolbar">${segments(["Player", "Coach"], record.entity, "Expansion.recordEntity")}${segments(["game", "season", "career"], record.scope, "Expansion.recordScope")}<label class="exp-select">Franchise<select aria-label="Record franchise" onchange="Expansion.filter('record','team',this.value)">${options(teamOptions(), record.team)}</select></label><input aria-label="Search records" type="search" placeholder="Search records…" value="${esc(record.query)}" onchange="Expansion.filter('record','query',this.value)"></div><div class="exp-record-grid">${
      rows
        .slice(record.page * 9, record.page * 9 + 9)
        .map(
          (r) =>
            `<article class="exp-record-card"><span class="eyebrow">${esc(r.label)}</span><strong>${number(r.value)}</strong><h3>${esc(r.name)}</h3><div>${tag(r.historical ? "All-time standard" : "Record holder", r.historical ? "gold" : "green")}<small>${r.year || "Shared mark"} ${r.team !== null && r.team !== undefined ? " · " + esc(clubs[r.team][0]) : ""}</small></div>${r.playerId && S.roster(state, r.team).some((p) => p.id === r.playerId) ? `<button class="exp-text-button" onclick="W.player(${arg(r.playerId)},${r.team})">Player profile →</button>` : ""}</article>`,
        )
        .join("") ||
      empty(
        "No matching records",
        "Choose another franchise or record category.",
      )
    }</div><div class="exp-pagination"><span>${rows.length} records</span><button class="secondary small" onclick="Expansion.page('record',-1)" ${record.page === 0 ? "disabled" : ""}>Previous</button><b>${record.page + 1} / ${pages}</b><button class="secondary small" onclick="Expansion.page('record',1)" ${record.page >= pages - 1 ? "disabled" : ""}>Next</button></div><div class="exp-two-col">${panel(
      "Milestone wire",
      `<div class="exp-list">${
        b.alerts
          .slice(0, 6)
          .map(
            (a) =>
              `<div class="exp-record-row"><span class="exp-row-icon">${icon("chart")}</span><span><b>${esc(a.name)}</b><small>${esc(a.label)} · ${number(a.value)}${a.broken ? "" : " / " + number(a.target)}</small></span>${tag(a.broken ? "Record broken" : "Closing in", a.broken ? "gold" : "blue")}</div>`,
          )
          .join("") ||
        empty(
          "The chase begins",
          "Milestone alerts appear as a player approaches a league record.",
        )
      }</div>`,
    )}${panel(
      "Franchise leaders · " + state.year,
      `<div class="exp-list">${
        Object.entries(R.RECORD_FIELDS)
          .slice(0, 6)
          .map(([key, label]) => {
            const best = Object.values(b.regularTotals[state.year] || {})
              .filter((p) => p.team === state.team)
              .sort((a, b) => (b.stats[key] || 0) - (a.stats[key] || 0))[0];
            return best && (best.stats[key] || 0) > 0
              ? `<button class="exp-record-row" onclick="W.player(${arg(best.id)},${best.team})"><span><small>${label}</small><b>${esc(best.name)}</b></span><strong>${number(best.stats[key])}</strong></button>`
              : "";
          })
          .join("") ||
        empty(
          "Regular-season production",
          "The first results establish your team leaders.",
        )
      }</div>`,
    )}</div></div>`;
  }
  function candidates(snapshot, a) {
    if (a === "COTY")
      return snapshot.coaches.map((c) => ({
        ...c,
        breakdown: A.coachAwardScore(c),
      }));
    if (a === "ACOTY")
      return snapshot.assistants.map((c) => ({ ...c, breakdown: c.score }));
    const offense = (p) => ["QB", "RB", "WR", "TE", "OL"].includes(p.pos),
      defense = (p) => ["DL", "LB", "CB", "S"].includes(p.pos),
      rookie = (p) => p.experience === 0 || p.draftYear === snapshot.year;
    return snapshot.players
      .filter((p) =>
        a === "MVP"
          ? offense(p) || defense(p)
          : a === "OPOY"
            ? offense(p)
            : a === "DPOY"
              ? defense(p)
              : a === "OROY"
                ? offense(p) && rookie(p)
                : a === "DROY"
                  ? defense(p) && rookie(p)
                  : p.recoveryWeeks >= 6 && (p.stats.snaps || 0) >= 100,
      )
      .map((p) => ({ ...p, breakdown: A.playerAwardScore(p, a) }));
  }
  function awardsView() {
    const f = state.franchise,
      years = [
        ...new Set([
          state.year,
          ...Object.keys(f.awardBallots || {}).map(Number),
        ]),
      ].sort((a, b) => b - a);
    if (!years.includes(Number(awardYear))) awardYear = state.year;
    const ballot = f.awardBallots?.[awardYear],
      snapshot = ballot?.snapshot || A.awardsSnapshot(state),
      announced = !!ballot?.announced,
      locked = !!ballot?.locked;
    let rows = announced
      ? ballot.races[award].results
      : locked
        ? ballot.races[award].results
            .slice(0, 5)
            .sort((a, b) => a.name.localeCompare(b.name))
        : candidates(snapshot, award)
            .sort((a, b) => b.breakdown.total - a.breakdown.total)
            .slice(0, 10);
    return `<div class="exp-workspace">${hero("COMPETITION / NFL HONORS", "Great seasons. Lasting recognition.", "Follow the race across the league, then explore the final ranked ballots.", tag(announced ? "Honors announced" : locked ? "Ballot sealed" : "Awards watch", announced ? "gold" : locked ? "blue" : "green"))}<div class="exp-toolbar"><label class="exp-select">Season<select aria-label="Awards season" onchange="Expansion.awardYear(this.value)">${options(years, awardYear)}</select></label>${segments(Object.keys(A.AWARD_NAMES), award, "Expansion.award")}</div>${panel(
      A.AWARD_NAMES[award],
      `${stats([
        [
          "Status",
          announced
            ? "Final results"
            : locked
              ? "Voting closed"
              : "Race in progress",
        ],
        ["Ballot", locked ? "50 voters" : "Regular season"],
        ["Rank weights", "10 · 5 · 3 · 2 · 1"],
        [
          "Winner",
          announced
            ? esc(
                rows
                  .filter((r) => r.winner)
                  .map((r) => r.name)
                  .join(" / "),
              )
            : "To be announced",
        ],
      ])}<div class="exp-award-list">${
        rows
          .slice(0, 10)
          .map(
            (r, i) =>
              `<article class="exp-award-row"><strong class="exp-award-rank">${locked && !announced ? "•" : String(i + 1).padStart(2, "0")}</strong>${r.pos ? playerFace(r) : `<span class="exp-row-icon">${icon("briefcase")}</span>`}<div><h3>${esc(r.name)} ${announced && r.winner ? tag("Winner", "gold") : ""}</h3><small>${esc(name(r.team))}${r.pos ? " · " + r.pos : ""}</small>${!locked ? `<div class="exp-score-bars"><span title="Production and expectations" style="width:${Math.max(2, Math.min(80, r.breakdown.production))}%"></span><i title="Team results" style="width:${Math.max(1, Math.min(25, r.breakdown.team))}%"></i></div>` : ""}</div><div class="exp-award-score"><b>${announced ? number(r.points) : locked ? "Finalist" : number(r.breakdown.total)}</b><small>${announced ? r.firstVotes + " first-place votes" : locked ? "Ballot sealed" : "Race index"}</small></div>${r.pos ? `<button class="secondary small" onclick="W.player(${arg(r.playerId || r.id)},${r.team})">Profile</button>` : ""}</article>`,
          )
          .join("") ||
        empty(
          "The field is still forming",
          award === "CPOY"
            ? "A comeback requires a substantial documented absence and a meaningful return to play."
            : "Candidates emerge as the season unfolds.",
        )
      }</div>${announced ? `<div class="exp-panel-footer"><button class="secondary small" onclick="Expansion.ballots()">Explore the 50 ballots →</button></div>` : ""}`,
    )}${!announced ? `<div class="exp-explainer"><b>${locked ? "The regular-season vote is preserved." : "What drives this race?"}</b><p>${locked ? "Playoff results do not alter the sealed ballots. Honors are announced after the championship." : award === "COTY" ? "Wins above the preseason expectation and year-to-year improvement carry the most weight. Team results and the late-season story influence a close race." : award === "MVP" ? "Quarterback production, team record and seeding carry substantial weight. Exceptional seasons at other positions can challenge the field." : "Production and position-specific impact lead the evaluation. Recent performance, reputation and the team story influence close decisions."}</p></div>` : ""}</div>`;
  }
  function hofRows() {
    const simulated = (state.franchise.hall || []).map((p) => ({
      ...p,
      category: "Players",
      teamIds: [p.team],
      classYear: p.year,
      role: p.pos,
      stats: p.totals,
      achievements: (p.awards || []).map((a) => a.year + " " + a.award),
      bio: `${p.name} retired in ${p.retired}. The career ledger includes all recorded games. ${p.inducted ? "Enshrined in" : "Eligible for"} the Hall of Fame in ${p.year}.`,
      historical: false,
    }));
    return [...(heritage?.legends || []), ...simulated].filter(
      (p) =>
        (hof.team === "All" || p.teamIds?.includes(Number(hof.team))) &&
        (hof.kind === "All" ||
          (hof.kind === "Players"
            ? p.category !== "Coaches"
            : p.category === "Coaches")) &&
        (p.name + " " + (p.role || ""))
          .toLowerCase()
          .includes(hof.query.toLowerCase()),
    );
  }
  function hofView() {
    const rows = hofRows(),
      pages = Math.max(1, Math.ceil(rows.length / 8));
    hof.page = Math.max(0, Math.min(hof.page, pages - 1));
    const team = heritage?.teams.find((t) => String(t.id) === hof.team),
      numbers = team?.retiredNumbers || [];
    return `<div class="exp-workspace">${hero("HISTORY / CANTON & FRANCHISE LEGENDS", "The people who shaped the game.", "Explore the greats, their achievements and the numbers that belong to franchise history.", tag("32 franchises", "gold"))}<div class="exp-toolbar"><label class="exp-select">Franchise<select aria-label="Hall of Fame franchise" onchange="Expansion.filter('hof','team',this.value)">${options(teamOptions(), hof.team)}</select></label>${segments(["All", "Players", "Coaches"], hof.kind, "Expansion.hofKind")}<input aria-label="Search Hall of Fame" type="search" value="${esc(hof.query)}" placeholder="Search the greats…" onchange="Expansion.filter('hof','query',this.value)"></div>${team ? panel(esc(team.name) + " · Retired numbers", `<div class="exp-retired-numbers">${numbers.map((n) => `<div><strong>${n.number}</strong><span>${esc(n.name)}</span></div>`).join("") || "<p>No officially retired numbers are recorded for this franchise.</p>"}</div>`) : ""}<div class="exp-legend-grid">${
      rows
        .slice(hof.page * 8, hof.page * 8 + 8)
        .map(
          (p) =>
            `<button class="exp-legend" onclick="Expansion.legend(${arg(p.id)})"><div class="exp-legend-image">${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">` : playerFace(p)}<span>${tag(p.category === "Coaches" ? "Coach" : p.role || p.pos, "gold")}</span></div><div class="exp-legend-copy"><span class="eyebrow">CLASS OF ${p.classYear || "—"}</span><h3>${esc(p.name)}</h3><p>${
              p.teamIds
                ?.map((t) => clubs[t]?.[0])
                .filter(Boolean)
                .join(" · ") || ""
            }</p><div>${Object.entries(p.stats || {})
              .filter(([k]) => k !== "Hall of Fame class")
              .sort(([a], [b]) => {
                const priority = (k) =>
                  /yards|Yards/.test(k)
                    ? 0
                    : /touchdowns|TD|sacks|Sacks|Interceptions|wins|championship/.test(
                          k,
                        )
                      ? 1
                      : 3;
                return priority(a) - priority(b);
              })
              .slice(0, 2)
              .map(
                ([k, v]) =>
                  `<span><b>${number(v)}</b><small>${esc(metrics[k] || k)}</small></span>`,
              )
              .join("")}</div></div></button>`,
        )
        .join("") ||
      empty("No matching legends", "Try another position, name or franchise.")
    }</div><div class="exp-pagination"><span>${rows.length} legends</span><button class="secondary small" onclick="Expansion.page('hof',-1)" ${hof.page === 0 ? "disabled" : ""}>Previous</button><b>${hof.page + 1} / ${pages}</b><button class="secondary small" onclick="Expansion.page('hof',1)" ${hof.page >= pages - 1 ? "disabled" : ""}>Next</button></div></div>`;
  }
  function leagueView() {
    const f = K.ensureCareerSystems(state),
      rumors = f.world.rumors.slice(0, 8),
      agenda =
        state.phase === "offseason"
          ? E.ensureCommittee(state)
          : f.world.committee[0];
    return `<div class="exp-workspace">${hero("LEAGUE DESK / THE WIDER GAME", "Football never stands still.", "Track developing stories, the mood around your club and the decisions shaping next season.", tag(state.phase === "offseason" ? "Annual league meeting" : "Around the league", "blue"))}${stats(
      [
        ["Fan pulse", number(f.clubs[state.team].fanApproval) + "%"],
        [
          "Developing reports",
          f.world.rumors.filter((r) =>
            ["Developing", "Addressed"].includes(r.status),
          ).length,
        ],
        ["Season length", f.rules.regularGames + " games"],
        ["Trade deadline", "Week " + (f.rules.tradeDeadline || 9)],
      ],
    )}<div class="exp-two-col">${panel("Developing stories", `<div class="exp-rumors">${rumors.map((r) => `<article><div>${logo(r.team)}<span class="eyebrow">${esc(clubs[r.team][0])} / ${esc(r.kind)}</span>${tag(r.status, r.status === "Confirmed" ? "red" : r.status === "Resolved" ? "green" : "amber")}</div><h3>${esc(r.name)}</h3><p>${r.status === "Developing" ? "League sources are discussing the situation. No action has been confirmed." : r.status === "Confirmed" ? "The report has become an active club matter." : r.status === "Addressed" ? "The club has responded. Further developments are being monitored." : r.outcome || "The latest information has been added to the club record."}</p>${r.team === state.team && !r.response && ["Developing", "Confirmed"].includes(r.status) ? `<div class="exp-response-buttons">${["Private contact", "Public support", "Demand accountability"].map((c) => `<button class="secondary small" onclick="Expansion.rumor(${arg(r.id)},${arg(c)})" ${disabled("media")}>${c}</button>`).join("")}</div>` : r.response ? tag("Response: " + r.response, "blue") : ""}</article>`).join("") || empty("A quiet news cycle", "Reports develop from contract concerns, trade interest and coaching pressure.")}</div>`)}${panel("Competition Committee", agenda ? `<div class="exp-committee">${agenda.proposals.map((p) => `<article><div><h4>${esc(p.label)}</h4>${tag(p.status, p.status === "Adopted" ? "green" : p.status === "Defeated" ? "red" : "blue")}</div><p>${esc(p.description)} Proposed: <b>${p.kind === "cap" ? money(p.target) : esc(p.target)}</b></p>${p.status === "Open" ? `<div><button class="small" onclick="Expansion.vote(${arg(p.id)},'Yes')" ${disabled("league")}>Vote for</button><button class="secondary small" onclick="Expansion.vote(${arg(p.id)},'No')" ${disabled("league")}>Vote against</button></div>` : `<b>${p.yes}–${p.no}</b><small> · ${p.applied ? "In force from " + p.appliedYear : "Effective " + agenda.effectiveYear}</small>`}</article>`).join("")}</div>` : empty("The annual meeting is ahead", "Ownership votes after the championship. Adopted changes take effect at the next training camp."))}</div>${panel(
      "Supporter pulse",
      `<div class="exp-pulse-grid">${
        f.fanPulse.events
          .slice(0, 6)
          .map(
            (m) =>
              `<article><span class="exp-event ${m.delta >= 0 ? "positive" : "negative"}">${m.delta >= 0 ? "↗" : "↘"}</span><b>${esc(m.reason)}</b><p>${esc(m.detail || "The decision is part of the conversation around the club.")}</p>${tag(m.delta >= 0 ? "Backing the decision" : "Questions being asked", m.delta >= 0 ? "green" : "amber")}</article>`,
          )
          .join("") ||
        empty(
          "Your decisions start the conversation",
          "Fourth downs, draft selections, trades and coaching changes draw supporter reactions.",
        )
      }</div>`,
      "<button class=\"exp-text-button\" onclick=\"W.open('News');Hub.mediaTab('Fan network')\">Open social feed →</button>",
    )}</div>`;
  }
  function jobScene(id) {
    const o = state.franchise.coachReputation.jobOffers.find(
      (o) => o.id === id,
    );
    if (!o) return;
    if (o.status === "invited" && !update((s) => Jobs.beginJobInterview(s, id)))
      return;
    const current = state.franchise.coachReputation.jobOffers.find(
        (o) => o.id === id,
      ),
      step = current.answers?.length || 0;
    scene({
      eyebrow: "Career / Head-coaching interview",
      title: name(current.team),
      speaker: state.franchise.clubs[current.team].owner.name,
      subject: { id: "owner-" + current.team },
      board: true,
      shot: step % 2,
      line:
        current.status === "interview"
          ? Jobs.JOB_QUESTIONS[step].question
          : current.line || "Thank you for meeting with us.",
      body:
        current.status === "interview"
          ? `<div class="exp-response-list">${Jobs.JOB_QUESTIONS[step].choices.map((text, i) => `<button onclick="Expansion.jobAnswer(${arg(id)},${step},${i})"><b>${esc(text)}</b>${icon("chevron")}</button>`).join("")}</div>`
          : current.status === "offered"
            ? `${stats([
                ["Annual salary", money(current.salary)],
                ["Role", "Head coach"],
              ])}<p>The appointment takes you to ${esc(name(current.team))}. Your current club will release you when the new committee completes its search.</p><button onclick="Expansion.acceptJob(${arg(id)})" ${disabled()}>Accept and join the club →</button><button class="secondary" onclick="Expansion.declineJob(${arg(id)})">Decline offer</button>`
            : `<p>${esc(current.line || "The opportunity has concluded.")}</p><button onclick="closeModal()">Return to career</button>`,
    });
  }
  function extension(id) {
    const p = state.roster.find((p) => p.id === id),
      c = state.franchise.contracts[id];
    if (!p || !c) return;
    const talk = state.franchise.extensionTalks?.[id],
      valid = talk?.year === S.financeYear(state) && talk.team === state.team,
      t = valid
        ? talk.terms
        : {
            annual: Math.max(
              0.8,
              p.salary * K.coachPerks(state).demand,
            ).toFixed(1),
            years: 2,
            bonus: Math.max(1, p.salary * 0.5).toFixed(1),
            guaranteed: Math.max(0.8, p.salary).toFixed(1),
          },
      ready = valid && talk.status === "reviewed",
      days = K.cooldownRemaining(state, "Contract review", id);
    scene({
      eyebrow: "Contract / Extension meeting",
      title: p.name,
      speaker: "Player representative",
      subject: p,
      shot: ready ? 1 : 0,
      line: days
        ? `We have just concluded a contract review. Let us return to this in ${days} days.`
        : ready
          ? "The structure meets our expectations. If you are ready, we can sign the additional seasons."
          : "We value the relationship. Show us the additional seasons, annual value and financial security you can commit to.",
      body: `${stats([
        ["Current deal ends", c.start + c.years - 1],
        ["Cap room", money(S.capLedger(state).room)],
      ])}${
        ready
          ? `<div class="exp-extension-summary">${stats([
              ["Additional seasons", t.years],
              ["Annual base", money(Number(t.annual) * S.MILLION)],
              ["Signing bonus", money(Number(t.bonus) * S.MILLION)],
              ["Guaranteed base", money(Number(t.guaranteed) * S.MILLION)],
            ])}</div><button onclick="Expansion.signExtension(${arg(id)})" ${disabled("finance")}>Sign the extension →</button><button class="secondary" onclick="Expansion.reviseExtension(${arg(id)})">Revise terms</button>`
          : `<form class="exp-extension-form" onsubmit="event.preventDefault();Expansion.reviewExtension(${arg(id)},this)">${[
              ["annual", "Annual base ($M)", 0.8, 0.1],
              ["years", "Additional seasons", 1, 1],
              ["bonus", "Signing bonus ($M)", 0, 0.1],
              ["guaranteed", "Guaranteed base ($M)", 0, 0.1],
            ]
              .map(
                ([k, label, min, step]) =>
                  `<label>${label}<input name="${k}" type="number" min="${min}" step="${step}" max="${k === "years" ? 5 : 500}" value="${esc(t[k])}" required></label>`,
              )
              .join(
                "",
              )}<button ${disabled("finance") || days ? "disabled" : ""}>Present extension proposal →</button></form>`
      }`,
    });
  }
  window.Expansion = {
    contractFilter(key, value) {
      contractFilter[key] = value;
      contractFilter.page = 0;
      render();
    },
    contractSort(value) {
      contractFilter.sort = value;
      contractFilter.page = 0;
      render();
    },
    contractPage(delta) {
      contractFilter.page += delta;
      render();
    },
    extension,
    debug(kind, value) {
      update((s) => {
        if (!s.franchise.debug) throw Error("Enable developer mode first.");
        if (kind === "reputation") {
          const v = Number(value);
          if (!Number.isFinite(v) || v < 0 || v > 99)
            throw Error("Choose a reputation from 0 to 99.");
          s.franchise.coachReputation.value = v;
          s.franchise.career.reputation = v;
        } else if (kind === "clock")
          K.advanceCareerTime(s, 7, "debug:" + s.franchise.clock.day);
        else if (kind === "rumor") {
          const p = s.roster.slice().sort((a, b) => b.ovr - a.ovr)[0];
          if (!p) throw Error("No player available.");
          s.franchise.world.rumors.unshift({
            id: "debug-rumor-" + s.franchise.clock.day,
            kind: "Trade buzz",
            team: s.team,
            playerId: p.id,
            name: p.name,
            year: s.year,
            week: s.week,
            day: s.franchise.clock.day,
            deadline: s.franchise.clock.day + 7,
            status: "Developing",
            heat: 90,
            response: null,
          });
        }
        s.debugSave = true;
      });
    },
    recordEntity(v) {
      record.entity = v;
      record.page = 0;
      render();
    },
    recordScope(v) {
      record.scope = v;
      record.page = 0;
      render();
    },
    hofKind(v) {
      hof.kind = v;
      hof.page = 0;
      render();
    },
    filter(kind, key, v) {
      const f = kind === "hof" ? hof : record;
      f[key] = v;
      f.page = 0;
      render();
    },
    page(kind, delta) {
      (kind === "hof" ? hof : record).page += delta;
      render();
    },
    award(v) {
      award = v;
      render();
    },
    awardYear(v) {
      awardYear = Number(v);
      render();
    },
    ballots() {
      const ballot = state.franchise.awardBallots?.[awardYear];
      if (!ballot?.announced) return;
      const race = ballot.races[award],
        names = new Map(race.results.map((r) => [r.id, r.name]));
      modal(
        `<div class="exp-ballots"><span class="eyebrow">${awardYear} / ${esc(A.AWARD_NAMES[award])}</span><h2>The ranked ballots</h2><div class="exp-ballot-table"><table><thead><tr><th>Voter</th>${A.AP_POINTS.map((p, i) => `<th>${i + 1} · ${p} pts</th>`).join("")}</tr></thead><tbody>${race.ballots.map((b) => `<tr><td>${String(b.voter).padStart(2, "0")}</td>${Array.from({ length: 5 }, (_, i) => `<td>${esc(names.get(b.ranked[i]) || "—")}</td>`).join("")}</tr>`).join("")}</tbody></table></div><button onclick="closeModal()">Done</button></div>`,
      );
    },
    legend(id) {
      const p = [...(heritage?.legends || []), ...hofRows()].find(
        (p) => p.id === id,
      );
      if (!p) return;
      modal(
        `<div class="exp-legend-detail"><button class="icon-button exp-detail-close" aria-label="Close legend profile" onclick="closeModal()">×</button><div class="exp-legend-detail-hero">${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}">` : playerFace(p)}<div><span class="eyebrow">HALL OF FAME / ${p.role || p.pos || "LEGACY"}</span><h2>${esc(p.name)}</h2>${tag("Class of " + (p.classYear || "—"), "gold")}<p>${p.teamIds?.map((t) => name(t)).join(" · ") || esc(p.team || "")}</p></div></div><div class="exp-detail-body"><p>${esc(p.bio || "A career that helped define franchise history.")}</p>${stats(
          Object.entries(p.stats || {})
            .filter(
              ([k, v]) => k !== "Hall of Fame class" && typeof v === "number",
            )
            .map(([k, v]) => [metrics[k] || k, number(v)]),
        )}<h3>Achievements & legacy</h3><div class="exp-achievements">${(p.achievements || []).map((x) => `<div>${icon("check")}<span>${esc(x)}</span></div>`).join("")}</div></div></div>`,
      );
    },
    rumor(id, choice) {
      update((s) => E.respondRumor(s, id, choice));
    },
    vote(id, choice) {
      update((s) => E.voteCommittee(s, id, choice));
    },
    job: jobScene,
    jobAnswer(id, step, index) {
      update(
        (s) => Jobs.answerJobInterview(s, id, step, index),
        () => jobScene(id),
      );
    },
    acceptJob(id) {
      update(
        (s) => Jobs.acceptJob(s, id),
        () => {
          league = clubs[state.team][3];
          closeModal();
          toast("Your new club is ready.");
        },
      );
    },
    declineJob(id) {
      update(
        (s) => Jobs.declineJob(s, id),
        () => closeModal(),
      );
    },
    reviewExtension(id, form) {
      const terms = Object.fromEntries(new FormData(form));
      update(
        (s) => {
          S.transact(s, (test) => C.extendContract(test, id, terms));
          (s.franchise.extensionTalks ??= {})[id] = {
            team: s.team,
            year: S.financeYear(s),
            terms,
            status: "reviewed",
          };
        },
        () => extension(id),
      );
    },
    reviseExtension(id) {
      update(
        (s) => {
          s.franchise.extensionTalks[id].status = "draft";
        },
        () => extension(id),
      );
    },
    signExtension(id) {
      update(
        (s) => {
          const talk = s.franchise.extensionTalks?.[id];
          if (
            !talk ||
            talk.status !== "reviewed" ||
            talk.team !== s.team ||
            talk.year !== S.financeYear(s)
          )
            throw Error("Review the current extension terms first.");
          C.extendContract(s, id, talk.terms);
          talk.status = "signed";
        },
        () => {
          closeModal();
          toast("The extension has been signed.");
        },
      );
    },
  };
  const previousDebug = views.Debug;
  views.Debug = () =>
    previousDebug() +
    panel(
      "Career systems controls",
      `<div class="exp-debug-controls"><label>Coach reputation<input id="exp-debug-rep" type="number" min="0" max="99" value="${K.coachReputation(state)}"></label><button class="secondary small" onclick="Expansion.debug('reputation',document.getElementById('exp-debug-rep').value)">Set reputation</button><button class="secondary small" onclick="Expansion.debug('clock')">Advance action clock 7 days</button><button class="secondary small" onclick="Expansion.debug('rumor')">Create trade rumor</button></div>`,
    );
  views.Contracts = contractsView;
  views["Career dossier"] = careerView;
  views.Records = recordsView;
  views.Awards = awardsView;
  views["Hall of Fame"] = hofView;
  views["League desk"] = leagueView;
  const originalAction = F.action;
  F.action = function (action, ...args) {
    if (action === "interview") {
      window.W.open("Career dossier");
      return;
    }
    return originalAction(action, ...args);
  };
  F.trade = function () {
    const own = document.getElementById("trade-out"),
      other = document.getElementById("trade-team"),
      target = document.getElementById("trade-in");
    if (!own || !other || !target) return;
    return F.action("trade", own.value, Number(other.value), target.value);
  };
}
