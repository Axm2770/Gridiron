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

## New in 0.26.0: a pixel makeover

### Starting a career
- A new, faster career setup: pick a club, name your coach and sign, or customise everything.
- All 32 clubs on one board by division, with real context for each: opening roster rating and rank, what the owner will expect, difficulty, projected wins, best player and starting QB.
- A pixel coach you can shape (outfit, build, hair, colours, glasses, headset) that updates as you go.
- Coaching philosophy choices explain what they actually change.
- It finishes with a signing announcement. Use the arrow keys and Enter to move through it.

### Matchday
- Sim options open fully, with no scrollbar, and are no longer cut off by the field.
- A cleaner match screen: a pixel scoreboard with the situation (down, distance, ball spot, timeouts), tidy controls, a compact call sheet that fits beside the field, and halftime and full-time banners.
- Press conference questions and answers fit on screen.

### Transfers and free agency
- A pixel trade desk: a deal meter showing what you send against what they want, their reasoning as short +/− badges, and your offer as chips you can remove.
- Both sides of a trade are browsed with filters, search and pages instead of long scrolling lists.
- Incoming offers are cards, with a new **Counter** option.
- Free agents can be filtered by position, age, rating and asking price, sorted by any column and paged, and every free agent is listed.

### Draft room
- A pixel war room: draft status, your picks as tokens, and scouting meters.
- The big board is paged, with ability and potential bars, report confidence and roster-need flags.
- The live draft has an on-the-clock banner, a pick ticker with grades, and a trade desk. Each draft ends with a class summary and grades.

### Everywhere
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
