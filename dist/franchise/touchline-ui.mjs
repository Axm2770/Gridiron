import * as S from "./state.mjs";
import {
  lineupActors,
  lineupCandidates,
  lineupSettings,
  changeLineup,
  availableForLineup,
} from "./lineup.mjs";
import {
  playerFace,
  previewAttributes,
  scorePill,
  positionBadge,
} from "./player-ui.mjs";
import { periodLabel } from "./matchday-sim.mjs";
import { icon } from "./presentation.mjs";
const arg = (x) => esc(JSON.stringify(x));
const unitPositions = {
  Offense: ["QB", "RB", "WR", "TE", "OL"],
  Defense: ["DL", "LB", "CB", "S"],
  Specialists: ["K", "P"],
};
export function lineupCoordinates(actors, unit, m) {
  const off = [
      [50, 74],
      [63, 90],
      [8, 29],
      [92, 29],
      [83, 50],
      [27, 54],
      [38.5, 54],
      [50, 54],
      [61.5, 54],
      [73, 54],
      [22, 28],
    ],
    def = [
      [25, 72],
      [42, 72],
      [58, 72],
      [75, 72],
      [24, 47],
      [50, 44],
      [76, 47],
      [8, 23],
      [92, 23],
      [35, 15],
      [65, 15],
    ];
  return actors.map((a, i) => {
    let [x, y] = (unit === "Defense" ? def : off)[i] || [30 + i * 40, 55];
    if (unit === "Specialists") {
      x = 32 + i * 36;
      y = 52;
    }
    if (unit === "Offense") {
      if (m.offense === "I formation" && i === 0) y = 66;
      if (["I formation", "Singleback"].includes(m.offense) && i === 1) {
        x = 50;
        y = 91;
      }
      if (m.offense === "Empty backfield" && i === 1) {
        x = 5;
        y = 49;
      }
      if (i === 10 && a.role === "TE") {
        x = 17;
        y = 51;
      }
      if (i === 10 && a.role === "RB") {
        x = 45;
        y = 89;
      }
      if (i === 4 && a.role === "WR") {
        x = 83;
        y = 27;
      }
      if (m.personnel === "Goal Line" && [2, 3].includes(i)) {
        x = i === 2 ? 14 : 86;
        y = 50;
      }
    }
    if (unit === "Defense" && m.shell === "Zero" && i >= 9) y = 38;
    if (unit === "Defense" && m.shell === "Single-High" && i === 10) {
      x = 50;
      y = 12;
    }
    return { ...a, left: x, top: y };
  });
}
const select = (label, values, value, handler, locked = false) =>
  `<label>${label}<select aria-label="${label}" onchange="${handler}" ${locked ? "disabled" : ""}>${values.map((x) => `<option ${x === value ? "selected" : ""}>${x}</option>`).join("")}</select></label>`;
export function installTouchlineUI({ isBusy }) {
  let tab = "Live",
    unit = "Offense",
    slot = 0,
    lineupModal = false,
    error = "",
    simTarget = "quarter";
  const locked = () => isBusy() || animating;
  const roleCan = (side) =>
    S.allowed(state, "coach") ||
    S.allowed(state, "roster") ||
    (state.franchise.role === "OC" && side !== "Defense") ||
    (state.franchise.role === "DC" && side === "Defense");
  function changeSetting(key, value) {
    if (locked()) {
      toast("Adjustments are available between plays.");
      return;
    }
    if (state.live) {
      matchSetting(key, value);
      return;
    }
    const offense = ["offense", "personnel"].includes(key),
      role = state.franchise.role;
    if (
      role === "GM" ||
      (role === "OC" && !offense) ||
      (role === "DC" && offense)
    ) {
      toast("That adjustment is delegated to your staff.");
      return;
    }
    state.coach[key] = value;
    save();
    render();
  }
  function boardHTML() {
    const m = lineupSettings(state),
      actors = lineupActors(state, unit),
      points = lineupCoordinates(actors, unit, m);
    slot = Math.min(slot, actors.length - 1);
    const selected = actors[slot],
      p = selected?.p,
      candidates = lineupCandidates(state, unit, slot),
      mean =
        actors
          .filter((a) => a.p)
          .reduce((n, a) => n + (a.p.fitness ?? 100), 0) /
        Math.max(1, actors.filter((a) => a.p).length);
    return `<div class="touch-lineup"><div class="touch-lineup-toolbar"><div class="touch-segments">${Object.keys(
      unitPositions,
    )
      .map(
        (v) =>
          `<button class="${unit === v ? "active" : ""}" aria-pressed="${unit === v}" onclick="Touch.unit('${v}')">${v}</button>`,
      )
      .join(
        "",
      )}</div><span>${actors.filter((a) => a.p).length}/${actors.length} assigned <i>●</i> ${Math.round(mean)}% average condition</span>${lineupModal ? '<button class="icon-button" aria-label="Close lineup board" onclick="closeModal()">×</button>' : ""}</div><div class="touch-lineup-layout"><section><div class="touch-formation-controls">${unit === "Offense" ? select("Formation", offenses, m.offense, "Touch.setting('offense',this.value)", locked()) + select("Personnel", ["11", "12", "21", "10", "Goal Line"], m.personnel || "11", "Touch.setting('personnel',this.value)", locked()) : unit === "Defense" ? select("Defensive front", defenses, m.defense, "Touch.setting('defense',this.value)", locked()) + select("Disguise shell", ["2-High", "Single-High", "Zero"], m.shell || "2-High", "Touch.setting('shell',this.value)", locked()) : "<p>Kicker and punter selection. Full return and coverage units are delegated in this prototype.</p>"}</div><div class="touch-tactics-field ${unit.toLowerCase()}"><div class="touch-field-endzone">${esc(clubs[state.team][2].toUpperCase())}</div><div class="touch-field-watermark">${logo(state.team)}</div><div class="touch-field-midline"></div><span class="touch-attack-direction">${unit === "Defense" ? "DEFEND ↓" : "ATTACK ↑"}</span>${points.map((a) => `<button class="touch-lineup-player ${slot === a.index ? "selected" : ""} ${!a.p ? "vacant" : ""}" style="--player-x:${a.left}%;--player-y:${a.top}%" onclick="Touch.select(${a.index})" aria-label="Select ${a.p ? esc(a.p.name) : "vacant " + a.role} at ${a.role}" aria-pressed="${slot === a.index}">${a.p ? playerFace(a.p) : '<span class="touch-vacancy">＋</span>'}<i>${a.role}</i><b>${esc(a.p?.name.split(" ").at(-1) || "Vacant")}</b><span>${a.p ? `${a.p.ovr} <em class="${a.p.fitness < 65 ? "low" : ""}">${Math.round(a.p.fitness ?? 100)}%</em>` : "Assign player"}</span></button>`).join("")}</div><p class="touch-lineup-note">Select a player on the field, then choose a replacement. Changes affect the next snap in live and quick simulation. Injured, inactive and unavailable players are excluded.</p></section><section class="touch-bench"><div class="touch-bench-heading"><span>SELECTED SLOT / ${selected?.role || "—"}</span><h3>${esc(p?.name || "Vacant position")}</h3>${p ? `<div>${scorePill("rating", p.ovr)} OVR ${scorePill("condition", p.fitness)} condition <button class="link" onclick="W.player(${arg(p.id)},${state.team})">Full profile →</button></div>` : ""}</div>${error ? `<p class="touch-error" role="alert">${esc(error)}</p>` : ""}<div class="touch-bench-label"><b>Available replacements</b><span>${candidates.length}</span></div><div class="touch-reserve-list">${candidates.map((q) => `<button onclick="Touch.swap(${arg(q.id)})" ${locked() || !roleCan(unit) ? "disabled" : ""}>${playerFace(q)}<span><b>${esc(q.name)}</b><small>${q.realPosition || q.pos} · ${q.age} years · ${q.starter ? "Current starter" : "Reserve"}</small></span><strong>${q.ovr}<small class="${q.fitness < 65 ? "negative" : ""}">${Math.round(q.fitness ?? 100)}%</small></strong>${icon("arrow")}</button>`).join("") || '<div class="touch-empty-bench"><h3>No eligible replacements.</h3><p>Check the active roster and injury list. Players already in this unit cannot occupy a second slot.</p></div>'}</div><div class="touch-bench-foot"><span>Condition key</span><i class="green-dot"></i> Ready <i class="amber-dot"></i> Monitor <i class="red-dot"></i> Fatigued</div><button class="secondary small" onclick="Touch.assistantDepth()" ${locked() || !(S.allowed(state, "coach") || S.allowed(state, "roster")) ? "disabled" : ""}>Assistant depth chart</button></section></div></div>`;
  }
  function drawBoard() {
    if (lineupModal) {
      modal(
        `<div class="touch-board-dialog"><div class="touch-board-title"><span class="eyebrow">${state.live ? "SIDELINE / NEXT SNAP" : "MATCH PREPARATION"}</span><h2>Your team. In position.</h2></div>${boardHTML()}</div>`,
      );
      document.getElementById("modal").classList.add("touch-lineup-dialog");
    } else render();
  }
  function preMatch() {
    const g = game();
    if (!g)
      return `<section class="touch-no-match"><div>${icon("calendar")}</div><span class="eyebrow">THE SIDELINE</span><h2>${state.phase === "offseason" ? "Plan the next chapter." : "No fixture at this stage."}</h2><p>Review your squad or advance the competition from the front office.</p><button onclick="W.open('Overview')">Return to club overview →</button><button class="secondary" onclick="W.open('Schedule')">View schedule</button></section>`;
    const a = g.a,
      b = g.b,
      ready = state.roster.filter(availableForLineup),
      average = Math.round(
        ready.reduce((n, p) => n + (p.fitness ?? 100), 0) /
          Math.max(1, ready.length),
      );
    return `<div class="touch-pregame"><div class="touch-prematch-hero"><div class="touch-prematch-top"><span>GRIDIRON / MATCHDAY</span><b>${state.year} · ${phaseName()}</b><span>${esc(state.franchise.clubs[g.a].stadium.name)}</span></div><div class="touch-prematch-teams"><div>${logo(a)}<h2>${clubs[a][2]}</h2><span>HOME · ${state.teams[a].w}–${state.teams[a].l}</span></div><div class="touch-vs">VS<small>THE NEXT CHAPTER</small></div><div>${logo(b)}<h2>${clubs[b][2]}</h2><span>AWAY · ${state.teams[b].w}–${state.teams[b].l}</span></div></div><div class="touch-match-readiness"><span><b>${ready.length}</b> available players</span><span><b>${average}%</b> average condition</span><span><b>${state.franchise.preparation.familiarity}%</b> scheme familiarity</span></div></div><div class="touch-entry-grid"><button class="touch-entry-card featured" onclick="beginLive()">${icon("play")}<span>TAKE THE HEADSET</span><h3>Coach live</h3><p>Every snap, every adjustment. Watch the game and lead from the sideline.</p><b>Enter the stadium →</b></button><button class="touch-entry-card" onclick="MD.start('halftime')">${icon("calendar")}<span>HAND OVER, THEN TAKE OVER</span><h3>Join at halftime</h3><p>Your staff handles the opening half. Take control at the break.</p><b>Sim to halftime →</b></button><button class="touch-entry-card" onclick="MD.start('final')">${icon("chart")}<span>TRUST YOUR STAFF</span><h3>Simulate game</h3><p>Delegate the game, then review the score, moments and player production.</p><b>Sim full game →</b></button></div><div class="touch-preparation-row"><div><span class="eyebrow">TEAM SELECTION</span><h3>See the shape. Set the people.</h3><p>${esc(state.coach.offense)} · ${esc(state.coach.defense)} · Change personnel before kickoff.</p></div><button onclick="Touch.lineup()">${icon("users")} Interactive lineup</button><button class="secondary" onclick="CI.open('pre')">${icon("mic")} Pregame interview</button></div>${state.lastMatch ? `<details class="touch-last-game"><summary>Last match report ${icon("chevron")}</summary>${postgameCard(state.lastMatch)}</details>` : ""}</div>`;
  }
  function routeArt(call) {
    const paths = {
      "Inside run": "M45 49V13l-8 9m8-9 8 9",
      "Outside run": "M32 50V33Q32 27 44 27H78l-9-7m9 7-9 7",
      "Quick pass": "M20 50V33H75l-8-7m8 7-8 7",
      "Deep pass": "M25 53V11l-7 8m7-8 7 8",
      "Play action": "M45 51v-8l-12 5m12-5V15h30l-8-7m8 7-8 7",
      Screen: "M28 49L15 35H67l-8-7m8 7-8 7",
      Punt: "M30 49Q42 3 75 15l-9-5m9 5-8 6",
      "Field goal": "M31 15v16h37V15M50 31v22M50 14V4",
      "Cover 2": "M12 20Q25 6 40 20M55 20Q70 6 85 20M48 52V31",
      "Man coverage": "M20 48V19M45 48V19M70 48V19",
      "All-out blitz": "M15 10L40 50M48 10V50M80 10L55 50",
      "Zone blitz": "M15 10L40 50M75 10Q50 15 65 35",
      "Run contain": "M15 12v30l20 9M80 12v30l-20 9",
      Prevent: "M13 17Q25 3 40 17M56 17Q70 3 85 17M45 55V35",
    };
    return `<svg viewBox="0 0 100 60" aria-hidden="true"><path d="${paths[call] || "M15 18Q30 5 45 18M55 18Q70 5 85 18M20 48V33M50 48V33M80 48V33"}"/><circle cx="45" cy="52" r="3"/></svg>`;
  }
  function callSheet(m) {
    const off = onOffense(m),
      role = state.franchise.role,
      delegated =
        role === "GM" || (role === "DC" && off) || (role === "OC" && !off),
      disable = locked() || m.finished || m.halftime || delegated;
    return `<section class="touch-calls"><div class="touch-panel-heading"><span>${off ? "OFFENSIVE" : "DEFENSIVE"} CALL SHEET</span><b>${delegated ? "Delegated" : state.coach.calling === "Manual" ? "You are calling" : "Staff playcalling"}</b></div><div class="touch-call-formation">${select(off ? "Offensive formation" : "Defensive personnel", off ? offenses : defenses, off ? m.offense : m.defense, `Touch.setting('${off ? "offense" : "defense"}',this.value)`, disable)}${off ? select("Personnel", ["11", "12", "21", "10", "Goal Line"], m.personnel || "11", "Touch.setting('personnel',this.value)", disable) : select("Disguise shell", ["2-High", "Single-High", "Zero"], m.shell || "2-High", "Touch.setting('shell',this.value)", disable)}</div><div class="touch-play-grid">${(off ? offCalls : defCalls).map(([call, description]) => `<button class="touch-play ${m[off ? "call" : "defCall"] === call ? "selected" : ""} ${["Punt", "Field goal"].includes(call) ? "special-play" : ""}" aria-pressed="${m[off ? "call" : "defCall"] === call}" onclick="Touch.setting('${off ? "call" : "defCall"}',${arg(call)})" ${disable ? "disabled" : ""}>${routeArt(call)}<b>${call}</b><small>${description}</small></button>`).join("")}</div><div class="touch-tempo"><span>TEMPO</span><div>${["Normal", "Hurry-up", "Chew clock"].map((v) => `<button class="${m.tempo === v ? "active" : ""}" onclick="Touch.setting('tempo',${arg(v)})" ${disable ? "disabled" : ""}>${v}</button>`).join("")}</div></div><label class="touch-playcaller">Playcaller<select aria-label="Matchday playcaller" onchange="changeCaller(this.value);render()" ${disable ? "disabled" : ""}>${["Manual", "Head coach"].map((v) => `<option ${state.coach.calling === v ? "selected" : ""}>${v}</option>`).join("")}</select></label><button class="touch-open-lineup secondary" onclick="Touch.lineup()" ${locked() ? "disabled" : ""}>${icon("users")} View team & replacements ${icon("arrow")}</button></section>`;
  }
  function matchCentre(m) {
    return `<div class="touch-centre-grid"><section class="panel"><div class="panel-head"><h2>Game flow</h2><span>${m.plays} snaps</span></div><div class="touch-event-feed" aria-live="polite">${
      m.events
        .slice(0, 40)
        .map(
          (e) =>
            `<div class="${e.highlight ? "key-moment" : ""}"><time>${esc(e.time)}</time><p>${esc(e.text)}</p></div>`,
        )
        .join("") || '<p class="pad">The game story begins at kickoff.</p>'
    }</div></section><section class="panel"><div class="panel-head"><h2>Match statistics</h2><span>${clubs[m.a][0]} / ${clubs[m.b][0]}</span></div><div class="touch-stat-comparison">${[
      ["yards", "Total yards"],
      ["pass", "Passing yards"],
      ["rush", "Rushing yards"],
      ["first", "First downs"],
      ["turnovers", "Turnovers"],
      ["plays", "Plays"],
    ]
      .map(([key, label]) => {
        const a = m.stats[0][key],
          b = m.stats[1][key],
          total = Math.max(1, a + b);
        return `<div><span><b>${a}</b><small>${label}</small><b>${b}</b></span><i><em style="width:${(a / total) * 100}%"></em></i></div>`;
      })
      .join(
        "",
      )}</div><div class="touch-period-grid"><span>PERIOD</span>${m.periodScores.map((_, i) => `<b>${i < 4 ? "Q" + (i + 1) : "OT"}</b>`).join("")}<span>${clubs[m.a][0]}</span>${m.periodScores.map((p) => `<b>${p[0]}</b>`).join("")}<span>${clubs[m.b][0]}</span>${m.periodScores.map((p) => `<b>${p[1]}</b>`).join("")}</div></section></div>`;
  }
  matchScreen = function () {
    const m = state.live;
    if (!m) return preMatch();
    const own = teamIndex(m),
      off = onOffense(m),
      time = periodLabel(m),
      disabled = locked() || m.finished || m.halftime;
    const visual = liveField(m).replace(
      /(<div class="motion-preview">[\s\S]*?<\/div>)/,
      '<details class="touch-animation-lab"><summary>Animation lab · preview only</summary>$1</details>',
    );
    const targets = [
      ["play", "Next play"],
      ["five", "Next 5 plays"],
      ["drive", "Next possession"],
      ["quarter", "End current quarter"],
      ["halftime", "Halftime"],
      ["q2", "Start Q2"],
      ["q3", "Start Q3"],
      ["q4", "Start Q4"],
      ["final", "Full game"],
    ]
      .filter(([key]) => key !== "halftime" || (m.quarter < 3 && !m.halftime))
      .filter(([key]) => !/^q[234]$/.test(key) || Number(key[1]) > m.quarter);
    if (!targets.some(([key]) => key === simTarget)) simTarget = "quarter";
    const recap = m.quickSimRecap;
    return `<div class="touch-app" aria-busy="${isBusy()}"><div class="touch-scoreboard"><div class="touch-score-team ${m.poss === 0 ? "possession" : ""}">${logo(m.a)}<span><b>${clubs[m.a][2]}</b><small>HOME ${m.a === state.team ? "· YOUR TEAM" : ""}</small></span><strong>${m.score[0]}</strong></div><div class="touch-score-clock"><span>${m.finished ? "FINAL" : m.halftime ? "HALFTIME" : autoTimer ? "● LIVE" : "● PAUSED"}</span><b>${m.finished ? "FT" : m.halftime ? "HT" : clockText(m)}</b><small>${m.quarter > 4 ? "OVERTIME" : "QUARTER " + m.quarter}</small></div><div class="touch-score-team away ${m.poss === 1 ? "possession" : ""}"><strong>${m.score[1]}</strong><span><b>${clubs[m.b][2]}</b><small>AWAY ${m.b === state.team ? "· YOUR TEAM" : ""}</small></span>${logo(m.b)}</div></div><div class="touch-situation"><span class="touch-unit-label ${off ? "offense" : "defense"}">${off ? "YOUR OFFENSE" : "YOUR DEFENSE"}</span><strong>${m.down}${["st", "nd", "rd", "th"][m.down - 1] || "th"} & ${m.toGo}</strong><span>${fieldPosition(m)}</span><span class="touch-timeouts">TIMEOUTS <b>${"●".repeat(m.timeouts[own])}<i>${"○".repeat(3 - m.timeouts[own])}</i></b></span></div><div class="touch-control-rail"><div class="touch-view-tabs">${["Live", "Team lineup", "Match centre"].map((v) => `<button class="${tab === v ? "active" : ""}" aria-pressed="${tab === v}" onclick="Touch.tab('${v}')" ${locked() ? "disabled" : ""}>${icon(v === "Live" ? "play" : v === "Team lineup" ? "users" : "chart")}${v}</button>`).join("")}</div><div class="touch-sim-menu"><label>Skip to<select aria-label="Simulation stopping point" onchange="Touch.target(this.value)" ${locked() || m.finished ? "disabled" : ""}>${targets.map(([key, label]) => `<option value="${key}" ${simTarget === key ? "selected" : ""}>${label}</option>`).join("")}</select></label><label class="touch-sim-caller">Caller<select aria-label="Quick sim playcalling" onchange="MD.calling(this.value)" ${locked() || m.finished ? "disabled" : ""}><option value="Assistant" ${(window.MD?.preference?.() || "Assistant") === "Assistant" ? "selected" : ""}>Assistant</option><option value="Manual" ${window.MD?.preference?.() === "Manual" ? "selected" : ""}>Selected play</option></select></label><button class="secondary small" onclick="Touch.sim()" ${locked() || m.finished ? "disabled" : ""}>${isBusy() ? "Simulating…" : "Advance →"}</button></div></div>${recap && !recap.dismissed ? `<div class="touch-sim-notice" role="status"><span>${icon("check")} ${recap.plays} plays simulated · ${esc(recap.from)} → ${esc(recap.to)}</span><button class="link" onclick="Touch.dismissRecap()">Dismiss</button></div>` : ""}${m.halftime ? '<div class="touch-break-banner"><div><b>Make the halftime adjustment.</b><span>Talk to your players or change the team before the second half.</span></div><button onclick="halftimeTalk()">Enter the locker room →</button></div>' : m.finished ? '<div class="touch-break-banner final"><div><b>The final whistle.</b><span>Review the match, commit the result and face the media.</span></div><button onclick="commitMatch()">Postgame report →</button></div>' : ""}${
      tab === "Team lineup"
        ? boardHTML()
        : tab === "Match centre"
          ? matchCentre(m)
          : `<div class="touch-live-grid"><section class="touch-broadcast"><div class="touch-broadcast-heading"><span>${icon("play")} STADIUM FEED</span><b>${esc(state.franchise.clubs[m.a].stadium.name)}</b>${select("Weather", ["Clear", "Rain", "Wind"], m.weather || "Clear", "Touch.setting('weather',this.value)", locked())}</div><div class="match-controls touch-match-actions"><button class="touch-snap" onclick="snap()" ${disabled ? "disabled" : ""}>${icon("play")} ${animating ? "Play in motion…" : "Snap ball"}</button><button class="secondary" onclick="toggleAuto()" ${isBusy() || (animating && !autoTimer) || m.finished || m.halftime ? "disabled" : ""}>${autoTimer ? "Ⅱ Pause auto" : "Auto play"}</button><button class="secondary" onclick="timeout()" ${disabled || !m.timeouts[own] ? "disabled" : ""}>Timeout <small>${m.timeouts[own]} left</small></button><button class="secondary" onclick="Touch.lineup()" ${locked() ? "disabled" : ""}>${icon("users")} Replace</button></div><div class="touch-field-key">Colored jerseys: offense · White jerseys: defense | Blue: scrimmage | Yellow: first down</div>${visual}<div class="touch-coordinator"><span>${icon("briefcase")}</span><div><b>${esc(state.coach.name)} / SIDELINE</b><p>${esc(advice(m))}</p></div></div><div class="touch-booth"><div><b>THE BROADCAST BOOTH</b><button class="link" onclick="broadcast.toggle()">${window.broadcast?.director.enabled ? "Commentary on" : "Enable commentary"}</button><button class="link" onclick="broadcast.settings()">Voice settings</button></div><p id="broadcast-caption" aria-live="polite">${esc(m.commentary?.at(-1)?.text || "The teams are set. Make your call for the next snap.")}</p></div><div class="touch-mini-stats">${[
              ["yards", "YARDS"],
              ["first", "FIRST DOWNS"],
              ["turnovers", "TURNOVERS"],
            ]
              .map(
                ([key, label]) =>
                  `<div><b>${m.stats[0][key]} <span>–</span> ${m.stats[1][key]}</b><small>${label}</small></div>`,
              )
              .join("")}</div></section>${callSheet(m)}</div>`
    }</div>`;
  };
  window.Touch = {
    tab(v) {
      if (locked()) return;
      pauseAuto();
      tab = v;
      lineupModal = false;
      error = "";
      render();
    },
    lineup() {
      if (locked()) {
        toast("Wait for the current play or simulation to finish.");
        return;
      }
      pauseAuto();
      lineupModal = true;
      unit = state.live
        ? onOffense(state.live)
          ? "Offense"
          : "Defense"
        : "Offense";
      slot = 0;
      error = "";
      drawBoard();
    },
    unit(v) {
      unit = v;
      slot = 0;
      error = "";
      drawBoard();
    },
    select(i) {
      slot = i;
      error = "";
      drawBoard();
    },
    swap(id) {
      if (locked()) return;
      try {
        state = S.transact(state, (s) => changeLineup(s, unit, slot, id));
        save();
        error = "";
        render();
        drawBoard();
        toast("Lineup updated for the next snap.");
      } catch (e) {
        error = e.message;
        drawBoard();
      }
    },
    setting(k, v) {
      changeSetting(k, v);
      if (lineupModal) drawBoard();
    },
    target(v) {
      simTarget = v;
    },
    sim() {
      if (locked()) return;
      MD.run(simTarget);
    },
    dismissRecap() {
      if (state.live?.quickSimRecap) state.live.quickSimRecap.dismissed = true;
      render();
    },
    assistantDepth() {
      if (locked()) return;
      if (!(S.allowed(state, "coach") || S.allowed(state, "roster"))) return;
      F.depth();
      drawBoard();
    },
  };
  // Keep legacy squad promotions and assistant selection consistent with custom match ordering.
  const clearOrder = (position) => {
    for (const p of state.roster)
      if (p.depthTeam === state.team && (!position || p.pos === position)) {
        delete p.depthPriority;
        delete p.depthTeam;
      }
  };
  for (const name of ["toggleStarter", "subPlayer"]) {
    const before = window[name];
    if (typeof before !== "function") continue;
    window[name] = function (...args) {
      const id = args[0],
        p = state.roster.find((q) => q.id === id),
        position = p?.pos;
      const prior = JSON.stringify(
        state.roster
          .filter((q) => q.pos === position)
          .map((q) => [q.id, q.starter]),
      );
      const result = before.apply(this, args);
      const after = JSON.stringify(
        state.roster
          .filter((q) => q.pos === position)
          .map((q) => [q.id, q.starter]),
      );
      if (position && prior !== after) {
        clearOrder(position);
        save();
        render();
      }
      return result;
    };
  }
  if (typeof F.depth === "function") {
    const optimize = F.depth;
    F.depth = function () {
      if (locked()) return;
      if (S.allowed(state, "coach") || S.allowed(state, "roster")) clearOrder();
      return optimize();
    };
  }
  showSubs = () => Touch.lineup();
  document.getElementById("modal").addEventListener("close", () => {
    lineupModal = false;
    document.getElementById("modal").classList.remove("touch-lineup-dialog");
  });
  const oldModal = modal;
  modal = function (html) {
    document.getElementById("modal").classList.remove("touch-lineup-dialog");
    oldModal(html);
  };
  const previousRender = render;
  render = function () {
    previousRender();
    document.body.classList.toggle("matchday-app", view === "Matchday");
    if (view === "Matchday") {
      const title = document.querySelector("#app>.title-row h1");
      if (title) title.textContent = "Matchday";
    }
  };
  const previousBegin = beginLive;
  beginLive = function (...args) {
    tab = "Live";
    const prior = state.live;
    const result = previousBegin(...args);
    if (!prior && state.live) {
      state.live.personnel = state.coach.personnel || "11";
      state.live.shell = state.coach.shell || "2-High";
      render();
    }
    return result;
  };
}
