import { clamp } from "./random.mjs";
export function applyExecution(match, execution, label) {
  const m = structuredClone(match),
    r = execution.result,
    k = m.poss,
    start = m.spot,
    oldQuarter = m.quarter,
    oldClock = m.clock;
  let text,
    first = false;
  const flip = (spot) => {
      if (m.quarter > 4) {
        m.otDrives ??= [0, 0];
        m.otDrives[m.poss]++;
      }
      m.poss = 1 - m.poss;
      m.spot = clamp(spot, 1, 99);
      m.down = 1;
      m.toGo = Math.min(10, 100 - m.spot);
    },
    score = (side, n) => {
      m.score[side] += n;
      m.periodScores[m.quarter - 1] ??= [0, 0];
      m.periodScores[m.quarter - 1][side] += n;
    };
  m.plays++;
  m.stats[k].plays++;
  let dead = [
    "incomplete",
    "fieldGoal",
    "missedFieldGoal",
    "punt",
  ].includes(r.kind)||r.kind==="outOfBounds"&&(m.quarter===2&&m.clock<=120||m.quarter>=4&&m.clock<=300);
  if (r.kind === "punt") {
    text = `${label} punt ${r.yards} yards.`;
    flip(r.spot >= 100 ? 20 : 100 - r.spot);
  } else if (r.kind === "fieldGoal") {
    score(k, 3);
    text = `${label} make a ${117 - start}-yard field goal!`;
    flip(m.settings?.touchback || 25);
  } else if (r.kind === "missedFieldGoal") {
    text = `${label} miss a ${117 - start}-yard field goal.`;
    flip(Math.max(20, 100 - start + 7));
  } else if (r.kind === "interception") {
    m.stats[k].turnovers++;
    text = `${label}: INTERCEPTED!`;
    flip(100 - r.spot);
  } else {
    let yards =
      r.kind === "incomplete" ? 0 : clamp(r.yards, -start, 100 - start);
    m.stats[k].yards += yards;
    m.stats[k][r.passing ? "pass" : "rush"] += yards;
    m.spot = start + yards;
    let name = execution.actors[r.carrier]?.name || "The ball carrier";
    text =
      r.kind === "incomplete"
        ? `${label} ${execution.call}: incomplete.`
        : r.kind === "sack"
          ? `${label}: quarterback sacked for ${Math.abs(yards)} yards.`
          : `${label}: ${name} ${r.passing ? "receives for" : "runs for"} ${yards} yards.`;
    if (m.spot >= 100) {
      score(k, 7);
      text += " TOUCHDOWN! Extra point good.";
      flip(m.settings?.touchback || 25);
    } else if (m.spot <= 0) {
      score(1 - k, 2);
      text += " SAFETY!";
      flip(35);
    } else if (yards >= m.toGo) {
      first = true;
      m.down = 1;
      m.toGo = Math.min(10, 100 - m.spot);
      m.stats[k].first++;
      text += " First down.";
    } else {
      m.down++;
      m.toGo -= yards;
      if (m.down > 4) {
        flip(100 - m.spot);
        text += " Turnover on downs.";
      }
    }
  }
  const runoff =
    m.stopped || dead
      ? 0
      : m.tempo === "Hurry-up"
        ? 13
        : m.tempo === "Chew clock"
          ? 38
          : 33;
  m.clock = Math.max(
    0,
    m.clock - Math.max(1, Math.ceil(execution.duration - 0.8)) - runoff,
  );
  m.stopped = false;
  m.last = {
    text,
    start,
    spot: r.kind === "interception" ? r.spot : clamp(start + r.yards, 0, 100),
    poss: k,
    passing: r.passing,
    call: execution.call,
    animation:
      r.kind === "sack"
        ? "tackle"
        : r.passing
          ? "throw"
          : execution.call === "Outside run"
            ? "juke"
            : "run",
    execution,
  };
  m.official = {
    signal: /TOUCHDOWN|field goal!/.test(text)
      ? "touchdown"
      : r.kind === "incomplete"
        ? "incomplete"
        : first
          ? "first"
          : "whistle",
    text:
      r.kind === "incomplete"
        ? "Incomplete pass. Clock stopped."
        : first
          ? "First down. Move the chains."
          : "Play dead. Ball spotted.",
  };
  m.events.unshift({
    text,
    time: `${oldQuarter > 4 ? "OT" : "Q" + oldQuarter} ${Math.floor(oldClock / 60)}:${String(oldClock % 60).padStart(2, "0")}`,
    highlight: /TOUCHDOWN|INTERCEPTED|field goal|SAFETY/.test(text),
  });
  m.events = m.events.slice(0, 200);
  const both = m.settings?.otMode === "Both teams receive a possession",
    otReady = !both || m.otDrives?.every((n) => n > 0);
  if (m.quarter > 4 && m.score[0] !== m.score[1] && otReady) m.finished = true;
  if (!m.clock && !m.finished) {
    if (m.quarter === 2) m.halftime = true;
    else if (m.quarter >= 4) {
      if (m.score[0] !== m.score[1] && (m.quarter === 4 || otReady))
        m.finished = true;
      else {
        m.quarter++;
        m.clock = 600;
        m.periodScores.push([0, 0]);
        if (m.quarter === 5) {
          m.poss = 0;
          m.otDrives = [0, 0];
          m.spot = m.settings?.touchback || 25;
          m.down = 1;
          m.toGo = 10;
        }
      }
    } else {
      m.quarter++;
      m.clock = 900;
    }
  }
  execution.events.push({
    id: execution.playId + ":result",
    time: execution.duration,
    type: "ResultConfirmed",
    text,
    score: [...m.score],
    firstDown: first,
    quarter: oldQuarter,
  });
  return m;
}
