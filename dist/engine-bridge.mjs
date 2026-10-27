import { sortForLineup } from "./franchise/lineup.mjs";
import { simulateExecution, buildActors } from "./engine/execution.mjs";
import { applyExecution } from "./engine/rules.mjs";
import { commentaryFor, CommentaryDirector } from "./engine/commentary.mjs";
import { BroadcastVoice } from "./engine/voice.mjs";
import { random } from "./engine/random.mjs";
const grouped = (players, team) => {
  let groups = {};
  for (let p of sortForLineup(players, team)) {
    if (!p || !p.pos || p.injury) continue;
    (groups[p.pos] ??= []).push(p);
  }
  return groups;
};
function opponentPlayers(id) {
  if (state.franchise?.clubs?.[id]?.players?.length)
    return state.franchise.clubs[id].players
      .filter((p) => p.status === "active" || p.status === "elevated")
      .map((p) => ({
        ...p,
        ovr: Math.min(
          99,
          p.ovr +
            (state.franchise.bulletinBoard?.year === state.year &&
            state.franchise.bulletinBoard?.week === state.week
              ? 1
              : 0),
        ),
      }));
  return Array.from({ length: 32 }, (_, i) => ({
    id: `team-${id}-${i}`,
    name: `${clubs[id][2]} ${positions[i % 21]} ${i + 1}`,
    pos: positions[i % 21],
    ovr: state.teams[id].rating,
    fitness: 100,
  }));
}
resolveSnap = function () {
  let m = state.live;
  if (!m || m.finished || m.halftime) return;
  m.engine ??= {
    version: 1,
    seed:
      (state.year * 7919 + m.a * 1009 + m.b * 9173 + state.week * 479) >>> 0,
    serial: 0,
  };
  let serial = ++m.engine.serial,
    playSeed =
      (m.engine.nextSeed ?? m.engine.seed + Math.imul(serial, 2654435761)) >>>
      0,
    rng = random(playSeed);
  delete m.engine.nextSeed;
  seed = playSeed;
  if (rng() < 0.045) {
    let type = [
      "False start",
      "Offside",
      "Offensive holding",
      "Defensive pass interference",
    ][Math.floor(rng() * 4)];
    let last = enforcePenalty(m, type);
    m.commentary = [
      { id: `flag-${serial}`, time: 0, type: "Penalty", text: last.text },
    ];
    return last;
  }
  const own = onOffense(m),
    team = possessionTeam(m),
    role = state.franchise?.role,
    manual =
      state.coach.calling === "Manual" &&
      role !== "GM" &&
      !(role === "DC" && own),
    call = own && manual ? m.call : coachCall(m);
  let coverage = own
    ? ["Cover 2", "Cover 3", "Quarters", "Man coverage"][Math.floor(rng() * 4)]
    : m.defCall;
  const ours = state.roster
      .filter(
        (p) =>
          !p.injury &&
          !p.holdout &&
          (!p.status || ["active", "elevated"].includes(p.status)),
      )
      .sort((a, b) => Number(b.starter) - Number(a.starter))
      .map((p) => ({
        ...p,
        ovr: Math.min(
          99,
          p.ovr +
            (state.franchise?.career?.skills?.[
              ["QB", "RB", "WR", "TE", "OL", "K", "P"].includes(p.pos)
                ? "offense"
                : "defense"
            ] || 0) *
              0.4,
        ),
      })),
    theirs = opponentPlayers(own ? (m.poss === 0 ? m.b : m.a) : team);
  let execution = simulateExecution({
    playId: `${state.year}-${state.week}-${serial}`,
    seed: playSeed,
    spot: m.spot,
    call,
    coverage,
    formation: own ? m.offense : "Shotgun spread",
    front: m.defense,
    personnel: m.personnel || "11",
    shell: m.shell || "2-High",
    weather: m.weather || "Clear",
    offensePlayers: grouped(own ? ours : theirs, team),
    defensePlayers: grouped(
      own ? theirs : ours,
      own ? (m.poss === 0 ? m.b : m.a) : state.team,
    ),
  });
  execution.context = {
    decision: {
      id: `${m.engine.seed}:${serial}`,
      team,
      call,
      formation: own ? m.offense : "Shotgun spread",
      down: m.down,
      toGo: m.toGo,
      spot: m.spot,
      quarter: m.quarter,
      clock: m.clock,
      scoreDiff: m.score[m.poss] - m.score[1 - m.poss],
      kind: execution.result.kind,
      yards: execution.result.yards,
      a: m.a,
      b: m.b,
    },
    down: m.down,
    toGo: m.toGo,
    spot: m.spot,
    quarter: m.quarter,
    clock: m.clock,
    team: clubs[team][2],
    score: [...m.score],
  };
  state.live = applyExecution(m, execution, clubs[team][0]);
  window.franchiseRecordExecution?.(execution, team);
  state.live.commentary = commentaryFor(execution);
  for (let p of state.roster) {
    if (p.starter && !p.injury) p.fitness = Math.max(45, p.fitness - 0.6);
    else p.fitness = Math.min(100, p.fitness + 0.4);
  }
  if (state.live.finished || state.live.halftime) pauseAuto();
  return state.live.last;
};
for (const [name, description] of [
  ["Cover 3", "Three deep zones"],
  ["Quarters", "Four deep defenders"],
  ["Tampa 2", "Middle linebacker drops deep"],
])
  if (!defCalls.some((x) => x[0] === name)) defCalls.push([name, description]);
const screenBeforeEngine = matchScreen;
matchScreen = function () {
  let html = screenBeforeEngine(),
    m = state.live;
  if (!m) return html;
  let tactical = `<div class="execution-settings"><label>Offensive personnel<select onchange="matchSetting('personnel',this.value)" ${animating ? "disabled" : ""}>${["11", "12", "21", "10", "Goal Line"].map((v) => `<option ${m.personnel === v ? "selected" : ""}>${v}</option>`).join("")}</select></label><label>Disguise shell<select onchange="matchSetting('shell',this.value)" ${animating ? "disabled" : ""}>${["2-High", "Single-High", "Zero"].map((v) => `<option ${m.shell === v ? "selected" : ""}>${v}</option>`).join("")}</select></label><label>Weather<select onchange="matchSetting('weather',this.value)" ${animating ? "disabled" : ""}>${["Clear", "Rain", "Wind"].map((v) => `<option ${m.weather === v ? "selected" : ""}>${v}</option>`).join("")}</select></label></div>`;
  let booth = `<div class="commentary-booth"><div><b>THE BROADCAST BOOTH</b><button class="small secondary" onclick="window.broadcast.toggle()">${window.broadcast.director.enabled ? "♫ Commentary on" : "♫ Enable commentary"}</button></div><p id="broadcast-caption" aria-live="polite">${esc(m.commentary?.at(-1)?.text || "Ready for the next snap.")}</p><div class="booth-bottom"><small>Live play-by-play · situation-aware calls</small><button class="link" onclick="broadcast.settings()">Voice settings</button></div></div>`;
  let recent = m.last?.execution,
    release = recent?.events.find((e) => e.type === "PassReleased");
  let intelligence = `<details class="kernel-details"><summary>Coordinator advice ▾</summary><p>${release ? esc(release.name) + " found " + release.separation.toFixed(1) + " yards of separation at release." : "Watch how the defensive shell rotates after the snap."} ${recent?.result.kind === "sack" ? "Shorten the quarterback’s progression or use a quicker passing concept." : recent?.result.yards < 3 ? "Try a different personnel grouping or attack the opposite edge." : "Monitor fatigue and rotate personnel between snaps."}</p></details><details class="kernel-details"><summary>Developer match diagnostics ▾</summary><p>20 Hz · seed ${m.engine?.seed ?? "initialized on snap"} · play ${m.engine?.serial ?? 0} · ${recent?.events.length ?? 0} events · ${recent?.frames.length ?? 0} frames</p><label>Next play seed <input type="number" min="0" max="4294967295" id="debug-seed" value="42"></label><button class="small secondary" onclick="window.forcePlaySeed()" ${animating ? "disabled" : ""}>Use seed for next snap</button><p>Seed overrides mark this as a debug save. Replays and commentary never change the score.</p></details>`;
  html = html.replace(
    '<div class="advisor">',
    tactical + booth + intelligence + '<div class="advisor">',
  );
  return html;
};
const voice = new BroadcastVoice({
  visible: () => !document.hidden && view === "Matchday",
  volume: () => Math.min(1, (window.matchAudio?.volume ?? 0.5) + 0.25),
});
window.broadcast = {
  voice,
  director: new CommentaryDirector({
    caption: (text) => {
      let el = document.getElementById("broadcast-caption");
      if (el) el.textContent = text;
    },
    speak: (text, line) => voice.speak(text, line),
  }),
  toggle() {
    if (!window.speechSynthesis) {
      toast("This browser supports captions only.");
      return;
    }
    this.director.enabled = !this.director.enabled;
    if (!this.director.enabled) voice.stop();
    render();
  },
  settings() {
    modal(
      `<h2>Broadcast audio</h2><p>Choose the best voice available on your device. Commentary uses natural phrases, player names and the live game situation.</p><label for="broadcast-voice">Commentator voice</label><select id="broadcast-voice" onchange="broadcast.voice.configure({voiceURI:this.value})"><option value="">Automatic · best available English voice</option>${voice
        .voices()
        .map(
          (v) =>
            `<option value="${esc(v.voiceURI)}" ${v.voiceURI === voice.preferences.voiceURI ? "selected" : ""}>${esc(v.name)} · ${esc(v.lang)}</option>`,
        )
        .join(
          "",
        )}</select><label class="voice-pace" for="broadcast-pace">Delivery speed</label><select id="broadcast-pace" onchange="broadcast.voice.configure({pace:Number(this.value)})">${[
        [0.92, "Relaxed"],
        [1, "Broadcast"],
        [1.1, "Brisk"],
      ]
        .map(
          ([value, label]) =>
            `<option value="${value}" ${voice.preferences.pace === value ? "selected" : ""}>${label}</option>`,
        )
        .join(
          "",
        )}</select><p class="subtitle">Voice quality depends on the voices installed in your browser and operating system. Captions stay available when speech is off.</p><div class="modal-actions"><button class="secondary" onclick="broadcast.preview()">Preview voice</button><button onclick="closeModal()">Done</button></div>`,
    );
  },
  preview() {
    voice.stop();
    let qb =
      state.roster.find((p) => p.pos === "QB" && p.starter) ||
      state.roster.find((p) => p.pos === "QB");
    voice.speak(
      `Third and seven. ${qb?.name || "The quarterback"} takes the snap. The pass is complete! That moves the chains.`,
      { type: "Outcome", excitement: 1 },
    );
  },
  start(execution, replay) {
    if (replay) voice.stop();
    else voice.startPlay();
    this.director.start(commentaryFor(execution), { replay });
  },
  update(t, options) {
    this.director.update(t, options);
  },
  stop() {
    voice.stop();
  },
};
window.executionFormation = (m) =>
  buildActors(
    m.spot,
    {},
    {},
    m.offense,
    m.personnel || "11",
    m.defense,
    m.shell || "2-High",
  ).map((a) => ({
    x: (a.x - 50) * (m.poss === 0 ? 1 : -1),
    z: a.z * (m.poss === 0 ? 1 : -1),
  }));
document.addEventListener("visibilitychange", () => {
  if (document.hidden) window.broadcast.stop();
});

window.forcePlaySeed = function () {
  if (animating || !state.live) return;
  let value = Number(document.getElementById("debug-seed").value);
  if (!Number.isInteger(value) || value < 0 || value > 4294967295) {
    toast("Enter an integer seed from 0 to 4294967295.");
    return;
  }
  state.live.engine ??= { version: 1, seed: 42, serial: 0 };
  state.live.engine.nextSeed = value;
  state.debugSave = true;
  save();
  toast("Next snap will use seed " + value);
};

window.executionActors = function (m) {
  const team = m.poss === 0 ? m.a : m.b,
    other = m.poss === 0 ? m.b : m.a;
  let players = (id) =>
    (id === state.team ? state.roster : opponentPlayers(id))
      .filter(
        (p) =>
          !p.injury &&
          !p.holdout &&
          (!p.status || ["active", "elevated"].includes(p.status)),
      )
      .sort((a, b) => Number(b.starter) - Number(a.starter));
  return buildActors(
    m.spot,
    grouped(players(team), team),
    grouped(players(other), other),
    m.offense,
    m.personnel || "11",
    m.defense,
    m.shell || "2-High",
  );
};

const animateWithCommentary = animatePlay;
animatePlay = function (last) {
  animateWithCommentary(last);
  if (last?.execution) {
    window.broadcast.start(last.execution, false);
    window.broadcast.update(last.execution.duration);
  }
};
