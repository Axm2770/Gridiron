import { recordDecision } from "./career-systems.mjs";
import * as S from "./state.mjs";
import { SIM_TARGETS, matchFingerprint } from "../engine/sim-targets.mjs";
import { commentaryFor } from "../engine/commentary.mjs";
export const periodLabel = (m) =>
  m.finished
    ? "Final"
    : m.halftime
      ? "Halftime"
      : `${m.quarter > 4 ? "OT " + (m.quarter - 4) : "Q" + m.quarter} ${Math.floor(m.clock / 60)}:${String(m.clock % 60).padStart(2, "0")}`;
export function applyMatchSegment(state, result) {
  if (
    !state.live ||
    result.continuationFrom !== matchFingerprint(state.live) ||
    result.a !== state.live.a ||
    result.b !== state.live.b
  )
    throw Error(
      "The match changed during simulation. This result was not applied.",
    );
  if (
    !Number.isInteger(result.plays) ||
    result.match.plays !== state.live.plays + result.plays
  )
    throw Error("Invalid simulation continuation.");
  const before = state.live;
  for (const d of result.decisions || []) recordDecision(state, d);
  for (const record of result.stats || []) {
    const p = S.roster(state, record.team).find((p) => p.id === record.id);
    if (!p) continue;
    const stats = (p.stats[state.year] ??= {});
    for (const [key, value] of Object.entries(record))
      if (!["team", "id"].includes(key)) stats[key] = (stats[key] || 0) + value;
  }
  const match = structuredClone(result.match),
    execution = match.last?.execution;
  delete match.replay;
  if (match.last) delete match.last.execution;
  match.commentary = execution ? commentaryFor(execution) : [];
  match.quickSimRecap = {
    from: periodLabel(before),
    to: periodLabel(match),
    plays: result.plays,
    target: SIM_TARGETS[result.target],
    before: [...before.score],
    after: [...match.score],
    highlights: result.highlights || [],
  };
  state.live = match;
  return match;
}
export function installMatchdaySim({
  initialize,
  workerGames,
  isBusy,
  setBusy,
}) {
  let preference = "Assistant";
  try {
    preference =
      localStorage.getItem("gridiron-quick-playcaller") || "Assistant";
  } catch {}
  const jobSeed = (m) =>
    (m.engine?.seed ??
      state.year * 7919 + m.a * 1009 + m.b * 9173 + state.week * 479) >>> 0;
  const targetButton = (text, target, disabled = false, primary = false) =>
    `<button class="${primary ? "" : "secondary "}small" onclick="MD.run('${target}')" ${disabled || isBusy() ? "disabled" : ""}>${text}</button>`;
  window.MD = {
    preference() {
      return preference;
    },
    live() {
      if (isBusy() || !state.live) return;
      if (state.live.halftime) {
        halftimeTalk();
        return;
      }
      if (state.live.quickSimRecap) state.live.quickSimRecap.dismissed = true;
      render();
      const controls = document.querySelector(".match-controls");
      controls?.scrollIntoView({
        block: "center",
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")
          .matches
          ? "auto"
          : "smooth",
      });
      controls?.querySelector("button")?.focus({ preventScroll: true });
    },
    calling(value) {
      if (!["Assistant", "Manual"].includes(value) || isBusy()) return;
      preference = value;
      try {
        localStorage.setItem("gridiron-quick-playcaller", value);
      } catch {}
    },
    start(target = "final") {
      if (isBusy()) return;
      if (!state.live) {
        if (!game()) {
          toast("There is no scheduled match to simulate.");
          return;
        }
        beginLive();
        if (!state.live) return;
        state.live.interviewDone = true;
        closeModal();
      }
      return MD.run(target);
    },
    async run(target) {
      if (isBusy()) return;
      initialize();
      let m = state.live;
      if (!m || m.finished) {
        toast(
          m?.finished
            ? "The final whistle has already gone."
            : "Enter matchday first.",
        );
        return;
      }
      if (!Object.hasOwn(SIM_TARGETS, target)) {
        toast("Choose a simulation target.");
        return;
      }
      if (
        (target === "halftime" && (m.halftime || m.quarter > 2)) ||
        (/^q[234]$/.test(target) && m.quarter >= Number(target[1]))
      ) {
        toast("That point in the game has already been reached.");
        return;
      }
      pauseAuto();
      window.broadcast?.stop();
      setBusy(true);
      try {
        window.finishMatchPlayback?.();
        if (animating)
          throw Error("Finish the current animation before skipping.");
        m = state.live;
        if (m.finished) return;
        const source = structuredClone(m),
          jobs = [
            {
              a: m.a,
              b: m.b,
              home: structuredClone(S.roster(state, m.a)),
              away: structuredClone(S.roster(state, m.b)),
              live: source,
              seed: jobSeed(m),
              target,
              userTeam: state.team,
              directives: structuredClone(state.franchise.directives),
              settings: m.settings,
              labels: [clubs[m.a][0], clubs[m.b][0]],
              tactics: { calling: preference, style: state.coach.style },
            },
          ];
        view = "Matchday";
        render();
        const [result] = await workerGames(jobs);
        state = S.transact(state, (s) => applyMatchSegment(s, result));
        save();
        toast(
          `${periodLabel(state.live)} · ${result.plays} ${result.plays === 1 ? "play" : "plays"} simulated`,
        );
      } catch (error) {
        toast(error.message);
      } finally {
        setBusy(false);
        view = "Matchday";
        render();
      }
    },
  };
  // A worker has exclusive ownership of the current clock and score until its result is committed.
  for (const name of [
    "snap",
    "resolveSnap",
    "startAuto",
    "toggleAuto",
    "timeout",
    "matchSetting",
    "subPlayer",
    "resumeHalf",
    "toggleStarter",
    "changeCaller",
    "beginLive",
    "startCareer",
  ]) {
    const previous = window[name];
    if (typeof previous === "function")
      window[name] = function (...args) {
        if (isBusy()) {
          toast("Simulation is running. Controls resume at the selected stop.");
          return;
        }
        return previous.apply(this, args);
      };
  }
  const screen = matchScreen;
  matchScreen = function () {
    let html = screen(),
      m = state.live;
    if (!m) {
      return game()
        ? `<section class="panel match-sim-start"><div><span class="eyebrow">YOUR MATCHDAY. YOUR PACE.</span><h2>Coach every snap, or jump into the action.</h2><p>Start live coaching below, or delegate to your coordinators and take over at a break.</p></div><div class="f-actions"><button class="secondary" onclick="MD.start('quarter')">Sim first quarter</button><button class="secondary" onclick="MD.start('halftime')">Sim to halftime</button><button onclick="MD.start('final')">Sim full game</button></div></section>${html}`
        : html;
    }
    const recap = m.quickSimRecap,
      quarter = m.halftime ? 3 : m.quarter,
      jumps = [2, 3, 4].filter((q) => q > m.quarter);
    const recapHtml =
      recap && !recap.dismissed
        ? `<div class="match-sim-recap" role="status"><div><b>${recap.from} <span>→</span> ${recap.to}</b><small>${recap.plays} plays simulated · ${clubs[m.a][0]} ${recap.before[0]}–${recap.before[1]} ${clubs[m.b][0]} → ${recap.after[0]}–${recap.after[1]}</small></div>${m.halftime ? '<button class="small" onclick="halftimeTalk()">Halftime adjustments</button>' : m.finished ? '<button class="small" onclick="commitMatch()">Postgame report →</button>' : '<button class="secondary small" onclick="MD.live()">Resume live coaching</button>'}${recap.highlights.length ? `<details><summary>Key moments</summary>${recap.highlights.map((h) => `<p><time>${esc(h.time)}</time>${esc(h.text)}</p>`).join("")}</details>` : ""}</div>`
        : "";
    let panel = `<section class="match-sim-panel" aria-label="Matchday simulation"><div class="match-sim-heading"><div><b>Matchday sim</b><small>${m.finished ? "Full time. Review the result before advancing the week." : isBusy() ? `Simulating… controls will return at your selected stop.` : "Choose a stopping point. Take over live coaching at any break."}</small></div>${!m.finished ? `<label>Playcalling<select aria-label="Quick sim playcalling" onchange="MD.calling(this.value)" ${isBusy() ? "disabled" : ""}><option value="Assistant" ${preference === "Assistant" ? "selected" : ""}>Assistant coach</option><option value="Manual" ${preference === "Manual" ? "selected" : ""}>Repeat selected play</option></select></label>` : ""}</div>${m.finished ? "" : `<div class="match-sim-actions">${targetButton("Next play", "play")}${targetButton("Next 5 plays", "five")}${targetButton("Next possession", "drive")}${targetButton(m.halftime ? "Sim Q3" : quarter > 4 ? "End OT" + (quarter - 4) : "End Q" + quarter, "quarter")}${targetButton("Halftime", "halftime", m.halftime || m.quarter > 2)}${targetButton("Sim full game", "final", false, true)}</div>${jumps.length ? `<div class="match-sim-jump"><label for="match-sim-quarter">Jump to a quarter</label><select id="match-sim-quarter" aria-label="Jump to quarter">${jumps.map((q) => `<option value="q${q}">Start of Q${q}</option>`).join("")}</select><button class="secondary small" onclick="MD.run(document.getElementById('match-sim-quarter').value)">Jump →</button><small>Targets beyond halftime delegate the break.</small></div>` : ""}`}${recapHtml}</section>`;
    html = html.replace(
      '<div class="match-banner">',
      panel + '<div class="match-banner">',
    );
    return isBusy()
      ? `<fieldset class="match-sim-locked" disabled aria-busy="true">${html}</fieldset>`
      : html;
  };
  const pre = pregame;
  pregame = function () {
    pre();
    document
      .querySelector("#modal .modal-actions")
      ?.insertAdjacentHTML(
        "afterbegin",
        '<button class="secondary" onclick="MD.start(\'final\')">Quick sim game</button>',
      );
  };
  render();
}
