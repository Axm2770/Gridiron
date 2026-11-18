<!-- The release job fills the version marker in file names with the tag's version number. -->
## Download

| Your computer | File |
| --- | --- |
| Mac with Apple Silicon (M1 or newer) | `Gridiron-Director-<version>-macOS-arm64.zip` |
| Mac with Intel processor | `Gridiron-Director-<version>-macOS-x64.zip` |
| Windows 10/11 (64-bit) | `Gridiron-Director-<version>-Windows-x64.zip` |

Not sure which Mac you have? Apple menu → **About This Mac**: "Chip: Apple M…" means Apple Silicon.

## Install

**macOS (13 Ventura or newer)**

1. Unzip and drag **Gridiron Director.app** into Applications.
2. The app is ad-hoc signed, not notarized. The first time, right-click it and choose **Open**, then **Open** again. If macOS still blocks it, open **System Settings → Privacy & Security** and click **Open Anyway**.

**Windows**

1. Unzip the whole folder anywhere (for example Documents). Keep the files together.
2. Run **Gridiron Director.exe**. The app is not code-signed, so SmartScreen may show "Windows protected your PC": click **More info → Run anyway**.

Careers are saved locally on your computer, and each install keeps its own saves. To move a browser career into the app, use **Careers & saves → Export** in the browser and **Import a career** in the app.

Every file in this release was built by GitHub Actions from this tag, passed the full regression suite, and was launch-tested (the app opened, loaded the career workspace and ran a simulation) before and after zipping.

## Updating

If you have 0.24.1 or later, the game offers this update in-game: choose **Download now**, then **Restart now**. Your careers are untouched. On 0.23.0 or earlier, download this version once from this page.

## New in 0.31.0: the combine, awards night, the Hall of Fame and a real newspaper

### New events
- **Scouting Combine:** every prospect runs the 40, 10-yard split, bench, vertical, broad jump, 3-cone and shuttle. Results narrow your scouting ranges and move draft stock. Draft room has a Combine tab, profiles show a combine card, and a pixel cutscene shows a prospect racing the stopwatch.
- **Awards night:** MVP, Offensive and Defensive Player of the Year, both Rookie of the Year awards, Comeback Player, Coach of the Year (which can be you) and the All-Pro team, with a pixel ceremony when your club is involved and trophy cards in Records.
- **Hall of Fame:** finalists in January, a class of 4–8 elected on awards night, and enshrinement in July with a gold-jacket ceremony when the inductee played for your club. Records gets "Class of" plaques.

### News you can read
- Every story opens as a full article: headline, byline, several paragraphs, pull quotes and related stories. Use Previous and Next or the arrow keys to move between them.
- Match reports have a pixel scoreboard, quarter-by-quarter scoring, team stat bars and top performers. Player, trade, injury and league stories get their own visuals.
- New coverage: player and team milestones, records, streaks, your coaching milestones, the trade deadline, free agency, the draft, the playoff field, awards and the champion.

### Inbox cards
- Messages are now pixel cards: "what changed" lists with meters and the right colours (more drama is bad), press transcripts with the reporter's question and your answers, injury, trade and signing cards, scouting reports, board meetings, final scores and practice reports. Older messages are converted too.
- The career library header is cleaner.

### Clearer values everywhere
- Boardroom targets show progress bars, status chips, cap bars and pips instead of grey text, with no more "on pace for 0.0" before the season starts. The same style is used in the Organization hub, club and player profiles, Medical, Development, Scouting and the Locker room.

### Lineup
- One reliable lineup board for Squad, Tactics and matchday: no overlapping cards, a pixel field, player chips with faces and colour-coded OVR, click, drag or keyboard to swap, Undo, and a side panel that compares replacements with your starter.

### Polish and fixes
- New postgame report with a scoreboard, quarter scores, stat bars and key plays.
- Trades now ask you to confirm before players move.
- Compact panel headers, tidier breadcrumbs and footer, readable free-agent reasons, healed injured-reserve players shown as fit, and many smaller layout fixes.

## Also new in 0.30

#### Automatic updates
- From the next release on, the desktop app updates itself when it starts: it saves your career, downloads and checks the update behind a pixel loading screen, then reopens your career. A card tells you what version you're on now.
- Turn it off in Settings (Update automatically when the game starts). Updates found mid-session still wait for you, so a match is never interrupted.

#### Tactics, NFL style
- Four tabs: Base plan, Situational, Advanced and Scheme fit.
- Pick a scheme family (West Coast, Air Raid, Spread RPO, Wide zone, Erhardt-Perkins, Power gap), personnel, formation, front, coverage shell and blitz rate, each with a meter for how well your roster fits it.
- Situational packages for 3rd down, red zone, goal line and the two-minute drill, and a 4th-down chart (conservative, balanced, aggressive).
- Run and pass concepts, tempo, man vs zone, press vs off and run fits, with a plain-English explanation of every term.
- Opponent analysis now shows how their tendencies match up with your plan. Every choice feeds the sim, and scores stay realistic.

#### Club profiles
- Click any team's logo or name anywhere, or search for it, to open its profile: leadership, identity, top players, roster and depth chart, schedule, history and titles, stadium and finances, and a Trade with button.

#### Fix it in one click
- Warnings and blockers now lead with a bold headline. Where the game suggests a fix, a button does it (release, restructure, waive, move to the practice squad, quick-sim) or takes you to the right screen.

#### Clearer screens
- Inbox messages are laid out in pixel sections with bullet markers and coloured chips.
- The Locker room's "What is moving the room" uses cards with meters, chips and win/loss pips.

#### Matchday
- Weather now depends on the stadium, its roof and the time of year: snow in Green Bay in December, rain in Seattle, always 70°F indoors. It's no longer a dropdown.
- When the head coach is calling plays, the call sheet is locked until you switch Playcaller to Manual.
- The top bar shows "Game in progress" during a match instead of "Return to game".
- Quick-sim dropdowns no longer cut off their text.

## Also new in 0.29

#### Realistic scores
- Fixed a bug where your offense could score almost nothing: with Manual play calling, a Punt or Field goal you picked once was repeated on every down. A selected run or pass now repeats on downs 1–3 only; punts, field goals and fourth downs follow your staff unless you pick them for that snap.
- Live coaching no longer wears your club down: only players on the field tire, and less. Saves already worn down are restored on load.
- Scores across the league now look like real football: about 22 points per team on average, 50-point games are very rare and 70 essentially never happens. Hurry-up tempo no longer leaks into other teams' games.
- Run-first and Vertical styles now tilt your play mix instead of replacing it, and they apply in calendar sims too.

#### Press conferences with consequences
- Every press conference asks about your tone and about a named player. Your answers move team morale, chemistry, drama, fans, the owner's patience, media trust, and that player's morale and trust in you.
- Calling a player out can open a rift and an inbox story; backing a struggling player lifts him. "Promise snaps" creates a promise you must keep.
- Context matters: wins, losses, streaks and rivalry weeks change the effect, and bold claims followed by a loss cost credibility.
- The outcome card shows exactly what changed, and the Locker room lists it.

#### Pixel cutscenes again
- Championship, draft pick, press room, playoff exit, locker room, clutch finish and conversation scenes are pixel art in the pixel theme.

#### One simple navigation
- The sidebar is the only way to move around: the Club overview tab strip is gone, and its unique parts moved to Draft room (Scout network, Watchlist pipeline) and Coach career (Coaching tree).
- A pixel sidebar with pixel icons that scales to fit your screen without scrolling.
- Careers & saves was removed from the sidebar; the Careers button in the top bar opens the career library.
- The interface scales down a little on smaller screens.

## Also new in 0.28

#### Cleaner screens
- Every screen now opens with a compact title bar (the page name and the ? help button) and then its real content.
- Gone from every page: the "Jump to" links, the role badge, the club and season line and the description.
- Banners that only repeated the page title or described the page are gone from Transfers & free agency, Inbox, News, Development, Scouting, Staff, Organization, Careers & saves, Conversations, Media room, Career dossier, Records, Settings and Matchday.

#### Player profiles and dialogs
- Player profiles are rebuilt in the pixel style:
  - a header with a pixel face, OVR and POT badges, and status chips;
  - Overview with readiness and best-attribute meters;
  - Stats with a career chart and paged seasons;
  - Contract with season blocks and dead money if cut;
  - Scouting with attribute ranges.
- Confirmations, the postgame report, Ctrl+K search, the help centre, tutorial cards, notifications and the update bar all share the same frames, header bars and fonts.

#### Cutscenes and story scenes
- Signing, coach-arrival and draft-night scenes, 3D cinematics, press conferences and player conversations now use the same pixel fonts, frames and answer cards as the rest of the game.
- Captions no longer cover the art, and every answer fits on screen.

#### Any screen size
- Layouts adapt from phones to 2560-wide monitors: content is centred and capped on very wide screens, toolbars wrap, buttons line up, and nothing scrolls sideways or gets cut off at the edge.
- The sidebar becomes a slide-in menu on narrow windows.

## Also new in 0.27

#### Club overview
- A new dashboard: your next match with both clubs, form, kickoff, weather and a win-chance meter.
- Your record, division place, point difference, cap room and roster at a glance.
- Your desk shows the decisions waiting for you, plus the club's pulse (morale, chemistry, fans, board, drama), your division table, a season road of every week's result, team leaders, core players, the medical room and the timeline.

#### Medical & training
- A treatment room: injury cards with a pixel body diagram, weeks out and expected return. Treatment choices are shown side by side with their re-injury risk, time out, cost and trust effects.
- Squad health at a glance: availability, who's out or playing hurt, and joint wear across the squad.
- Move players to injured reserve or back with one click, and compare physio candidates before hiring.
- Training is a weekly calendar: choose each day's session and see the effect on fatigue, injury risk, growth and readiness before the week is played.

#### Data & analysis and Statistics
- Pixel charts: where you rank in the league on every recorded metric, weekly trends, unit ratings against the league, your play-calling mix and a tale of the tape against your next opponent.
- League leaders with pixel faces, and a side-by-side comparison of up to three players.
- Statistics tables in categories, with filters, sortable columns and pages. Defensive interceptions now show, and the CSV export follows your filters.

#### Players
- Development: progress tracks from current to potential, age curve, and a cleaner player card with a weekly progress chart.
- Locker room: morale, chemistry, drama and leadership meters, your captains, what's moving the room, promises and a mood grid for every player.
- Scouting: a cleaner scouting desk with a shortlist, scout assignments and a redesigned report.

#### Front office
- Contracts: a cap sheet, the next five seasons' commitments, an extension watch list and a clearer ledger showing dead money if cut.
- Coaching staff, Boardroom, Organization hub, Coach career and Career dossier all redesigned with pixel coach portraits and meters.
- Contract and interview dialogs match the new style.

#### League
- Schedule: a season strip of every week, a next-game card, and rivalry cards for head-to-head.
- The calendar and simulation banner are redesigned.
- League snapshot: a playoff picture "if the season ended today", standings with clinched and eliminated marks, leaders with faces, and a paged transactions log.
- Records: a trophy wall of champions, a record book with faces, Hall of Fame plaques and the awards race.

#### Inbox and news
- The inbox works like a pixel mail client: count tiles, filters, pages and clear decision cards.
- The Gridiron Journal newspaper has lead stories, sections, search and followed teams.

#### Fixes
- Home and away games are now balanced: every club gets 7–9 home games. Before, some clubs played almost every game away.

## Also new in 0.26

#### Starting a career
- A new, faster career setup: pick a club, name your coach and sign, or customise everything.
- All 32 clubs on one board by division, with real context for each: opening roster rating and rank, what the owner will expect, difficulty, projected wins, best player and starting QB.
- A pixel coach you can shape (outfit, build, hair, colours, glasses, headset) that updates as you go.
- Coaching philosophy choices explain what they actually change.
- It finishes with a signing announcement. Use the arrow keys and Enter to move through it.

#### Matchday
- Sim options open fully, with no scrollbar, and are no longer cut off by the field.
- A cleaner match screen: a pixel scoreboard with the situation (down, distance, ball spot, timeouts), tidy controls, a compact call sheet that fits beside the field, and halftime and full-time banners.
- Press conference questions and answers fit on screen.

#### Transfers and free agency
- A pixel trade desk: a deal meter showing what you send against what they want, their reasoning as short +/− badges, and your offer as chips you can remove.
- Both sides of a trade are browsed with filters, search and pages instead of long scrolling lists.
- Incoming offers are cards, with a new **Counter** option.
- Free agents can be filtered by position, age, rating and asking price, sorted by any column and paged, and every free agent is listed.

#### Draft room
- A pixel war room: draft status, your picks as tokens, and scouting meters.
- The big board is paged, with ability and potential bars, report confidence and roster-need flags.
- The live draft has an on-the-clock banner, a pick ticker with grades, and a trade desk. Each draft ends with a class summary and grades.

#### Everywhere
- Player faces are pixel art in the market and the draft room.
- Wherever a list still scrolls, it uses one slim, square pixel scrollbar.

## Also new in 0.25

#### A real transfer market
- Clubs no longer trade on points alone. Age, contract, injury history, reputation (fan favourites, franchise icons and legends), character and controversy, team needs and whether a club is contending or rebuilding all move the price. Some players are simply not for sale.
- Their front office explains its thinking as you build a deal ("They need a CB", "He's a franchise icon: they want 30% more", "Injury concerns") and suggests what would close the gap.
- **Trade for a specific player:** open any player's profile on another club and choose **Trade for <name>**. The trade builder opens with him selected and a package suggested.
- Suggested packages aim for a fair price, and a trade that would leave you without a healthy player at a position is blocked before it happens.
- Free agents weigh more than money: veterans chase contenders, young players want to start, and a player may return to a former club. You see the reasons.

#### Lineups you can see
- Squad and Tactics show your starters on a pixel football field, like a retro lineup screen. Switch between offense, defense and special teams.
- Click a player on the field (or drag one from the bench) to change your starter. Injured players are listed with the reason they can't play.
- Switch to **Table** for the full list. Sorting now works properly: every metric, both directions, players without data last, and the column headers and the Sort by menu agree.

#### Expectations and meetings
- Each season the owner sets expectations from your club's strength: a win target, playoffs for strong clubs, cap discipline and young players to develop. Find them in the Boardroom.
- Fall clearly behind and the board calls a meeting: commit to a short-term target, ask for patience to develop youth, or request resources, each with real consequences. Struggling teams also get a meeting with the captains.
- Plans have a checkpoint, and missing it hurts your job security. Each season ends with a review against the expectations.

#### Careers
- **Delete careers** from the career library, with a confirmation (and an option to export first).
- The career library has a cleaner layout: one card per career with club, coach, season, record and last played.
- Your career role, background and archetype are fixed once a career starts. Start a new career, or accept a job offer, to change role.
- The coach avatar is pixel art, in the creation screen, the dossier and the sidebar.

#### Fixes
- The expectations brief now reaches the inbox for new careers.
- Team logos show inside dialogs again with the pixel theme on.

## Earlier 0.24 updates

### New in 0.24.4

- **Sort any table.** Click a column header to sort it, on every screen: Squad, Locker room, the draft board, Development and the rest. Numbers sort highest first. Long tables also get a search box.
- **The contract ledger** shows 25 contracts per page instead of 8.
- **Player profiles** show where the player sits on the depth chart (for example "QB, 1st of 2, starter") and his four best attributes.
- **Clearer roster buttons** on a profile: Make starter, Move to bench, or Move to active roster for a practice-squad player.
- **Search runs actions.** Press Ctrl+K (⌘K on a Mac) and type "sim", "trim", "help" or "tour" to simulate to the next game, trim to 53, open help or start a tutorial.

### New in 0.24.3

- **Trim to 53 asks first.** It lists exactly who moves to the practice squad and who is released before anything happens.
- **No more late cutscenes.** A cutscene that waited out a long simulation only plays if its moment was in the last week, so draft night no longer appears months later.
- **The tutorial welcome waits** for the new head coach's arrival cutscene instead of appearing on top of it.
- **Your desk** on the Club overview shows the decision waiting in your inbox, with a button to answer it.
- **Trade builder** explains its trade-value points and what Contender, Middle and Rebuilding mean.

### Also in 0.24.2 (if you are coming from 0.24.1)

#### Fixed

- **The second season works.** In 0.24.1 the first game of a career's second season failed to finish, because players drafted by computer-controlled clubs had no stats record. Rookies now start with everything they need to play.
- **Head coaches run the whole football operation.** New careers start as head coach, and that role couldn't open the draft, sign, release or trade. Head coaches now make every football decision; stadium projects and league votes stay with the owner.
- New careers no longer start with 90-rated free agents that computer clubs snap up in week one.
- Other clubs' free-agent signings no longer fill your inbox.

#### New

- **Transactions.** League snapshot → Transactions lists every signing, trade, waiver claim, draft pick, release, expired contract and retirement in the league, with contracts. Filter by club, type or season. Each player's profile shows his own history on the Contract tab.
- **Tutorials.** Seven short guided tours point at the real screens: getting started, your squad, contracts and the salary cap, free agency and trades, scouting and the draft, the season, and staff. New players are offered the first one; replay any of them from the **?** button.
- **Help on every screen.** The **?** button opens Help & tutorials: tours with your progress, help for the screen you're on, and a glossary. Terms such as Cap room, Dead money and OVR are underlined and explain themselves when you hover over them.

#### Easier to get around

- When calendar simulation stops for a decision, the decision and its answers appear right there. Answering carries on simulating.
- Anything that stops the simulation links to the screen that fixes it, for example **Fix in Squad** when your roster is over the limit.
- Squad warns when you're over the active-roster limit and offers **Trim to 53 automatically**.
- Player names on every screen open the player's profile.
- Matchday, Tactics, Settings and the other remaining screens now have the **?** button and Jump to links.

#### Look

- Page and panel titles use the readable pixel font; body text and tables stay in the clean font.
- Older screens now share the same colours as the rest of the game.
