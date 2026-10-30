import { scorePill, previewAttributes, miniBio } from "./player-ui.mjs";
import { playerAwards } from "./player-catalog.mjs";
import * as S from "./state.mjs";
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
  statRows,
  statValue,
  teamReport,
  leagueBenchmarks,
  csvText,
} from "./analysis.mjs";
import { effectiveAttributes } from "./ratings.mjs";
import { faceSVG } from "./newgens.mjs";
import { icon, searchKey } from "./presentation.mjs";
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
  let inbox = { category: "All", filter: "All", query: "", selected: null },
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
    analysisTab = "Performance";
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
  function inboxList() {
    const rows = filteredMessages();
    return (
      rows
        .map(
          (m) =>
            `<button class="inbox-row ${m.id === inbox.selected ? "selected" : ""} ${!m.read ? "unread" : ""}" onclick="Office.select('${m.id}')"><span class="inbox-row-meta"><span>${esc(m.source)}</span><time>${messageTime(m)}</time></span><b>${m.priority === "urgent" ? '<i class="urgent-dot"></i>' : ""}${esc(m.title)}</b><span class="inbox-preview">${esc(m.summary || m.body)}</span><span class="inbox-row-tags">${badge(m.category)}${isTask(m) ? badge(m.status === "pending" ? "Response needed" : "Action needed", m.priority === "urgent" ? "danger" : "amber") : m.status === "resolved" ? badge("Replied", "good") : m.status === "delegated" ? badge("Delegated") : ""}${m.bookmarked ? '<span class="saved-star">★</span>' : ""}${!m.read ? '<span class="new-dot" aria-label="Unread"></span>' : ""}</span></button>`,
        )
        .join("") ||
      '<div class="office-empty"><b>Your desk is clear.</b><p>No messages match these filters.</p></div>'
    );
  }
  function impactRows(changes) {
    return changes?.length
      ? `<div class="impact-grid">${changes.map((c) => `<div><span>${esc(c.name)}</span><b class="${c.delta >= 0 ? "positive" : "negative"}">${sign(c.delta)} morale</b>${c.trust ? `<small>${sign(c.trust)} coach trust</small>` : ""}</div>`).join("")}</div>`
      : '<p class="muted">No direct morale change.</p>';
  }
  function messageDetail() {
    const m = currentMessage();
    if (!m)
      return '<div class="inbox-blank"><span>✉</span><h2>Your next decision starts here.</h2><p>Choose a message to read the brief, review its context and respond.</p></div>';
    const p = state.roster.find((p) => p.id === m.playerId),
      effects = office().moodHistory.find(
        (h) => h.sourceId === m.id || h.sourceId === m.key,
      ),
      pending = m.status === "pending";
    return `<article class="message-detail"><div class="message-topline">${badge(m.category)}<span>${messageTime(m)}</span><button class="icon-button ${m.bookmarked ? "positive" : ""}" aria-label="${m.bookmarked ? "Unsave" : "Save"} message" onclick="Office.bookmark('${m.id}')">${m.bookmarked ? "★" : "☆"}</button></div><h2>${esc(m.title)}</h2><div class="message-sender"><span class="sender-avatar">${icon(m.category === "Medical" ? "medical" : m.category === "Interviews" ? "mic" : "briefcase")}</span><span><b>${esc(m.source)}</b><small>To ${esc(state.coach.name)} · ${esc(state.franchise.role)}</small></span></div><p class="message-copy">${esc(m.body)}</p>${p ? `<div class="message-player">${playerLink(p, state.team)}<div><b>${num(p.morale, 0)}%</b><small>Morale</small></div><div><b>${num(p.coachTrust ?? 60, 0)}%</b><small>Trust</small></div></div>` : m.playerId ? '<p class="muted">The player is no longer with this franchise.</p>' : ""}${
      pending
        ? `<section class="response-box"><div><span class="eyebrow">YOUR RESPONSE</span>${badge(m.priority === "urgent" ? "Priority decision" : "Decision", "amber")}</div><p class="muted">Due in ${Math.max(0, m.dueStep - office().step)} league round(s). If left unanswered, the head coach uses the first response.</p>${decisionOptions(
            m,
          )
            .map(
              (c, i) =>
                `<button class="inbox-choice" onclick="Office.respond('${m.id}','${c.id}')" ${isBusy() || state.live ? "disabled" : ""}><span>${i + 1}</span><span><b>${esc(c.text)}</b><small>${esc(c.note)}</small></span>${icon("arrow")}</button>`,
            )
            .join(
              "",
            )}${state.live ? "<p>Finish the current match to respond.</p>" : ""}</section>`
        : m.response
          ? `<section class="response-record"><span class="eyebrow">${m.status === "delegated" ? "STAFF RESPONSE" : "YOUR RESPONSE"}</span><p>“${esc(m.response)}”</p><small>${esc(m.outcome)}</small>${impactRows(m.changes)}</section>`
          : m.outcome
            ? `<p class="muted">${esc(m.outcome)}</p>`
            : ""
    }${effects && !m.response ? `<section class="response-record"><span class="eyebrow">WHAT CHANGED</span><p>${esc(effects.reason)}</p>${impactRows(effects.changes)}</section>` : ""}<div class="message-actions">${m.route ? `<button class="secondary" onclick="Office.route('${m.route}','${m.playerId || ""}')">${m.interview ? "Attend interview" : m.promiseKey ? "Meet player" : "Open " + ({ Development: "development report", Medical: "medical centre" }[m.route] || m.route)} ${icon("arrow")}</button>` : ""}${p ? `<button class="secondary" onclick="W.player('${p.id}')">Player profile</button>` : ""}<button class="link" onclick="Office.unread('${m.id}')">Mark unread</button></div></article>`;
  }
  views.Inbox = () => {
    const counts = officeCounts(state),
      rows = filteredMessages();
    if (!rows.some((m) => m.id === inbox.selected))
      inbox.selected = rows[0]?.id || null;
    return `<div class="office-page-lead"><div><span class="eyebrow">THE COACHING OFFICE</span><p>Your people. Your priorities. Your next decision.</p></div><div>${badge(counts.pending + (counts.pending === 1 ? " open decision" : " open decisions"), counts.pending ? "amber" : "good")}<button class="secondary small" onclick="Office.markAll()">Mark all read</button></div></div><div class="inbox-toolbar"><div class="office-tabs" aria-label="Inbox filters">${["All", "Unread", "Needs response", "Saved"].map((v) => `<button class="${v === inbox.filter ? "active" : ""}" onclick="Office.inboxFilter('filter','${v}')">${v}</button>`).join("")}</div><div class="table-search">${icon("search")}<input type="search" aria-label="Search inbox" placeholder="Search your inbox…" value="${esc(inbox.query)}" oninput="Office.searchInbox(this.value)"></div><select aria-label="Inbox category" onchange="Office.inboxFilter('category',this.value)">${opts(CATEGORIES, inbox.category)}</select></div><div class="inbox-workspace"><section class="inbox-list" aria-label="Messages"><div class="inbox-list-heading"><b id="inbox-message-count">${rows.length} messages</b><span>Priority · newest</span></div><div id="inbox-list">${inboxList()}</div></section><section id="inbox-detail" class="inbox-reading" aria-label="Selected message">${messageDetail()}</section></div>`;
  };
  function storyCards() {
    const rows = office()
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
          ({
            "Sunday Review": 0,
            "Team communications": 1,
            "Gridiron Journal": 1,
            "League desk": 2,
          }[a.source] ?? 3) -
            ({
              "Sunday Review": 0,
              "Team communications": 1,
              "Gridiron Journal": 1,
              "League desk": 2,
            }[b.source] ?? 3),
      );
    news.total = rows.length;
    news.pages = Math.max(1, Math.ceil(rows.length / 9));
    news.page = Math.max(0, Math.min(news.page, news.pages - 1));
    return (
      rows
        .slice(news.page * 9, news.page * 9 + 9)
        .map(
          (a, i) =>
            `<article class="story-card story-topic-${a.category.toLowerCase()} ${i === 0 ? "lead-story" : ""}"><div class="story-top"><span>${esc(a.source)}</span><button class="icon-button" aria-label="${a.bookmarked ? "Unsave" : "Save"} story" onclick="Office.storyBookmark('${a.id}')">${a.bookmarked ? "★" : "☆"}</button></div><div class="story-category">${badge(a.category)}<span>${a.year} · Week ${a.week + 1}</span></div><h2>${esc(a.title)}</h2><p>${esc(a.body)}</p><div class="story-bottom"><span>${logo(a.team)}${esc(clubs[a.team][2])}</span>${a.messageId ? `<button class="link" onclick="Office.fromStory('${a.messageId}')">Open brief ${icon("arrow")}</button>` : a.route ? `<button class="link" onclick="W.open('${a.route}')">Explore ${icon("arrow")}</button>` : a.playerId ? `<button class="link" onclick="W.player('${a.playerId}',${a.team})">Player ${icon("arrow")}</button>` : ""}</div></article>`,
        )
        .join("") ||
      '<div class="office-empty"><h2>No stories in this view.</h2><p>Change your filters or follow more franchises.</p></div>'
    );
  }
  views.News = () =>
    `<div class="news-masthead"><div><span class="eyebrow">AROUND THE LEAGUE</span><h2>Gridiron Journal<span> / </span>${state.year}</h2></div><div><p>Results. Relationships. The stories behind Sunday.</p></div></div><div class="news-tools"><div class="office-tabs">${["All", "My team", "Following", "Tracked players", "Saved stories"].map((v) => `<button class="${news.scope === v ? "active" : ""}" onclick="Office.newsFilter('scope','${v}')">${v === "All" ? "Around the league" : v}</button>`).join("")}</div><select aria-label="News topic" onchange="Office.newsFilter('category',this.value)">${opts(["All", "Players", "Team", "Medical", "League", "Scouting"], news.category)}</select><button class="secondary small" onclick="Office.settings('News & workflow')">Manage following</button></div><div class="stories-grid">${storyCards()}</div><div class="exp-pagination"><span>${news.total} stories</span><button class="secondary small" onclick="Office.newsPage(-1)" ${news.page === 0 ? "disabled" : ""}>Previous</button><b>${news.page + 1} / ${news.pages}</b><button class="secondary small" onclick="Office.newsPage(1)" ${news.page >= news.pages - 1 ? "disabled" : ""}>Next</button></div>`;
  const statYears = () =>
    [
      ...new Set([
        state.year,
        ...state.roster.flatMap((p) => Object.keys(p.stats || {}).map(Number)),
      ]),
    ]
      .sort((a, b) => b - a)
      .concat("Career");
  function statTableRows() {
    return (
      statRows(state, stats)
        .slice(0, 160)
        .map(
          ({ p, team, stats: s }, i) =>
            `<tr><td class="muted">${i + 1}</td><td>${playerLink(p, team)}</td>${STAT_VIEWS[stats.category].map(([key]) => `<td class="numeric">${num(statValue(s, key, stats.mode), key === "growth" ? 2 : 1)}</td>`).join("")}<td><button class="compare-toggle ${selected.some((x) => x.id === p.id) ? "active" : ""}" onclick="Office.compareToggle('${p.id}',${team})" aria-label="Compare ${esc(p.name)}">${selected.some((x) => x.id === p.id) ? "✓" : "＋"}</button></td></tr>`,
        )
        .join("") ||
      `<tr><td colspan="12" class="office-empty">No matching players with this sample. Reduce the minimum snaps filter.</td></tr>`
    );
  }
  views.Statistics = () => {
    if (!statYears().map(String).includes(String(stats.year)))
      stats.year = state.year;
    stats.team = state.team;
    const count = statRows(state, stats).length;
    return `${metrics([
      ["Data scope", "This save", "Simulated production only"],
      [
        "Season",
        stats.year,
        stats.year === "Career"
          ? "All recorded save seasons"
          : "Current and completed games",
      ],
      [
        "Matching players",
        `<span id="stats-match-count">${num(count, 0)}</span>`,
        "First 160 shown",
      ],
      ["Display", stats.mode, "Efficiency columns retain their units"],
    ])}<div class="office-tabs stats-tabs">${Object.keys(STAT_VIEWS)
      .map(
        (c) =>
          `<button class="${c === stats.category ? "active" : ""}" onclick="Office.statFilter('category','${c}')">${c}</button>`,
      )
      .join(
        "",
      )}</div><section class="panel"><div class="office-filters"><label>Scope<select aria-label="Statistics scope" onchange="Office.statFilter('scope',this.value)">${opts(["My team", "League"], stats.scope)}</select></label><label>Season<select aria-label="Statistics season" onchange="Office.statFilter('year',this.value)">${opts(statYears(), stats.year)}</select></label><label>Display<select aria-label="Statistics display" onchange="Office.statFilter('mode',this.value)">${opts(["Totals", "Per 100 snaps"], stats.mode)}</select></label><label>Minimum snaps<select aria-label="Minimum snaps" onchange="Office.statFilter('minimum',Number(this.value))">${opts([0, 25, 100, 250], stats.minimum)}</select></label><div class="table-search">${icon("search")}<input type="search" aria-label="Search statistics" placeholder="Find a player…" value="${esc(stats.query)}" oninput="Office.searchStats(this.value)"></div><button class="secondary small" onclick="Office.exportStats()">Export CSV</button></div><div class="scroll"><table class="office-data-table"><thead><tr><th>#</th><th>Player</th>${STAT_VIEWS[stats.category].map(([key, label]) => `<th aria-sort="${stats.sort === key ? (stats.direction === -1 ? "descending" : "ascending") : "none"}"><button onclick="Office.statSort('${key}')">${label} ${stats.sort === key ? (stats.direction === -1 ? "↓" : "↑") : ""}</button></th>`).join("")}<th>Compare</th></tr></thead><tbody id="stats-rows">${statTableRows()}</tbody></table></div><div class="office-table-note">${stats.mode === "Per 100 snaps" ? "Counting stats are scaled to 100 recorded snaps. Rate columns (Cmp %, Y/A, Y/C, Y/Rec) retain their original units." : "Click a column to sort. — means no recorded value or no valid denominator."} Snaps can include special teams. Older saves may have incomplete player records. ${stats.category === "Defense" ? "The engine currently records tackles and sacks; untracked defensive metrics are omitted." : ""}</div></section>${comparisonTray()}`;
  };
  const comparable = (id, t) => S.roster(state, t).find((p) => p.id === id);
  function comparisonTray() {
    selected = selected.filter((x) => comparable(x.id, x.team));
    return selected.length
      ? `<div class="comparison-tray"><span>COMPARE <b>${selected.length} / 3</b></span>${selected
          .map((x) => {
            const p = comparable(x.id, x.team);
            return `<button class="compare-chip" onclick="Office.compareToggle('${x.id}',${x.team})">${esc(p.name)} ×</button>`;
          })
          .join(
            "",
          )}<button onclick="Office.compare()" ${selected.length < 2 ? "disabled" : ""}>Compare players →</button><button class="link" onclick="Office.clearCompare()">Clear</button></div>`
      : "";
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
      .sort((a, b) => {
        const value = (p) =>
          squad.sort === "name"
            ? p.name
            : squad.sort === "cap"
              ? S.capHit(state.franchise.contracts[p.id], S.financeYear(state))
              : squad.sort === "form"
                ? (p.progression?.form ?? -1)
                : squad.sort === "growth"
                  ? (p.progression?.lastReport?.delta ?? -99)
                  : (p[squad.sort] ?? 0);
        const av = value(a),
          bv = value(b);
        return typeof av === "string"
          ? squad.direction * av.localeCompare(bv)
          : squad.direction * (av - bv);
      });
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
    return `<div class="scroll"><table class="office-data-table squad-new-table"><thead><tr>${squadColumns()
      .map((c) => `<th>${c}</th>`)
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
  views.Roster = () =>
    `${metrics([
      [
        "Active roster",
        state.roster.filter((p) => p.status === "active").length + " / 53",
        "Before matchday",
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
    ])}<div class="squad-workspace-controls"><div class="office-tabs">${["Overview", "Performance", "Development", "Contracts", "Bio & honors"].map((v) => `<button class="${pref().squad === v ? "active" : ""}" onclick="Office.squadView('${v}')">${v}</button>`).join("")}</div><div><button class="secondary small" onclick="Office.squadLayout()">${pref().layout === "Cards" ? "☷ Table view" : "▦ Card view"}</button><button class="secondary small" onclick="F.depth()">Optimize depth</button><details class="action-menu"><summary>Operations ⌄</summary><div><button onclick="F.action('trim')">Trim to 53</button><button onclick="F.action('recruit')">Recruit reserves</button><button onclick="F.action('camp')">Invite camp roster</button><button onclick="Office.waivers()">Waiver wire</button></div></details></div></div><section class="panel"><div class="office-filters"><div class="table-search">${icon("search")}<input type="search" aria-label="Search squad" placeholder="Name, position or jersey…" value="${esc(squad.query)}" oninput="Office.searchSquad(this.value)"></div><select aria-label="Squad unit" onchange="Office.squadFilter('unit',this.value)">${opts(["All", "Offense", "Defense", "Special teams"], squad.unit)}</select><select aria-label="Roster status filter" onchange="Office.squadFilter('status',this.value)">${opts(["All", "active", "practice", "ir", "elevated", "Favorites"], squad.status)}</select><label>Sort by<select aria-label="Sort squad" onchange="Office.squadFilter('sort',this.value)">${[
      ["ovr", "Overall"],
      ["name", "Name"],
      ["age", "Age"],
      ["morale", "Morale"],
      ["cap", "Cap charge"],
      ["form", "Form"],
      ["growth", "Ability change"],
    ]
      .map(
        ([v, l]) =>
          `<option value="${v}" ${v === squad.sort ? "selected" : ""}>${l}</option>`,
      )
      .join(
        "",
      )}</select></label><button class="secondary small" aria-label="Reverse squad sort" onclick="Office.squadReverse()">${squad.direction === -1 ? "↓ Descending" : "↑ Ascending"}</button></div><div id="squad-view-content">${squadContent()}</div><div class="office-table-note" id="squad-view-count">${squadList().length} of ${state.roster.length} players · Views and tracked players are saved with this career.</div></section>${comparisonTray()}`;
  function teamBars(r, b) {
    return [
      ["Points / game", r.ppg, b.ppg],
      ["Points allowed / game", r.allowed, b.allowed],
      ["Squad morale", r.morale, b.morale],
      ["Training grade", r.training, b.training],
    ]
      .map(([label, v, l]) => {
        const max = Math.max(v || 0, l || 0, 1);
        return `<div class="benchmark-row"><div><b>${label}</b><span>${num(v)} <small>vs ${num(l)} league mean</small></span></div><div class="benchmark-bars"><i style="width:${v === null ? 0 : (v / max) * 100}%"></i><b style="width:${l === null ? 0 : (l / max) * 100}%"></b></div></div>`;
      })
      .join("");
  }
  views.Analysis = () => {
    const r = teamReport(state),
      b = leagueBenchmarks(state),
      injured = r.roster.filter((p) => p.injury),
      unsettled = r.roster.filter((p) => p.morale < 60),
      last = r.played.slice(-6),
      op = game(),
      opp = op ? teamReport(state, op.a === state.team ? op.b : op.a) : null;
    const trends = last.length
      ? `<div class="results-chart">${last.map((g) => `<div class="result-column"><div><i style="height:${Math.max(4, (g.for / Math.max(1, ...last.flatMap((x) => [x.for, x.against]))) * 120)}px" title="Scored ${g.for}"></i><b style="height:${Math.max(4, (g.against / Math.max(1, ...last.flatMap((x) => [x.for, x.against]))) * 120)}px" title="Allowed ${g.against}"></b></div><strong>${g.for}–${g.against}</strong><small>W${g.week} · ${esc(clubs[g.opponent][0])}</small></div>`).join("")}</div>`
      : '<div class="office-empty">Your first completed game will begin this chart.</div>';
    const mood = office().moodHistory.slice(0, 8);
    const body =
      analysisTab === "Performance"
        ? `<div class="analysis-grid">${panel("Your team against the league", teamBars(r, b), badge(r.games + " games"))}${panel("Recent results", trends + '<p class="chart-key"><i></i> Scored <b></b> Allowed</p>')}</div>${panel("Your next opponent", opp ? `<div class="opposition-report">${logo(opp.team)}<div><h3>${esc(cname(opp.team))}</h3><p>${opp.games} games · ${num(opp.ppg)} points/game · ${num(opp.allowed)} allowed/game</p></div><button class="secondary" onclick="W.open('Game plan')">Prepare tactics →</button></div><p class="muted">${opp.games < 3 ? "Small sample: fewer than three games. Use roster quality and availability alongside these results." : "Scoring trends are descriptive. Opponent quality and game situation affect these figures."}</p>` : "No fixture scheduled. Use the offseason to address the squad.")}`
        : analysisTab === "Workload"
          ? `<div class="analysis-grid">${panel(
              "Availability watch",
              injured.length
                ? injured
                    .slice(0, 8)
                    .map(
                      (p) =>
                        `<div class="analysis-player-row">${playerLink(p, state.team)}<span>${p.injury}w <small>${esc(p.medical?.bodyPart || "Injury")}</small></span><button class="link" onclick="Dev.player('${p.id}')">Rehab →</button></div>`,
                    )
                    .join("")
                : "<p>No current injuries.</p>",
            )}${panel(
              "Training & recovery",
              r.roster
                .filter(
                  (p) =>
                    p.progression?.load === "Intensive" ||
                    (p.fitness ?? 100) < 75,
                )
                .slice(0, 8)
                .map(
                  (p) =>
                    `<div class="analysis-player-row">${playerLink(p, state.team)}<span>${num(p.fitness, 0)}% <small>${esc(p.progression?.load || "Normal")} load</small></span><button class="link" onclick="Dev.player('${p.id}')">Plan →</button></div>`,
                )
                .join("") || "<p>No low-condition or intensive-load flags.</p>",
            )}</div>`
          : `<div class="analysis-grid">${panel(
              "Relationship watch",
              unsettled.length
                ? unsettled
                    .slice(0, 8)
                    .map(
                      (p) =>
                        `<div class="analysis-player-row">${playerLink(p, state.team)}<span class="negative">${num(p.morale, 0)}%<small>${num(p.coachTrust ?? 60, 0)}% trust</small></span><button class="link" onclick="Office.morale('${p.id}')">Why? →</button></div>`,
                    )
                    .join("")
                : "<p>No players below 60% morale.</p>",
            )}${panel("Why the room changed", mood.length ? mood.map((e) => `<div class="mood-event"><span>${e.year} · W${e.week + 1}</span><b>${esc(e.reason)}</b><small>${e.changes.map((c) => esc(c.name) + " " + sign(c.delta)).join(" · ") || "No direct morale change"}</small></div>`).join("") : "<p>News reactions and responses will be recorded here.</p>")}</div>`;
    return `${metrics([
      ["Scoring", num(r.ppg), "Points per game"],
      ["Defensive scoring", num(r.allowed), "Points allowed per game"],
      ["Squad morale", num(r.morale, 0) + "%", "Roster average"],
      ["Available", r.available, "Healthy active/elevated players"],
    ])}<div class="office-tabs stats-tabs">${["Performance", "Workload", "Dynamics"].map((v) => `<button class="${analysisTab === v ? "active" : ""}" onclick="Office.analysis('${v}')">${v}</button>`).join("")}</div>${body}<p class="fiction-note">— indicates no recorded sample. Scoring benchmarks use regular-season games; player production includes all recorded games.</p>`;
  };
  function settingsInterface() {
    return `<div class="settings-section"><h3>Make the workspace yours.</h3><p>Display preferences apply on this device. Career decisions remain part of each save.</p><label class="settings-row"><span><b>Pixel theme</b><small>Retro pixel fonts, square panels and a pixel-art field. Off restores the classic look.</small></span><input type="checkbox" aria-label="Pixel theme" ${document.body.classList.contains("gd-pixel") ? "checked" : ""} onchange="Office.pixel(this.checked)"></label><label class="settings-row"><span><b>Table density</b><small>More space or more players on screen.</small></span><select aria-label="Interface density" onchange="Office.density(this.value)">${opts(["comfortable", "compact"], document.body.dataset.density || "comfortable")}</select></label><label class="settings-row"><span><b>Reduce scene motion</b><small>Quieter cutscenes and static interface transitions.</small></span><input type="checkbox" aria-label="Reduce scene motion" ${document.body.classList.contains("reduce-motion") ? "checked" : ""} onchange="Office.motion(this.checked)"></label><div class="settings-row"><span><b>Keyboard shortcuts</b><small>⌘K / Ctrl+K opens global player and screen search. Escape closes dialogs.</small></span><button class="secondary" onclick="W.command()">Open search</button></div></div>`;
  }
  function settingsAudio() {
    const b = window.broadcast,
      v = b?.voice;
    return `<div class="settings-section"><h3>Bring Sunday to life.</h3><p>Sound and speech start after your interaction. Voice availability depends on your browser.</p><div class="settings-row"><span><b>Stadium sound</b><small>Crowd, whistle and on-field effects.</small></span><button class="secondary" onclick="window.matchAudio.toggle()">${window.matchAudio?.on ? "Sound on · turn off" : "Enable sound"}</button></div><label class="settings-row"><span><b>Master volume</b><small>Match effects and broadcast output level.</small></span><input aria-label="Master volume" type="range" min="0" max="1" step="0.05" value="${window.matchAudio?.volume ?? 0.3}" oninput="Office.volume(this.value)"></label><div class="settings-row"><span><b>Spoken commentary</b><small>Captions remain available with speech off.</small></span><button class="secondary" onclick="broadcast.toggle()">${b?.director.enabled ? "Commentary on · turn off" : "Enable commentary"}</button></div><label class="settings-row"><span><b>Commentator voice</b><small>Choose an installed English voice.</small></span><select aria-label="Commentator voice" onchange="broadcast.voice.configure({voiceURI:this.value})"><option value="">Automatic</option>${(v?.voices() || []).map((x) => `<option value="${esc(x.voiceURI)}" ${x.voiceURI === v.preferences.voiceURI ? "selected" : ""}>${esc(x.name)} · ${esc(x.lang)}</option>`).join("")}</select></label><label class="settings-row"><span><b>Commentary pace</b><small>Relaxed, broadcast or brisk delivery.</small></span><select aria-label="Commentary pace" onchange="broadcast.voice.configure({pace:Number(this.value)})">${[
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
    select(id) {
      const m = allMessages().find((x) => x.id === id);
      if (!m) return;
      inbox.selected = id;
      m.read = true;
      save();
      render();
    },
    inboxFilter(k, v) {
      inbox[k] = v;
      inbox.selected = null;
      render();
    },
    searchInbox(v) {
      inbox.query = v;
      document.getElementById("inbox-list").innerHTML = inboxList();
      document.getElementById("inbox-message-count").textContent =
        filteredMessages().length + " messages";
    },
    respond(id, c) {
      inbox.filter = "All";
      inbox.category = "All";
      inbox.query = "";
      inbox.selected = id;
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
      const m = allMessages().find((m) => m.id === id);
      if (m) m.read = true;
      save();
      W.open("Inbox");
    },
    statFilter(k, v) {
      stats[k] = v;
      if (k === "category") stats.sort = null;
      render();
    },
    statSort(k) {
      stats.direction = stats.sort === k ? -stats.direction : -1;
      stats.sort = k;
      render();
    },
    searchStats(v) {
      stats.query = v;
      document.getElementById("stats-rows").innerHTML = statTableRows();
      const count = document.getElementById("stats-match-count");
      if (count) count.textContent = num(statRows(state, stats).length, 0);
    },
    exportStats() {
      const columns = STAT_VIEWS[stats.category],
        rows = statRows(state, stats);
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
      const roleKeys = {
        QB: [
          "throwPower",
          "throwAccuracyShort",
          "throwAccuracyMid",
          "throwAccuracyDeep",
        ],
        RB: ["carrying", "breakTackle", "catching"],
        WR: ["catching", "shortRouteRunning"],
        TE: ["catching", "shortRouteRunning", "runBlock"],
        OL: ["runBlock", "passBlock"],
        DL: ["tackle"],
        LB: ["tackle", "zoneCoverage"],
        CB: ["manCoverage", "zoneCoverage", "tackle"],
        S: ["manCoverage", "zoneCoverage", "tackle"],
        K: ["kickPower", "kickAccuracy"],
        P: ["kickPower", "kickAccuracy"],
      };
      const attrs = [
        ...new Set([
          "speed",
          "acceleration",
          "strength",
          "awareness",
          "stamina",
          ...rows.flatMap(({ p }) => roleKeys[p.pos] || []),
        ]),
      ];
      modal(
        `<div class="comparison-modal"><div class="drawer-top"><span>PLAYER COMPARISON</span><button class="icon-button" onclick="closeModal()" aria-label="Close comparison">×</button></div><div class="compare-players" style="--compare-count:${rows.length}">${rows.map(({ p, team }) => `<div>${avatar(p)}<h3>${esc(p.name)}</h3><p>${esc(clubs[team][0])} · ${esc(p.realPosition || p.pos)} · ${p.age}</p><b>${p.ovr} <small>OVR</small></b></div>`).join("")}</div><div class="scroll"><table class="office-data-table"><thead><tr><th>Attribute</th>${rows.map(({ p }) => `<th>${esc(p.name.split(" ").at(-1))}</th>`).join("")}</tr></thead><tbody>${[
          ["Potential", (p) => p.pot],
          ["Morale", (p) => p.morale],
          ["Condition", (p) => p.fitness],
          ["Training", (p) => p.progression?.training],
          ["Form", (p) => p.progression?.form],
          ...attrs.map((k) => [
            k.replace(/([A-Z])/g, " $1"),
            (p) => (effectiveAttributes(p) || {})[k],
          ]),
        ]
          .map(([label, get]) => {
            const vals = rows.map(({ p }) => get(p)),
              max = Math.max(...vals.filter(Number.isFinite));
            return `<tr><th>${esc(label)}</th>${vals.map((v) => `<td class="${v === max ? "positive" : ""}">${num(v)}</td>`).join("")}</tr>`;
          })
          .join(
            "",
          )}</tbody></table></div><p class="data-note">Position matters: an attribute can be irrelevant to a player's role. Ratings include development and medical changes in this save.</p></div>`,
      );
      document.getElementById("modal").classList.add("compare-dialog");
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
  W.open = function (route) {
    openScreen(route);
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
