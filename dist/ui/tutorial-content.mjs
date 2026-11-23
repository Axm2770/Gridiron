// Tutorial content: guided tours, per-screen help and the glossary. Pure data, so tests can check
// every tour step names a real route and selector, and the engine (tutorial.mjs) stays
// content-agnostic. The rules behind each step are explained at length in the Gridiron Guide
// (guide-content.mjs); tours stay short and point at the real screen.
//
// A step: { route?, tab?, prepare?, target?: selector | selector[], title, body, art?, click?, guide? }
//   route/tab  open that screen first (W.open).
//   prepare    runs after the route opens (for example, picking a sub-tab).
//   target     the first visible match is highlighted with a ring and a pixel pointer; with none,
//              the card is centred.
//   body       one or two short sentences.
//   art        a small pixel diagram from guide-art.mjs shown on the card.
//   click      the player clicks the highlighted element to move on (Next stays available).
//   guide      a guide chapter id: the card offers "Read more" into the Gridiron Guide.

const tab = (fn) => () => window[fn[0]]?.[fn[1]]?.(...fn.slice(2));

export const TOURS = [
  {
    id: "basics",
    title: "Your first week",
    summary: "The core loop: club overview, an inbox decision, the lineup, the game plan, matchday and the result.",
    minutes: 3,
    steps: [
      {
        route: "Overview",
        target: ".fd-match",
        title: "This is your club",
        body: "The overview shows your next opponent, the odds and the week ahead. Everything starts here.",
        art: "welcome",
      },
      {
        target: ".fd-kpis",
        title: "Your numbers at a glance",
        body: "Record, division place, cap room and roster spots. Each tile turns amber or red when it needs you.",
      },
      {
        target: "#nav",
        title: "The sidebar is your map",
        body: "Every screen lives here, grouped by job. Search (Ctrl+K) finds any player or screen too.",
        art: "sidebar",
      },
      {
        route: "Inbox",
        target: [".response-box", ".ib-tiles"],
        title: "Answer a decision",
        body: "Decisions wait in the inbox. Answer within two rounds, or option A is chosen for you.",
        art: "inbox",
        guide: "start",
      },
      {
        route: "Roster",
        target: [".lu-pitch", ".lu-layout"],
        title: "Set your lineup",
        body: "Click a player, then his replacement, or drag one onto the other. Changes count from the next snap.",
        art: "depth",
        guide: "roster",
      },
      {
        route: "Game plan",
        target: [".tx-tabs", ".fo-plan"],
        title: "Pick a game plan",
        body: "Choose a scheme, personnel and coverage. Your staff call plays from it.",
        art: "tactics",
        guide: "tactics",
      },
      {
        route: "Matchday",
        target: [".touch-entry-grid", ".touch-pregame"],
        title: "Play the game",
        body: "Take the headset and call plays, take over at halftime, or trust your staff with a quick sim.",
        art: "matchday",
        guide: "sim",
      },
      {
        target: ".continue-button",
        title: "Continue moves time",
        body: "Nothing happens until you press Continue. After each game the postgame report shows the box score and key plays.",
        art: "calendar",
      },
      {
        title: "You're ready",
        body: "Topic tours and the Gridiron Guide live behind the ? button on every screen.",
        art: "trophy",
        guide: "start",
      },
    ],
  },
  {
    id: "roster",
    title: "Roster & depth chart",
    summary: "The lineup board: swap starters by click or drag, read condition and quality, and check roster limits.",
    minutes: 2,
    steps: [
      {
        route: "Roster",
        target: ".office-metrics",
        title: "Your squad in numbers",
        body: "Active players, cap and the units' strength. 53 active in the season, 90 in the offseason.",
      },
      {
        target: [".lu-units", ".lu-bar"],
        title: "Pick a unit",
        body: "Switch between offense, defense and special teams.",
      },
      {
        target: [".lu-pitch", ".lu-field"],
        title: "The lineup board",
        body: "Your formation on the field. Colours show quality; a warning edge means a tired player.",
      },
      {
        target: [".lu-side", ".lu-rows"],
        title: "Swap a starter",
        body: "Click a starter, then a bench player at the same position, or drag one onto the other.",
        art: "depth",
      },
      {
        target: [".lu-pos-tabs", ".lu-side"],
        title: "Depth by position",
        body: "Each tab lists one position in depth order. Injured or holding-out players can't start.",
        guide: "roster",
      },
    ],
  },
  {
    id: "gameplan",
    title: "Game plan",
    summary: "Tactics tabs, the fourth-down chart, scheme fit and this week's opponent.",
    minutes: 2,
    steps: [
      {
        route: "Game plan",
        target: ".tx-summary",
        title: "Your plan in one line",
        body: "Offense on top, defense below, with how well your roster fits each.",
      },
      {
        target: ".tx-tabs",
        title: "Four tabs",
        body: "Base plan, Situational packages, Advanced concepts and Scheme fit.",
        art: "tactics",
      },
      {
        prepare: tab(["FrontOffice", "tacticsTab", "situational"]),
        target: [".tx-chart-wrap", ".tx-chart"],
        title: "The fourth-down chart",
        body: "Go, kick or punt by field position and yards to go. Aggressive goes for it more often.",
        art: "fourth",
      },
      {
        prepare: tab(["FrontOffice", "tacticsTab", "base"]),
        target: [".fo-scout", ".fo-opp-head"],
        title: "Know the opponent",
        body: "Their unit ratings, tendencies and the counters your staff suggest.",
        guide: "tactics",
      },
    ],
  },
  {
    id: "matchday",
    title: "Matchday",
    summary: "Live calls, who calls plays, quick sims and the halftime report card.",
    minutes: 2,
    steps: [
      {
        route: "Matchday",
        target: [".touch-prematch-hero", ".touch-pregame"],
        title: "Kickoff",
        body: "The matchup, the stadium and the weather. Weather comes from the home stadium and the month.",
        art: "weather",
      },
      {
        target: [".touch-match-readiness", ".touch-pregame"],
        title: "Readiness",
        body: "Fitness, injuries and your plan's fit for this game.",
      },
      {
        target: [".touch-entry-card.featured", ".touch-entry-grid"],
        title: "Take the headset",
        body: "Call every play from the sideline. With Playcaller set to Head coach, the call sheet locks and your staff call it.",
        art: "matchday",
      },
      {
        target: [".touch-entry-grid", ".touch-pregame"],
        title: "Or sim it",
        body: "Hand over until halftime, or trust your staff for the whole game. Quick sims use the same engine.",
        art: "sim",
      },
      {
        // Mid-game this points at the banner's "Halftime report" button; before kickoff, at the entry cards.
        target: [".touch-break-actions", ".touch-entry-grid"],
        title: "Halftime report card",
        body: "At the break a report card pops up with the score, the Q1/Q2 line, first-half stats and key plays. Reopen it from the halftime banner.",
        art: "matchday",
        guide: "sim",
      },
    ],
  },
  {
    id: "market",
    title: "Transfers & trades",
    summary: "The trade builder, blockers with fix buttons, free agents and confirming a deal.",
    minutes: 3,
    steps: [
      {
        route: "Market",
        target: ".ops-windows",
        title: "Market windows",
        body: "What's open today: trades, free agency and the draft. Trades close after the deadline week.",
      },
      {
        prepare: tab(["Ops", "sub", "market", "builder"]),
        target: [".mk-deal", ".mk-desk"],
        title: "Build a trade",
        body: "Pick a club, tick who you want, then Suggest a package or choose what you send.",
        art: "trade",
      },
      {
        target: [".mk-side", ".mk-assets"],
        title: "Both sides of the deal",
        body: "Players and picks from each club. The meter shows whether they'd say yes.",
      },
      {
        target: [".mk-actions", ".mk-deal"],
        title: "Blockers and fixes",
        body: "If a deal can't go through, it says why with a fix button (clear cap, free a roster spot). Accepted deals ask you to confirm.",
        guide: "market",
      },
      {
        prepare: tab(["Ops", "sub", "market", "agents"]),
        target: [".mk-page .gd-tabs", ".mk-page"],
        title: "Free agents",
        body: "Offer years, salary and guarantees. Players decide two market days later.",
      },
    ],
  },
  {
    id: "cap",
    title: "Contracts & cap",
    summary: "Cap room, dead money, restructures, extensions and tags.",
    minutes: 2,
    steps: [
      {
        route: "Contracts",
        target: ".fp-tiles",
        title: "Cap sheet",
        body: "Cap limit, what's committed, what's left and dead money.",
      },
      {
        target: [".fp-stack", ".fp-tiles"],
        title: "The cap bar",
        body: "Blue is live contracts, red is dead money, green is room to sign players.",
        art: "cap",
      },
      {
        target: [".fp-columns", ".fp-grid-2"],
        title: "Next five years",
        body: "Projected room each year. Big bonuses push cost into later years.",
        art: "capdeal",
      },
      {
        target: [".fp-watch-list", ".fp-grid-2"],
        title: "Extend early",
        body: "Expiring stars are listed first. An extension must fit the cap every year.",
      },
      {
        target: [".exp-contract-table", ".fp-toolbar"],
        title: "Every contract",
        body: "Open a deal to restructure, extend, tag or release. Releases turn unpaid bonus into dead money.",
        guide: "cap",
      },
    ],
  },
  {
    id: "draft",
    title: "Draft & scouting",
    summary: "Fog of war, scouting reports, the combine and your watchlist.",
    minutes: 3,
    steps: [
      {
        route: "Scouting",
        target: [".sc-resources", ".pp-panel"],
        title: "Scouting resources",
        body: "Your scouts and their reports. Unknown players show ranges until scouted.",
        art: "fog",
      },
      {
        target: [".finder-results", ".finder-table"],
        title: "Find players",
        body: "Search any pool and request a report. It lands in your inbox three days later.",
      },
      {
        route: "Draft",
        target: [".fd-draft-tabs", ".dr-room"],
        title: "The draft room",
        body: "Draft room, Scout network, Watchlist pipeline and Combine, all in one place.",
      },
      {
        prepare: tab(["Hub2", "draftTab", "combine"]),
        target: [".fd-draft-tabs + *", ".fd-draft-tabs"],
        title: "The combine",
        body: "Drills turn prospects into risers and fallers, and firm up their athletic ratings.",
        art: "combine",
      },
      {
        prepare: tab(["Hub2", "draftTab", "pipeline"]),
        target: [".fd-draft-tabs + *", ".fd-draft-tabs"],
        title: "Watchlist pipeline",
        body: "Watchlist → Scouted → Interviewed → Big Board → Drafted.",
      },
      {
        prepare: tab(["Hub2", "draftTab", "room"]),
        target: [".dr-board", ".dr-room"],
        title: "Your board",
        body: "On the clock: pick, trade down or trade up. Seven rounds, worst record first.",
        guide: "draft",
      },
    ],
  },
  {
    id: "medical",
    title: "Medical & training",
    summary: "Injuries, treatments and the weekly training load.",
    minutes: 2,
    steps: [
      {
        route: "Medical",
        prepare: tab(["Hub2", "tab", "medical"]),
        target: [".mt-panel", ".mt-page"],
        title: "The treatment room",
        body: "Who's hurt, for how long and how risky a return is.",
        art: "injury",
      },
      {
        target: [".mt-room-grid", ".mt-main"],
        title: "Choose a treatment",
        body: "Rest, rehab or play through it. Undecided cases follow the doctor's advice after a round.",
      },
      {
        prepare: tab(["Hub2", "tab", "training"]),
        target: [".gd-hub .gd-tabs", ".gd-hub"],
        title: "Training week",
        body: "Harder weeks grow players faster but tire them and raise injury risk. Keep one rest day.",
        guide: "roster",
      },
    ],
  },
  {
    id: "locker",
    title: "Locker room & press",
    summary: "Morale, chemistry, one-on-ones, promises and press conferences.",
    minutes: 2,
    steps: [
      {
        route: "Locker room",
        target: [".lr-meter", ".pp-panel"],
        title: "Team mood",
        body: "Morale across the squad, from happy to unhappy.",
        art: "morale",
      },
      {
        target: [".lr-row", ".lr-leader"],
        title: "Leaders and causes",
        body: "Leaders' moods spread to teammates. The causes show what's moving morale this week.",
      },
      {
        target: [".lr-grid", ".lr-card"],
        title: "Talk to players",
        body: "One meeting per player a week. Promises are remembered, and broken ones hurt.",
      },
      {
        title: "Press conferences",
        body: "After games Continue opens the press room. Your tone moves morale, fans and the owner.",
        art: "press",
        guide: "happiness",
      },
    ],
  },
  {
    id: "board",
    title: "Board expectations",
    summary: "Mandate, win target, job security and board meetings.",
    minutes: 2,
    steps: [
      {
        route: "Boardroom",
        target: [".fo-security", ".fp-panel"],
        title: "Job security",
        body: "Secure, Stable, Under pressure or Hot seat, from the owner's patience, fans and results.",
        art: "board",
      },
      {
        target: [".sv-targets", ".fp-tiles"],
        title: "Season targets",
        body: "Win target, playoffs, the cap and young starters. Meet them to earn patience.",
      },
      {
        target: [".fp-mandates", ".fp-grid-3"],
        title: "The mandate",
        body: "Rebuild, Compete or Contend sets this season's win target.",
        guide: "board",
      },
    ],
  },
  {
    id: "season",
    title: "Calendar & simulation",
    summary: "Fixtures, simulating ahead, what pauses the sim, and the offseason.",
    minutes: 2,
    steps: [
      {
        route: "Calendar",
        tab: "Fixtures",
        target: [".lg-page", ".nav-tabs"],
        title: "Your season",
        body: "Every fixture, head-to-head records and the calendar, in three tabs.",
      },
      {
        tab: "Calendar",
        route: "Calendar",
        target: [".calendar-side", ".calendar-layout"],
        title: "Simulate ahead",
        body: "Sim a day, a week, four weeks or to a date. Urgent decisions pause it.",
        art: "calendar",
      },
      {
        title: "The offseason",
        body: "Honors, the combine, free agency, the draft and camp. Begin next season from the Draft room.",
        art: "trophy",
        guide: "start",
      },
    ],
  },
  {
    id: "news",
    title: "News & inbox",
    summary: "Inbox filters and decisions, the Gridiron Journal and following clubs.",
    minutes: 2,
    steps: [
      {
        route: "Inbox",
        target: ".ib-tiles",
        title: "Inbox at a glance",
        body: "Unread, decisions, urgent and saved. Click a tile to filter.",
      },
      {
        target: [".ib-cats", ".ib-toolbar"],
        title: "Categories",
        body: "Players, team, medical, interviews, scouting and the league.",
      },
      {
        target: [".response-box", ".ib-read"],
        title: "Decisions",
        body: "Pick an option and its effects show at once. Unanswered decisions are delegated after two rounds.",
        art: "inbox",
      },
      {
        route: "News",
        target: [".nw-mast", ".nw-page"],
        title: "The Gridiron Journal",
        body: "League news, your club's stories and fan reaction. Every story opens as a full article.",
      },
      {
        target: [".nw-follow", ".nw-tools"],
        title: "Follow clubs",
        body: "Follow clubs and players to see more of their stories.",
      },
    ],
  },
];

// Short help shown by the ? button for each screen. `tour` links the matching walkthrough.
export const SCREEN_HELP = {
  Overview: { text: "Your home screen: next game, record, cap room, morale and what needs you this week.", tour: "basics" },
  Inbox: { text: "Messages and decisions. Answer anything under Needs response; urgent ones pause calendar simulation, and unanswered decisions are delegated after two rounds.", tour: "news" },
  News: { text: "The Gridiron Journal: league news and fan reaction. Follow clubs to see more of their stories.", tour: "news" },
  Matchday: { text: "Coach the next game live, take over at halftime, or quick-sim it.", tour: "matchday" },
  Roster: { text: "Your players on the lineup board. Click a player then a replacement (or drag) to change starters. 53 active in the season, 90 in the offseason.", tour: "roster" },
  "Game plan": { text: "Your game plan (scheme, packages, 4th-down chart), scheme fit and this week's opponent.", tour: "gameplan" },
  Medical: { text: "Injuries, treatments, return dates and the weekly training load.", tour: "medical" },
  Development: { text: "Which way each player is heading (improving, stable or declining) and what drives it.", tour: "roster" },
  "Locker room": { text: "Player morale and team chemistry, and the conversations that move them.", tour: "locker" },
  Scouting: { text: "Request reports to narrow the rating ranges of unfamiliar players; reports arrive in your inbox.", tour: "draft" },
  Draft: { text: "The draft room, scout network, watchlist pipeline and combine. On the clock: pick, trade down or trade up.", tour: "draft" },
  Market: { text: "Trades and free agents. The windows at the top show what is open today.", tour: "market" },
  Contracts: { text: "Cap room, every contract, dead money, restructures, extensions and tags.", tour: "cap" },
  Club: { text: "The organization at a glance: facilities, finances, staff and the league office." },
  Staff: { text: "Hire, fire and assign coaches. Better coaches develop players faster." },
  Boardroom: { text: "The owner's mandate, season targets, the budget and your job security.", tour: "board" },
  Career: { text: "Your coaching profile, reputation and job offers.", tour: "board" },
  Calendar: { text: "Fixtures, head-to-head records, and the calendar for simulating ahead.", tour: "season" },
  "League desk": { text: "Standings, leaders and the Transactions log of every move in the league.", tour: "market" },
  Records: { text: "Champions, the record book, awards and the Hall of Fame.", tour: "season" },
  Statistics: { text: "Season and career statistics for every player; sort any column." },
  Analysis: { text: "Team and player analytics: efficiency, tendencies and comparisons." },
  Settings: { text: "Display, sound, match and data options. Tutorial progress can be reset from Help & tutorials (the ? button)." },
  Conversations: { text: "One-to-one talks with players: promises, playing time, contracts and morale.", tour: "locker" },
  "Career dossier": { text: "Your coaching record, reputation and the history of your career.", tour: "board" },
  "Media room": { text: "Press conferences and interviews. Your answers move fan support and player morale.", tour: "locker" },
};

// Glossary terms. Matching labels on screen get a dotted underline and this tooltip.
export const GLOSSARY = {
  "Cap room": "Money left under the salary cap this league year. You need room to sign or trade for players.",
  "Cap hit": "What a contract counts against the cap this season: base salary plus this year's share of bonuses.",
  "Dead cap": "Cap charges for players no longer on your roster, usually unpaid signing bonus after a release.",
  "Dead money": "Same as dead cap: charges for players no longer on your roster.",
  "Cap limit": "The salary cap for this league year, plus any room rolled over from last year.",
  Committed: "The total cap hits of every contract you have this league year.",
  "Salary cap": "The spending limit every club shares each league year.",
  OVR: "Overall rating (0–99): the player's current ability at his position.",
  POT: "Potential: the highest overall rating he could grow into.",
  Morale: "How happy a player is. Low morale hurts performance and contract talks.",
  Chemistry: "How well the squad works together. Stable rosters and winning raise it.",
  "Practice squad": "Players who train with the team but can't play unless elevated for a game.",
  "Injured reserve": "Injured players moved off the active roster. They don't count against the 53-man limit.",
  Waivers: "Released players other clubs can claim before they become free agents. The worst record claims first.",
  "Free agent": "A player without a contract. Any club can sign him.",
  "Franchise tag": "A one-year contract at a set price that stops a player leaving in free agency.",
  Restructure: "Converting salary into bonus to create cap room now, at a cost in later seasons.",
  Guarantees: "Money the player is paid even if released.",
  "Signing bonus": "Paid up front; for the cap it is spread evenly over up to five seasons.",
  "Trade deadline": "The last week of the season when trades are allowed.",
  "Scheme fit": "How well a player suits your offensive or defensive system. Good fits play above their rating.",
  "Base personnel": "Who is on the field: the first digit is running backs, the second tight ends, e.g. 11 = 1 RB, 1 TE, 3 WR.",
  "Coverage shell": "How the secondary splits the field: Cover 2 has two deep safeties, Cover 3 three deep zones, Cover 1 man with one safety deep.",
  "Blitz rate": "How often the defense sends more than four pass rushers.",
  "Run–pass lean": "How often your staff run versus pass on early downs.",
  "Red zone": "Inside the opponent's 20-yard line, where the field shrinks.",
  "Two-minute drill": "The hurry-up offense at the end of a half: no huddle, throws to stop the clock.",
  "Head-to-head": "Your all-time record against one club.",
};
