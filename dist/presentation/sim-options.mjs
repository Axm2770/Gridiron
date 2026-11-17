// Match simulator preferences: instant replays, replay and game speed, the matchday intro and
// commentary. Stored per device (like volume and the camera), never in a save; none of them can
// change a result, they only change how a play is shown.
const KEY = "gridiron-sim-options";
export const SIM_OPTION_CHOICES = {
  replays: [true, false],
  replaySpeed: [0.25, 0.5, 0.75, 1],
  gameSpeed: [0.5, 0.75, 1, 1.5, 2],
  intro: [true, false],
  commentary: [true, false],
  captions: ["Full", "Key plays", "Off"],
};
export const SIM_DEFAULTS = { replays: true, replaySpeed: 0.75, gameSpeed: 1, intro: true, commentary: false, captions: "Full" };
const storage = () => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};
// Unknown or out-of-range stored values fall back to the default, so old or edited storage is safe.
export function normalizeSimOptions(raw = {}) {
  const out = { ...SIM_DEFAULTS };
  for (const [k, choices] of Object.entries(SIM_OPTION_CHOICES)) {
    let v = raw?.[k];
    if (typeof SIM_DEFAULTS[k] === "number") v = Number(v);
    if (typeof SIM_DEFAULTS[k] === "boolean" && typeof v === "string") v = v === "true";
    if (choices.includes(v)) out[k] = v;
  }
  return out;
}
let current = null;
export function simOptions() {
  if (!current) {
    let raw = {};
    try {
      raw = JSON.parse(storage()?.getItem(KEY) || "{}");
    } catch {}
    current = normalizeSimOptions(raw);
  }
  return current;
}
export function setSimOption(key, value) {
  if (!Object.hasOwn(SIM_DEFAULTS, key)) throw Error("Unknown simulator option.");
  current = normalizeSimOptions({ ...simOptions(), [key]: value });
  try {
    storage()?.setItem(KEY, JSON.stringify(current));
  } catch {}
  applySimOptions();
  return current;
}
// Plays worth an instant replay: scores, takeaways, sacks, kicks that decide something, chunk gains.
export function bigPlay(last) {
  const e = last?.execution,
    kind = e?.result?.kind;
  if (!e || last.penalty) return false;
  if (["touchdown", "interception", "sack", "fieldGoal", "missedFieldGoal"].includes(kind)) return true;
  if (e.events.some((x) => x.type === "BrokenTackle") && e.result.yards >= 8) return true;
  return e.result.yards >= 20;
}
// Caption verbosity: "Key plays" keeps the call of the outcome and drops setup and analysis lines.
export function captionAllowed(line, verbosity = simOptions().captions) {
  if (verbosity === "Off") return false;
  if (verbosity === "Key plays") return line?.type === "Outcome" || (line?.excitement ?? 0) >= 1;
  return true;
}
export function applySimOptions() {
  // A play already on screen picks up a new speed immediately.
  const G = globalThis.window?.GridironStadium,
    stadium = G?.instance?.();
  if (stadium) stadium.playbackRate = G.replaying() ? simOptions().replaySpeed : simOptions().gameSpeed;
  const b = globalThis.window?.broadcast;
  if (b?.director) {
    b.director.enabled = simOptions().commentary && !!globalThis.speechSynthesis;
    if (!b.director.enabled) b.voice?.stop?.();
  }
  const caption = globalThis.document?.getElementById?.("broadcast-caption");
  if (caption) caption.hidden = simOptions().captions === "Off";
}
export function installSimOptions(win = globalThis.window) {
  if (!win || win.SimOptions) return win?.SimOptions;
  const b = win.broadcast;
  if (b && !b.__simOptions) {
    b.__simOptions = true;
    // The booth toggle now remembers the choice on this device.
    b.toggle = function () {
      if (!globalThis.speechSynthesis) {
        win.toast?.("This browser supports captions only.");
        return;
      }
      setSimOption("commentary", !simOptions().commentary);
      win.render?.();
    };
  }
  win.SimOptions = { get: simOptions, set: setSimOption, bigPlay, captionAllowed, choices: SIM_OPTION_CHOICES };
  applySimOptions();
  return win.SimOptions;
}
// Shared markup for Settings → Match & audio and the match toolbar popover.
export function simOptionsControls({ compact = false, voices = [], voiceURI = "" } = {}) {
  const o = simOptions(),
    row = (label, help, control) =>
      compact ? `<label class="sim-opt"><span>${label}</span>${control}</label>` : `<label class="settings-row"><span><b>${label}</b><small>${help}</small></span>${control}</label>`,
    select = (key, aria, options) =>
      `<select aria-label="${aria}" onchange="SimOptions.set('${key}',this.value);render()">${options
        .map(([v, l]) => `<option value="${v}" ${String(o[key]) === String(v) ? "selected" : ""}>${l}</option>`)
        .join("")}</select>`,
    toggle = (key, aria) => `<input type="checkbox" aria-label="${aria}" ${o[key] ? "checked" : ""} onchange="SimOptions.set('${key}',this.checked);render()">`,
    esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  return [
    row("Instant replays", "Replay touchdowns, takeaways, sacks, kicks and big gains automatically.", toggle("replays", "Instant replays")),
    row("Replay speed", "Slow motion for instant and manual replays.", select("replaySpeed", "Replay speed", SIM_OPTION_CHOICES.replaySpeed.map((v) => [v, v === 1 ? "Full speed" : `${v}× slow motion`]))),
    row("Game speed", "How fast each live play animates. Results are identical at every speed.", select("gameSpeed", "Game speed", SIM_OPTION_CHOICES.gameSpeed.map((v) => [v, `${v}×`]))),
    row("Matchday intro", "Teams, venue, weather and records before kickoff. Skippable.", toggle("intro", "Matchday intro")),
    row("Spoken commentary", "Play-by-play voice. Captions follow the setting below.", toggle("commentary", "Spoken commentary")),
    row(
      "Commentator voice",
      "Choose an installed English voice.",
      `<select aria-label="Commentator voice" onchange="broadcast.voice.configure({voiceURI:this.value})"><option value="">Automatic</option>${voices
        .map((v) => `<option value="${esc(v.voiceURI)}" ${v.voiceURI === voiceURI ? "selected" : ""}>${esc(v.name)} · ${esc(v.lang)}</option>`)
        .join("")}</select>`,
    ),
    row("Captions", "Every call, key plays only, or no captions.", select("captions", "Caption verbosity", SIM_OPTION_CHOICES.captions.map((v) => [v, v]))),
  ].join("");
}
