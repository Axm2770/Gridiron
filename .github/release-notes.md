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

If you have 0.24.1 or 0.24.2, the game offers this update in-game: choose **Download now**, then **Restart now**. Your careers are untouched. On 0.23.0 or earlier, download this version once from this page.

## New in 0.24.3

- **Trim to 53 asks first.** It lists exactly who moves to the practice squad and who is released before anything happens.
- **No more late cutscenes.** A cutscene that waited out a long simulation only plays if its moment was in the last week, so draft night no longer appears months later.
- **The tutorial welcome waits** for the new head coach's arrival cutscene instead of appearing on top of it.
- **Your desk** on the Club overview shows the decision waiting in your inbox, with a button to answer it.
- **Trade builder** explains its trade-value points and what Contender, Middle and Rebuilding mean.

## Also in 0.24.2 (if you are coming from 0.24.1)

### Fixed

- **The second season works.** In 0.24.1 the first game of a career's second season failed to finish, because players drafted by computer-controlled clubs had no stats record. Rookies now start with everything they need to play.
- **Head coaches run the whole football operation.** New careers start as head coach, and that role couldn't open the draft, sign, release or trade. Head coaches now make every football decision; stadium projects and league votes stay with the owner.
- New careers no longer start with 90-rated free agents that computer clubs snap up in week one.
- Other clubs' free-agent signings no longer fill your inbox.

### New

- **Transactions.** League snapshot → Transactions lists every signing, trade, waiver claim, draft pick, release, expired contract and retirement in the league, with contracts. Filter by club, type or season. Each player's profile shows his own history on the Contract tab.
- **Tutorials.** Seven short guided tours point at the real screens: getting started, your squad, contracts and the salary cap, free agency and trades, scouting and the draft, the season, and staff. New players are offered the first one; replay any of them from the **?** button.
- **Help on every screen.** The **?** button opens Help & tutorials: tours with your progress, help for the screen you're on, and a glossary. Terms such as Cap room, Dead money and OVR are underlined and explain themselves when you hover over them.

### Easier to get around

- When calendar simulation stops for a decision, the decision and its answers appear right there. Answering carries on simulating.
- Anything that stops the simulation links to the screen that fixes it, for example **Fix in Squad** when your roster is over the limit.
- Squad warns when you're over the active-roster limit and offers **Trim to 53 automatically**.
- Player names on every screen open the player's profile.
- Matchday, Tactics, Settings and the other remaining screens now have the **?** button and Jump to links.

### Look

- Page and panel titles use the readable pixel font; body text and tables stay in the clean font.
- Older screens now share the same colours as the rest of the game.
