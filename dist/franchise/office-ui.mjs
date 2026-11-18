import { scorePill, previewAttributes, miniBio } from "./player-ui.mjs";
import { playerAwards } from "./player-catalog.mjs";
import * as S from "./state.mjs";
import { simOptionsControls } from "../presentation/sim-options.mjs";
import {
  ensureOffice,
  syncOffice,
  officeCounts,
  respondMessage,
  decisionOptions,
  CATEGORIES,
} from "./newsroom.mjs";
import {
  STAT_VIEWS,
  seasonStats,
  statValue,
  csvText,
} from "./analysis.mjs";
import { faceSVG } from "./newgens.mjs";
import { icon, searchKey } from "./presentation.mjs";
import { rosterLimit } from "./blockers.mjs";
import { trimPlan } from "./personnel.mjs";
import { storyArt } from "../presentation/pixel-art.mjs";
import { heightInches } from "./player-catalog.mjs";
import { SQUAD_SORTS, SQUAD_SORT_MENU, defaultDirection, compareSquad } from "./squad-sort.mjs";
import { installLineupUI } from "./lineup-ui.mjs";
import { pixelFace } from "../ui/pixel-face.mjs";
import { pageOf, pageContaining, litBlocks, senderInitials, loadDeskStyles } from "./hub-model.mjs";
import {
  analysisView,
  statisticsView,
  statisticsResults,
  statisticsRows,
  compareBody,
  comparePickList,
  compareTray,
} from "./analysis-ui.mjs";
const fmtBio = (n) => Number(n).toLocaleString("en-US");
const num = (n, d = 1) =>
  Number.isFinite(n)
    ? Number(n).toLocaleString("en-US", { maximumFractionDigits: d })
    : "—";
const sign = (n) => `${n > 0 ? "+" : ""}${num(n, 2)}`;
const cash = (n) => "$" + num(n / S.MILLION, 1) + "M";
const opts = (a, v) =>
  a
    .map(
      (x) =>
        `<option ${String(x) === String(v) ? "selected" : ""}>${esc(x)}</option>`,
    )
    .join("");
const avatar = (p) =>
  `<span class="player-avatar">${faceSVG(p)}${/^https:\/\//.test(p.headshot || "") ? `<img src="${esc(p.headshot)}" alt="${esc(p.name)}" loading="lazy" onerror="this.remove()">` : ""}</span>`;
const playerLink = (p, t) =>
  `<button class="player-link" ${previewAttributes(p, t)} onclick="W.player('${p.id}',${t})">${avatar(p)}<span><b>${esc(p.name)}</b><small>${esc(p.realPosition || p.pos)} · ${esc(clubs[t][0])} · ${miniBio(p)}</small></span></button>`;
const badge = (text, tone = "") =>
  `<span class="office-badge ${tone}">${esc(text)}</span>`;
const grade = (n) =>
  Number.isFinite(n)
    ? `<span class="grade ${n >= 7 ? "positive" : n < 6 ? "negative" : ""}">${num(n)}</span>`
    : '<span class="muted">—</span>';
const metrics = (arr) =>
  `<div class="office-metrics">${arr.map(([label, value, note]) => `<div><span>${label}</span><b>${value}</b><small>${note || ""}</small></div>`).join("")}</div>`;
const panel = (title, body, extra = "") =>
  `<section class="panel office-panel"><div class="panel-head"><h2>${title}</h2>${extra}</div><div class="office-pad">${body}</div></section>`;
export function installOfficeUI({ views, isBusy, getSection }) {
  let inbox = { category: "All", filter: "All", query: "", selected: null, page: 0 },
    news = {
      scope: "All",
      category: "All",
      query: "",
      page: 0,
      total: 0,
      pages: 1,
    },
    stats = {
      category: "Passing",
      year: state.year,
      scope: "My team",
      team: state.team,
      mode: "Totals",
      minimum: 0,
      query: "",
      sort: null,
      direction: -1,
      club: "All",
      pos: "All",
      page: 0,
    },
    squad = {
      query: "",
      unit: "All",
      status: "All",
      sort: "ovr",
      direction: -1,
    },
    selected = [],
    settingsTab = "Interface",
    analysisTab = "Performance",
    compareQuery = "";
  const office = () => ensureOffice(state);
  const mutate = (fn) => {
    if (isBusy()) {
      toast("Wait for the current simulation to finish.");
      return false;
    }
    try {
      state = S.transact(state, fn);
      save();
      render();
      return true;
    } catch (e) {
      toast(e.message);
      return false;
    }
  };
  const viewPrefs = () =>
    (office().views ??= {
      squad: "Overview",
      layout: "Table",
      favorites: [],
      statMode: "Totals",
    });
  const allMessages = () => office().messages;
  const currentMessage = () =>
    allMessages().find((m) => m.id === inbox.selected);
  const messageTime = (m) =>
    m.date?new Date(m.date+"T00:00:00Z").toLocaleDateString("en-US",{timeZone:"UTC",month:"short",day:"numeric",year:"numeric"}):
    `${m.year} · ${m.phase === "offseason" ? "Offseason" : "Week " + (m.week + 1)}`;
  const isTask = (m) =>
    m.status === "pending" ||
    (m.interview && m.status !== "closed") ||
    (m.promiseKey && m.status !== "closed");
  function filteredMessages() {
    const rank = (m) =>
      isTask(m)
        ? m.priority === "urgent"
          ? 0
          : m.priority === "important"
            ? 1
            : 2
        : 3;
    return allMessages()
      .filter(
        (m) =>
          (inbox.category === "All" ||
            (inbox.category === "Decisions" && isTask(m)) ||
            m.category === inbox.category) &&
          (inbox.filter === "All" ||
            (inbox.filter === "Unread" && !m.read) ||
            (inbox.filter === "Saved" && m.bookmarked) ||
            (inbox.filter === "Needs response" && isTask(m))) &&
          searchKey(m.title + " " + m.summary + " " + m.source).includes(
            searchKey(inbox.query),
          ),
      )
      .sort((a, b) => rank(a) - rank(b));
  }
  // Inbox: a paged message list (no inner scroll box) beside the reading pane. Rows are a fixed
  // height so a page of INBOX_PAGE keeps the list the same size; styles in desk.css (ib-*).
  const INBOX_PAGE = 7;
  const catClass = (c) => "fd-cat-" + String(c || "").toLowerCase().replace(/[^a-z]/g, "");
  const senderPlayer = (m) => (m.playerId ? state.roster.find((p) => p.id === m.playerId) : null);
  const senderAvatar = (m, size = 36) => {
    const p = senderPlayer(m);
    return p
      ? pixelFace(p, { size, team: state.team })
      : `<span class="fd-mono ${catClass(m.category)}" style="width:${size}px;height:${size}px">${esc(senderInitials(m.source))}</span>`;
  };
  const dueRounds = (m) => Math.max(0, (m.dueStep ?? office().step) - office().step);
  const statusChip = (m) =>
    m.status === "pending"
      ? badge(dueRounds(m) <= 0 ? "Due now" : `Due in ${dueRounds(m)} round${dueRounds(m) === 1 ? "" : "s"}`, m.priority === "urgent" ? "danger" : "amber")
      : isTask(m)
        ? badge("Action needed", m.priority === "urgent" ? "danger" : "amber")
        : m.status === "resolved"
          ? badge("Replied", "good")
          : m.status === "delegated"
            ? badge("Delegated")
            : "";
  const inboxPager = (pg) =>
    pg.pages > 1
      ? `<div class="ib-pager"><button class="secondary small" onclick="Office.inboxPage(-1)" ${pg.page <= 0 ? "disabled" : ""} aria-label="Previous page">◀ Prev</button><span>${pg.from}–${pg.to} of ${pg.total}</span><button class="secondary small" onclick="Office.inboxPage(1)" ${pg.page >= pg.pages - 1 ? "disabled" : ""} aria-label="Next page">Next ▶</button></div>`
      : `<div class="ib-pager ib-pager-single"><span>${pg.total} message${pg.total === 1 ? "" : "s"}</span></div>`;
  function inboxList() {
    const all = filteredMessages(),
      pg = pageOf(all, inbox.page, INBOX_PAGE);
    inbox.page = pg.page;
    const rows = pg.rows
      .map(
        (m) =>
          `<button class="inbox-row ib-row ${m.id === inbox.selected ? "selected" : ""} ${!m.read ? "unread" : ""} ${m.priority === "urgent" && isTask(m) ? "urgent" : ""}" onclick="Office.select('${m.id}')" aria-current="${m.id === inbox.selected}">${senderAvatar(m)}<span class="ib-row-main"><span class="ib-row-top"><b>${esc(m.source)}</b><time>${messageTime(m)}</time></span><span class="ib-row-title">${m.priority === "urgent" && isTask(m) ? '<i class="ib-prio" title="Urgent">!</i>' : ""}${esc(m.title)}</span><span class="ib-row-tags">${badge(m.category)}${statusChip(m)}${m.bookmarked ? '<span class="saved-star" title="Saved">★</span>' : ""}</span></span>${!m.read ? '<span class="new-dot" aria-label="Unread"></span>' : ""}</button>`,
      )
      .join("");
    return (
      (rows
        ? `<div class="ib-rows">${rows}</div>`
        : '<div class="office-empty ib-empty"><b>Your desk is clear.</b><p>No messages match these filters. Try All or clear the search.</p></div>') + inboxPager(pg)
    );
  }
  function impactRows(changes) {
    return changes?.length
      ? `<div class="impact-grid">${changes.map((c) => `<div><span>${esc(c.name)}</span><b class="${c.delta >= 0 ? "positive" : "negative"}">${sign(c.delta)} morale</b>${c.trust ? `<small>${sign(c.trust)} coach trust</small>` : ""}</div>`).join("")}</div>`
      : '<p class="muted">No direct morale change.</p>';
  }
  const meterBlocks = (v, cells = 10) => {
    const n = litBlocks(v, 100, cells),
      tone = v >= 65 ? "good" : v <= 40 ? "bad" : "warn";
    return `<span class="fd-blocks ${tone}" aria-hidden="true">${Array.from({ length: cells }, (_, i) => `<i${i < n ? ' class="on"' : ""}></i>`).join("")}</span>`;
  };
  function messageDetail() {
    const m = currentMessage();
    if (!m)
      return '<div class="inbox-blank ib-blank"><span class="fd-mono fd-cat-team">✉</span><h2>Your next decision starts here.</h2><p>Choose a message to read the brief, review its context and respond.</p></div>';
    const p = senderPlayer(m),
      effects = office().moodHistory.find(
        (h) => h.sourceId === m.id || h.sourceId === m.key,
      ),
      pending = m.status === "pending",
      options = pending ? decisionOptions(m) : [],
      locked = isBusy() || state.live;
    return `<article class="message-detail ib-msg"><div class="message-topline ib-msg-top">${badge(m.category)}${m.priority === "urgent" ? badge("Urgent", "danger") : m.priority === "important" ? badge("Important", "amber") : ""}<span>${messageTime(m)}</span><button class="icon-button ib-star ${m.bookmarked ? "positive" : ""}" aria-label="${m.bookmarked ? "Unsave" : "Save"} message" onclick="Office.bookmark('${m.id}')">${m.bookmarked ? "★" : "☆"}</button></div><h2>${esc(m.title)}</h2><div class="message-sender ib-sender">${senderAvatar(m, 44)}<span><b>${esc(m.source)}</b><small>To ${esc(state.coach.name)} · ${esc(state.franchise.role)}</small></span></div><p class="message-copy ib-copy">${esc(m.body)}</p>${
      p
        ? `<div class="message-player ib-player">${playerLink(p, state.team)}<div class="ib-player-meter"><small>Morale</small>${meterBlocks(p.morale ?? 75)}<b>${num(p.morale, 0)}%</b></div><div class="ib-player-meter"><small>Trust</small>${meterBlocks(p.coachTrust ?? 60)}<b>${num(p.coachTrust ?? 60, 0)}%</b></div></div>`
        : m.playerId
          ? '<p class="muted">The player is no longer with this franchise.</p>'
          : ""
    }${
      pending
        ? `<section class="response-box ib-decide"><div class="ib-decide-head"><span class="eyebrow">YOUR RESPONSE</span>${badge(m.priority === "urgent" ? "Priority decision" : "Decision", m.priority === "urgent" ? "danger" : "amber")}${badge(dueRounds(m) <= 0 ? "Due now" : `Due in ${dueRounds(m)} league round${dueRounds(m) === 1 ? "" : "s"}`)}</div><p class="muted">Pick one. If you don’t answer in time, option A is used.</p><div class="ib-options">${options
            .map(
              (c, i) =>
                `<button class="inbox-choice ib-option" onclick="Office.respond('${m.id}','${c.id}')" ${locked ? "disabled" : ""}><span class="ib-opt-key">${String.fromCharCode(65 + i)}</span><span class="ib-opt-copy"><b>${esc(c.text)}</b><small><i>What happens:</i> ${esc(c.note)}</small></span>${i === 0 ? '<span class="ib-opt-default">Default</span>' : ""}<span class="ib-opt-go">${icon("arrow")}</span></button>`,
            )
            .join("")}</div>${state.live ? '<p class="ib-locked">Finish the current match to respond.</p>' : ""}</section>`
        : m.response
          ? `<section class="response-record ib-record"><span class="eyebrow">${m.status === "delegated" ? "STAFF RESPONSE" : "YOUR RESPONSE"}</span><p>“${esc(m.response)}”</p><small>${esc(m.outcome)}</small>${impactRows(m.changes)}</section>`
          : m.outcome
            ? `<p class="muted">${esc(m.outcome)}</p>`
            : ""
    }${effects && !m.response ? `<section class="response-record ib-record"><span class="eyebrow">WHAT CHANGED</span><p>${esc(effects.reason)}</p>${impactRows(effects.changes)}</section>` : ""}<div class="message-actions ib-actions">${m.route ? `<button class="secondary" onclick="Office.route('${m.route}','${m.playerId || ""}')">${m.interview ? "Attend interview" : m.promiseKey ? "Meet player" : "Open " + ({ Development: "development report", Medical: "medical centre" }[m.route] || m.route)} ${icon("arrow")}</button>` : ""}${p ? `<button class="secondary" onclick="W.player('${p.id}')">Player profile</button>` : ""}${m.category === "Scouting" && m.playerId ? `<button class="secondary" onclick="Scout.open('${m.playerId}')">Open scouting card</button>` : ""}<button class="link" onclick="Office.unread('${m.id}')">Mark unread</button></div></article>`;
  }
  views.Inbox = () => {
    loadDeskStyles();
    const counts = officeCounts(state),
      rows = filteredMessages(),
      all = allMessages();
    if (!rows.some((m) => m.id === inbox.selected)) inbox.selected = pageOf(rows, inbox.page, INBOX_PAGE).rows[0]?.id || rows[0]?.id || null;
    const filterCount = { All: all.length, Unread: all.filter((m) => !m.read).length, "Needs response": all.filter(isTask).length, Saved: all.filter((m) => m.bookmarked).length };
    const tile = (label, value, tone, filter) => `<button class="ib-tile ${tone} ${inbox.filter === filter ? "on" : ""}" onclick="Office.inboxFilter('filter','${filter}')"><small>${label}</small><b>${value}</b></button>`;
    return `<div class="ib-page"><div class="ib-head"><div class="ib-head-copy"><span class="eyebrow">THE COACHING OFFICE</span><p>Your people. Your priorities. Your next decision.</p></div><div class="ib-tiles">${tile("Unread", counts.unread, counts.unread ? "" : "dim", "Unread")}${tile("Decisions", counts.pending, counts.pending ? "warn" : "dim", "Needs response")}${tile("Urgent", counts.urgent, counts.urgent ? "bad" : "dim", "Needs response")}${tile("Saved", filterCount.Saved, "dim", "Saved")}</div><button class="secondary small" onclick="Office.markAll()">Mark all read</button></div><div class="inbox-toolbar ib-toolbar"><div class="ib-seg" role="tablist" aria-label="Inbox filters">${["All", "Unread", "Needs response", "Saved"].map((v) => `<button role="tab" aria-selected="${v === inbox.filter}" class="${v === inbox.filter ? "on" : ""}" onclick="Office.inboxFilter('filter','${v}')">${v}<i>${filterCount[v]}</i></button>`).join("")}</div><div class="table-search ib-search">${icon("search")}<input type="search" aria-label="Search inbox" placeholder="Search sender, subject…" value="${esc(inbox.query)}" oninput="Office.searchInbox(this.value)"></div></div><div class="ib-cats" role="tablist" aria-label="Inbox category">${CATEGORIES.map((c) => `<button role="tab" aria-selected="${c === inbox.category}" class="${c === inbox.category ? "on" : ""}" onclick="Office.inboxFilter('category','${c}')">${c === "All" ? "" : `<span class="ib-cat-dot ${catClass(c)}"></span>`}${c === "All" ? "All categories" : c}</button>`).join("")}</div><div class="inbox-workspace ib-work"><section class="inbox-list ib-list" aria-label="Messages"><div class="inbox-list-heading ib-list-head"><b id="inbox-message-count">${rows.length} messages</b><span>Priority · newest</span></div><div id="inbox-list">${inboxList()}</div></section><section id="inbox-detail" class="inbox-reading ib-read" aria-label="Selected message">${messageDetail()}</section></div></div>`;
  };
  // Newsroom: a pixel broadsheet. Each page of NEWS_PAGE stories opens with a lead story, two
  // briefs beside it, then a grid. Styles in desk.css (nw-*).
  const NEWS_PAGE = 9;
  const SOURCE_RANK = {
    "Sunday Review": 0,
    "Team communications": 1,
    "Gridiron Journal": 1,
    "Transactions wire": 1,
    "League desk": 2,
  };
  function storyRows() {
    return office()
      .stories.filter(
        (a) =>
          (!a.title.startsWith("Conversation:") ||
            /final whistle|lights come on/i.test(a.title)) &&
          !/^(Assistant match report|NFL roster database loaded|A win for the franchise|A difficult result)$/.test(
            a.title,
          ) &&
          !["role", "contract", "recovery"].includes(
            office().messages.find((m) => m.id === a.messageId && m.response)
              ?.decision,
          ) &&
          (news.scope === "All" ||
            (news.scope === "Saved stories" && a.bookmarked) ||
            (news.scope === "Tracked players" &&
              viewPrefs().favorites.includes(a.playerId)) ||
            (news.scope === "My team" &&
              (a.team === state.team || a.otherTeam === state.team)) ||
            (news.scope === "Following" &&
              (office().followedTeams.includes(a.team) ||
                office().followedTeams.includes(a.otherTeam)))) &&
          (news.category === "All" || a.category === news.category) &&
          searchKey(a.title + " " + a.body).includes(searchKey(news.query)),
      )
      .sort(
        (a, b) =>
          b.year - a.year ||
          b.week - a.week ||
          (SOURCE_RANK[a.source] ?? 3) - (SOURCE_RANK[b.source] ?? 3),
      );
  }
  function storyCard(a, kind) {
    const art = storyArt(a),
      action = a.messageId
        ? `<button class="link" onclick="Office.fromStory('${a.messageId}')">Open brief ${icon("arrow")}</button>`
        : a.route
          ? `<button class="link" onclick="W.open('${a.route}')">Explore ${icon("arrow")}</button>`
          : a.playerId
            ? `<button class="link" onclick="W.player('${a.playerId}',${a.team})">Player ${icon("arrow")}</button>`
            : "";
    return `<article class="nw-story nw-${kind} story-topic-${esc(a.category.toLowerCase())}"><div class="nw-art ${art ? "" : "nw-art-crest"}">${art || (Number.isInteger(a.otherTeam) && a.otherTeam !== a.team && clubs[a.otherTeam] ? `<span class="nw-matchup"><span class="nw-crest">${logo(a.team)}</span><b>VS</b><span class="nw-crest">${logo(a.otherTeam)}</span></span>` : `<span class="nw-crest">${logo(a.team)}</span>`)}</div><div class="nw-copy"><div class="nw-meta">${badge(a.category)}<span>${esc(a.source)} · ${a.year} W${a.week + 1}</span><button class="icon-button nw-save ${a.bookmarked ? "on" : ""}" aria-label="${a.bookmarked ? "Unsave" : "Save"} story" onclick="Office.storyBookmark('${a.id}')">${a.bookmarked ? "★" : "☆"}</button></div><h3>${esc(a.title)}</h3><p>${esc(a.body)}</p><div class="nw-foot"><span class="nw-team">${logo(a.team)}${esc(clubs[a.team]?.[2] ?? "League")}</span>${action}</div></div></article>`;
  }
  function storyCards() {
    const rows = storyRows(),
      pg = pageOf(rows, news.page, NEWS_PAGE);
    news.total = pg.total;
    news.pages = pg.pages;
    news.page = pg.page;
    if (!pg.rows.length)
      return '<div class="nw-empty"><h2>No stories in this view.</h2><p>Change the section or topic, clear the search, or follow more franchises.</p></div>';
    const [lead, ...rest] = pg.rows;
    return `<div class="nw-front">${storyCard(lead, "lead")}${rest.length ? `<div class="nw-briefs">${rest
      .slice(0, 2)
      .map((a) => storyCard(a, "brief"))
      .join("")}</div>` : ""}</div>${rest.length > 2 ? `<div class="nw-grid">${rest
      .slice(2)
      .map((a) => storyCard(a, "card"))
      .join("")}</div>` : ""}`;
  }
  function followStrip() {
    const followed = office().followedTeams.filter((t) => clubs[t]);
    return `<div class="nw-follow"><span class="nw-label">Following</span>${followed
      .map((t) => `<span class="nw-follow-chip">${logo(t)}<b>${esc(clubs[t][0])}</b>${t === state.team ? "" : `<button class="link" aria-label="Unfollow ${esc(cname(t))}" onclick="Office.followTeam(${t},false)">×</button>`}</span>`)
      .join("")}<select aria-label="Follow another franchise" onchange="this.value!=='' && Office.followTeam(Number(this.value),true)"><option value="">＋ Follow a team…</option>${clubs
      .map((c, i) => [c, i])
      .filter(([, i]) => !followed.includes(i))
      .map(([c, i]) => `<option value="${i}">${esc(c[1] + " " + c[2])}</option>`)
      .join("")}</select><button class="link nw-manage" onclick="Office.settings('News & workflow')">Manage following</button></div>`;
  }
  views.News = () => {
    loadDeskStyles();
    const list = storyCards(),
      cal = state.franchise.calendarSim?.date,
      when = cal ? new Date(cal + "T00:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" }) : `${state.year} season`;
    return `<div class="nw-page"><div class="nw-mast"><div class="nw-mast-rule"><span>Vol. ${state.year} · ${state.phase === "offseason" ? "Offseason" : state.phase === "playoffs" ? "Playoffs" : "Week " + (state.week + 1)}</span><span>${esc(when)}</span><span>${news.total} stor${news.total === 1 ? "y" : "ies"}</span></div><h2>The Gridiron Journal</h2><p>Results. Relationships. The stories behind Sunday.</p></div><div class="nw-tools"><div class="nw-seg" role="tablist" aria-label="News section">${["All", "My team", "Following", "Tracked players", "Saved stories"].map((v) => `<button role="tab" aria-selected="${news.scope === v}" class="${news.scope === v ? "on" : ""}" onclick="Office.newsFilter('scope','${v}')">${v === "All" ? "Around the league" : v}</button>`).join("")}</div><label class="nw-search">${icon("search")}<input id="news-search" type="search" aria-label="Search stories" placeholder="Search headlines…" value="${esc(news.query)}" oninput="Office.searchNews(this.value)"></label></div><div class="nw-cats" role="tablist" aria-label="News topic">${["All", "Players", "Team", "Medical", "Interviews", "League", "Scouting"].map((c) => `<button role="tab" aria-selected="${news.category === c}" class="${news.category === c ? "on" : ""}" onclick="Office.newsFilter('category','${c}')">${c === "All" ? "All topics" : c}</button>`).join("")}</div>${followStrip()}<div class="nw-stories">${list}</div><div class="nw-pager"><button class="secondary small" onclick="Office.newsPage(-1)" ${news.page === 0 ? "disabled" : ""}>◀ Previous</button><span><b>Page ${news.page + 1} / ${news.pages}</b> · ${news.total} stories</span><button class="secondary small" onclick="Office.newsPage(1)" ${news.page >= news.pages - 1 ? "disabled" : ""}>Next ▶</button></div></div>`;
  };
  const statYears = () =>
    [
      ...new Set([
        state.year,
        ...state.roster.flatMap((p) => Object.keys(p.stats || {}).map(Number)),
      ]),
    ]
      .sort((a, b) => b - a)
      .concat("Career");
  // Statistics and comparison rendering lives in analysis-ui.mjs; this file keeps the state.
  views.Statistics = () => {
    if (!statYears().map(String).includes(String(stats.year)))
      stats.year = state.year;
    stats.team = state.team;
    return statisticsView(stats, {
      years: statYears(),
      selected,
      tray: comparisonTray(),
    });
  };
  const comparable = (id, t) => S.roster(state, t).find((p) => p.id === id);
  function comparisonTray() {
    selected = selected.filter((x) => comparable(x.id, x.team));
    return compareTray(
      selected.map((x) => ({ p: comparable(x.id, x.team), team: x.team })),
    );
  }
  const pref = () => viewPrefs();
  const squadList = () =>
    state.roster
      .filter(
        (p) =>
          (squad.unit === "All" ||
            (squad.unit === "Offense" &&
              ["QB", "RB", "WR", "TE", "OL"].includes(p.pos)) ||
            (squad.unit === "Defense" &&
              ["DL", "LB", "CB", "S"].includes(p.pos)) ||
            (squad.unit === "Special teams" && ["K", "P"].includes(p.pos))) &&
          (squad.status === "All" ||
            (squad.status === "Favorites" && pref().favorites.includes(p.id)) ||
            p.status === squad.status) &&
          searchKey(
            p.name +
              " " +
              p.pos +
              " " +
              (p.realPosition || "") +
              " " +
              p.jersey,
          ).includes(searchKey(squad.query)),
      )
      .sort((a, b) => compareSquad(a, b, squad, sortContext()));
  const sortContext = () => {
    const year = S.financeYear(state);
    return {
      year: state.year,
      cap: (p) => S.capHit(state.franchise.contracts[p.id], year),
      contractEnd: (p) => {
        const c = state.franchise.contracts[p.id];
        return c && !c.ended ? c.start + c.years - 1 : null;
      },
      stats: (p) => seasonStats(p, state.year),
      height: (p) => heightInches(p) || null,
    };
  };
  // Column header → sort key, per squad tab. Headers without a key are not sortable.
  const COLUMN_SORT = {
    Player: "name",
    "OVR / potential": "ovr",
    Role: "role",
    Condition: "condition",
    Morale: "morale",
    Form: "form",
    Availability: "availability",
    Snaps: "snaps",
    "Pass yards": "passYards",
    "Rush yards": "rushYards",
    "Rec yards": "recYards",
    TD: "td",
    Age: "age",
    Training: "training",
    "Ability Δ": "growth",
    "Cap charge": "cap",
    "Contract through": "contract",
    Trust: "trust",
    Height: "height",
    Weight: "weight",
    College: "college",
    Experience: "experience",
  };
  const sortHeader = (c) => {
    const key = COLUMN_SORT[c];
    if (!key) return `<th>${c}</th>`;
    const on = squad.sort === key,
      sorted = on ? (squad.direction === 1 ? "ascending" : "descending") : "none";
    return `<th aria-sort="${sorted}" class="sortable-head ${on ? "sorted" : ""}"><button type="button" class="th-sort" onclick="Office.squadSortBy('${key}')" title="Sort by ${esc(SQUAD_SORTS[key]?.label || c)}">${c}<i aria-hidden="true">${on ? (squad.direction === 1 ? "▲" : "▼") : "↕"}</i></button></th>`;
  };
  const squadColumns = () =>
    ({
      "Bio & honors": [
        "Player",
        "Height",
        "Weight",
        "Age",
        "College",
        "Experience",
        "Best recorded honor",
        "Compare",
      ],
      Overview: [
        "Player",
        "OVR / potential",
        "Role",
        "Condition",
        "Morale",
        "Form",
        "Availability",
        "Compare",
      ],
      Performance: [
        "Player",
        "Snaps",
        "Form",
        "Pass yards",
        "Rush yards",
        "Rec yards",
        "TD",
        "Compare",
      ],
      Development: [
        "Player",
        "Age",
        "Training",
        "Form",
        "Ability Δ",
        "Focus",
        "Compare",
      ],
      Contracts: [
        "Player",
        "Cap charge",
        "Contract through",
        "Morale",
        "Trust",
        "Compare",
      ],
    })[pref().squad] || [];
  function squadContent() {
    const rows = squadList();
    if (pref().layout === "Cards")
      return `<div class="squad-card-grid">${rows.map((p) => `<article class="squad-person-card"><button class="favorite-player ${pref().favorites.includes(p.id) ? "positive" : ""}" aria-label="${pref().favorites.includes(p.id) ? "Unfollow" : "Follow"} ${esc(p.name)}" onclick="Office.favorite('${p.id}')">${pref().favorites.includes(p.id) ? "★" : "☆"}</button><button class="card-player" onclick="W.player('${p.id}')">${avatar(p)}<b>${esc(p.name)}</b><span>${esc(p.realPosition || p.pos)} · #${p.jersey || "—"}</span></button><div class="card-rating"><strong>${p.ovr}</strong><span>OVR<br>${p.pot} POT</span></div><div class="person-card-stats"><span>Morale${scorePill("morale", p.morale, num(p.morale, 0) + "%")}</span><span>Condition${scorePill("condition", p.fitness ?? 100, num(p.fitness ?? 100, 0) + "%")}</span><span>Form${scorePill("form", p.progression?.form)}</span></div><div class="card-person-foot">${badge(p.injury ? "Injured" : p.holdout ? "Holdout" : p.starter ? "Starter" : "Reserve", p.injury || p.holdout ? "danger" : "")}<button class="link" onclick="Office.compareToggle('${p.id}',${state.team})">${selected.some((x) => x.id === p.id) ? "✓ Selected" : "+ Compare"}</button></div></article>`).join("")}</div>`;
    return `<div class="scroll"><table class="office-data-table squad-new-table" data-no-sort="true"><thead><tr>${squadColumns()
      .map(sortHeader)
      .join("")}</tr></thead><tbody>${
      rows
        .map((p) => {
          const s = seasonStats(p, state.year),
            c = state.franchise.contracts[p.id],
            first = `<td><div class="squad-first"><button class="favorite-player" aria-label="${pref().favorites.includes(p.id) ? "Unfollow" : "Follow"} ${esc(p.name)}" onclick="Office.favorite('${p.id}')">${pref().favorites.includes(p.id) ? "★" : "☆"}</button>${playerLink(p, state.team)}</div></td>`,
            last = `<td><button class="compare-toggle ${selected.some((x) => x.id === p.id) ? "active" : ""}" onclick="Office.compareToggle('${p.id}',${state.team})" aria-label="Compare ${esc(p.name)}">${selected.some((x) => x.id === p.id) ? "✓" : "＋"}</button></td>`;
          const cells =
            pref().squad === "Bio & honors"
              ? `<td>${miniBio(p).split(" · ")[0]}</td><td>${p.weight ? fmtBio(p.weight) + " lb" : "—"}</td><td>${p.age}</td><td>${esc(p.college || "—")}</td><td>${p.experience ?? "—"} yr</td><td><span class="honor-chip">${esc(playerAwards(state, p)[0]?.award || "—")}</span><small>${playerAwards(state, p)[0]?.year || ""}</small></td>`
              : pref().squad === "Performance"
                ? `<td>${num(s.snaps, 0)}</td><td>${grade(s.form)}</td><td>${num(s.passYards, 0)}</td><td>${num(s.rushYards, 0)}</td><td>${num(s.recYards, 0)}</td><td>${num((s.passTD || 0) + (s.rushTD || 0) + (s.recTD || 0), 0)}</td>`
                : pref().squad === "Development"
                  ? `<td>${p.age}</td><td>${grade(s.training)}</td><td>${grade(s.form)}</td><td class="${s.growth >= 0 ? "positive" : "negative"}">${s.growth === null ? "—" : sign(s.growth)}</td><td><button class="link" onclick="Dev.player('${p.id}')">${esc(p.progression?.focus || "Balanced")} →</button></td>`
                  : pref().squad === "Contracts"
                    ? `<td>${cash(S.capHit(c, S.financeYear(state)))}</td><td>${c && !c.ended ? c.start + c.years - 1 : "—"}</td><td>${scorePill("morale", p.morale, num(p.morale, 0) + "%")}</td><td>${scorePill("morale", p.coachTrust ?? 60, num(p.coachTrust ?? 60, 0) + "%")}</td>`
                    : `<td><span class="ovr-pill ${p.ovr >= 90 ? "elite" : "good"}">${p.ovr}</span><small>${p.pot} POT</small></td><td>${badge(p.starter ? "Starter" : "Reserve")}</td><td>${scorePill("condition", p.fitness ?? 100, num(p.fitness ?? 100, 0) + "%")}</td><td>${scorePill("morale", p.morale, num(p.morale, 0) + "%")}</td><td>${scorePill("form", p.progression?.form)}</td><td>${badge(p.injury ? "Injured · " + p.injury + "w" : p.holdout ? "Holdout" : p.status, p.injury || p.holdout ? "danger" : "")}</td>`;
          return `<tr>${first}${cells}${last}</tr>`;
        })
        .join("") ||
      '<tr><td colspan="10" class="office-empty">No matching players.</td></tr>'
    }</tbody></table></div>`;
  }
  const oldRoster = views.Roster;
  const lineupUI = installLineupUI({ isBusy });
  // Over the active limit, say so above the squad and offer the automatic trim right there.
  const rosterAlert = () => {
    const active = state.roster.filter((p) => p.status === "active").length,
      limit = rosterLimit(state),
      over = active - limit;
    if (over <= 0) return "";
    const practice = state.roster.filter((p) => p.status === "practice").length;
    return `<div class="squad-alert" role="status"><div><b>${over} over the ${limit}-player active limit.</b><small>Games can't be played until you trim. Trim to ${limit} keeps your best player at every position, moves the rest to the practice squad while it has room (${practice} / 16), and releases the remainder.</small></div>${S.allowed(state, "roster") ? `<button onclick="Office.trimPreview()">Trim to ${limit} automatically</button>` : ""}</div>`;
  };
  views.Roster = () =>
    `${rosterAlert()}${metrics([
      [
        "Active roster",
        state.roster.filter((p) => p.status === "active").length + " / " + rosterLimit(state),
        state.phase === "offseason" ? "Offseason limit" : "Before matchday",
      ],
      [
        "Practice squad",
        state.roster.filter((p) => p.status === "practice").length + " / 16",
        "Reserve pipeline",
      ],
      [
        "Unavailable",
        state.roster.filter((p) => p.injury || p.holdout).length,
        "Injury or holdout",
      ],
      ["Following", pref().favorites.length, "Your tracked players"],
    ])}<div class="squad-workspace-controls">${lineupUI.toggle("squad")}${lineupUI.mode("squad") === "lineup" ? "" : `<div class="office-tabs">${["Overview", "Performance", "Development", "Contracts", "Bio & honors"].map((v) => `<button class="${pref().squad === v ? "active" : ""}" onclick="Office.squadView('${v}')">${v}</button>`).join("")}</div>`}<div>${lineupUI.mode("squad") === "lineup" ? "" : `<button class="secondary small" onclick="Office.squadLayout()">${pref().layout === "Cards" ? "☷ Table view" : "▦ Card view"}</button>`}<button class="secondary small" onclick="F.depth()">Optimize depth</button><details class="action-menu"><summary>Operations ⌄</summary><div><button onclick="Office.trimPreview()">Trim to 53</button><button onclick="F.action('recruit')">Recruit reserves</button><button onclick="F.action('camp')">Invite camp roster</button><button onclick="Office.waivers()">Waiver wire</button></div></details></div></div>${lineupUI.mode("squad") === "lineup" ? lineupUI.board("squad") : `<section class="panel"><div class="office-filters"><div class="table-search">${icon("search")}<input type="search" aria-label="Search squad" placeholder="Name, position or jersey…" value="${esc(squad.query)}" oninput="Office.searchSquad(this.value)"></div><select aria-label="Squad unit" onchange="Office.squadFilter('unit',this.value)">${opts(["All", "Offense", "Defense", "Special teams"], squad.unit)}</select><select aria-label="Roster status filter" onchange="Office.squadFilter('status',this.value)">${opts(["All", "active", "practice", "ir", "elevated", "Favorites"], squad.status)}</select><label>Sort by<select aria-label="Sort squad" onchange="Office.squadFilter('sort',this.value)">${(SQUAD_SORT_MENU.includes(squad.sort) ? SQUAD_SORT_MENU : [...SQUAD_SORT_MENU, squad.sort])
      .map((k) => [k, SQUAD_SORTS[k]?.label || k])
      .map(
        ([v, l]) =>
          `<option value="${v}" ${v === squad.sort ? "selected" : ""}>${l}</option>`,
      )
      .join(
        "",
      )}</select></label><button class="secondary small" aria-label="Reverse squad sort" onclick="Office.squadReverse()">${squad.direction === -1 ? (["name", "pos", "college"].includes(squad.sort) ? "↓ Z–A" : "↓ Highest first") : ["name", "pos", "college"].includes(squad.sort) ? "↑ A–Z" : "↑ Lowest first"}</button></div><div id="squad-view-content">${squadContent()}</div><div class="office-table-note" id="squad-view-count">${squadList().length} of ${state.roster.length} players · Views and tracked players are saved with this career.</div></section>`}${comparisonTray()}`;
  views.Analysis = () => {
    selected = selected.filter((x) => comparable(x.id, x.team));
    return analysisView({ tab: analysisTab, selected, query: compareQuery });
  };
  function settingsInterface() {
    return `<div class="settings-section"><h3>Make the workspace yours.</h3><p>Display preferences apply on this device. Career decisions remain part of each save.</p><label class="settings-row"><span><b>Pixel theme</b><small>Square pixel panels, hard shadows and a pixel-art field with clear, readable text. Off restores the classic look.</small></span><input type="checkbox" aria-label="Pixel theme" ${document.body.classList.contains("gd-pixel") ? "checked" : ""} onchange="Office.pixel(this.checked)"></label><label class="settings-row"><span><b>Table density</b><small>More space or more players on screen.</small></span><select aria-label="Interface density" onchange="Office.density(this.value)">${opts(["comfortable", "compact"], document.body.dataset.density || "comfortable")}</select></label><label class="settings-row"><span><b>Reduce scene motion</b><small>Quieter cutscenes and static interface transitions.</small></span><input type="checkbox" aria-label="Reduce scene motion" ${document.body.classList.contains("reduce-motion") ? "checked" : ""} onchange="Office.motion(this.checked)"></label><div class="settings-row"><span><b>Keyboard shortcuts</b><small>⌘K / Ctrl+K opens global player and screen search. Escape closes dialogs.</small></span><button class="secondary" onclick="W.command()">Open search</button></div></div>`;
  }
  function settingsAudio() {
    const b = window.broadcast,
      v = b?.voice;
    return `<div class="settings-section"><h3>Bring Sunday to life.</h3><p>Sound and speech start after your interaction. Voice availability depends on your browser.</p><div class="settings-row"><span><b>Stadium sound</b><small>Crowd, whistle and on-field effects.</small></span><button class="secondary" onclick="window.matchAudio.toggle()">${window.matchAudio?.on ? "Sound on · turn off" : "Enable sound"}</button></div><label class="settings-row"><span><b>Master volume</b><small>Match effects and broadcast output level.</small></span><input aria-label="Master volume" type="range" min="0" max="1" step="0.05" value="${window.matchAudio?.volume ?? 0.3}" oninput="Office.volume(this.value)"></label><h3 class="settings-subhead">Match simulator</h3><p>Saved on this device. None of these change a result.</p>${simOptionsControls({ voices: v?.voices() || [], voiceURI: v?.preferences.voiceURI })}<label class="settings-row"><span><b>Commentary pace</b><small>Relaxed, broadcast or brisk delivery.</small></span><select aria-label="Commentary pace" onchange="broadcast.voice.configure({pace:Number(this.value)})">${[
      [0.92, "Relaxed"],
      [1, "Broadcast"],
      [1.1, "Brisk"],
    ]
      .map(
        ([v, l]) =>
          `<option value="${v}" ${v === b?.voice.preferences.pace ? "selected" : ""}>${l}</option>`,
      )
      .join(
        "",
      )}</select></label><div class="settings-row"><span><b>Voice check</b><small>Preview the selected voice.</small></span><button class="secondary" onclick="broadcast.preview()">Preview voice</button></div></div>`;
  }
  function settingsNews() {
    return `<div class="settings-section"><h3>The right information, at the right time.</h3><p>Urgent club messages always reach your inbox. Following controls the news feed.</p><label class="settings-row"><span><b>Pause simulations for urgent decisions</b><small>Stops after the current round when a new urgent choice is waiting.</small></span><input type="checkbox" aria-label="Pause on urgent inbox decisions" ${office().preferences.pauseOnUrgent ? "checked" : ""} onchange="Office.preference('pauseOnUrgent',this.checked)"></label><label class="settings-row"><span><b>League news volume</b><small>Number of wider-league results delivered each round.</small></span><select aria-label="League news volume" onchange="Office.preference('newsFrequency',this.value)">${opts(["Minimal", "Normal", "Extensive"], office().preferences.newsFrequency)}</select></label><h3>Follow franchises</h3><p>Choose Following in News to read only these teams.</p><div class="follow-team-grid">${clubs.map((c, i) => `<label><input type="checkbox" aria-label="Follow ${esc(cname(i))}" ${office().followedTeams.includes(i) ? "checked" : ""} onchange="Office.followTeam(${i},this.checked)">${logo(i)}<span>${esc(c[2])}</span></label>`).join("")}</div></div>`;
  }
  views.Settings = () =>
    `<div class="settings-workspace"><nav class="settings-nav" aria-label="Settings sections">${["Interface", "Match & audio", "News & workflow", "Data & tools"].map((v) => `<button class="${v === settingsTab ? "active" : ""}" onclick="Office.settings('${v}')">${icon(v === "Interface" ? "filter" : v === "Match & audio" ? "mic" : v === "News & workflow" ? "bell" : "database")}<span>${v}</span>${icon("chevron")}</button>`).join("")}</nav><section class="panel settings-content">${
      settingsTab === "Interface"
        ? settingsInterface()
        : settingsTab === "Match & audio"
          ? settingsAudio()
          : settingsTab === "News & workflow"
            ? settingsNews()
            : `<div class="settings-section"><h3>Your career. Your data.</h3><p>Manage backups, custom roster packs and simulation tools in one place.</p>${[
                [
                  "Careers & saves",
                  "Careers & saves",
                  "Independent coaches, save branches and portable JSON backups.",
                ],
                [
                  "Database",
                  "Roster database",
                  "Import and export custom player and branding packs.",
                ],
                [
                  "Debug",
                  "Developer console",
                  "Edit ratings, force events and inspect game systems.",
                ],
              ]
                .map(
                  ([r, t, d]) =>
                    `<button class="settings-destination" onclick="W.open('${r}')"><span>${icon(r === "Debug" ? "code" : "database")}</span><span><b>${t}</b><small>${d}</small></span>${icon("arrow")}</button>`,
                )
                .join("")}</div>`
    }</section></div>`;
  window.Office = {
    // Shows exactly who a trim moves before anything happens.
    trimPreview() {
      const plan = trimPlan(state),
        row = (p) => `<li><b>${esc(p.name)}</b> <small>${esc(p.pos)} · ${p.ovr} OVR · age ${p.age}</small></li>`;
      if (!plan.practice.length && !plan.release.length) return toast("The active roster is already within the limit.");
      modal(
        `<div class="trim-preview"><div class="eyebrow">TRIM TO 53</div><h2>Confirm roster cuts</h2><p>The best player at every position and the highest-rated players stay active.</p>${plan.practice.length ? `<h3>To the practice squad (${plan.practice.length})</h3><ul>${plan.practice.map(row).join("")}</ul>` : ""}${plan.release.length ? `<h3>Released (${plan.release.length})</h3><p class="subtitle">The practice squad is full. Released players count against the cap as dead money for any guaranteed or bonus money left on their deals.</p><ul>${plan.release.map(row).join("")}</ul>` : ""}<div class="modal-actions"><button class="secondary" onclick="closeModal()">Cancel</button><button onclick="closeModal();F.action('trim')">Confirm ${plan.release.length ? plan.release.length + " release" + (plan.release.length === 1 ? "" : "s") + " and " : ""}${plan.practice.length} move${plan.practice.length === 1 ? "" : "s"}</button></div></div>`,
      );
    },
    select(id) {
      const m = allMessages().find((x) => x.id === id);
      if (!m) return;
      inbox.selected = id;
      // Opened from elsewhere (the Hub desk): clear filters that would hide it, show its page.
      if (!filteredMessages().some((x) => x.id === id)) Object.assign(inbox, { filter: "All", category: "All", query: "" });
      inbox.page = pageContaining(filteredMessages(), id, INBOX_PAGE, inbox.page);
      m.read = true;
      save();
      render();
    },
    inboxFilter(k, v) {
      inbox[k] = v;
      inbox.selected = null;
      inbox.page = 0;
      render();
    },
    inboxPage(delta) {
      inbox.page = Math.max(0, inbox.page + Number(delta || 0));
      render();
    },
    searchInbox(v) {
      inbox.query = v;
      inbox.page = 0;
      document.getElementById("inbox-list").innerHTML = inboxList();
      document.getElementById("inbox-message-count").textContent =
        filteredMessages().length + " messages";
    },
    respond(id, c) {
      inbox.filter = "All";
      inbox.category = "All";
      inbox.query = "";
      inbox.selected = id;
      inbox.page = pageContaining(filteredMessages(), id, INBOX_PAGE);
      mutate((s) => respondMessage(s, id, c));
    },
    bookmark(id) {
      mutate((s) => {
        const m = ensureOffice(s).messages.find((m) => m.id === id);
        if (m) m.bookmarked = !m.bookmarked;
      });
    },
    unread(id) {
      mutate((s) => {
        const m = ensureOffice(s).messages.find((m) => m.id === id);
        if (m) m.read = false;
      });
    },
    markAll() {
      mutate((s) => {
        for (const m of ensureOffice(s).messages) m.read = true;
      });
    },
    route(r, id) {
      if (r === "Development" && id) {
        Dev.player(id);
        return;
      }
      if (r === "Conversations" && id) {
        closeModal();
        CI.open("player", id);
        return;
      }
      if (r === "Conversations" && state.interviewPending) {
        closeModal();
        CI.open("post");
        return;
      }
      W.open(r);
    },
    newsPage(delta) {
      news.page += delta;
      render();
    },
    searchNews(v) {
      news.query = v;
      news.page = 0;
      render();
      const el = document.getElementById("news-search");
      if (el) {
        el.focus({ preventScroll: true });
        el.setSelectionRange?.(v.length, v.length);
      }
    },
    newsFilter(k, v) {
      news[k] = v;
      news.page = 0;
      render();
    },
    storyBookmark(id) {
      mutate((s) => {
        const a = ensureOffice(s).stories.find((a) => a.id === id);
        if (a) a.bookmarked = !a.bookmarked;
      });
    },
    fromStory(id) {
      inbox.filter = "All";
      inbox.category = "All";
      inbox.query = "";
      inbox.selected = id;
      inbox.page = pageContaining(filteredMessages(), id, INBOX_PAGE);
      const m = allMessages().find((m) => m.id === id);
      if (m) m.read = true;
      save();
      W.open("Inbox");
    },
    statFilter(k, v) {
      stats[k] = v;
      if (k === "category") {
        stats.sort = null;
        stats.pos = "All";
      }
      if (k === "scope" && v !== "League") stats.club = "All";
      stats.page = 0;
      render();
    },
    statSort(k) {
      stats.direction = stats.sort === k ? -stats.direction : -1;
      stats.sort = k;
      stats.page = 0;
      render();
    },
    statPage(d) {
      stats.page = Math.max(0, (stats.page || 0) + d);
      render();
    },
    searchStats(v) {
      stats.query = v;
      stats.page = 0;
      // Update the results in place so the search box keeps focus.
      const res = statisticsResults(stats, selected),
        set = (id, html) => {
          const el = document.getElementById(id);
          if (el) el.innerHTML = html;
        };
      set("stats-rows", res.body);
      set("st-pager", res.pager);
      set("st-podium", res.podium);
      set("stats-match-count", num(res.count, 0));
    },
    exportStats() {
      const columns = STAT_VIEWS[stats.category],
        rows = statisticsRows(stats);
      const content = csvText(
        ["Player", "Team", "Position", ...columns.map((c) => c[1])],
        rows.map(({ p, team, stats: s }) => [
          p.name,
          clubs[team][0],
          p.realPosition || p.pos,
          ...columns.map(([k]) => statValue(s, k, stats.mode)),
        ]),
      );
      const a = document.createElement("a");
      a.href = URL.createObjectURL(
        new Blob([content], { type: "text/csv;charset=utf-8" }),
      );
      a.download = `gridiron-${stats.category.toLowerCase()}-${stats.year}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    squadView(v) {
      pref().squad = v;
      save();
      render();
    },
    squadLayout() {
      pref().layout = pref().layout === "Cards" ? "Table" : "Cards";
      save();
      render();
    },
    squadFilter(k, v) {
      squad[k] = v;
      // A new metric starts in its natural order (names A–Z, ratings highest first).
      if (k === "sort") squad.direction = defaultDirection(v);
      render();
    },
    squadSortBy(k) {
      if (!SQUAD_SORTS[k]) return;
      squad.direction = squad.sort === k ? -squad.direction : defaultDirection(k);
      squad.sort = k;
      render();
    },
    squadReverse() {
      squad.direction *= -1;
      render();
    },
    searchSquad(v) {
      squad.query = v;
      document.getElementById("squad-view-content").innerHTML = squadContent();
      document.getElementById("squad-view-count").textContent =
        squadList().length + " of " + state.roster.length + " players";
    },
    favorite(id) {
      const p = pref();
      p.favorites = p.favorites.includes(id)
        ? p.favorites.filter((x) => x !== id)
        : [...p.favorites, id];
      save();
      render();
    },
    waivers() {
      modal(oldRoster());
    },
    compareToggle(id, team) {
      const at = selected.findIndex((x) => x.id === id);
      if (at >= 0) selected.splice(at, 1);
      else if (selected.length < 3) selected.push({ id, team });
      else {
        toast("Compare up to three players. Remove one first.");
        return;
      }
      render();
      // Keep an open comparison dialog in step with the selection.
      const dlg = document.getElementById("modal");
      if (dlg?.open && dlg.classList.contains("compare-dialog")) {
        if (selected.length >= 2) window.Office.compare();
        else closeModal();
      }
    },
    clearCompare() {
      selected = [];
      render();
    },
    compare() {
      const rows = selected
        .map((x) => ({ p: comparable(x.id, x.team), team: x.team }))
        .filter((x) => x.p);
      if (rows.length < 2) return;
      modal(
        `<div class="comparison-modal an-cmp-modal"><div class="drawer-top"><span>PLAYER COMPARISON</span><button class="secondary small" onclick="closeModal();W.open('Analysis');Office.analysis('Compare')">Open in Analysis</button><button class="icon-button" onclick="closeModal()" aria-label="Close comparison">×</button></div>${compareBody(rows)}</div>`,
      );
      document.getElementById("modal").classList.add("compare-dialog");
    },
    compareSearch(v) {
      compareQuery = v;
      const list = document.getElementById("an-pick-list");
      if (list) list.innerHTML = comparePickList(selected, v);
    },
    analysis(v) {
      analysisTab = v;
      render();
    },
    morale(id) {
      const p = state.roster.find((p) => p.id === id);
      if (!p) return;
      modal(
        `<div class="eyebrow">PLAYER DYNAMICS</div><h2>${esc(p.name)}</h2>${metrics(
          [
            ["Morale", num(p.morale, 0) + "%"],
            ["Coach trust", num(p.coachTrust ?? 60, 0) + "%"],
          ],
        )}<p>Recent news and office decisions affecting this relationship.</p>${(p.moodLog || []).map((m) => `<div class="mood-event"><span>${m.year} · W${m.week + 1}</span><b>${esc(m.reason)}</b><small>${sign(m.delta)} morale${m.trust ? " · " + sign(m.trust) + " trust" : ""}</small></div>`).join("") || '<p class="muted">No tracked news effects yet. Matches, contracts and conversations can also affect morale.</p>'}<div class="modal-actions"><button class="secondary" onclick="closeModal()">Close</button><button onclick="closeModal();CI.open('player','${p.id}')">Meet player</button></div>`,
      );
    },
    settings(v = "Interface") {
      settingsTab = v;
      closeModal();
      W.open("Settings");
    },
    density(v) {
      document.body.dataset.density = v;
      try {
        localStorage.setItem("gridiron-density", v);
      } catch {}
    },
    pixel(v) {
      window.PixelTheme?.set(v);
      render();
    },
    motion(v) {
      document.body.classList.toggle("reduce-motion", v);
      try {
        localStorage.setItem("gridiron-reduce-motion", String(v));
      } catch {}
      render();
    },
    volume(v) {
      window.matchAudio.setVolume(v);
      try {
        localStorage.setItem("gridiron-volume", String(v));
      } catch {}
    },
    preference(k, v) {
      mutate((s) => {
        ensureOffice(s).preferences[k] = v;
      });
    },
    followTeam(t, v) {
      mutate((s) => {
        const o = ensureOffice(s);
        o.followedTeams = v
          ? [...new Set([...o.followedTeams, t])]
          : o.followedTeams.filter((x) => x !== t);
      });
    },
  };
  try {
    document.body.classList.toggle(
      "reduce-motion",
      localStorage.getItem("gridiron-reduce-motion") === "true",
    );
    const v = localStorage.getItem("gridiron-volume");
    if (v !== null && Number.isFinite(Number(v)))
      window.matchAudio.setVolume(Math.max(0, Math.min(1, Number(v))));
  } catch {}
  // The compact voice shortcut now lands in the dedicated settings workspace.
  if (window.broadcast)
    window.broadcast.settings = () => Office.settings("Match & audio");
  const prevPlayer = W.player;
  W.player = function (id, team = state.team) {
    prevPlayer(id, team);
    if (team === state.team) {
      const host = document.querySelector(".profile-body");
      if (host) {
        const p = state.roster.find((p) => p.id === id);
        if (p)
          host.insertAdjacentHTML(
            "afterbegin",
            `<div class="profile-section"><h3>Relationships & analysis</h3><div class="profile-actions"><button class="secondary" onclick="Office.morale('${id}')">Morale & trust history</button><button class="secondary" onclick="Office.compareToggle('${id}',${team});closeModal()">Add to comparison</button></div></div>`,
          );
      }
    }
  };
  const openScreen = W.open;
  W.open = function (route, ...rest) {
    openScreen(route, ...rest);
    window.scrollTo({ top: 0, behavior: "instant" });
    window.Recruit?.fit();
  };
  const oldOverview = views.Overview;
  views.Overview = () => {
    const c = officeCounts(state),
      list = office()
        .stories.filter((a) => a.team === state.team)
        .slice(0, 3);
    return (
      `<div class="office-pulse"><div><span class="pulse-icon">${icon("bell")}</span><span><b>${c.pending ? c.pending + " decisions on your desk" : "Your office is up to date"}</b><small>${c.unread} unread messages · ${c.urgent} urgent</small></span></div><button onclick="W.open('Inbox')">Open inbox ${icon("arrow")}</button><button class="secondary" onclick="W.open('Analysis')">Team analysis</button></div>` +
      oldOverview().replace(
        /<section class="panel news-panel">[\s\S]*?<\/section>/,
        `<section class="panel news-panel"><div class="panel-head"><h2>Inside the franchise</h2><button class="link" onclick="W.open('News')">All news ${icon("arrow")}</button></div>${list.map((a) => `<button class="dashboard-story" onclick="${a.messageId ? `Office.fromStory('${a.messageId}')` : "W.open('News')"}"><span>${badge(a.category)} ${a.year} · W${a.week + 1}</span><b>${esc(a.title)}</b><small>${esc(a.body)}</small>${icon("chevron")}</button>`).join("")}</section>`,
      )
    );
  };
  const oldRender = render;
  render = function () {
    ensureMatchState();
    S.migrate(state);
    syncOffice(state);
    oldRender();
    const c = officeCounts(state),
      h = document.querySelector("header>div");
    if (h && !h.querySelector(".office-inbox-trigger"))
      h.insertAdjacentHTML(
        "afterbegin",
        `<button class="office-inbox-trigger" aria-label="Inbox, ${c.unread} unread" onclick="W.open('Inbox')">${icon("bell")}${c.unread ? `<b>${c.unread > 99 ? "99+" : c.unread}</b>` : ""}</button>`,
      );
    const nav = document.querySelector("[data-inbox-count]");
    if (nav) nav.textContent = c.unread || "";
    document.querySelector(".density-toggle")?.remove();
    let settingsHost = document.querySelector(".sidebar-settings");
    if (!settingsHost) {
      settingsHost = document.createElement("div");
      settingsHost.className = "sidebar-settings";
      document.getElementById("nav").after(settingsHost);
    }
    const settingsButton = [...document.querySelectorAll("#nav button")].find(
      (b) => b.getAttribute("onclick") === "W.open('Settings')",
    );
    if (settingsButton) settingsHost.replaceChildren(settingsButton);
  };
  const originalClose = closeModal;
  closeModal = function () {
    originalClose();
    document.getElementById("modal").classList.remove("compare-dialog");
  };
  render();
}
