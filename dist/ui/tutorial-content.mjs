// Tutorial content: guided tours, per-screen help and the glossary. Pure data, so tests can check
// every tour step names a real route and the engine (tutorial.mjs) stays content-agnostic.
//
// A step: { route?, tab?, prepare?, target?: selector | selector[], title, body, click?: true }
//   route/tab  open that screen first (W.open).
//   prepare    runs after the route opens (for example, picking a sub-tab).
//   target     the first visible match is highlighted; with none, the card is centred.
//   click      the player clicks the highlighted element to move on (Next stays available).

export const TOURS = [
  {
    id: "basics",
    title: "Getting started",
    summary: "Find your way around: the sidebar, the club overview, search and the Continue button.",
    minutes: 2,
    steps: [
      {
        route: "Overview",
        title: "Welcome to your front office",
        body: "You run an NFL franchise: you pick the players, set the tactics, manage the money and coach the games. This tour shows where everything lives. You can leave at any time and replay it from the ? button.",
      },
      {
        target: "#nav",
        title: "The sidebar is your map",
        body: "Every area of the club is listed here, grouped by job: Team, Recruitment, Front office and League. Click any entry to open it. On a small screen, the ☰ button shows and hides it.",
      },
      {
        route: "Overview",
        prepare: () => window.Hub2?.tab?.("hub"),
        target: [".gd-hero", ".gd-bento", "#app .panel"],
        title: "Club overview",
        body: "Your home screen. It shows the next game, your record, cap room and team morale, plus shortcuts into the screens that need you this week.",
      },
      {
        target: ".continue-button",
        title: "Continue moves the season forward",
        body: "Continue takes you to whatever comes next: the next game, a press conference or the offseason hub. Time only passes when you press it (or simulate from the calendar), so nothing happens behind your back.",
      },
      {
        target: ".search-trigger",
        title: "Search anything",
        body: "Find any player in the league or jump to any screen. The shortcut is Ctrl+K (⌘K on a Mac).",
      },
      {
        target: "#breadcrumb",
        title: "Back and breadcrumbs",
        body: "The trail shows where you are. ← Back returns to the previous screen (Alt+← works too), and each crumb is a link.",
      },
      {
        target: [".related-links", ".page-context"],
        title: "Jump to related screens",
        body: "Under each screen title, Jump to links lead to the screens you usually need next. The ? button opens help for the screen you are on.",
      },
      {
        route: "Inbox",
        target: ["#app .inbox-layout", "#app .panel", "#app"],
        title: "Your inbox",
        body: "Staff, players and the media write to you here. Messages marked Response needed are decisions: answer them, because urgent ones pause calendar simulation until you do.",
      },
      {
        route: "Overview",
        title: "You're ready",
        body: "Next, try the Squad and Contracts tours, or press Continue to play your first game. Every tour lives in Help & tutorials (the ? button).",
      },
    ],
  },
  {
    id: "roster",
    title: "Roster and depth chart",
    summary: "Read player ratings, set starters, and manage the active roster, practice squad and injured reserve.",
    minutes: 3,
    steps: [
      {
        route: "Roster",
        title: "Your squad",
        body: "Every player under contract is here. OVR is current ability (0–99); POT is the ceiling he could grow into. Starters play most snaps; everyone else is depth.",
      },
      {
        target: ["#app .squad-filters", "#app .table-search", "#app .segmented"],
        title: "Filter and search",
        body: "Narrow the list by unit (offense, defense, special teams), status or position, or type a name or jersey number.",
      },
      {
        target: ["#app table tbody tr", "#app .player-row", "#app [data-player-id]"],
        click: true,
        title: "Open a player",
        body: "Click a player to open his profile: ratings, stats, contract, scouting and transaction history, with actions to promote, bench, extend or release him. Click the highlighted row, or press Next.",
      },
      {
        title: "Roster limits",
        body: "In the season you may carry 53 active players; in the offseason, up to 90. Extra players go to the practice squad (they train but can't play unless elevated) or injured reserve (injured players who don't count against the 53).",
      },
      {
        route: "Game plan",
        title: "Tactics and the depth chart",
        body: "Tactics sets your offensive and defensive schemes and who starts at each spot. Players who fit the scheme play better, and the opponent analysis shows what this week's opponent does well.",
      },
      {
        route: "Medical",
        title: "Medical and training",
        body: "Injured players and their return dates are listed here. The Training tab sets the weekly workload: harder practice grows players faster but costs freshness and raises injury risk.",
      },
      {
        route: "Locker room",
        title: "Morale matters",
        body: "Happy players perform and re-sign more easily. Playing time, results, contracts and your conversations all move morale, and it shows here player by player.",
      },
    ],
  },
  {
    id: "cap",
    title: "Contracts and the salary cap",
    summary: "Cap room, cap hits, dead money, releases, restructures and extensions explained.",
    minutes: 3,
    steps: [
      {
        route: "Contracts",
        title: "The salary cap",
        body: "Every club has the same spending limit each league year. The total of your players' cap hits must stay under it. Cap room is what is left, and you need room to sign anyone.",
      },
      {
        target: ["#app .exp-stats", "#app .gd-stats", "#app .panel"],
        title: "Cap hit is not salary",
        body: "A player's cap hit for a season is his base salary plus his share of any signing bonus, which is spread evenly over the first years of the deal. That's why a big bonus makes a contract cheaper now and more expensive later.",
      },
      {
        title: "Releasing players and dead cap",
        body: "Releasing a player saves his future salary, but any bonus not yet charged becomes dead cap: money that counts against the cap for a player no longer on the team. A post-June release spreads that charge over two seasons.",
      },
      {
        title: "Restructures and extensions",
        body: "A restructure turns this year's salary into bonus, creating room now and pushing cost into later years. An extension adds years before a deal expires. Both are on each player's contract screen.",
      },
      {
        route: "Boardroom",
        title: "The owner is watching",
        body: "The Boardroom shows the owner's goals, the budget and your job security. Winning, staying under budget and keeping fans happy earn trust.",
      },
    ],
  },
  {
    id: "market",
    title: "Free agency and trades",
    summary: "Make offers, build trades, and follow every move in the league.",
    minutes: 3,
    steps: [
      {
        route: "Market",
        title: "The transfer market",
        body: "Free agents are players without a team. You can sign them if you have cap room and a roster spot. The top of the screen shows when each window is open: trades, free agency and the draft.",
      },
      {
        route: "Market",
        tab: "Free agents",
        target: ["#app .segmented", "#app [role=tablist]"],
        title: "Making an offer",
        body: "Choose a player and offer years, salary and guaranteed money. He decides after each game week (or market day), comparing your offer with other clubs' on money, guarantees, playing time and your chances of winning.",
      },
      {
        route: "Market",
        tab: "Trade builder",
        title: "Building a trade",
        body: "Pick a partner club, then add players and draft picks from both sides. The other club judges value and need. If a deal can't go through, the screen says why and suggests a fix (for example, add a pick or clear cap room).",
      },
      {
        title: "Trade deadline",
        body: "Trades close after the deadline week in the season and reopen after the championship. Free agents can be signed all year; the big free agency window opens in March.",
      },
      {
        route: "Transactions",
        target: ["#app .tx-filters", "#app .tx-table", "#app .nav-panel"],
        title: "Every move, recorded",
        body: "League snapshot → Transactions lists every signing, trade, waiver claim, draft pick, release and retirement, with contracts. Filter by club, type or season. A player's own history is on his profile's Contract tab.",
      },
    ],
  },
  {
    id: "draft",
    title: "Scouting and the draft",
    summary: "How scouting reveals ratings, and how draft day works.",
    minutes: 3,
    steps: [
      {
        route: "Scouting",
        title: "Scouting",
        body: "You don't know exactly how good unfamiliar players are. Until scouted, their ratings show as a range. Request a report and it arrives in your inbox after a few days, narrowing the range.",
      },
      {
        title: "Your board",
        body: "Add prospects to your watchlist and rank them on your draft board, so you know whom to take when you are on the clock.",
      },
      {
        route: "Draft",
        title: "The draft room",
        body: "The draft is held after the championship. Seven rounds; the worst teams pick first. When you are on the clock, take a player from your board, trade down for extra picks, or trade up.",
      },
      {
        title: "Rookies",
        body: "Drafted players join on cheap four-year contracts. High picks can become stars, but most need time in Player development to reach their potential.",
      },
    ],
  },
  {
    id: "season",
    title: "Playing the season",
    summary: "Matchday, simulating ahead, the playoffs and the offseason cycle.",
    minutes: 3,
    steps: [
      {
        route: "Matchday",
        title: "Matchday",
        body: "Coach the game live (call each play and make substitutions) or quick-sim it for an instant result. Either way, the result, stats and injuries are recorded.",
      },
      {
        route: "Calendar",
        title: "Schedule & calendar",
        body: "Fixtures lists every game of your season. Head-to-head shows your record against every club. The Calendar tab lets you simulate ahead to a date; it pauses when something needs your answer in the inbox.",
      },
      {
        route: "League desk",
        title: "Around the league",
        body: "Standings, league leaders and the latest moves. Click a club for your head-to-head record.",
      },
      {
        title: "Playoffs and the offseason",
        body: "The top clubs in each conference reach the playoffs. After the championship comes the offseason: re-sign your own players, then the draft, free agency and training camp, before the next season begins.",
      },
      {
        route: "Records",
        title: "Your legacy",
        body: "Records & milestones keeps the champions list, the record book, awards and the Hall of Fame. Your career's achievements are written here.",
      },
    ],
  },
  {
    id: "organization",
    title: "Staff and the organization",
    summary: "Coaching staff, player development and your own coaching career.",
    minutes: 2,
    steps: [
      {
        route: "Staff",
        title: "Coaching staff",
        body: "Your coordinators and position coaches shape scheme, development and game-day calls. Better coaches develop players faster. Hire from the market or open a search.",
      },
      {
        route: "Development",
        title: "Player development",
        body: "Young players grow with playing time, training and good coaching; veterans eventually decline. Track each player's progress and focus here.",
      },
      {
        route: "Career",
        title: "Your coaching career",
        body: "Your own reputation, contract and job offers. Win and other clubs will call; lose and the owner may not wait.",
      },
    ],
  },
];

// Short help shown by the ? button for each screen. `tour` links the matching walkthrough.
export const SCREEN_HELP = {
  Overview: { text: "Your home screen: next game, record, cap room, morale and what needs you this week.", tour: "basics" },
  Inbox: { text: "Messages and decisions. Answer anything marked Response needed; urgent items pause calendar simulation.", tour: "basics" },
  News: { text: "League news and fan reaction. Follow clubs to see more of their stories.", tour: "season" },
  Matchday: { text: "Coach the next game live, or quick-sim it for an instant result.", tour: "season" },
  Roster: { text: "Your players. Open a profile to promote, bench, extend or release. 53 active in the season, 90 in the offseason.", tour: "roster" },
  "Game plan": { text: "Schemes, starters and this week's opponent analysis.", tour: "roster" },
  Medical: { text: "Injuries, return dates and the weekly training workload.", tour: "roster" },
  Development: { text: "How each player is growing or declining, and what drives it.", tour: "organization" },
  "Locker room": { text: "Player morale and team chemistry, and the conversations that move them.", tour: "roster" },
  Scouting: { text: "Request reports to narrow the rating ranges of unfamiliar players; reports arrive in your inbox.", tour: "draft" },
  Draft: { text: "Your board and the live draft. On the clock: pick, trade down or trade up.", tour: "draft" },
  Market: { text: "Free agents and trades. The windows at the top show what is open today.", tour: "market" },
  Contracts: { text: "Cap room, every contract, dead cap, restructures and extensions.", tour: "cap" },
  Club: { text: "The organization at a glance: facilities, finances, staff and the league office.", tour: "organization" },
  Staff: { text: "Hire, fire and assign coaches. Better coaches develop players faster.", tour: "organization" },
  Boardroom: { text: "The owner's goals, the budget and your job security.", tour: "cap" },
  Career: { text: "Your coaching profile, reputation and job offers.", tour: "organization" },
  Calendar: { text: "Fixtures, head-to-head records, and the calendar for simulating ahead.", tour: "season" },
  "League desk": { text: "Standings, leaders and the Transactions log of every move in the league.", tour: "market" },
  Records: { text: "Champions, the record book, awards and the Hall of Fame.", tour: "season" },
  Statistics: { text: "Season and career statistics for every player; sort any column.", tour: "season" },
  Analysis: { text: "Team and player analytics: efficiency, tendencies and comparisons.", tour: "season" },
  "Careers & saves": { text: "Switch careers, export a backup or import a save." },
  Settings: { text: "Display, sound, match and data options. Tutorial progress can be reset from Help & tutorials (the ? button)." },
  Conversations: { text: "One-to-one talks with players: promises, playing time, contracts and morale.", tour: "roster" },
  "Career dossier": { text: "Your coaching record, reputation and the history of your career.", tour: "organization" },
  "Media room": { text: "Press conferences and interviews. Your answers move fan support and player morale.", tour: "season" },
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
  "Head-to-head": "Your all-time record against one club.",
};
