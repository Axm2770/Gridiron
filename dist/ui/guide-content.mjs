// The Gridiron Guide: the player's handbook. Pure data shared by the in-game guide (ui/guide.mjs)
// and the repository doc (docs/player-guide.md, written by scripts/build-player-guide.mjs), so the
// two never drift. Every rule here is read from the game code; when a mechanic changes, change the
// sentence here and regenerate the doc (test-guide.mjs fails while the doc is stale).
//
// A chapter: { id, short (rail label), title, glyph, hero: { art, alt }, lead, points: [{ title, text, art? }],
//              tips: [text], where: [{ label, route, tab?, then?: [object, method, ...args] }], keywords }
//   glyph   a sidebar pixel glyph (ui/pixel-icons.mjs)
//   art     an illustration id from ui/guide-art.mjs
//   where   "Where to find it" buttons: W.open(route, tab), then call window[object][method](...args) (a sub-tab switch).

export const GUIDE_TITLE = "The Gridiron Guide";
export const GUIDE_INTRO =
  "Everything you need to run a club, one short chapter at a time. Each chapter ends with a button that takes you to the screen it describes.";

export const GUIDE_CHAPTERS = [
  {
    id: "start",
    short: "Getting started",
    title: "Getting started & the season calendar",
    glyph: "calendar",
    hero: { art: "calendar", alt: "A week on the calendar with the marker stepping to game day" },
    lead: "Time only moves when you press Continue or simulate from the calendar, so nothing happens behind your back.",
    points: [
      { title: "Continue", text: "Continue takes you to the next thing that needs you: the next game, a press conference or, in the offseason, the Draft room. On a bye week it moves the calendar on by a week." },
      { title: "The regular season", text: "17 games over 18 weeks, so every club gets one bye. The trade deadline falls after week 9 by default." },
      { title: "Playoffs", text: "Seven clubs per conference make it: four division winners and three wild cards. The top seed gets a bye, higher seeds play at home and the bracket is re-seeded each round." },
      { title: "The offseason", text: "NFL Honors and the Hall of Fame vote come just before the championship. Then the scouting combine, legal tampering (second Monday of March), free agency two days later, the draft (last Thursday of April), Hall of Fame enshrinement on 25 July and training camp on 28 July." },
      { title: "Simulating ahead", text: "Schedule & calendar → Calendar lets you simulate a day, a week, four weeks or up to a chosen date (two years at most). It stops early when an urgent decision, an interview or a roster problem needs you." },
      { title: "Starting a new season", text: "The calendar won't pass training camp on its own: choose Begin next season in the Draft room. You must trim to 53 players before the first game." },
    ],
    tips: [
      "Inbox decisions show when they are due: answer within two rounds or option A is chosen for you. Urgent ones stop calendar simulation until you answer.",
      "The header shows the date and week; the club overview always shows the next opponent.",
    ],
    where: [
      { label: "Schedule & calendar", route: "Calendar", tab: "Calendar" },
      { label: "Club overview", route: "Overview" },
    ],
    keywords: "continue calendar season week bye playoffs offseason combine tampering free agency draft camp simulate sim date",
  },
  {
    id: "sim",
    short: "How games are played",
    title: "How games are simulated",
    glyph: "play",
    hero: { art: "sim", alt: "Unit ratings for two teams feeding a scoreboard" },
    lead: "Every snap is played out from the players on the field, how fresh and happy they are, your game plan and the weather.",
    points: [
      { title: "Ratings drive each snap", text: "A player's strength on a snap is mostly his OVR (80%) plus the skills his position uses (20%), scaled by fitness. An injured player is far weaker." },
      { title: "Fitness and fatigue", text: "In live games players on the field tire a little every snap (never below 60% fitness) and recover on the sideline. Weekly training load sets how fresh they start the game." },
      { title: "Morale", text: "Morale nudges every snap: a player at 95 morale plays slightly above his rating, one at 55 slightly below." },
      { title: "Scheme fit", text: "When your roster suits your scheme, your players get up to +1.5 OVR on game day; a poor fit costs up to 1.5. See Tactics → Scheme fit." },
      { title: "Weather", text: "Weather comes from the home stadium's climate and the month. Rain makes passes harder to catch, wind pushes throws off line, snow plays like rain, and domes shut it all out." },
      { title: "Kicks", text: "Field-goal odds fall with distance and rise with the kicker's accuracy and leg strength." },
    ],
    tips: [
      "Crowd noise and momentum readings on the overview are scouting advice: results come from players, fitness, morale, the plan and the weather.",
      "A confident pregame quote can fire the opponent up: they play 1 OVR better that week.",
      "Quick sim and live coaching use the same play engine, so a quick sim is a fair result.",
    ],
    where: [
      { label: "Matchday", route: "Matchday" },
      { label: "Tactics", route: "Game plan" },
    ],
    keywords: "simulation engine ratings fitness fatigue morale weather rain wind snow dome kicker field goal scheme fit result score",
  },
  {
    id: "roster",
    short: "Roster building",
    title: "Roster building",
    glyph: "squad",
    hero: { art: "depth", alt: "A bench receiver swapping places with the starter on the lineup board" },
    lead: "Pick the right 22, keep the depth behind them, and grow young players into stars.",
    points: [
      { title: "OVR and POT", text: "OVR (0–99) is what a player can do now. POT is his ceiling: OVR can never pass it. Scouted players show both as ranges until you know them well." },
      { title: "The lineup board", text: "Squad shows your formation on a pixel field. Click a player, then a replacement, or drag one onto the other. Same-position starters trade places; changes count from the next snap and you can undo the last ten." },
      { title: "Roster limits", text: "53 active players in the season, 90 in the offseason, 16 on the practice squad and two practice-squad elevations a week. Injured reserve keeps a player out for at least four weeks." },
      { title: "Minimum to play", text: "To take the field you need at least 1 QB, 1 RB, 2 WR, 1 TE, 5 OL, 3 DL, 2 LB, 2 CB, 2 S and a kicker who can play." },
      { title: "Growth and age", text: "Young players grow fastest (24 and under), keep growing to their position's peak, hold for three years, then decline. Peaks: RB 25, CB 26, WR and LB 27, TE, DL and S 28, QB and OL 29, kickers 32." },
      { title: "What speeds growth", text: "Playing time, good coaches, training facilities, the training load, fitness, morale, form and an older mentor at the same position. Unused players develop much more slowly.", art: "age" },
    ],
    tips: [
      "Player development shows each player's direction (improving, stable or declining), not exact numbers.",
      "Moving a player to a new position costs 6 OVR at first; he earns it back as he learns the role.",
      "A veteran three or more years older at the same position works as a mentor.",
    ],
    where: [
      { label: "Squad", route: "Roster" },
      { label: "Player development", route: "Development" },
    ],
    keywords: "roster squad depth chart lineup starters bench ovr pot potential age peak decline development growth mentor practice squad injured reserve 53 90",
  },
  {
    id: "tactics",
    short: "Tactics primer",
    title: "Tactics primer",
    glyph: "tactics",
    hero: { art: "tactics", alt: "A shotgun formation against three deep zones" },
    lead: "Your game plan tells your staff what to call. It has four tabs: Base plan, Situational, Advanced and Scheme fit.",
    points: [
      { title: "Scheme family", text: "The style your offense is built on: West Coast (short, timed passes), Air Raid (spread it out and throw), Spread RPO, Wide zone, Erhardt-Perkins, Power gap, or Multiple." },
      { title: "Personnel", text: "Two digits: running backs, then tight ends. 11 is 1 RB, 1 TE and 3 WR; 12 swaps a receiver for a tight end; 21 adds a fullback; 10 is four receivers." },
      { title: "Formation", text: "Where they line up: Shotgun, Singleback, Pistol, I formation, Under center or Empty." },
      { title: "Front and coverage", text: "The front is 4–3, 3–4, Nickel (an extra corner) or Dime (two). Coverage splits the deep field: Cover 1 has one deep safety and man under, Cover 2 two deep halves, Cover 3 three deep thirds, Cover 0 nobody deep and everyone rushing or in man." },
      { title: "Situations", text: "Situational packages replace the base plan on 3rd down, in the red zone, at the goal line and in the two-minute drill, with matching defensive calls and a prevent option." },
      { title: "Fourth downs", text: "Conservative and Balanced kick field goals inside about the opponent's 37–40 and punt otherwise. Aggressive goes for it on short yardage. Every setting goes for it when trailing in the last three minutes.", art: "fourth" },
    ],
    tips: [
      "Who calls plays: Manual lets you pick each play in live games; Head coach hands the sideline to your staff.",
      "Head-coach directives (protect the QB, feed the RB) override the run–pass lean on early downs.",
      "The plan can't be changed during a live game, so set it before kickoff.",
    ],
    where: [{ label: "Tactics", route: "Game plan" }],
    keywords: "tactics game plan scheme personnel formation shotgun front coverage cover 2 cover 3 blitz fourth down 4th chart red zone two minute playcaller",
  },
  {
    id: "cap",
    short: "The salary cap",
    title: "The salary cap",
    glyph: "cap",
    hero: { art: "cap", alt: "The cap bar: live contracts, dead money and cap room" },
    lead: "Every club spends under the same hard cap ($255M to start). Your total cap hits must stay under it.",
    points: [
      { title: "Cap hit", text: "What a contract counts this year: salary plus this year's share of any bonus. A signing bonus is spread evenly over the contract, five years at most." },
      { title: "Worked example", text: "Four years, $7M salary a year and a $12M bonus: $3M of bonus lands each year, so the cap hit is $10M every season. Cut him before year two and the $9M of bonus not yet charged becomes dead money at once.", art: "capdeal" },
      { title: "Dead money and post-June cuts", text: "Releasing a player turns his remaining bonus and any remaining guaranteed salary into dead money. Post-June accounting charges only this year's share now and moves the rest to next year." },
      { title: "Restructures", text: "Turn part of this year's salary into bonus spread over the remaining years: room now, cost later. At least $0.8M salary must stay, and a contract can be restructured again only after 14 days." },
      { title: "Extensions and tags", text: "An extension adds years after the current deal (the average must be at least 92% of his ask and fit every year's cap). The franchise or transition tag gives one fully guaranteed year, once per league year, to a player whose deal has just expired." },
      { title: "Being over the cap", text: "Over the cap you can't advance the calendar, play games, sign free agents or trade. Unused room rolls over to next year." },
    ],
    tips: [
      "Tag cost is the higher of 120% of his salary and the average of the league's five biggest cap hits.",
      "Rookie deals are four years: about $4M a year for a first-rounder down to $1M in round seven.",
      "The cap only grows if the clubs vote for the +8% proposal at the league meeting (24 of 32 votes).",
    ],
    where: [{ label: "Contracts & salary cap", route: "Contracts" }],
    keywords: "salary cap cap hit dead money release cut post june restructure extension franchise tag transition tag rollover bonus guarantee rookie contract",
  },
  {
    id: "market",
    short: "Trades & free agency",
    title: "Trades & free agency",
    glyph: "market",
    hero: { art: "trade", alt: "A player and a draft pick crossing between two clubs over a value meter" },
    lead: "Clubs trade on value and need. Free agents sign wherever the whole offer scores best.",
    points: [
      { title: "How value works", text: "Value climbs steeply with OVR above 60, is weighted by position (quarterbacks most, kickers least), rises with years of control and falls with age past his peak, injuries and a big cap hit." },
      { title: "What AI clubs want", text: "Rebuilding clubs want players 25 and under and value picks more; contenders want 78+ OVR players now. Everyone pays more for a position they need and less for one they're stacked at." },
      { title: "Getting a yes", text: "The other club accepts when what it gets is worth at least 8% more than what it gives. If it says no, the builder suggests the cheapest pick or reserve that closes the gap." },
      { title: "Blockers and fixes", text: "If a deal or signing can't go through, the screen says why and offers a fix button: move a reserve to the practice squad, release or restructure to clear cap, remove a no-trade player from the deal, or quick-sim a live game." },
      { title: "Free agency", text: "It opens with legal tampering; on the third market day expired contracts hit the market. Your offers are decided two market days later. Players weigh money, guarantees, team strength (more so past 29), the head coach, scheme fit, playing time and loyalty." },
      { title: "Waivers", text: "Released players go on waivers. Claims settle on the next market day, with the club with the fewest wins first; unclaimed players become free agents." },
    ],
    tips: [
      "Trades close after the deadline week and reopen after the championship; a club you just traded with waits seven days for the next deal.",
      "Before the deadline contenders send offers for your 72+ OVR players. They expire at the deadline.",
      "Offer feedback reads Strong, Competitive or Needs improvement before you send.",
    ],
    where: [
      { label: "Trade builder", route: "Market", then: ["Ops", "sub", "market", "builder"] },
      { label: "Free agents", route: "Market", then: ["Ops", "sub", "market", "agents"] },
    ],
    keywords: "trade trades value deadline free agency free agent offer waivers blockers fix no-trade contender rebuilding picks counter",
  },
  {
    id: "draft",
    short: "Draft & scouting",
    title: "Draft, scouting & the combine",
    glyph: "draft",
    hero: { art: "fog", alt: "A scouted rating range narrowing as confidence rises" },
    lead: "You only see what your scouts have seen: unfamiliar players show ranges that narrow as confidence grows.",
    points: [
      { title: "Fog of war", text: "Your own players and the league's prominent ones (80+ OVR or starters elsewhere) are shown exactly. Draft prospects start at 25% confidence, other players at 30%, and their OVR and POT show as ranges." },
      { title: "Scouting reports", text: "A formal report takes three days and adds 35 confidence; each scout works one at a time. Your scouts also file regional reports every week, and better scouts file more." },
      { title: "What confidence unlocks", text: "At 40% you see the combine projection, at 55% film, at 70% medical and personality, at 85% the sleeper and bust odds." },
      { title: "The combine", text: "Prospects run the 40, 10-yard split, bench, vertical, broad jump, 3-cone and shuttle (quarterbacks skip the bench, kickers don't test). Strong workouts make risers, poor ones fallers, and measured athletic ratings jump to 90% confidence.", art: "combine" },
      { title: "Watchlist pipeline", text: "Watchlist → Scouted (40% confidence) → Interviewed (after a private visit) → Big Board → Drafted. Prospects taken by other clubs move to a lost list." },
      { title: "Draft day", text: "Seven rounds, fewest wins picking first. On the clock you can pick, take a trade-down offer (worth at least 102% of your pick) or trade up by paying at least 110% in later picks." },
    ],
    tips: [
      "A first- or second-rounder who hasn't gained 2 OVR after two seasons is labelled a bust in public.",
      "You can't draft at 90 players; clear a spot first.",
    ],
    where: [
      { label: "Draft room", route: "Draft" },
      { label: "Scouting", route: "Scouting" },
    ],
    keywords: "draft scouting scout combine fog of war confidence range prospects watchlist big board risers fallers trade up trade down rookie",
  },
  {
    id: "happiness",
    short: "Player happiness",
    title: "Player happiness",
    glyph: "locker",
    hero: { art: "morale", alt: "Morale bands from happy to unhappy" },
    lead: "Morale nudges every snap, and unhappy players hold out or ask to leave.",
    points: [
      { title: "Morale bands", text: "Happy at 75+, Content 60+, Unsettled 45+, Unhappy below. The Locker room shows each player's mood and why: playing time, contract, injury, results and your conversations." },
      { title: "Chemistry and drama", text: "Chemistry rises after wins and falls after losses; drama builds from negative headlines and cools each week. High chemistry lifts everyone's morale a little each week; high drama drags it down." },
      { title: "One-on-ones", text: "Meet each player at most once a week. Support raises morale and can end a holdout; challenging works on ambitious players but stings loyal or injured ones." },
      { title: "Promises", text: "Promise a role review or a starting job and he'll hold you to it. Kept promises build trust; broken ones cost trust, morale and your reputation." },
      { title: "Press conferences", text: "Pick a tone: Humble, Confident, Defiant or Deflect. Each moves team morale, chemistry, drama, fans, the owner and the media. A confident claim followed by a loss costs credibility.", art: "press" },
    ],
    tips: [
      "Leaders' moods spread to teammates at the same position.",
      "Backing a player in public raises his morale and trust; calling him out drops both.",
    ],
    where: [
      { label: "Locker room", route: "Locker room" },
      { label: "Media room", route: "Media room" },
    ],
    keywords: "morale happiness trust chemistry drama promises press conference media holdout trade demand locker room conversation",
  },
  {
    id: "board",
    short: "Owner & board",
    title: "Owner & board",
    glyph: "board",
    hero: { art: "board", alt: "Job security bands from secure to the hot seat" },
    lead: "The owner sets a mandate and a win target. Hit them and your job is safe.",
    points: [
      { title: "Mandate and target", text: "Each season the owner picks Rebuild, Compete or Contend. The win target starts from your roster's strength and moves with the mandate." },
      { title: "Season targets", text: "Win enough games, reach (or win in) the playoffs if you're expected to, stay under the cap, develop young starters and keep fan approval up." },
      { title: "Job security", text: "Secure 80+, Stable 60+, Under pressure 40+, Hot seat below 40. It comes from the owner's patience, the fans and how far ahead or behind the target you are." },
      { title: "Board meetings", text: "Fall two wins behind pace, lose three straight or drop below 40 security and the board calls a meeting. Choose to commit, play the youth or ask for resources; ignore it for two rounds and the first option is chosen for you." },
      { title: "Warnings and job offers", text: "Below 35 after a missed target, the owner gives a final warning, then an ultimatum. As a head coach or coordinator with reputation 65+, other clubs call in the offseason; pass the interview and you become their head coach." },
    ],
    tips: [
      "Beating the season review earns patience and reputation; missing it badly costs a lot.",
      "Championships, conference titles, 10-win seasons and Coach of the Year all raise your reputation.",
    ],
    where: [
      { label: "Boardroom", route: "Boardroom" },
      { label: "Coach career", route: "Career" },
    ],
    keywords: "owner board boardroom mandate target job security hot seat meeting warning ultimatum fired job offers interview reputation",
  },
  {
    id: "staff",
    short: "Staff & coaches",
    title: "Staff & coaches",
    glyph: "staff",
    hero: { art: "staff", alt: "The coaching tree from head coach to position coaches" },
    lead: "Coaches shape how fast players grow, how well they're treated and how well your plan is drilled.",
    points: [
      { title: "Roles", text: "Head coach, assistant head coach, general manager, offensive, defensive and special-teams coordinators, position coaches (QB, RB, WR, TE, OL, DL, LB, DB), head of medical and scouts." },
      { title: "What ratings do", text: "Coaching ratings speed player development. The head of medical's rating sets how accurate diagnoses are. Coordinators whose scheme matches yours run training more efficiently." },
      { title: "Hiring", text: "Open a search, interview candidates, then hire. Top jobs need two outside interviews from diverse candidates, and the salary must fit the staff budget." },
      { title: "Windows and firing", text: "Outside hiring is closed during the regular season. Dismissing a coach costs severance: half his salary for each year left (at least one)." },
      { title: "Coaches change too", text: "Like players, coaches' ratings move over time with age, results and how their players develop, so review the staff each offseason." },
    ],
    tips: [
      "Ask the owner for a bigger staff budget in the Boardroom.",
      "Each coach has a personality (Teacher, Analyst or Motivator) and a specialty; match them to your young core.",
    ],
    where: [{ label: "Coaching staff", route: "Staff" }],
    keywords: "staff coaches coordinators hire fire severance budget interview scouts medical ratings personality",
  },
  {
    id: "legacy",
    short: "Awards & Hall of Fame",
    title: "Awards, records & the Hall of Fame",
    glyph: "records",
    hero: { art: "trophy", alt: "A championship trophy and a Hall of Fame plaque" },
    lead: "Great seasons are written down: awards each year, a record book, and the Hall of Fame for careers.",
    points: [
      { title: "Awards", text: "MVP, Offensive and Defensive Player of the Year, both Rookies of the Year, Comeback Player, Coach and Assistant Coach of the Year. 50 voters rank five names each; winners are announced at NFL Honors before the championship." },
      { title: "All-Pro and Pro Bowl", text: "The best players at each position are named All-Pro, and the Pro Bowl picks twice as many." },
      { title: "Records", text: "League and club records for a game, a season and a career, seeded with real history. You get an alert when one of your players is within 10% of a record." },
      { title: "Hall of Fame", text: "Players become eligible five seasons after retiring and stay on the ballot for 20 years. Finalists are named before the championship, the class is elected on Honors night and enshrined on 25 July." },
    ],
    tips: ["Breaking a league record with your club raises your reputation.", "Watch the Awards tab during the season to see who is leading each race."],
    where: [
      { label: "Records & milestones", route: "Records" },
      { label: "Awards", route: "Records", tab: "Awards" },
    ],
    keywords: "awards mvp all-pro pro bowl records record book hall of fame hof honors legacy champions",
  },
  {
    id: "saves",
    short: "Updates & saves",
    title: "Updates & saves",
    glyph: "settings",
    hero: { art: "update", alt: "The update steps from save to restart" },
    lead: "Your career saves itself on this device, and the desktop game keeps itself up to date.",
    points: [
      { title: "Autosave", text: "Every change is saved on this device a moment after you make it, and again when you close the window. The footer says when it's saved, or tells you to export a backup if saving fails." },
      { title: "Career library", text: "Keep several careers: start, load, rename, save a copy, archive or delete them from the library (Careers in the header). Deleting offers to export first." },
      { title: "Import and export", text: "Export writes the whole career to one file you can back up or move to another computer; Import reads it back (up to 40 MB).", art: "saves" },
      { title: "Automatic updates", text: "On the desktop app, a new version installs as the game starts, before your first click: it saves your career, downloads, verifies, installs and restarts. Turn it off in Settings → Interface." },
      { title: "Updates later on", text: "If an update arrives while you play, a banner offers to install or download it. Your careers carry over, and a failed update rolls back on its own." },
    ],
    tips: ["Export a backup before big experiments; it's one click in the library.", "Saves live in this browser or app profile, so clearing site data deletes them."],
    where: [
      { label: "Career library", route: "Careers & saves" },
      { label: "Settings", route: "Settings" },
    ],
    keywords: "save saves autosave export import backup career library update auto-update version restart",
  },
];

// Which chapter answers "how does this screen work?" for the ? button.
export const ROUTE_CHAPTER = {
  Overview: "start",
  Inbox: "start",
  Calendar: "start",
  Matchday: "sim",
  "Game plan": "tactics",
  Roster: "roster",
  Development: "roster",
  Medical: "roster",
  "Locker room": "happiness",
  Conversations: "happiness",
  "Media room": "happiness",
  News: "happiness",
  Market: "market",
  "League desk": "market",
  Draft: "draft",
  Scouting: "draft",
  Contracts: "cap",
  Boardroom: "board",
  Career: "board",
  "Career dossier": "board",
  Staff: "staff",
  Club: "staff",
  Records: "legacy",
  Statistics: "legacy",
  Analysis: "sim",
  Settings: "saves",
};

// Plain-text search: a chapter matches when every word of the query appears in it.
export function searchGuide(query, chapters = GUIDE_CHAPTERS) {
  const words = String(query || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return chapters.map((c) => ({ chapter: c, points: [] }));
  const hay = (c) => [c.title, c.lead, c.keywords, ...c.points.flatMap((p) => [p.title, p.text]), ...c.tips].join(" ").toLowerCase();
  // Rank: a word in the title counts most, then the keywords, then each matching card.
  const score = (c, points) =>
    words.reduce((n, w) => n + (c.title.toLowerCase().includes(w) ? 6 : 0) + (c.keywords.includes(w) ? 3 : 0), 0) + points.length;
  return chapters
    .filter((c) => words.every((w) => hay(c).includes(w)))
    .map((c) => ({ chapter: c, points: c.points.filter((p) => words.some((w) => (p.title + " " + p.text).toLowerCase().includes(w))) }))
    .map((r, i) => ({ ...r, rank: score(r.chapter, r.points), i }))
    .sort((a, b) => b.rank - a.rank || a.i - b.i)
    .map(({ chapter, points }) => ({ chapter, points }));
}

// The repository doc. Sidebar labels come from the caller so this module stays dependency-free.
export function guideMarkdown(label = (route) => route) {
  const out = [
    `# ${GUIDE_TITLE}`,
    "",
    "<!-- Generated by scripts/build-player-guide.mjs from dist/ui/guide-content.mjs. Edit that file, then run `node scripts/build-player-guide.mjs`. -->",
    "",
    GUIDE_INTRO + " In the game, open it from the `?` button, Help & tutorials, or Ctrl+K → \"Guide\".",
    "",
    "## Chapters",
    "",
    ...GUIDE_CHAPTERS.map((c, i) => `${i + 1}. [${c.title}](#${slug(c.title)})`),
    "",
  ];
  for (const c of GUIDE_CHAPTERS) {
    out.push(`## ${c.title}`, "", `*${c.hero.alt}.*`, "", `**${c.lead}**`, "");
    for (const p of c.points) out.push(`- **${p.title}.** ${p.text}`);
    out.push("", "**Pro tips**", "");
    for (const t of c.tips) out.push(`- ${t}`);
    out.push("", `**Where to find it:** ${c.where.map((w) => label(w.route) + (w.tab ? ` → ${w.tab}` : "")).join(" · ")}`, "");
  }
  return out.join("\n");
}
const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, "")
    .trim()
    .replace(/ /g, "-");
