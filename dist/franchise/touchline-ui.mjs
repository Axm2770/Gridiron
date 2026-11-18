import * as S from "./state.mjs";
import { lineupSettings, availableForLineup } from "./lineup.mjs";
import {
  playerFace,
  previewAttributes,
  scorePill,
  positionBadge,
} from "./player-ui.mjs";
import { periodLabel } from "./matchday-sim.mjs";
import { icon } from "./presentation.mjs";
import { textNotice } from "../ui/notice.mjs";
import { gameForecast, WEATHER_ICON } from "./weather.mjs";
import { TEAM_COLORS } from "../presentation/team-colors.mjs";
import { lineupController } from "./lineup-ui.mjs";
import { formationLayout } from "./lineup-layout.mjs";
// Matchday styles (pixel panels, scoreboard, sim options popover) load after the theme sheets.
function loadMatchdayStyles() {
  try {
    if (typeof document === "undefined" || !document.head || document.getElementById("gd-matchday-css")) return;
    const link = document.createElement("link");
    link.id = "gd-matchday-css";
    link.rel = "stylesheet";
    link.href = new URL("../ui/matchday.css", import.meta.url).href;
    document.head.appendChild(link);
  } catch {}
}
const ordinalDown = (d) => `${d}${["st", "nd", "rd", "th"][d - 1] || "th"}`;
const pips = (n) => `<b class="touch-pips" aria-label="${n} of 3">${"■".repeat(Math.max(0, n))}<i>${"□".repeat(Math.max(0, 3 - n))}</i></b>`;
const arg = (x) => esc(JSON.stringify(x));
// Field positions (percent of the field box, token centre) for each slot, from the shared
// formation layout (lineup-layout.mjs) that the visual lineup draws.
export function lineupCoordinates(actors, unit, m) {
  const tokens = formationLayout(actors, unit, m || {}).tokens;
  return actors.map((a, i) => ({ ...a, left: +(tokens[i].left + tokens[i].width / 2).toFixed(2), top: +(tokens[i].top + tokens[i].height / 2).toFixed(2) }));
}
// Weather is set by the stadium and the date (franchise/weather.mjs); shown, never chosen.
const weatherChip = (m) => {
  const f = gameForecast(state, m) || {};
  const cond = m.weather || f.condition || "Clear";
  return `<span class="touch-weather" title="Set by the stadium, its roof and the time of year">${WEATHER_ICON[cond] || ""} ${esc(cond === "Dome" ? "Indoors" : cond)}${f.temp != null ? ` · ${f.temp}°F` : ""}</span>`;
};
const select = (label, values, value, handler, locked = false) =>
  `<label>${label}<select aria-label="${label}" onchange="${handler}" ${locked ? "disabled" : ""}>${values.map((x) => `<option ${x === value ? "selected" : ""}>${x}</option>`).join("")}</select></label>`;
export function installTouchlineUI({ isBusy }) {
  loadMatchdayStyles();
  // The sim options popover closes on an outside click or Escape, like any menu.
  const closeSimPopover = (event) => {
    const pop = document.querySelector?.(".sim-options-pop[open]");
    if (!pop || (event.type === "keydown" && event.key !== "Escape") || (event.type === "pointerdown" && pop.contains(event.target))) return;
    pop.open = false;
    window.__simPop = false;
  };
  document.addEventListener?.("pointerdown", closeSimPopover);
  document.addEventListener?.("keydown", closeSimPopover);
  let tab = "Live",
    lineupModal = false,
    error = "",
    simTarget = "quarter",
    shownFinal = null;
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
  // The matchday Team lineup is the shared visual lineup (lineup-ui.mjs) with the formation
  // controls on top; selection, drag and drop, swaps and undo all live in that one controller.
  function boardHTML() {
    const m = lineupSettings(state),
      LU = lineupController({ isBusy }),
      unit = LU.current().unit;
    const pick = (label, values, value, handler) =>
      `<label class="lu-pick"><span class="lu-sr">${label}</span><select aria-label="${label}" title="${label}" onchange="${handler}" ${locked() ? "disabled" : ""}>${values.map((x) => `<option ${x === value ? "selected" : ""}>${x}</option>`).join("")}</select></label>`;
    const head = `<div class="lu-formation">${unit === "Offense" ? pick("Formation", offenses, m.offense, "Touch.setting('offense',this.value)") + pick("Personnel", ["11", "12", "21", "10", "Goal Line"], m.personnel || "11", "Touch.setting('personnel',this.value)") : unit === "Defense" ? pick("Defensive front", defenses, m.defense, "Touch.setting('defense',this.value)") + pick("Disguise shell", ["2-High", "Single-High", "Zero"], m.shell || "2-High", "Touch.setting('shell',this.value)") : "<p>Kicker and punter. Return and coverage units fill automatically.</p>"}<button type="button" class="secondary small" onclick="Touch.assistantDepth()" ${locked() || !(S.allowed(state, "coach") || S.allowed(state, "roster")) ? "disabled" : ""}>Assistant depth</button></div>`;
    return `<div class="touch-lineup">${LU.board("match", { head, redraw: drawBoard, tools: lineupModal ? '<button type="button" class="icon-button lu-close" aria-label="Close lineup board" onclick="closeModal()">×</button>' : "" })}</div>`;
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
    return `<div class="touch-pregame"><div class="touch-prematch-hero" style="--home:${TEAM_COLORS[a] || "var(--team)"};--away:${TEAM_COLORS[b] || "var(--team)"}"><div class="touch-prematch-top"><span></span><b>${state.year} · ${phaseName()}</b><span>${esc(state.franchise.clubs[g.a].stadium.name)}</span></div><div class="touch-prematch-teams"><div>${logo(a)}<h2>${clubs[a][2]}</h2><span>HOME · ${state.teams[a].w}–${state.teams[a].l}</span></div><div class="touch-vs">VS</div><div>${logo(b)}<h2>${clubs[b][2]}</h2><span>AWAY · ${state.teams[b].w}–${state.teams[b].l}</span></div></div><div class="touch-match-readiness"><span><b>${ready.length}</b> available players</span><span><b>${average}%</b> average condition</span><span><b>${state.franchise.preparation.familiarity}%</b> scheme familiarity</span></div></div><div class="touch-entry-grid"><button class="touch-entry-card featured" onclick="beginLive()">${icon("play")}<span>TAKE THE HEADSET</span><h3>Coach live</h3><p>Every snap, every adjustment. Watch the game and lead from the sideline.</p><b>Enter the stadium →</b></button><button class="touch-entry-card" onclick="MD.start('halftime')">${icon("calendar")}<span>HAND OVER, THEN TAKE OVER</span><h3>Join at halftime</h3><p>Your staff handles the opening half. Take control at the break.</p><b>Sim to halftime →</b></button><button class="touch-entry-card" onclick="MD.start('final')">${icon("chart")}<span>TRUST YOUR STAFF</span><h3>Simulate game</h3><p>Delegate the game, then review the score, moments and player production.</p><b>Sim full game →</b></button></div><div class="touch-preparation-row"><div><span class="eyebrow">TEAM SELECTION</span><h3>See the shape. Set the people.</h3><p>${esc(state.coach.offense)} · ${esc(state.coach.defense)} · Change personnel before kickoff.</p></div><button onclick="Touch.lineup()">${icon("users")} Interactive lineup</button><button class="secondary" onclick="CI.open('pre')">${icon("mic")} Pregame interview</button></div>${state.lastMatch ? `<details class="touch-last-game"><summary>Last match report ${icon("chevron")}</summary>${postgameCard(state.lastMatch)}</details>` : ""}</div>`;
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
      disable = locked() || m.finished || m.halftime || delegated,
      // While the head coach/staff is calling, the sheet shows their calls but is read-only.
      staff = !delegated && state.coach.calling !== "Manual",
      lockCalls = disable || staff;
    return `<section class="touch-calls ${staff ? "staff-calling" : ""}"><div class="touch-panel-heading"><span>${off ? "OFFENSIVE" : "DEFENSIVE"} CALL SHEET</span><b>${delegated ? "Delegated" : state.coach.calling === "Manual" ? "You are calling" : "Staff playcalling"}</b></div>${staff ? `<p class="touch-staff-note" role="status">The head coach is calling plays. Set <b>Playcaller</b> to <b>Manual</b> to make the calls yourself.</p>` : ""}<div class="touch-call-formation">${select(off ? "Offensive formation" : "Defensive personnel", off ? offenses : defenses, off ? m.offense : m.defense, `Touch.setting('${off ? "offense" : "defense"}',this.value)`, lockCalls)}${off ? select("Personnel", ["11", "12", "21", "10", "Goal Line"], m.personnel || "11", "Touch.setting('personnel',this.value)", lockCalls) : select("Disguise shell", ["2-High", "Single-High", "Zero"], m.shell || "2-High", "Touch.setting('shell',this.value)", lockCalls)}</div><div class="touch-play-grid">${(off ? offCalls : defCalls).map(([call, description]) => `<button class="touch-play ${m[off ? "call" : "defCall"] === call ? "selected" : ""} ${["Punt", "Field goal"].includes(call) ? "special-play" : ""}" aria-pressed="${m[off ? "call" : "defCall"] === call}" title="${esc(call)}: ${esc(description)}" onclick="Touch.setting('${off ? "call" : "defCall"}',${arg(call)})" ${lockCalls ? "disabled" : ""}>${routeArt(call)}<b>${call}</b><small>${description}</small></button>`).join("")}</div><div class="touch-tempo"><span>TEMPO</span><div>${["Normal", "Hurry-up", "Chew clock"].map((v) => `<button class="${m.tempo === v ? "active" : ""}" onclick="Touch.setting('tempo',${arg(v)})" ${lockCalls ? "disabled" : ""}>${v}</button>`).join("")}</div></div><label class="touch-playcaller">Playcaller<select aria-label="Matchday playcaller" onchange="changeCaller(this.value);render()" ${disable ? "disabled" : ""}>${["Manual", "Head coach"].map((v) => `<option ${state.coach.calling === v ? "selected" : ""}>${v}</option>`).join("")}</select></label><button class="touch-open-lineup secondary" onclick="Touch.lineup()" ${locked() ? "disabled" : ""}>${icon("users")} View team & replacements ${icon("arrow")}</button></section>`;
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
    // At the final whistle the box score is the useful view; open it once, the Live tab stays available.
    const finalKey = m.finished ? `${state.year}:${state.week}:${m.a}:${m.b}` : null;
    if (finalKey && finalKey !== shownFinal) {
      shownFinal = finalKey;
      if (tab === "Live") tab = "Match centre";
    }
    const visual = liveField(m);
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
    const live = !m.finished && !m.halftime,
      lead = m.score[0] === m.score[1] ? -1 : m.score[0] > m.score[1] ? 0 : 1,
      goal = m.spot + m.toGo >= 100,
      situation = m.finished
        ? `<span class="touch-unit-label final">FINAL</span><strong>${lead < 0 ? `Tied ${m.score[0]}–${m.score[1]}` : `${esc(clubs[lead ? m.b : m.a][2])} win ${Math.max(...m.score)}–${Math.min(...m.score)}`}</strong><span>${m.plays} snaps · ${m.stats[0].yards}–${m.stats[1].yards} total yards</span>`
        : m.halftime
          ? `<span class="touch-unit-label final">HALFTIME</span><strong>${m.score[0]}–${m.score[1]}</strong><span>Second half kicks off after your locker-room adjustment.</span>`
          : `<span class="touch-unit-label ${off ? "offense" : "defense"}">${off ? "YOUR OFFENSE" : "YOUR DEFENSE"}</span><strong>${ordinalDown(m.down)} & ${goal ? "Goal" : m.toGo}</strong><span class="touch-ball-on">Ball on <b>${fieldPosition(m)}</b></span>`;
    return `<div class="touch-app" aria-busy="${isBusy()}"><div class="touch-header" style="--home:${TEAM_COLORS[m.a] || "var(--team)"};--away:${TEAM_COLORS[m.b] || "var(--team)"}"><div class="touch-scoreboard"><div class="touch-score-team home ${m.poss === 0 && live ? "possession" : ""}">${logo(m.a)}<span><b>${clubs[m.a][2]}</b><small>HOME${m.a === state.team ? " · YOUR TEAM" : ""}</small></span><strong class="touch-score-num">${m.score[0]}</strong></div><div class="touch-score-clock"><span class="${live && autoTimer ? "is-live" : ""}">${m.finished ? "END OF GAME" : m.halftime ? "END OF Q2" : autoTimer ? "● LIVE" : "Ⅱ PAUSED"}</span><b>${m.finished ? "FINAL" : m.halftime ? "HALF" : clockText(m)}</b><small>${m.quarter > 4 ? "OVERTIME" : "QUARTER " + m.quarter}</small></div><div class="touch-score-team away ${m.poss === 1 && live ? "possession" : ""}"><strong class="touch-score-num">${m.score[1]}</strong><span><b>${clubs[m.b][2]}</b><small>AWAY${m.b === state.team ? " · YOUR TEAM" : ""}</small></span>${logo(m.b)}</div></div><div class="touch-situation">${situation}<span class="touch-timeouts">TIMEOUTS <span>${clubs[m.a][0]} ${pips(m.timeouts[0])}</span><span>${clubs[m.b][0]} ${pips(m.timeouts[1])}</span></span></div></div><div class="touch-control-rail"><div class="touch-view-tabs">${["Live", "Team lineup", "Match centre"].map((v) => `<button class="${tab === v ? "active" : ""}" aria-pressed="${tab === v}" onclick="Touch.tab('${v}')" ${locked() ? "disabled" : ""}>${icon(v === "Live" ? "play" : v === "Team lineup" ? "users" : "chart")}${v}</button>`).join("")}</div><div class="touch-sim-menu" ${m.finished ? "hidden" : ""}><label>Skip to<select aria-label="Simulation stopping point" onchange="Touch.target(this.value)" ${locked() || m.finished ? "disabled" : ""}>${targets.map(([key, label]) => `<option value="${key}" ${simTarget === key ? "selected" : ""}>${label}</option>`).join("")}</select></label><label class="touch-sim-caller">Caller<select aria-label="Quick sim playcalling" onchange="MD.calling(this.value)" ${locked() || m.finished ? "disabled" : ""}><option value="Assistant" ${(window.MD?.preference?.() || "Assistant") === "Assistant" ? "selected" : ""}>Assistant</option><option value="Manual" ${window.MD?.preference?.() === "Manual" ? "selected" : ""}>Selected play</option></select></label><button class="secondary small" onclick="Touch.sim()" ${locked() || m.finished ? "disabled" : ""}>${isBusy() ? "Simulating…" : "Advance →"}</button></div></div>${recap && !recap.dismissed ? `<div class="touch-sim-notice" role="status"><span>${icon("check")} ${recap.plays} plays simulated · ${esc(recap.from)} → ${esc(recap.to)}</span><button class="link" onclick="Touch.dismissRecap()">Dismiss</button></div>` : ""}${m.halftime ? '<div class="touch-break-banner"><div><b>Make the halftime adjustment.</b><span>Talk to your players or change the team before the second half.</span></div><button onclick="halftimeTalk()">Enter the locker room →</button></div>' : m.finished ? '<div class="touch-break-banner final"><div><b>The final whistle.</b><span>Review the match, commit the result and face the media.</span></div><button onclick="commitMatch()">Postgame report →</button></div>' : ""}${
      tab === "Team lineup"
        ? boardHTML()
        : tab === "Match centre"
          ? matchCentre(m)
          : `<div class="touch-live-grid"><section class="touch-broadcast"><div class="touch-broadcast-heading"><span>${icon("play")} STADIUM FEED</span><b>${esc(state.franchise.clubs[m.a].stadium.name)}</b>${weatherChip(m)}</div><div class="match-controls touch-match-actions"><button class="touch-snap" onclick="snap()" ${disabled ? "disabled" : ""}>${icon("play")} ${animating ? "Play in motion…" : "Snap ball"}</button><button class="secondary" onclick="toggleAuto()" ${isBusy() || (animating && !autoTimer) || m.finished || m.halftime ? "disabled" : ""}>${autoTimer ? "Ⅱ Pause auto" : "Auto play"}</button><button class="secondary" onclick="timeout()" ${disabled || !m.timeouts[own] ? "disabled" : ""}>Timeout <small>${m.timeouts[own]} left</small></button><button class="secondary" onclick="Touch.lineup()" ${locked() ? "disabled" : ""}>${icon("users")} Replace</button></div><div class="touch-field-key">Colored jerseys: offense · White jerseys: defense | Blue: scrimmage | Yellow: first down</div>${visual}<div class="touch-feed-row"><div class="touch-coordinator"><span>${icon("briefcase")}</span><div><b>${esc(state.coach.name)} / SIDELINE</b><p>${esc(advice(m))}</p></div></div><div class="touch-booth"><div><b>THE BROADCAST BOOTH</b><button class="link" onclick="broadcast.toggle()">${window.broadcast?.director.enabled ? "Commentary on" : "Enable commentary"}</button><button class="link" onclick="broadcast.settings()">Voice settings</button></div><p id="broadcast-caption" aria-live="polite">${esc(m.commentary?.at(-1)?.text || "The teams are set. Make your call for the next snap.")}</p></div></div><div class="touch-mini-stats">${[
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
      const LU = lineupController({ isBusy });
      LU.setUnit(state.live ? (onOffense(state.live) ? "Offense" : "Defense") : "Offense");
      drawBoard();
    },
    // Older entry points, kept for callers: they go through the shared lineup controller.
    unit(v) {
      lineupController({ isBusy }).unit(v);
    },
    select(i) {
      lineupController({ isBusy }).select(i);
    },
    swap(id) {
      lineupController({ isBusy }).assign(id);
    },
    setting(k, v) {
      // Play calls belong to the staff unless the coach has taken over (Playcaller: Manual).
      if (["call", "defCall", "offense", "defense", "personnel", "shell", "tempo"].includes(k) && state.coach.calling !== "Manual" && !lineupModal) return;
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
      state.live.weather = gameForecast(state, state.live)?.condition || "Clear";
      render();
    }
    return result;
  };
}
