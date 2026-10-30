import { serializeCareer } from "./ratings.mjs";
import { faceSVG } from "./newgens.mjs";
import * as S from "./state.mjs";
import { applyRealRosters } from "./real-rosters.mjs";
const paths = {
  home: "m3 10 9-7 9 7v10H3z M9 20v-7h6v7",
  play: "m8 5 11 7-11 7z",
  users:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  target: "M22 12A10 10 0 1 1 12 2 M16 12a4 4 0 1 1-4-4 M12 12l9-9 M16 3h5v5",
  calendar: "M4 5h16v16H4z M8 2v6 M16 2v6 M4 10h16",
  chart: "M3 3v18h18 M7 14l5-5 4 3 5-7",
  wallet: "M3 6h17v15H3z M3 6V3h14v3 M16 11h6v5h-6z",
  search: "M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  chevron: "m9 5 7 7-7 7",
  medical: "M9 3h6v6h6v6h-6v6H9v-6H3V9h6z",
  building: "M4 21V3h16v18 M8 7h2 M14 7h2 M8 11h2 M14 11h2 M9 21v-6h6v6",
  briefcase: "M3 7h18v14H3z M8 7V3h8v4 M3 12h18 M10 12v3h4v-3",
  mic: "M9 4a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0z M5 10v2a7 7 0 0 0 14 0v-2 M12 19v3 M8 22h8",
  history: "M3 11a9 9 0 1 1 2 7 M3 4v7h7 M12 7v5l3 2",
  database:
    "M21 5c0 2-4 3-9 3S3 7 3 5s4-3 9-3 9 1 9 3z M3 5v14c0 2 4 3 9 3s9-1 9-3V5 M3 12c0 2 4 3 9 3s9-1 9-3",
  code: "m8 6-6 6 6 6 M16 6l6 6-6 6 M14 3l-4 18",
  check: "m5 12 4 4L19 6",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4",
  menu: "M3 6h18 M3 12h18 M3 18h18",
  close: "m6 6 12 12 M6 18 18 6",
  filter: "M3 5h18 M6 12h12 M9 19h6",
  ball: "M4 4c8-4 20 8 16 16C12 24 0 12 4 4z M8 8l8 8 M9 12l3-3 M12 15l3-3",
};
export const icon = (name, cls = "") =>
  `<svg class="ui-icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.target}"/></svg>`;
export const searchKey = (text) =>
  String(text)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const money = (n) => "$" + (n / S.MILLION).toFixed(1) + "M";
const groups = [
  [
    "Squad & tactics",
    [
      ["Roster", "Squad", "users"],
      ["Game plan", "Tactics", "target"],
      ["Medical", "Medical & training", "medical"],
      ["Development", "Player development", "chart"],
      ["Locker room", "Locker room", "users"],
      ["Conversations", "Conversations", "mic"],
    ],
  ],
  [
    "Recruitment",
    [
      ["Scouting", "Scouting", "search"],
      ["Draft", "Draft room", "target"],
      ["Next generation", "Next generation", "users"],
      ["Market", "Transfers & free agency", "chart"],
    ],
  ],
  [
    "Organization",
    [
      ["Contracts", "Contracts & salary cap", "wallet"],
      ["Club", "Organization hub", "building"],
      ["Staff", "Coaching staff", "users"],
      ["Boardroom", "Boardroom", "building"],
      ["Career dossier", "Career dossier", "briefcase"],
      ["Career", "Coach profile", "briefcase"],
      ["Media room", "Media room", "mic"],
    ],
  ],
  [
    "Competition",
    [
      ["Calendar", "Calendar & holiday", "calendar"],
      ["Schedule", "Schedule", "calendar"],
      ["League desk", "Around the league", "chart"],
      ["Records", "Records & milestones", "chart"],
      ["Awards", "Awards watch", "history"],
      ["Archives", "History & records", "history"],
      ["Hall of Fame", "Hall of Fame", "history"],
    ],
  ],
  [
    "Performance",
    [
      ["Statistics", "Statistics", "chart"],
      ["Analysis", "Data & analysis", "target"],
    ],
  ],
];
const legacy = new Set(["Game plan", "Schedule", "Media room", "Matchday"]);
const descriptions = {
  Overview: ["Club overview", "The decisions that shape your next Sunday."],
  Roster: ["Squad", "Every player. Every role. One team."],
  Career: ["Coach profile", "Build your coaching career."],
  Staff: ["Coaching staff", "Build your department. Run a complete search."],
  Contracts: ["Contracts & salary cap", "Plan this season. Protect the next."],
  Market: [
    "Transfers & free agency",
    "Find the right player at the right price.",
  ],
  Scouting: ["Scouting", "Find your next difference-maker."],
  Draft: ["Draft room", "The next chapter starts on the clock."],
  Club: ["Organization hub", "Invest in the future of your franchise."],
  Medical: ["Medical & training", "Prepare hard. Keep your players ready."],
  "Locker room": [
    "Locker room",
    "Understand the people behind the performance.",
  ],
  League: ["League office", "Follow the decisions shaping the competition."],
  Archives: ["History & records", "Every season leaves a legacy."],
  "Hall of Fame": ["Hall of Fame", "The people who made the game."],
  "Next generation": ["Next generation", "New faces. New possibilities."],
  Conversations: ["Conversations", "Your words shape the room."],
  Database: ["Data & saves", "Your roster database and career backups."],
  Development: [
    "Player development",
    "Shape ability. Manage workload. Protect the future.",
  ],
  "Careers & saves": ["Careers & saves", "Every coach has a different story."],
  Inbox: ["Inbox", "The decisions and people that need your attention."],
  News: ["News & social", "Follow the stories shaping your football world."],
  Statistics: ["Statistics", "Find the numbers. Understand the sample."],
  Analysis: ["Data & analysis", "See the patterns. Choose your next move."],
  Settings: ["Settings", "Your workspace, audio, news and data tools."],
  Debug: ["Developer console", "Inspect, adjust and test your simulation."],
};
const initials = (p) =>
  p.name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("");
const portrait = (p, cls = "") =>
  `<span class="player-avatar ${cls}">${faceSVG(p)}${/^https:\/\//.test(p.headshot || "") ? `<img src="${esc(p.headshot)}" alt="${esc(p.name)}" loading="lazy" decoding="async" onerror="this.remove()">` : ""}</span>`;
const status = (p) =>
  p.holdout
    ? "Holdout"
    : p.injury
      ? "Injured"
      : {
          active: "Active",
          practice: "Practice squad",
          elevated: "Elevated",
          ir: "Injured reserve",
        }[p.status] || p.status;
const positionSide = (p) =>
  ["QB", "RB", "WR", "TE", "OL"].includes(p.pos)
    ? "Offense"
    : ["DL", "LB", "CB", "S"].includes(p.pos)
      ? "Defense"
      : "Special teams";
export function installPresentation({
  views,
  getSection,
  setSection,
  isBusy,
  snapshot,
}) {
  let squadFilter = { query: "", unit: "All", status: "All", sort: "ovr" },
    commandQuery = "",
    openGroups = new Set(["Squad & tactics", "Recruitment"]);
  try {
    openGroups = new Set(
      JSON.parse(localStorage.getItem("gridiron-nav-groups")) || [
        ...openGroups,
      ],
    );
    document.body.dataset.density =
      localStorage.getItem("gridiron-density") || "comfortable";
  } catch {}
  const pristine =
    !state.franchise.databaseSource &&
    state.week === 0 &&
    !state.live &&
    !state.history.length &&
    !state.franchise.audit?.length;
  if (snapshot && pristine) applyRealRosters(state, snapshot);
  // Batch repeated render saves; flush synchronously when the page is left.
  let saveTimer = null,
    lastSaved = "",
    dirty = false;
  const flushSave = () => {
    if (!dirty) return;
    if (window.Career) {
      dirty = false;
      window.Career.autosave();
      return;
    }
    if (window.careerStore) return;
    try {
      const payload = serializeCareer(state);
      if (payload !== lastSaved) {
        localStorage.setItem("gridiron-v1", payload);
        lastSaved = payload;
      }
      dirty = false;
    } catch {
      let label = document.querySelector(".footer-status");
      if (label)
        label.innerHTML =
          '<span class="negative">Storage full · export your career in Data & saves</span>';
    }
  };
  save = function () {
    if (window.Career) {
      window.Career.autosave();
      return;
    }
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 220);
  };
  window.addEventListener("beforeunload", flushSave);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) flushSave();
  });
  const previousStart = startCareer;
  startCareer = function (team) {
    if (isBusy()) {
      toast("Wait for the current simulation to finish.");
      return;
    }
    previousStart(team);
    if (snapshot) {
      state.live = null;
      applyRealRosters(state, snapshot);
    }
    F.tab("Overview");
    render();
  };
  const active = () =>
    view === "Franchise"
      ? getSection()
      : view === "Overview"
        ? "Overview"
        : view;
  const link = (route, label, glyph) =>
    `<button class="nav-item ${active() === route ? "active" : ""}" ${active() === route ? 'aria-current="page"' : ""} onclick="W.open('${route}')">${icon(glyph)}<span>${label}</span>${route === "Matchday" && state.live ? '<i class="live-dot"></i>' : ""}${route === "Medical" && state.roster.some((p) => p.injury) ? `<small>${state.roster.filter((p) => p.injury).length}</small>` : ""}</button>`;
  function syncMobileNavigation() {
    let closed =
      window.innerWidth <= 760 &&
      !document.body.classList.contains("nav-visible");
    let sidebar = document.querySelector("aside");
    sidebar.inert = closed;
    sidebar.setAttribute("aria-hidden", String(closed));
  }
  window.addEventListener("resize", syncMobileNavigation);
  document.addEventListener("click", (e) => {
    if (
      window.innerWidth <= 760 &&
      document.body.classList.contains("nav-visible") &&
      !e.target.closest("aside") &&
      !e.target.closest(".mobile-menu")
    ) {
      document.body.classList.remove("nav-visible");
      syncMobileNavigation();
    }
  });
  function navigation() {
    for (let [name, items] of groups)
      if (items.some(([route]) => active() === route)) openGroups.add(name);
    document.getElementById("nav").innerHTML =
      link("Overview", "Club overview", "home") +
      link("Inbox", "Inbox", "bell") +
      link("News", "News & social", "database") +
      link("Matchday", "Matchday", "play") +
      groups
        .map(
          ([name, items]) =>
            `<details class="nav-group" ${openGroups.has(name) ? "open" : ""} ontoggle="W.group('${name}',this.open)"><summary>${name}<span>⌄</span></summary>${items.map(([r, l, i]) => link(r, l, i)).join("")}</details>`,
        )
        .join("") +
      `<div class="nav-settings-divider"></div>` +
      link("Careers & saves", "Careers & saves", "briefcase") +
      link("Settings", "Settings", "filter");
  }
  const previousModal = modal;
  modal = function (html) {
    document
      .getElementById("modal")
      .classList.remove("player-drawer", "command-dialog");
    previousModal(html);
  };
  const previousClose = closeModal;
  closeModal = function () {
    previousClose();
    document
      .getElementById("modal")
      .classList.remove("player-drawer", "command-dialog");
  };
  window.W = {
    open(route) {
      document.body.classList.remove("nav-visible");
      if (legacy.has(route)) {
        go(route);
      } else {
        setSection(route);
        go("Franchise");
      }
    },
    group(name, opened) {
      opened ? openGroups.add(name) : openGroups.delete(name);
      try {
        localStorage.setItem(
          "gridiron-nav-groups",
          JSON.stringify([...openGroups]),
        );
      } catch {}
    },
    mobile() {
      document.body.classList.toggle("nav-visible");
      syncMobileNavigation();
    },
    density() {
      let value =
        document.body.dataset.density === "compact" ? "comfortable" : "compact";
      document.body.dataset.density = value;
      try {
        localStorage.setItem("gridiron-density", value);
      } catch {}
      toast(
        value === "compact"
          ? "Compact layout enabled"
          : "Comfortable layout enabled",
      );
    },
    command() {
      closeModal();
      commandQuery = "";
      modal(
        `<div class="command-search">${icon("search")}<input id="command-input" type="search" placeholder="Find a player or jump to a screen…" aria-label="Search players and screens" oninput="W.search(this.value)"><kbd>ESC</kbd></div><div id="command-results"></div><div class="command-hint">Search your entire league · Click a result to open it</div>`,
      );
      document.getElementById("modal").classList.add("command-dialog");
      W.search("");
      document.getElementById("command-input").focus();
    },
    search(value) {
      commandQuery = value.toLowerCase().trim();
      let routes = [
          ["Overview", "Club overview", "home"],
          ["Matchday", "Matchday", "play"],
          ["Inbox", "Inbox", "bell"],
          ["News", "News & social", "database"],
          ["Settings", "Settings", "filter"],
          ["Careers & saves", "Careers & saves", "briefcase"],
          ...groups.flatMap((g) => g[1]),
        ].filter((r) =>
          (r[0] + " " + r[1]).toLowerCase().includes(commandQuery),
        ),
        players =
          commandQuery.length > 1
            ? Array.from({ length: 32 }, (_, team) =>
                S.roster(state, team).map((p) => ({ p, team })),
              )
                .flat()
                .filter(({ p }) =>
                  searchKey(p.name).includes(searchKey(commandQuery)),
                )
                .slice(0, 18)
            : [];
      document.getElementById("command-results").innerHTML =
        (routes.length ? '<div class="result-label">SCREENS</div>' : "") +
          routes
            .map(
              ([route, label, glyph]) =>
                `<button class="command-row" onclick="closeModal();W.open('${route}')">${icon(glyph)}<span>${label}</span>${icon("arrow")}</button>`,
            )
            .join("") +
          (players.length ? '<div class="result-label">PLAYERS</div>' : "") +
          players
            .map(
              ({ p, team }) =>
                `<button class="command-row" onclick="W.player('${p.id}',${team})">${portrait(p)}<span>${esc(p.name)}<small>${clubs[team][0]} · ${p.realPosition || p.pos} · ${status(p)}</small></span><b>${p.ovr}</b></button>`,
            )
            .join("") ||
        '<div class="search-empty">No matching players or screens. Try a surname.</div>';
    },
    filter(key, value) {
      squadFilter[key] = value;
      updateSquadRows();
    },
    unit(unit) {
      squadFilter.unit = unit;
      document.querySelectorAll("[data-unit]").forEach((b) => {
        let on = b.dataset.unit === unit;
        b.classList.toggle("active", on);
        b.setAttribute("aria-pressed", String(on));
      });
      updateSquadRows();
    },
    player(id, team = state.team) {
      let p = S.roster(state, team).find((p) => p.id === id);
      if (!p) return;
      closeModal();
      let c = state.franchise.contracts[id],
        own = team === state.team,
        year = S.financeYear(state),
        summary = Object.values(p.stats || {}).reduce(
          (n, y) =>
            n + (y.passYards || 0) + (y.recYards || 0) + (y.rushYards || 0),
          0,
        );
      modal(
        `<div class="drawer-top"><span>PLAYER PROFILE</span><button class="icon-button" aria-label="Close player profile" onclick="closeModal()">${icon("close")}</button></div><div class="player-profile-hero">${portrait(p, "portrait-large")}<div class="player-number">#${esc(p.jersey || "—")}</div><span class="position-tag">${esc(p.realPosition || p.pos)}</span><h2>${esc(p.name)}</h2><p>${esc(cname(team))} · Age ${p.age}</p></div><div class="profile-metrics"><div><b>${p.ovr}</b><small>OVR · career rating</small></div><div><b>${p.pot}</b><small>Potential</small></div><div><b>${Math.round(p.fitness || 100)}%</b><small>Condition</small></div></div><div class="profile-body"><div class="profile-section"><h3>Player information</h3><div class="kv"><span>Roster</span><b>${status(p)}</b></div><div class="kv"><span>Role</span><b>${p.starter ? "Starter" : "Reserve"}</b></div><div class="kv"><span>College</span><b>${esc(p.college || "—")}</b></div><div class="kv"><span>Experience</span><b>${p.experience ?? Math.max(0, p.age - 22)} years</b></div><div class="kv"><span>Season cap charge</span><b>${money(S.capHit(c, year))}</b></div><div class="kv"><span>Career yards</span><b>${summary.toLocaleString()}</b></div></div>${own ? `<div class="profile-section"><h3>Squad actions</h3><div class="profile-actions"><button ${S.allowed(state, "coach") || S.allowed(state, "roster") || (state.franchise.role === "OC" && positionSide(p) === "Offense") || (state.franchise.role === "DC" && positionSide(p) === "Defense") ? "" : "disabled"} onclick="W.depth('${id}')">${p.starter ? "Move to reserve" : "Promote to starter"}</button><button class="secondary" onclick="closeModal();F.contract('${id}')">Contract details</button>${p.status === "practice" ? `<button class="secondary" onclick="W.move('${id}','elevated')">Elevate for next game</button><button class="secondary" onclick="F.action('protect','${id}');W.player('${id}')">${p.protected ? "Remove protection" : "Protect this week"}</button>` : p.status === "ir" ? `<button class="secondary" onclick="W.move('${id}','active')">Return to active roster</button>` : `<button class="secondary" onclick="W.move('${id}','practice')">Move to practice squad</button>`}${p.injury && p.status !== "ir" ? `<button class="secondary" onclick="W.move('${id}','ir')">Place on injured reserve</button>` : ""}<button class="secondary" onclick="closeModal();F.meeting('${id}')">Speak with player</button><button class="danger-link" onclick="closeModal();F.release('${id}')">Waive player</button></div></div>` : `<button onclick="closeModal();W.open('Market')">Open trade center ${icon("arrow")}</button>`}</div>`,
      );
      document.getElementById("modal").classList.add("player-drawer");
    },
    depth(id) {
      let p = state.roster.find((p) => p.id === id);
      if (!p) return;
      if (p.starter) {
        let replacement = S.active(state)
          .filter(
            (q) => q.pos === p.pos && !q.starter && !q.injury && !q.holdout,
          )
          .sort((a, b) => b.ovr - a.ovr)[0];
        if (!replacement) {
          toast("No healthy reserve at this position.");
          return;
        }
        toggleStarter(replacement.id);
      } else toggleStarter(id);
      W.player(id);
    },
    move(id, destination) {
      F.action("move", id, destination);
      W.player(id);
    },
    realCareer() {
      if (isBusy()) {
        toast("Wait for the current simulation to finish.");
        return;
      }
      closeModal();
      modal(
        `<div class="eyebrow">${snapshot?.season || 2026} NFL ROSTER SNAPSHOT</div><h2>Start your real-roster career</h2><p>Choose a franchise with real NFL players across all 32 teams. This starts a new career and replaces the current browser save.</p><div class="modal-actions"><button class="secondary" onclick="F.downloadSave()">Back up current career</button><button onclick="chooseClub()">Choose your franchise</button></div><button class="link" style="margin-top:18px" onclick="closeModal()">Keep current career</button>`,
      );
    },
    sources() {
      W.open("Settings");
    },
    help() {
      modal(
        `<div class="eyebrow">THE PLAYBOOK</div><h2>Run your franchise.</h2><p><b>Club overview</b> shows your next fixture, urgent decisions, cap position and preparation. The Continue button advances your next decision.</p><p><b>Squad</b> has instant search, unit/status filters and player profiles. Open a player to manage their role, contract or roster designation.</p><p><b>Matchday</b> lets you call each play, change formations, make substitutions and watch the 3D execution. Enable commentary and choose a voice in Voice settings.</p><p><b>Search</b> any player or screen with ⌘K / Ctrl+K. Data & saves contains database imports and a career backup export.</p><div class="modal-actions"><button class="secondary" onclick="closeModal();W.open('Staff')">Coaching staff</button><button onclick="closeModal()">Got it</button></div>`,
      );
    },
  };
  function header() {
    let current = active(),
      label =
        current === "Overview"
          ? "Club overview"
          : descriptions[current]?.[0] || current;
    document.getElementById("breadcrumb").innerHTML =
      `<button class="mobile-menu icon-button" onclick="W.mobile()" aria-label="Toggle navigation">${icon("menu")}</button><span class="breadcrumb-club">${esc(clubs[state.team][2])}</span><span class="breadcrumb-divider">/</span><b>${esc(label)}</b>`;
    document.querySelector("header>div").innerHTML =
      `<button class="search-trigger" onclick="W.command()" aria-label="Search players and screens">${icon("search")}<span>Search anything</span><kbd>⌘ K</kbd></button><button class="icon-button density-toggle" onclick="W.open('Settings')" aria-label="Settings" title="Settings">${icon("filter")}</button><span class="calendar-chip">${icon("calendar")}${state.year} · ${phaseName()}</span><button class="continue-button" onclick="advance()" ${isBusy() ? "disabled" : ""}>${state.live ? "Return to game" : state.interviewPending ? "Press conference" : state.phase === "offseason" ? "Offseason hub" : "Continue"}${icon("arrow")}</button>`;
    document.getElementById("club").innerHTML =
      `<button class="workspace-club" onclick="chooseClub()" title="Start a new career">${logo(state.team)}<span><b>${esc(clubs[state.team][2])}</b><small>${esc(clubs[state.team][3])} · ${state.year}</small></span><span class="club-chevron">⌄</span></button>`;
    document.querySelector(".career").innerHTML =
      `<span class="live-dot"></span> FOOTBALL OPERATIONS`;
    let footer = document.querySelector("footer");
    footer.innerHTML = `<span class="footer-wordmark">GRIDIRON DIRECTOR <i>•</i> ${state.year} SEASON</span><span class="footer-status"><i class="live-dot"></i> Saved on this device</span>`;
  }
  function enhanceTables() {
    for (let panel of document.querySelectorAll(".f-panel")) {
      let table = panel.querySelector("table");
      if (!table || table.dataset.enhanced || table.dataset.tableFiltered)
        continue;
      table.dataset.enhanced = "true";
      let rows = [...table.tBodies[0].rows];
      if (rows.length > 12) {
        let tools = document.createElement("div");
        tools.className = "table-tools";
        let label = panel.querySelector("h2")?.textContent || "table";
        tools.innerHTML = `<div class="table-search">${icon("search")}<input type="search" placeholder="Search ${esc(label.toLowerCase())}…" aria-label="Search ${esc(label)}"></div><small>${rows.length} records</small>`;
        panel.querySelector(".pad").prepend(tools);
        tools.querySelector("input").oninput = (e) => {
          let q = e.target.value.toLowerCase(),
            shown = 0;
          for (let row of rows) {
            row.hidden = !row.textContent.toLowerCase().includes(q);
            if (!row.hidden) shown++;
          }
          tools.querySelector("small").textContent =
            `${shown} of ${rows.length} records`;
        };
      }
      for (let [index, th] of [...table.tHead.rows[0].cells].entries()) {
        if (
          [
            "Actions",
            "Action",
            "Move / action",
            "Investigate",
            "Conversation",
          ].includes(th.textContent)
        )
          continue;
        th.tabIndex = 0;
        th.title = "Sort by " + th.textContent;
        th.setAttribute("aria-sort", "none");
        let asc = true;
        const sort = () => {
          let body = table.tBodies[0];
          [...body.rows]
            .sort((a, b) => {
              let av = a.cells[index]?.textContent.trim() || "",
                bv = b.cells[index]?.textContent.trim() || "";
              let an = Number(av.replace(/[$,%M]/g, "")),
                bn = Number(bv.replace(/[$,%M]/g, ""));
              let n =
                Number.isFinite(an) && Number.isFinite(bn)
                  ? an - bn
                  : av.localeCompare(bv);
              return asc ? n : -n;
            })
            .forEach((row) => body.append(row));
          table
            .querySelectorAll("th")
            .forEach((t) => t.setAttribute("aria-sort", "none"));
          th.setAttribute("aria-sort", asc ? "ascending" : "descending");
          asc = !asc;
        };
        th.onclick = sort;
        th.onkeydown = (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            sort();
          }
        };
      }
    }
  }
  function squadRows() {
    let players = state.roster.filter(
      (p) =>
        (!squadFilter.query ||
          searchKey(
            p.name +
              " " +
              p.pos +
              " " +
              (p.realPosition || "") +
              " " +
              p.jersey,
          ).includes(searchKey(squadFilter.query))) &&
        (squadFilter.unit === "All" || positionSide(p) === squadFilter.unit) &&
        (squadFilter.status === "All" || p.status === squadFilter.status),
    );
    players.sort((a, b) =>
      squadFilter.sort === "name"
        ? a.name.localeCompare(b.name)
        : squadFilter.sort === "age"
          ? a.age - b.age
          : squadFilter.sort === "cap"
            ? S.capHit(state.franchise.contracts[b.id], S.financeYear(state)) -
              S.capHit(state.franchise.contracts[a.id], S.financeYear(state))
            : b.ovr - a.ovr,
    );
    return (
      players
        .map(
          (p) =>
            `<tr><td><button class="player-link" onclick="W.player('${p.id}')">${portrait(p)}<span><b>${esc(p.name)}</b><small>#${esc(p.jersey || "—")} · ${esc(p.realPosition || p.pos)} · ${p.age} years</small></span></button></td><td><span class="position-tag">${p.pos}</span></td><td><span class="squad-role ${p.starter ? "starter" : ""}">${p.starter ? "Starter" : "Reserve"}</span></td><td><span class="ovr-pill ${p.ovr >= 90 ? "elite" : p.ovr >= 80 ? "good" : ""}">${p.ovr}</span><small>${p.pot} POT</small></td><td><div class="fitness"><span>${Math.round(p.fitness || 100)}%</span><i><b style="width:${Math.round(p.fitness || 100)}%"></b></i></div></td><td><span class="availability ${p.injury || p.holdout ? "unavailable" : ""}"><i></i>${status(p)}</span></td><td class="numeric">${money(S.capHit(state.franchise.contracts[p.id], S.financeYear(state)))}</td><td><button class="row-action" onclick="W.player('${p.id}')" aria-label="Manage ${esc(p.name)}">Manage ${icon("chevron")}</button></td></tr>`,
        )
        .join("") ||
      '<tr><td colspan="8" class="search-empty">No players match these filters.</td></tr>'
    );
  }
  function updateSquadRows() {
    let body = document.getElementById("squad-rows");
    if (body) body.innerHTML = squadRows();
    let count = document.getElementById("squad-count");
    if (count)
      count.textContent = `${document.querySelectorAll("#squad-rows tr .player-link").length} of ${state.roster.length} players`;
  }
  const previousRoster = views.Roster;
  views.Roster = () => {
    let a = state.roster.filter((p) => p.status === "active").length,
      ps = state.roster.filter((p) => p.status === "practice").length,
      ir = state.roster.filter((p) => p.status === "ir").length;
    return `<div class="squad-summary"><span><b>${a}</b> / 53 active</span><span><b>${ps}</b> / 16 practice squad</span><span><b>${ir}</b> injured reserve</span><div class="summary-actions"><button class="secondary small" onclick="F.depth()">${icon("target")} Optimize depth chart</button><details class="action-menu"><summary>Roster operations ⌄</summary><div><button onclick="F.action('trim')">Trim active roster to 53</button><button onclick="F.action('recruit')">Delegate reserve recruitment</button><button onclick="F.action('camp')">Invite camp roster to 90</button></div></details></div></div><section class="panel squad-panel"><div class="squad-toolbar"><div class="segmented">${["All", "Offense", "Defense", "Special teams"].map((v) => `<button class="${squadFilter.unit === v ? "active" : ""}" data-unit="${v}" aria-pressed="${squadFilter.unit === v}" onclick="W.unit('${v}')">${v === "All" ? "All players" : v}</button>`).join("")}</div><span id="squad-count">${state.roster.length} players</span></div><div class="squad-filters"><div class="table-search">${icon("search")}<input type="search" aria-label="Search squad" placeholder="Search player, position or number…" value="${esc(squadFilter.query)}" oninput="W.filter('query',this.value)"></div><select aria-label="Roster status filter" onchange="W.filter('status',this.value)">${[
      ["All", "All statuses"],
      ["active", "Active roster"],
      ["practice", "Practice squad"],
      ["ir", "Injured reserve"],
      ["elevated", "Elevated"],
    ]
      .map(
        ([v, l]) =>
          `<option value="${v}" ${squadFilter.status === v ? "selected" : ""}>${l}</option>`,
      )
      .join(
        "",
      )}</select><select aria-label="Sort squad" onchange="W.filter('sort',this.value)">${[
      ["ovr", "Best overall"],
      ["name", "Player name"],
      ["age", "Youngest first"],
      ["cap", "Highest cap charge"],
    ]
      .map(
        ([v, l]) =>
          `<option value="${v}" ${squadFilter.sort === v ? "selected" : ""}>${l}</option>`,
      )
      .join(
        "",
      )}</select></div><div class="scroll squad-table"><table data-table-filtered="true"><thead><tr>${["Player", "Pos", "Depth", "OVR", "Condition", "Availability", "Cap charge", ""].map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody id="squad-rows">${squadRows()}</tbody></table></div><div class="table-foot"><span>Squad registration & readiness</span><span>Click a player to view profile and actions ${icon("arrow")}</span></div></section>${state.franchise.waivers.length ? `<details class="secondary-roster"><summary>Waiver wire · ${state.franchise.waivers.length} available</summary>${previousRoster().split("Waiver wire")[1] ? previousRoster() : ""}</details>` : ""}`;
  };
  const originalOverview = views.Overview;
  views.Overview = () => {
    let f = state.franchise,
      club = f.clubs[state.team],
      cap = S.capLedger(state),
      g = game(),
      opp = opponent(),
      a = S.active(state),
      issues = S.gameEligibility(state),
      injuries = state.roster.filter((p) => p.injury),
      holdouts = state.roster.filter((p) => p.holdout),
      team = state.teams[state.team],
      record = `${team.w}<span>–</span>${team.l}`;
    let tasks = [];
    if (issues.length)
      tasks.push({
        title: "Your lineup needs attention",
        body: issues[0],
        route: "Roster",
        icon: "users",
        urgent: true,
      });
    if (injuries.length)
      tasks.push({
        title: `${injuries.length} players in the medical room`,
        body: "Review availability before your next game.",
        route: "Medical",
        icon: "medical",
      });
    if (holdouts.length)
      tasks.push({
        title: "A conversation is needed",
        body: holdouts
          .map((p) => p.name)
          .slice(0, 2)
          .join(", "),
        route: "Locker room",
        icon: "users",
        urgent: true,
      });
    if (state.interviewPending)
      tasks.push({
        title: "The press are waiting",
        body: "Attend your postgame press conference.",
        route: "Media room",
        icon: "mic",
      });
    if (!tasks.length)
      tasks.push({
        title: "Your team is ready",
        body: "Review your game plan and take the field.",
        route: "Game plan",
        icon: "check",
      });
    tasks.push({
      title: "Plan for the next generation",
      body: `${f.scoutPoints} scouting points available.`,
      route: "Scouting",
      icon: "target",
    });
    let fixture = g
      ? `<div class="fixture-teams"><div>${logo(state.team)}<b>${esc(clubs[state.team][2])}</b><small>${team.w}–${team.l}</small></div><span class="fixture-vs">VS</span><div>${logo(opp)}<b>${esc(clubs[opp][2])}</b><small>${state.teams[opp].w}–${state.teams[opp].l}</small></div></div><div class="fixture-bottom"><span>${icon("building")}${esc(cname(g.a))} · ${g.a === state.team ? "Home" : "Away"}</span><button onclick="advance()">${state.live ? "Return to match" : "Go to matchday"} ${icon("arrow")}</button></div>`
      : `<div class="no-fixture"><h2>${state.phase === "offseason" ? "Build your next contender." : "The season continues."}</h2><p>${state.phase === "offseason" ? "The market, the draft, the next chapter." : "Follow the postseason and prepare your franchise."}</p><button onclick="advance()">${state.phase === "offseason" ? "Open offseason" : "Advance calendar"} ${icon("arrow")}</button></div>`;
    const metric = (glyph, label, value, note, accent = "") =>
      `<div class="dash-metric"><div class="metric-heading">${icon(glyph)}${label}</div><b class="${accent}">${value}</b><small>${note}</small></div>`;
    let leaders = state.roster
        .filter((p) => p.status === "active")
        .sort((a, b) => b.ovr - a.ovr)
        .slice(0, 5),
      upcoming = state.schedule
        .slice(state.week, state.week + 5)
        .map((week, i) => ({
          week: state.week + i + 1,
          g: week.find((g) => g.a === state.team || g.b === state.team),
        }))
        .slice(0, 3);
    return `${isBusy() ? `<div class="simulation-progress"><span id="holiday-progress">Simulating the next round…</span><button class="secondary small" onclick="F.stopHoliday()">Stop after this week</button></div>` : ""}${!f.rosterSnapshot && snapshot ? `<div class="roster-upgrade"><span>${icon("users")}<b>Real NFL rosters are ready.</b> Start a new career with the ${snapshot.season} player database.</span><button class="small" onclick="W.realCareer()">Choose franchise ${icon("arrow")}</button></div>` : ""}<div class="dashboard-metrics">${metric("chart", "Season record", record, `${clubs[state.team][3]} · ${state.year}`)}${metric("wallet", "Salary cap room", money(cap.room), `${money(cap.used)} committed`, cap.room < 0 ? "warning" : "lime")}${metric("users", "Match-ready players", `${a.filter((p) => !p.injury && !p.holdout).length}<span> / ${a.length}</span>`, `${injuries.length} injured · ${holdouts.length} holdouts`)}${metric("target", "Team morale", `${Math.round(state.morale)}<span>%</span>`, state.morale >= 70 ? "Ready to compete" : "Needs your attention")}</div><div class="dashboard-main"><div class="dashboard-left"><section class="fixture-card"><div class="fixture-heading"><span class="eyebrow">${state.live ? "MATCH IN PROGRESS" : "NEXT FIXTURE"}</span><span class="fixture-round">${phaseName()}<i class="live-dot"></i></span></div>${fixture}<div class="pitch-decoration" aria-hidden="true"></div></section><section class="panel news-panel"><div class="panel-head"><h2>Inside the franchise</h2><button class="link" onclick="W.open('Media room')">Media room ${icon("arrow")}</button></div>${
      f.events
        .slice(0, 3)
        .map(
          (e, i) =>
            `<article class="dashboard-news"><div class="news-glyph">${icon(["users", "chart", "target"][i])}</div><div><span class="news-type">${esc(e.kind)} · Week ${e.week + 1}</span><h3>${esc(e.title)}</h3><p>${esc(e.body)}</p></div></article>`,
        )
        .join("") ||
      `<article class="dashboard-news"><div class="news-glyph">${icon("ball")}</div><div><span class="news-type">YOUR NEXT CHAPTER</span><h3>The headset is yours.</h3><p>Build your squad, establish your identity and take it to Sunday.</p></div></article>`
    }</section></div><div class="dashboard-right"><section class="panel decision-panel"><div class="panel-head"><h2>Your priorities</h2><span class="count-badge">${Math.min(tasks.length, 4)}</span></div>${tasks
      .slice(0, 4)
      .map(
        (t) =>
          `<button class="priority-row" onclick="W.open('${t.route}')"><span class="priority-icon ${t.urgent ? "warning" : ""}">${icon(t.icon)}</span><span><b>${t.title}</b><small>${esc(t.body)}</small></span>${icon("chevron")}</button>`,
      )
      .join(
        "",
      )}</section><section class="panel upcoming-panel"><div class="panel-head"><h2>Coming up</h2><button class="link" onclick="W.open('Schedule')">Schedule ${icon("arrow")}</button></div>${upcoming.map(({ week, g }) => (g ? `<div class="upcoming-row"><span class="week-badge">WK<b>${week}</b></span>${logo(g.a === state.team ? g.b : g.a)}<span><b>${clubs[g.a === state.team ? g.b : g.a][2]}</b><small>${g.a === state.team ? "Home" : "Away"}</small></span><span class="upcoming-tag">${week === state.week + 1 ? "NEXT" : "—"}</span></div>` : `<div class="upcoming-row"><span class="week-badge">WK<b>${week}</b></span><span>Bye week<small>Rest and preparation</small></span></div>`)).join("") || '<p class="pad subtitle">The offseason schedule is open.</p>'}</section></div></div><div class="dashboard-bottom"><section class="panel key-players"><div class="panel-head"><h2>Squad leaders</h2><button class="link" onclick="W.open('Roster')">View squad ${icon("arrow")}</button></div><div class="leaders-grid">${leaders.map((p) => `<button class="leader-card" onclick="W.player('${p.id}')">${portrait(p)}<span class="ovr-pill ${p.ovr >= 90 ? "elite" : "good"}">${p.ovr}</span><b>${esc(p.name)}</b><small>${esc(p.realPosition || p.pos)} · ${p.age} years</small></button>`).join("")}</div></section><section class="panel preparation-panel"><div class="panel-head"><h2>Weekly preparation</h2>${icon("target")}</div><div class="pad"><div class="preparation-value"><b>${f.preparation.familiarity}<span>%</span></b><span>Scheme familiarity</span></div><div class="meter"><i style="width:${f.preparation.familiarity}%"></i></div><div class="kv"><span>Practice intensity</span><b>${f.preparation.intensity}%</b></div><button class="secondary small" onclick="W.open('Medical')">Adjust preparation ${icon("arrow")}</button></div></section></div><details class="delegation-details"><summary>${icon("play")} Assistant delegation & simulation <span>⌄</span></summary><div><p class="subtitle">Your coordinators use the same execution engine. Set directives, then delegate a game or a period.</p><div class="delegation-grid">${Object.entries(
      f.directives,
    )
      .map(
        ([key, value]) =>
          `<label class="f-check"><input type="checkbox" ${value ? "checked" : ""} onchange="F.action('directive','${key}',this.checked)">${{ protectQB: "Protect the quarterback", feedRB: "Feed the starting running back", rookies: "Young players in late blowouts", halftime: "Speed up when trailing at halftime" }[key]}</label>`,
      )
      .join(
        "",
      )}</div><div class="f-actions"><button onclick="F.holiday(1)" ${isBusy() ? "disabled" : ""}>Sim next game</button><button class="secondary" onclick="F.holiday(4)" ${isBusy() ? "disabled" : ""}>Sim 4 weeks</button><button class="secondary" onclick="F.holiday(25)" ${isBusy() ? "disabled" : ""}>Sim to offseason</button></div><p class="subtitle">Stops at the offseason or when roster compliance needs your attention.</p></div></details>`;
  };
  const originalRender = render;
  render = function () {
    if (view === "Overview") {
      setSection("Overview");
      view = "Franchise";
    }
    originalRender();
    document.body.classList.add("workspace-ready");
    navigation();
    header();
    let section = active(),
      title = document.querySelector("#app>.title-row");
    if (view === "Franchise" && title) {
      let [name, description] = descriptions[section] || [section, ""];
      title.innerHTML = `<div><div class="eyebrow">${esc(clubs[state.team][1])} ${esc(clubs[state.team][2])} <span> / </span> ${state.year} SEASON</div><h1>${name}</h1><p class="subtitle">${description}</p></div><div class="page-context"><span class="role-badge">${esc(state.franchise.role)}</span><button class="icon-button" onclick="W.help()" aria-label="Workspace help">?</button></div>`;
      document.querySelector(".f-tabs")?.remove();
    }
    if (title && view !== "Franchise") {
      let names = {
        Matchday: "Matchday",
        "Game plan": "Tactics",
        Schedule: "Schedule",
        "Media room": "Media room",
        "Head coach": "Head coach",
      };
      if (names[view]) title.querySelector("h1").textContent = names[view];
      if (view === "Matchday")
        title.querySelector(".subtitle").textContent =
          "Live coaching. Every snap is your decision.";
    }
    syncMobileNavigation();
    enhanceTables();
  };
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      W.command();
    }
    if (e.key === "Escape") document.body.classList.remove("nav-visible");
  });
  showHelp = () => W.help();
  showLicensing = () => W.sources();
  if (view === "Overview") F.tab("Overview");
  else render();
}
