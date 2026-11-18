import { socialPost, socialReputationPanel } from "./social-ui.mjs";
import * as S from "./state.mjs";
import {
  hubPreferences,
  toggleStored,
  teamNeeds,
  draftBoard,
  fixtures,
  fixtureSummary,
  championshipArchive,
  socialFeed,
} from "./front-office.mjs";
import {
  playerFace,
  previewAttributes,
  scorePill,
  positionBadge,
} from "./player-ui.mjs";
import { heightLabel, paginate } from "./player-catalog.mjs";
import { icon } from "./presentation.mjs";
import { draftRoomView } from "./draft-room-ui.mjs";
import { marketView as opsMarketView, installOps, windowStrip } from "./ops-ui.mjs";
const fmt = (n, d = 0) =>
  Number.isFinite(n)
    ? n.toLocaleString("en-US", { maximumFractionDigits: d })
    : "—";
const cash = (n) => "$" + fmt(n / S.MILLION, 1) + "M";
const arg = (x) => esc(JSON.stringify(x));
const chip = (label, tone = "") =>
  `<span class="hub-chip ${tone}">${esc(label)}</span>`;
const empty = (title, body) =>
  `<div class="hub-empty">${icon("search")}<h3>${title}</h3><p>${body}</p></div>`;
const meter = (n, tone = "") =>
  `<span class="hub-meter ${tone}"><i style="width:${Math.max(0, Math.min(100, n))}%"></i></span>`;
const panel = (title, body, extra = "") =>
  `<section class="panel hub-panel"><div class="panel-head"><h2>${title}</h2>${extra}</div>${body}</section>`;
const stats = (items) =>
  `<div class="hub-stats">${items.map(([k, v, n, t = ""]) => `<div class="${t}"><span>${k}</span><b>${v}</b><small>${n || ""}</small></div>`).join("")}</div>`;
const options = (a, v) =>
  a
    .map((x) => {
      const [value, label] = Array.isArray(x) ? x : [x, x];
      return `<option value="${esc(value)}" ${String(value) === String(v) ? "selected" : ""}>${esc(label)}</option>`;
    })
    .join("");
export function installHubUI({ views, isBusy, tradeView }) {
  const oldClub = views.Club,
    oldNews = views.News;
  let draft = {
      query: "",
      position: "All",
      pinned: false,
      sort: "estimate",
      scouted: false,
      page: 1,
    },
    market = {
      query: "",
      position: "All",
      sort: "rating",
      minimum: 0,
      tab: "Available",
      page: 1,
    },
    schedule = { scope: "All", layout: "Cards" },
    history = { scope: "All", team: "All", decade: "All", query: "", page: 1 },
    clubTab = "Overview",
    mediaTab = "Newsroom",
    social = { scope: "All", topic: "All", query: "", page: 1 },
    thread = null;
  const disabled = (area) =>
    isBusy() || (area && !S.allowed(state, area)) ? "disabled" : "";
  const action = (text, code, area = "", secondary = false) =>
    `<button class="${secondary ? "secondary " : ""}small" onclick="${code}" ${disabled(area)}>${text}</button>`;
  const name = (p, t) =>
    `<button class="player-link" ${previewAttributes(p, t)} onclick="W.player(${arg(p.id)},${t})">${playerFace(p)}<span><b>${esc(p.name)}</b><small>${esc(p.realPosition || p.pos)} · ${esc(p.college || "College unrecorded")}</small></span></button>`;
  const tabs = (items, value, fn) =>
    `<div class="hub-tabs">${items.map((x) => `<button class="${value === x ? "active" : ""}" aria-pressed="${value === x}" onclick="${fn}(${arg(x)})">${esc(x)}</button>`).join("")}</div>`;
  const hero = (eyebrow, title, body, bits, tone = "") =>
    `<div class="hub-hero ${tone}"><div><span class="eyebrow">${eyebrow}</span><h2>${title}</h2><p>${body}</p></div><div class="hub-hero-aside">${bits}</div></div>`;
  const pager = (kind, p) =>
    `<div class="hub-pagination"><span>${p.total ? `${p.from}–${p.to} of ${p.total}` : "0 results"}</span><div><button class="secondary small" onclick="Hub.page('${kind}',-1)" ${p.page <= 1 ? "disabled" : ""}>Previous</button><b>${p.page} / ${p.pages}</b><button class="secondary small" onclick="Hub.page('${kind}',1)" ${p.page >= p.pages ? "disabled" : ""}>Next</button></div></div>`;
  const search = (kind, label, value) =>
    `<label class="hub-search">${icon("search")}<input id="hub-${kind}-query" aria-label="${label}" type="search" placeholder="${label}…" value="${esc(value)}" oninput="Hub.filter('${kind}','query',this.value)"></label>`;
  // The Draft room itself lives in draft-room-ui.mjs; the board filters stay here for Hub.filter/page.
  const draftView = () => draftRoomView({ filters: draft, busy: isBusy });
  // The war-room header carries the draft window; the strip keeps the trade window beside it.
  views.Draft = () => windowStrip(["trade"]) + draftView();
  // One market workspace for the sidebar and the Hub tab: windows, trade builder, offers, free agents.
  if (!window.Ops) installOps({ isBusy });
  views.Market = () =>
    hero(
      "RECRUITMENT / PLAYER MARKET",
      "Trades and free agency.",
      "Build a trade, answer offers, or bid on free agents. Open any player's scouting report to see value, fit and what is blocking a move.",
      chip(state.franchise.market.phase, "green"),
      "market-hero",
    ) + opsMarketView();
  views.Club = () => {
    const c = state.franchise.clubs[state.team],
      st = c.stadium,
      needs = teamNeeds(state),
      staff = c.staff || [],
      projects = st.projects.filter((p) => p.remaining > 0);
    const body =
      clubTab === "Facilities"
        ? oldClub()
        : clubTab === "Staff"
          ? `<div class="hub-staff-grid">${staff
              .map(
                (p) =>
                  `<article class="panel hub-staff-card"><span class="hub-staff-initial">${esc(
                    p.name
                      .split(" ")
                      .map((s) => s[0])
                      .slice(0, 2)
                      .join(""),
                  )}</span>${chip(p.role, "blue")}<h3>${esc(p.name)}</h3><p>${esc(p.scheme)}</p><div>${scorePill("rating", p.rating)} <span>Staff rating</span></div><small>${cash(p.salary)} / year · ${p.years} years</small></article>`,
              )
              .join(
                "",
              )}</div>${panel("Available coaching staff", `<div class="hub-table-scroll"><table><thead><tr><th>CANDIDATE</th><th>ROLE / SCHEME</th><th>RATING</th><th>SALARY</th><th>ACTION</th></tr></thead><tbody>${(state.franchise.staffPool || []).map((p) => `<tr><td><b>${esc(p.name)}</b></td><td>${chip(p.role, "blue")}<small>${esc(p.scheme)}</small></td><td>${scorePill("rating", p.rating)}</td><td>${cash(p.salary)}</td><td>${action("Hire staff", `F.action('hire',${arg(p.id)})`, "coach")}</td></tr>`).join("")}</tbody></table></div>`)}`
          : `<div class="hub-organization-grid">${panel("Board confidence", `<div class="hub-pad"><div class="hub-owner"><span class="hub-staff-initial">${icon("briefcase")}</span><div><h3>${esc(c.owner.name)}</h3>${chip(c.owner.trait, "purple")}</div></div><div class="hub-health-row"><span>Owner patience</span><b>${c.owner.patience}%</b></div>${meter(c.owner.patience, c.owner.patience < 40 ? "red" : "green")}<div class="hub-health-row"><span>Fan approval</span><b>${c.fanApproval}%</b></div>${meter(c.fanApproval, c.fanApproval < 40 ? "red" : "blue")}<p class="hub-note">Results, public responses, finances and organizational events shape confidence over time.</p></div>`)}${panel("Infrastructure", `<div class="hub-pad"><h3>${esc(st.name)}</h3><p>${esc(st.city)} · ${fmt(st.capacity)} seats</p><div class="hub-health-row"><span>Stadium condition</span><b>${fmt(st.condition)}%</b></div>${meter(st.condition, st.condition < 40 ? "red" : "green")}<div class="hub-facilities"><div><b>${st.medical}</b><small>MEDICAL TIER</small></div><div><b>${st.training}</b><small>TRAINING TIER</small></div><div><b>${projects.length}</b><small>LIVE PROJECTS</small></div></div>${action("Manage facilities", "Hub.clubTab('Facilities')", "", true)}</div>`)}${panel(
              "Football operations",
              `<div class="hub-pad"><div class="hub-health-row"><span>Active players</span><b>${S.active(state).filter((p) => p.status === "active").length} / 53</b></div><div class="hub-health-row"><span>Staff on payroll</span><b>${staff.length}</b></div><div class="hub-health-row"><span>Biggest depth need</span><b>${needs[0]?.pos || "—"}</b></div><div class="hub-quick-links">${[
                ["Roster", "Squad & depth"],
                ["Contracts", "Cap ledger"],
                ["Development", "Development"],
                ["League", "League governance"],
              ]
                .map(
                  ([r, l]) =>
                    `<button class="secondary small" onclick="W.open('${r}')">${l} →</button>`,
                )
                .join("")}</div></div>`,
            )}${panel("Project tracker", `<div class="hub-pad">${st.projects.length ? st.projects.map((p) => `<div class="hub-project"><span class="hub-project-dot ${p.remaining > 0 ? "live" : "complete"}"></span><div><b>${esc(p.name)}</b><small>${p.remaining > 0 ? p.remaining + " calendar advances remaining" : "Completed"}</small></div>${chip(p.remaining > 0 ? "In progress" : "Complete", p.remaining > 0 ? "amber" : "green")}</div>`).join("") : empty("Room to grow.", "Upgrade training, medical care or the stadium through Facilities.")}</div>`)}</div>`;
    return (
      hero(
        "ORGANIZATION / CLUB HEALTH",
        "Build beyond Sunday.",
        `${esc(cname(state.team))} · Ownership, people and infrastructure in one place.`,
        `${logo(state.team)}${action("Your coach profile", "W.open('Career')", "", true)}`,
        "club-hero",
      ) +
      stats([
        ["CLUB CASH", cash(c.cash), "Operating resources"],
        [
          "ATTENDANCE",
          fmt(c.attendance * 100) + "%",
          "Responds to pricing and fan approval",
        ],
        [
          "STAFF PAYROLL",
          cash(staff.reduce((n, p) => n + p.salary, 0)),
          "Annual commitments",
        ],
        ["TICKET PRICE", "$" + st.ticket, "Per seat"],
      ]) +
      tabs(["Overview", "Facilities"], clubTab, "Hub.clubTab") +
      `<div class="exp-club-links"><button class="secondary small" onclick="W.open('Staff')">Coaching staff →</button><button class="secondary small" onclick="W.open('Boardroom')">Meet ownership →</button></div>` +
      body
    );
  };
  calendar = () => {
    const all = fixtures(state),
      sum = fixtureSummary(all),
      rows = all.filter(
        (r) =>
          schedule.scope === "All" ||
          (schedule.scope === "Upcoming" && !r.done) ||
          (schedule.scope === "Results" && r.done) ||
          (schedule.scope === "Home" && r.home) ||
          (schedule.scope === "Away" && r.home === false),
      ),
      next = all.find((r) => !r.done && !r.bye);
    const tile = (r) =>
      r.bye
        ? `<article class="hub-fixture bye"><span class="eyebrow">WEEK ${r.week}</span><h3>Bye week</h3><p>Recover. Prepare. Reset.</p>${chip("No fixture")}</article>`
        : `<button class="hub-fixture ${r.result || ""} ${r.current ? "current" : ""}" onclick="Hub.fixture(${arg(r.key)})"><div class="hub-fixture-top"><span>${r.stage === "Regular season" ? "WEEK " + r.week : r.stage.toUpperCase()}</span>${chip(r.current ? "UP NEXT" : r.done ? "FULL TIME" : r.home ? "HOME" : "AWAY", r.current ? "blue" : "")}</div><div class="hub-fixture-teams">${logo(r.opponent)}<span><b>${esc(clubs[r.opponent][2])}</b><small>${esc(clubs[r.opponent][1])} · ${r.home ? "Home" : "Away"}</small></span>${r.done ? `<strong>${r.for}<small>${r.against}</small></strong>` : icon("calendar")}</div><div class="hub-fixture-footer">${r.done ? chip(r.result === "W" ? "VICTORY" : r.result === "L" ? "DEFEAT" : "TIE", r.result === "W" ? "green" : r.result === "L" ? "red" : "amber") : `<span>${r.home ? esc(state.franchise.clubs[state.team].stadium.name) : "Away fixture"}</span>`}<span>Match details →</span></div></button>`;
    return (
      hero(
        "COMPETITION / SEASON PLANNER",
        "Your road through the season.",
        `${state.year} · ${state.schedule.length} regular-season weeks. Select a fixture for the matchup and result.`,
        next
          ? `${logo(next.opponent)}<div><small>NEXT UNPLAYED</small><b>${esc(clubs[next.opponent][2])}</b>${action("Go to matchday", "go('Matchday')", "", true)}</div>`
          : chip("Season complete", "gold"),
        "schedule-hero",
      ) +
      stats([
        [
          "RECORD",
          `${sum.wins}–${sum.losses}${sum.ties ? "–" + sum.ties : ""}`,
          "Regular season + postseason",
        ],
        ["POINTS FOR", sum.pf, "Recorded fixtures"],
        [
          "POINT DIFFERENTIAL",
          (sum.pf - sum.pa > 0 ? "+" : "") + (sum.pf - sum.pa),
          "Points for minus points against",
          sum.pf >= sum.pa ? "positive" : "negative",
        ],
        ["REMAINING", sum.remaining, "Unplayed fixtures currently scheduled"],
      ]) +
      `<div class="hub-controls">${tabs(["All", "Upcoming", "Results", "Home", "Away"], schedule.scope, "Hub.scheduleScope")}${tabs(["Cards", "List"], schedule.layout, "Hub.scheduleLayout")}</div>${!rows.length ? empty("No fixtures in this view.", "Choose All to see the current season.") : schedule.layout === "Cards" ? `<div class="hub-fixture-grid">${rows.map(tile).join("")}</div>` : panel("Fixture list", `<div class="hub-table-scroll"><table><thead><tr><th>WEEK / STAGE</th><th>OPPONENT</th><th>VENUE</th><th>STATUS</th><th>DETAILS</th></tr></thead><tbody>${rows.map((r) => `<tr class="${r.current ? "pinned-row" : ""}"><td>${r.stage === "Regular season" ? "Week " + r.week : r.stage}</td><td>${r.bye ? "Bye week" : `${logo(r.opponent)} ${esc(cname(r.opponent))}`}</td><td>${r.bye ? "—" : r.home ? "Home" : "Away"}</td><td>${r.done ? `${chip(r.result, r.result === "W" ? "green" : r.result === "L" ? "red" : "amber")} <b>${r.for}–${r.against}</b>` : chip(r.current ? "Up next" : r.bye ? "Rest week" : "Scheduled", r.current ? "blue" : "")}</td><td>${r.bye ? "" : action("Match details", `Hub.fixture(${arg(r.key)})`, "", true)}</td></tr>`).join("")}</tbody></table></div>`)}`
    );
  };
  views.Archives = () => {
    const all = championshipArchive(state, clubs),
      rows = all.filter(
        (h) =>
          (history.scope === "All" || h.kind === history.scope) &&
          (history.team === "All" || h.team === Number(history.team)) &&
          (history.decade === "All" ||
            Math.floor(h.year / 10) * 10 === Number(history.decade)) &&
          (h.name + " " + h.year + " " + h.mvp)
            .toLowerCase()
            .includes(history.query.toLowerCase()),
      ),
      p = paginate(rows, history.page, 12),
      count = new Map();
    history.page = p.page;
    all.forEach((h) => count.set(h.team, (count.get(h.team) || 0) + 1));
    const leaders = [...count]
      .filter(([t]) => t >= 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    return (
      hero(
        "THE ARCHIVE / HISTORY & RECORDS",
        "Legends leave a record.",
        `${all.length} championship records. Historical results and the story you create, clearly separated.`,
        `${action("Explore Hall of Fame", "W.open('Hall of Fame')", "", true)}${action("Career statistics", "W.open('Statistics')", "", true)}`,
        "history-hero",
      ) +
      `<div class="hub-dynasties">${leaders.map(([t, n]) => `<button onclick="Hub.filter('history','team','${t}')">${logo(t)}<span><b>${clubs[t][2]}</b><small>${n} titles in this archive</small></span><strong>${n}</strong></button>`).join("")}</div>` +
      tabs(
        ["All", "Historical", "This save"],
        history.scope,
        "Hub.historyScope",
      ) +
      panel(
        "Championship collection",
        `<div class="hub-toolbar">${search("history", "Search seasons, champions or MVPs", history.query)}<select aria-label="History franchise" onchange="Hub.filter('history','team',this.value)">${options([["All", "Every franchise"], ...clubs.map((c, i) => [i, c[1] + " " + c[2]])], history.team)}</select><select aria-label="History decade" onchange="Hub.filter('history','decade',this.value)">${options([["All", "Every decade"], ...[...new Set(all.map((h) => Math.floor(h.year / 10) * 10))].sort((a, b) => b - a).map((d) => [d, d + "s"])], history.decade)}</select></div><div class="hub-history-grid">${p.rows.map((h) => `<button class="hub-history-card ${h.kind === "This save" ? "simulated" : ""}" onclick="Hub.champion(${arg(h.id)})"><div><span class="hub-season">${h.year}</span>${chip(h.kind, h.kind === "This save" ? "purple" : "gold")}</div><div class="hub-history-emblem">${h.team >= 0 ? logo(h.team) : icon("history")}</div><small>CHAMPIONS</small><h3>${esc(h.name)}</h3><p>${h.mvp ? "MVP · " + esc(h.mvp) : h.record ? "Career record · " + esc(h.record) : "Season championship record"}</p><span class="hub-history-open">View season →</span></button>`).join("") || empty("No matching seasons.", "Change your franchise, era or search filters.")}</div>${pager("history", p)}`,
      ) +
      panel(
        "Awards from your career",
        `<div class="hub-award-list">${
          state.franchise.awards
            .slice(-16)
            .reverse()
            .map(
              (a) =>
                `<div><span class="hub-award-icon">★</span><span><b>${esc(a.award)}</b><small>${a.year} · ${esc(a.name)} · ${clubs[a.team]?.[0] || "—"}</small></span>${a.playerId ? action("Player", `W.player(${arg(a.playerId)},${a.team})`, "", true) : ""}</div>`,
            )
            .join("") ||
          "<p>Season awards will be added here after they are decided.</p>"
        }</div>`,
      ) +
      ``
    );
  };
  function socialView() {
    const pref = hubPreferences(state),
      all = socialFeed(state, clubs),
      rows = all.filter(
        (p) =>
          (social.scope === "All" ||
            (social.scope === "Players" && p.authorPlayer) ||
            (social.scope === "Insiders" &&
              ["League insider", "National pundit"].includes(p.voiceKind)) ||
            (social.scope === "Legends" &&
              ["Former player", "Legends panel"].includes(p.voiceKind)) ||
            (social.scope === "My team" && p.team === state.team) ||
            (social.scope === "Saved" && pref.socialSaved.includes(p.id))) &&
          (social.topic === "All" || p.topic === social.topic) &&
          (p.body + " " + p.name)
            .toLowerCase()
            .includes(social.query.toLowerCase()),
      ),
      p = paginate(rows, social.page, 12);
    social.page = p.page;
    const topics = [
      "Players",
      "Reactions",
      "Comparisons",
      "Injuries",
      "Draft",
      "Rumors",
      "Coaching",
      "Trades",
      "Legends",
    ];
    return (
      hero(
        "FAN NETWORK / AROUND THE LEAGUE",
        "The conversation never stops.",
        `Players, film watchers and fans. Follow the people, compare the evidence and join the debate inside your career.`,
        `${chip("LEAGUE CONVERSATIONS", "purple")}`,
        "social-hero",
      ) +
      `<div class="hub-social-layout"><div>${panel(
        "Your feed",
        `<div class="hub-toolbar">${tabs(["All", "My team", "Players", "Insiders", "Legends", "Saved"], social.scope, "Hub.socialScope")}${search("social", "Search fan discussions", social.query)}<select aria-label="Social topic" onchange="Hub.filter('social','topic',this.value)">${options(["All", ...topics], social.topic)}</select></div><div class="hub-social-feed">${
          p.rows.map((post) => socialPost(post, pref, thread)).join("") ||
          empty(
            "A quiet corner of the league.",
            "Try All, change the topic or save discussions for later.",
          )
        }</div>${pager("social", p)}`,
      )}</div><aside class="hub-side-stack">${panel("Trending conversations", `<div class="hub-trends">${topics.map((topic) => `<button onclick="Hub.filter('social','topic',${arg(topic)})"><span>#${topic}</span><small>${all.filter((p) => p.topic === topic).length} discussions</small>${icon("chevron")}</button>`).join("")}</div>`)}${panel("Inside the building", `<div class="hub-pad"><p>Track the stories around your team and the conversations shaping its reputation.</p><p>Your private club correspondence is waiting in your inbox.</p><button class="link" onclick="W.open('Analysis');Office.analysis('Dynamics')">See squad analysis →</button></div>`)}${socialReputationPanel()}</aside></div>`
    );
  }
  views.News = () =>
    `<div class="hub-media-switch">${tabs(["Newsroom", "Fan network"], mediaTab, "Hub.mediaTab")}<span>${mediaTab === "Newsroom" ? "THE STORIES" : "THE REACTION"} / ${state.year}</span></div>${mediaTab === "Newsroom" ? `<div class="hub-news-color">${oldNews()}</div>` : socialView()}`;
  const persist = (fn) => {
    if (isBusy()) {
      toast("Wait for the current simulation to finish.");
      return;
    }
    fn();
    save();
    render();
  };
  window.Hub = {
    filter(kind, key, value) {
      const obj = { draft, market, history, social }[kind];
      if (!obj || !(key in obj) || key === "page") return;
      obj[key] = value;
      obj.page = 1;
      const focus = document.activeElement?.id,
        caret = document.activeElement?.selectionStart;
      render();
      if (focus) {
        const el = document.getElementById(focus);
        el?.focus({ preventScroll: true });
        if (caret != null && el?.setSelectionRange)
          el.setSelectionRange(caret, caret);
      }
    },
    page(kind, delta) {
      const o = { draft, market, history, social }[kind];
      if (!o) return;
      o.page = Math.max(1, o.page + delta);
      render();
    },
    pin(id) {
      if (!state.prospects.some((p) => p.id === id)) return;
      persist(() => toggleStored(state, "board", id));
    },
    rank(id, dir) {
      persist(() => {
        const a = hubPreferences(state).board,
          i = a.indexOf(id),
          j = i + dir;
        if (i >= 0 && j >= 0 && j < a.length) [a[i], a[j]] = [a[j], a[i]];
        draft.sort = "board";
      });
    },
    marketTab(v) {
      market.tab = v;
      market.page = 1;
      render();
    },
    clubTab(v) {
      clubTab = v;
      render();
    },
    scheduleScope(v) {
      schedule.scope = v;
      render();
    },
    scheduleLayout(v) {
      schedule.layout = v;
      render();
    },
    historyScope(v) {
      history.scope = v;
      history.page = 1;
      render();
    },
    mediaTab(v) {
      mediaTab = v;
      render();
    },
    socialScope(v) {
      social.scope = v;
      social.page = 1;
      render();
    },
    thread(id) {
      thread = thread === id ? null : id;
      render();
    },
    react(id, key) {
      if (!socialFeed(state, clubs).some((p) => p.id === id)) return;
      persist(() =>
        toggleStored(
          state,
          key,
          id,
          socialFeed(state, clubs).find((p) => p.id === id),
        ),
      );
    },
    story(id) {
      const a = state.franchise.office.stories.find((a) => a.id === id);
      if (!a) return;
      modal(
        `<div class="hub-article-modal"><span class="eyebrow">${esc(a.source)} / ${a.year} W${a.week + 1}</span><h2>${esc(a.title)}</h2>${chip(a.category, "blue")}<p>${esc(a.body)}</p><div class="modal-actions">${a.messageId ? action("Open brief", `closeModal();Office.fromStory(${arg(a.messageId)})`) : ""}${action("Close", "closeModal()", "", true)}</div></div>`,
      );
    },
    fixture(key) {
      const r = fixtures(state).find((r) => r.key === key);
      if (!r || r.bye) return;
      const opp = state.franchise.clubs[r.opponent],
        record = state.teams[r.opponent];
      modal(
        `<div class="hub-fixture-modal"><span class="eyebrow">${state.year} / ${r.stage === "Regular season" ? "WEEK " + r.week : r.stage}</span><div class="hub-matchup">${logo(state.team)}<strong>${r.done ? r.for + " – " + r.against : "VS"}</strong>${logo(r.opponent)}</div><h2>${esc(cname(state.team))}<small>vs ${esc(cname(r.opponent))}</small></h2>${chip(r.done ? (r.result === "W" ? "Victory" : r.result === "L" ? "Defeat" : "Tie") : r.current ? "Up next" : "Scheduled", r.result === "W" ? "green" : r.result === "L" ? "red" : "blue")}<div class="hub-health-row"><span>Venue</span><b>${esc((r.home ? state.franchise.clubs[state.team] : opp).stadium.name)}</b></div><div class="hub-health-row"><span>Opponent current record</span><b>${record.w}–${record.l}${record.t ? "-" + record.t : ""}</b></div><div class="hub-health-row"><span>Opponent head coach</span><b>${esc(opp.staff.find((s) => s.role === "HC")?.name || "Unassigned")}</b></div><div class="modal-actions">${r.current && !r.done ? action("Enter matchday", "closeModal();go('Matchday')") : ""}${action("Prepare tactics", "closeModal();go('Game plan')", "", true)}${action("Close", "closeModal()", "", true)}</div></div>`,
      );
    },
    champion(id) {
      const h = championshipArchive(state, clubs).find((h) => h.id === id);
      if (!h) return;
      modal(
        `<div class="hub-champion-modal"><span class="eyebrow">${h.year} SEASON / ${h.kind.toUpperCase()}</span>${h.team >= 0 ? logo(h.team) : ""}<h2>${esc(h.name)}</h2>${chip("CHAMPIONS", "gold")}<div class="hub-health-row"><span>Super Bowl MVP</span><b>${esc(h.mvp || "Not recorded in this database")}</b></div>${h.record ? `<div class="hub-health-row"><span>Your franchise record</span><b>${esc(h.record)}</b></div>` : ""}<div class="modal-actions">${action("Hall of Fame", "closeModal();W.open('Hall of Fame')", "", true)}${action("Close", "closeModal()")}</div></div>`,
      );
    },
  };
}
