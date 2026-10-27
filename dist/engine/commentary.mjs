// Broadcast copy uses confirmed simulation events. It never invents a route, coverage or official call.
const hash = (text) =>
  [...String(text)].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
const pick = (execution, key, choices) =>
  choices[
    hash(`${execution.seed}:${execution.playId}:${key}`) % choices.length
  ];
export function broadcastName(name = "The quarterback") {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  if (["Jr.", "Jr", "II", "III", "IV", "Sr."].includes(parts.at(-1)))
    parts.pop();
  let tail = parts.at(-1);
  if (parts.at(-2) === "St.") tail = "St. " + tail;
  return tail;
}
const ordinal = (n) => ["", "First", "Second", "Third", "Fourth"][n] || "First";
export function commentaryFor(execution) {
  const lines = [],
    events = execution.events || [],
    r = execution.result,
    ctx = execution.context || {},
    qb = broadcastName(execution.actors[0]?.name),
    carrier = broadcastName(execution.actors[r.carrier]?.name || "the runner");
  const add = (
    id,
    time,
    type,
    text,
    voice = true,
    role = "playByPlay",
    excitement = 0,
  ) =>
    lines.push({
      id: `${execution.playId}:${id}`,
      time,
      type,
      text,
      voice,
      role,
      excitement,
    });
  const down = ctx.down
    ? `${ordinal(ctx.down)} and ${ctx.spot + ctx.toGo >= 100 ? "goal" : ctx.toGo}. `
    : "";
  const snap = events.find((e) => e.type === "Snap");
  add(
    "setup",
    0,
    "Snap",
    r.kind === "punt"
      ? `${down}The punt team is out.`
      : ["fieldGoal", "missedFieldGoal"].includes(r.kind)
        ? `${down}A ${ctx.spot ? 117 - ctx.spot : "field-goal"}${ctx.spot ? "-yard attempt" : " attempt"}.`
        : `${down}${pick(execution, "snap", [`${qb} takes the snap.`, `${qb}, back to work.`, `${qb} gets the snap.`])}`,
  );
  for (const e of events) {
    const name = broadcastName(e.name),
      time = e.time;
    let text;
    switch (e.type) {
      case "Handoff":
        text = pick(execution, e.id, [
          `${name} takes the handoff.`,
          `They give it to ${name}.`,
          `${name} with the carry.`,
        ]);
        break;
      case "PassReleased":
        text = pick(execution, e.id, [
          `${name} lets it go.`,
          `${name} delivers.`,
          `${name} fires.`,
        ]);
        break;
      case "CatchCompleted":
        text = pick(execution, e.id, [
          `Caught by ${name}!`,
          `${name} makes the grab.`,
          `Complete to ${name}.`,
        ]);
        break;
      case "BrokenTackle":
        text = pick(execution, e.id, [
          `${name} stays on his feet!`,
          `${name} breaks free of the tackle!`,
          `Still going, ${name}!`,
        ]);
        break;
      case "Kick":
        text = "The kick is away.";
        break;
      default:
        continue;
    }
    add("event-" + e.id, time, e.type, text, false);
  }
  let outcome,
    excitement = 0,
    analysis;
  const gain =
    r.yards === 0
      ? "no gain"
      : r.yards < 0
        ? `a loss of ${Math.abs(r.yards)}`
        : `${r.yards} yards`;
  const first = Number.isFinite(ctx.toGo) && r.yards >= ctx.toGo;
  const confirmed = events.find((e) => e.type === "ResultConfirmed");
  if (r.kind === "touchdown") {
    excitement = 2;
    outcome = pick(execution, "td", [
      `${carrier} is in! Touchdown${ctx.team ? ", " + ctx.team : ""}!`,
      `${carrier}, into the end zone! Touchdown!`,
      `Touchdown! ${carrier} finishes it off!`,
    ]);
    analysis =
      "They turned that opportunity into six points. That is how you finish a drive.";
  } else if (r.kind === "interception") {
    excitement = 2;
    outcome = `Picked off! ${carrier} comes away with it!`;
    analysis = "A costly turnover. The defense gets the ball back.";
  } else if (r.kind === "sack") {
    const tackler = events.find((e) => e.type === "Sack")?.tackler;
    outcome =
      `${qb} goes down! ${tackler ? broadcastName(tackler) + " gets home for " : ""}A loss of ${Math.abs(r.yards)}.`.replace(
        "for A",
        "for a",
      );
    excitement = 1;
    analysis =
      "The quarterback never got the pass away. That pressure changes the next call.";
  } else if (r.kind === "incomplete") {
    outcome = pick(execution, "inc", [
      "Incomplete. They could not connect.",
      "That one falls incomplete.",
      "No catch. Incomplete.",
    ]);
    analysis =
      ctx.down === 3
        ? "Now the fourth-down decision. The field position matters here."
        : "The offense will have another decision to make on the next down.";
  } else if (r.kind === "fieldGoal") {
    excitement = 1;
    outcome = pick(execution, "fg", [
      "And it is good! Three more on the board.",
      "Right through! The field goal is good.",
      "The kick is good! They come away with three.",
    ]);
    analysis = "The drive ends with points on the board.";
  } else if (r.kind === "missedFieldGoal") {
    outcome = "No good! The field-goal attempt misses.";
    analysis = "An empty trip. The other offense takes over.";
  } else if (r.kind === "punt") {
    outcome = `The punt travels ${r.yards} yards${r.spot >= 100 ? ". A touchback." : ". Possession changes."}`;
    analysis = "The offense is coming back onto the field.";
  } else if (ctx.spot + r.yards <= 0) {
    excitement = 2;
    outcome = `${carrier} is stopped in the end zone! Safety!`;
    analysis = "The defense puts two points on the board.";
  } else {
    let stop =
      r.kind === "outOfBounds"
        ? "Out of bounds"
        : pick(execution, "stop", [
            "Brought down",
            "Stopped there",
            "Down he goes",
          ]);
    outcome = `${carrier}, ${gain}. ${stop}${first ? ", and that moves the chains!" : "."}`;
    if (ctx.down === 4 && !first) {
      outcome += " Short of the line. Turnover on downs.";
      excitement = 1;
      analysis =
        "They went for it, and the defense held. That is a big change of possession.";
    } else if (first) {
      excitement = r.yards >= 20 ? 1 : 0;
      analysis =
        r.yards >= 20
          ? "An explosive gain. The defense has to regroup before the next snap."
          : "A fresh set of downs. The offense keeps the drive alive.";
    } else
      analysis =
        r.yards <= 0
          ? "The defense wins that snap. The offense needs a better answer next time."
          : `That sets up ${ctx.down ? ordinal(ctx.down + 1).toLowerCase() + " down" : "the next play"}.`;
  }
  const ending = events.find((e) =>
    [
      "Touchdown",
      "Interception",
      "Sack",
      "Tackle",
      "PassIncomplete",
      "OutOfBounds",
      "FieldGoalGood",
      "FieldGoalMiss",
      "Punt",
    ].includes(e.type),
  );
  add(
    "outcome",
    Math.min(
      execution.duration,
      ending?.time ?? Math.max(0.5, execution.duration - 0.8),
    ),
    "Outcome",
    outcome,
    true,
    "playByPlay",
    excitement,
  );
  if (
    confirmed?.score &&
    ctx.clock < 120 &&
    ctx.quarter >= 4 &&
    ["touchdown", "fieldGoal"].includes(r.kind)
  )
    analysis += ` The score is now ${confirmed.score[0]} to ${confirmed.score[1]}.`;
  add(
    "analysis",
    Math.max(execution.duration - 0.03, (ending?.time || 0) + 0.1),
    "Analysis",
    analysis,
    false,
    "analyst",
  );
  return lines.sort((a, b) => a.time - b.time);
}
export class CommentaryDirector {
  constructor({ speak = () => {}, caption = () => {} } = {}) {
    this.speak = speak;
    this.caption = caption;
    this.seen = new Set();
    this.lines = [];
    this.enabled = false;
    this.replay = false;
  }
  start(lines, { replay = false } = {}) {
    this.lines = lines;
    this.replay = replay;
    this.seen.clear();
  }
  update(seconds, { seek = false } = {}) {
    const due = this.lines.filter(
      (l) => l.time <= seconds && !this.seen.has(l.id),
    );
    for (const line of due) this.seen.add(line.id);
    if (!due.length) return;
    const spoken = due.filter((l) => l.voice !== false),
      line = spoken.at(-1) || due.at(-1);
    this.caption(line.text);
    if (this.enabled && !this.replay && !seek && spoken.length) {
      const selected = spoken.at(-1);
      this.speak(selected.text, selected);
    }
  }
}
