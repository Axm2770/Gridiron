import { dialogueConsequences } from "./career-systems.mjs";
// Original, deterministic career fiction. Never a live news feed.
import * as S from "./state.mjs";
const clamp = (n, a = 0, b = 99) => Math.max(a, Math.min(b, n));
const hash = (s) => {
  let h = 2166136261;
  for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
};
const own = (s, id) => s.roster.find((p) => p.id === id);
export const CATEGORIES = [
  "All",
  "Decisions",
  "Players",
  "Team",
  "Medical",
  "Interviews",
  "Scouting",
  "League",
];
export function ensureOffice(s) {
  const f = s.franchise;
  f.office ??= {
    version: 1,
    messages: [],
    stories: [],
    seen: [],
    rounds: [],
    step: 0,
    followedTeams: [s.team],
    preferences: { pauseOnUrgent: true, newsFrequency: "Normal" },
    moodHistory: [],
  };
  const o = f.office;
  for (const k of [
    "messages",
    "stories",
    "seen",
    "rounds",
    "followedTeams",
    "moodHistory",
  ])
    if (!Array.isArray(o[k])) o[k] = [];
  o.preferences = {
    pauseOnUrgent: true,
    newsFrequency: "Normal",
    ...o.preferences,
  };
  o.step = Number.isFinite(o.step) ? o.step : 0;
  return o;
}
export function postMessage(s, key, item) {
  const o = ensureOffice(s),
    id = "mail-" + key;
  if (o.seen.includes(id)) return o.messages.find((m) => m.id === id) || null;
  o.seen.push(id);
  const m = {
    id,
    date:s.franchise.calendarSim?.date,
    key,
    year: s.year,
    week: s.week,
    phase: s.phase,
    team: s.team,
    category: "Team",
    priority: "normal",
    source: "Football operations",
    read: false,
    bookmarked: false,
    status: item.decision ? "pending" : "info",
    createdStep: o.step,
    ...item,
  };
  if (m.decision) m.dueStep = o.step + 2;
  o.messages.unshift(m);
  trimOffice(o);
  return m;
}
export function postStory(s, key, item) {
  const o = ensureOffice(s),
    id = "story-" + key;
  if (o.seen.includes(id)) return null;
  o.seen.push(id);
  const article = {
    id,
    date:s.franchise.calendarSim?.date,
    year: s.year,
    week: s.week,
    team: s.team,
    category: "Team",
    source: "Gridiron Wire",
    read: false,
    bookmarked: false,
    ...item,
  };
  o.stories.unshift(article);
  trimOffice(o);
  return article;
}
function trimOffice(o) {
  // Keep pending decisions and bookmarks even when the rolling archive fills.
  o.messages = o.messages
    .filter((m, i) => i < 180 || m.status === "pending" || m.bookmarked)
    .slice(0, 280);
  o.stories = o.stories.filter((m, i) => i < 160 || m.bookmarked).slice(0, 240);
  o.seen = o.seen.slice(-1800);
  o.rounds = o.rounds.slice(-180);
  o.moodHistory = o.moodHistory.slice(0, 80);
}
export function applyMood(
  s,
  {
    playerId,
    delta = 0,
    teamDelta = 0,
    trust = 0,
    fan = 0,
    owner = 0,
    reason,
    sourceId,
    spillover = true,
  },
) {
  const o = ensureOffice(s),
    p = own(s, playerId),
    changes = [];
  if (p && (delta || trust)) {
    const before = p.morale ?? 75,
      oldTrust = p.coachTrust ?? 60;
    p.morale = clamp(before + delta, 20);
    p.coachTrust = clamp(oldTrust + trust);
    const entry = {
      year: s.year,
      week: s.week,
      reason,
      delta: p.morale - before,
      trust: p.coachTrust - oldTrust,
      sourceId,
    };
    p.moodLog ??= [];
    p.moodLog.unshift(entry);
    p.moodLog = p.moodLog.slice(0, 20);
    changes.push({ name: p.name, ...entry });
    if (
      spillover &&
      Math.abs(delta) >= 4 &&
      (p.persona?.leadership || 0) >= 0.65
    ) {
      const peers = s.roster
          .filter(
            (q) =>
              q.id !== p.id &&
              (q.pos === p.pos || (q.persona?.loyalty || 0) > 0.75),
          )
          .slice(0, 8),
        d = Math.sign(delta);
      let affected = 0;
      for (const q of peers) {
        const b = q.morale ?? 75;
        q.morale = clamp(b + d, 20);
        if (q.morale === b) continue;
        affected++;
        q.moodLog ??= [];
        q.moodLog.unshift({
          year: s.year,
          week: s.week,
          reason: `Reaction to ${p.name}: ${reason}`,
          delta: q.morale - b,
          trust: 0,
          sourceId,
        });
        q.moodLog = q.moodLog.slice(0, 20);
      }
      if (affected)
        changes.push({
          name: `${affected} influenced teammates`,
          delta: d,
          trust: 0,
        });
    }
  }
  const before = s.morale ?? 75;
  s.morale = clamp(before + teamDelta, 35);
  if (teamDelta) {
    for (const q of s.roster) {
      const prior = q.morale ?? 75;
      q.morale = clamp(prior + teamDelta, 20);
      if (q.morale === prior) continue;
      q.moodLog ??= [];
      q.moodLog.unshift({
        year: s.year,
        week: s.week,
        reason: `Team message: ${reason}`,
        delta: q.morale - prior,
        trust: 0,
        sourceId,
      });
      q.moodLog = q.moodLog.slice(0, 20);
    }
    changes.push({ name: "Team morale", delta: s.morale - before, trust: 0 });
  }
  const c = s.franchise.clubs[s.team];
  if (c) {
    c.fanApproval = clamp((c.fanApproval ?? 60) + fan);
    c.owner.patience = clamp(c.owner.patience + owner);
  }
  o.moodHistory.unshift({
    year: s.year,
    week: s.week,
    reason,
    sourceId,
    changes,
    fan,
    owner,
  });
  trimOffice(o);
  return changes;
}
export function decisionOptions(m) {
  const sets = {
    expectations: [
      [
        "steady",
        "Set a clear, achievable weekly standard",
        "Build confidence without making a season-long promise.",
      ],
      [
        "ambitious",
        "Challenge the room to chase the playoffs",
        "A confident roster responds; a weaker roster can feel pressured.",
      ],
      [
        "development",
        "Put development and competition first",
        "A patient message keeps the focus on long-term progress.",
      ],
    ],
    role: [
      [
        "clarity",
        "Explain the depth chart in private",
        "Small trust gain; no guarantee of extra snaps.",
      ],
      [
        "review",
        "Commit to a role review next week",
        "More reassurance now. You must meet the player next week.",
      ],
      [
        "challenge",
        "Tell him to earn it at practice",
        "Ambitious personalities may respond; others may lose trust.",
      ],
    ],
    leadership: [
      [
        "praise",
        "Credit the player and the whole room",
        "Recognition boosts morale and reinforces leadership.",
      ],
      [
        "private",
        "Thank him privately",
        "Build trust while keeping outside expectations quiet.",
      ],
      [
        "standard",
        "Make that the standard for everyone",
        "Demanding players respond; others feel pressure.",
      ],
    ],
    social: [
      [
        "private",
        "Address the frustration in private",
        "Protect trust while asking for a quieter approach.",
      ],
      [
        "back",
        "Back the player publicly",
        "Player feels supported; ownership dislikes the distraction.",
      ],
      [
        "discipline",
        "Set a firm public boundary",
        "Standards rise, but the player may feel singled out.",
      ],
    ],
    recovery: [
      [
        "patient",
        "Support the medical timetable",
        "Reassurance and trust without promising a return date.",
      ],
      [
        "role",
        "Explain the return-to-play role",
        "Clarity helps, especially for a player worried about his place.",
      ],
      [
        "pressure",
        "Challenge him to be ready as soon as cleared",
        "Ambitious players may accept it; pressure can hurt morale.",
      ],
    ],
    team: [
      [
        "unite",
        "Take responsibility and bring the room together",
        "A steady message after a difficult result.",
      ],
      [
        "challenge",
        "Challenge the standards in the room",
        "More effective when confidence is already strong.",
      ],
      [
        "process",
        "Keep the message focused on preparation",
        "A smaller, dependable lift.",
      ],
    ],
    contract: [
      [
        "clarity",
        "Explain the plan without promising a deal",
        "Improves trust. Contract demands still need a real offer.",
      ],
      [
        "review",
        "Arrange a private role review",
        "Reassures the player; creates a meeting obligation.",
      ],
      [
        "firm",
        "Stand by the current agreement",
        "Protects the club stance, at a relationship cost.",
      ],
    ],
  };
  return (sets[m.decision] || sets.role).map(([id, text, note]) => ({
    id,
    text,
    note,
  }));
}
export function respondMessage(s, id, choice, { delegated = false } = {}) {
  const o = ensureOffice(s),
    m = o.messages.find((x) => x.id === id);
  if (!m || m.team !== s.team)
    throw Error("This message is not part of the current career.");
  if (m.status !== "pending")
    throw Error("This decision has already been handled.");
  if (s.live && !delegated)
    throw Error(
      "Finish the current game before responding to office decisions.",
    );
  if (!delegated && !S.allowed(s, "media"))
    throw Error("Your role delegates player communication to the head coach.");
  const option = decisionOptions(m).find((c) => c.id === choice);
  if (!option) throw Error("Choose an available response.");
  const p = own(s, m.playerId);
  if (m.playerId && !p) {
    m.status = "closed";
    m.read = true;
    m.outcome = "Player left the franchise; no relationship change.";
    return m;
  }
  let delta = 0,
    teamDelta = 0,
    trust = 0,
    fan = 0,
    owner = 0;
  const ambition = p?.persona?.ambition ?? 0.5;
  switch (m.decision) {
    case "expectations":
      teamDelta =
        choice === "steady"
          ? 2
          : choice === "ambitious"
            ? s.roster.reduce((a, p) => a + p.ovr, 0) /
                Math.max(1, s.roster.length) >=
              77
              ? 3
              : -2
            : 1;
      break;
    case "leadership":
      delta =
        choice === "praise"
          ? 4
          : choice === "private"
            ? 2
            : ambition > 0.55
              ? 3
              : -1;
      trust = choice === "private" ? 4 : 1;
      teamDelta = choice === "praise" ? 1 : 0;
      break;
    case "social":
      delta = choice === "private" ? 2 : choice === "back" ? 4 : -4;
      trust = choice === "discipline" ? -4 : 3;
      owner = choice === "back" ? -2 : choice === "discipline" ? 1 : 0;
      break;
    case "recovery":
      delta =
        choice === "patient"
          ? 3
          : choice === "role"
            ? 2
            : ambition > 0.7
              ? 1
              : -3;
      trust = choice === "pressure" ? -2 : 4;
      break;
    case "team":
      teamDelta =
        choice === "unite"
          ? 2
          : choice === "challenge"
            ? s.morale >= 65
              ? 3
              : -2
            : 1;
      break;
    case "contract":
      delta = choice === "firm" ? -3 : 2;
      trust = choice === "firm" ? -3 : 3;
      break;
    default:
      delta =
        choice === "challenge"
          ? ambition > 0.55
            ? 3
            : -3
          : choice === "review"
            ? 4
            : 2;
      trust = choice === "challenge" ? -1 : 3;
  }
  if (choice === "review" && p) {
    const cinema = (s.franchise.cinema ??= {
      history: [],
      promises: [],
      active: null,
    });
    cinema.promises ??= [];
    if (!cinema.promises.some((x) => !x.done && x.playerId === p.id))
      cinema.promises.push({
        playerId: p.id,
        name: p.name,
        year: s.year,
        week: s.week,
        due: s.week + 1,
        type: "Role review",
        done: false,
      });
  }
  dialogueConsequences(s, {
    key: `office:${m.id}`,
    person: p,
    tone: choice,
    delta: delta || teamDelta,
    publicCriticism: m.decision === "social" && choice === "discipline",
  });
  const changes = applyMood(s, {
    playerId: p?.id,
    delta,
    teamDelta,
    trust,
    fan,
    owner,
    sourceId: m.id,
    reason: option.text,
  });
  m.status = delegated ? "delegated" : "resolved";
  m.read = true;
  m.response = option.text;
  m.resolvedStep = o.step;
  m.changes = changes;
  m.outcome = delegated
    ? "The head coach used the default private response at the deadline."
    : choice === "review"
      ? "Role review promised. Meet this player during the next week to follow through."
      : "Your response has been delivered. The relationship changes are recorded below.";
  if (m.decision === "contract")
    m.outcome += " A conversation does not settle a contract holdout.";
  if (["social", "leadership", "team", "expectations"].includes(m.decision))
    postStory(s, "response-" + id, {
      title:
        m.decision === "social"
          ? "Coach addresses the noise around the team"
          : m.decision === "leadership"
            ? "Leadership recognised inside the building"
            : "A clear message from the coaching office",
      body: `${p ? p.name + ": " : ""}${option.text}`,
      category: m.category,
      playerId: p?.id,
      messageId: m.id,
      source: "Team communications",
    });
  return m;
}
export function pendingDecisions(s) {
  return ensureOffice(s).messages.filter(
    (m) => m.status === "pending" && m.team === s.team,
  );
}
const person = (s) =>
  s.roster
    .slice()
    .sort(
      (a, b) => (b.persona?.leadership || 0) - (a.persona?.leadership || 0),
    )[0];
export function syncOffice(s) {
  const o = ensureOffice(s),
    c = s.franchise.clubs[s.team],
    leader = person(s);
  if (!o.welcomed) {
    postMessage(s, `welcome-${s.team}`, {
      title: "Your first message to the locker room",
      summary: "Set the tone for your coaching tenure.",
      body: "The captain wants to hear your priorities. A clear message helps players understand what success means this season.",
      source: "Player liaison",
      category: "Team",
      priority: "important",
      decision: "expectations",
      playerId: leader?.id,
    });
    o.welcomed = true;
  }
  if (o.outlookYear !== s.year) {
    postStory(s, `outlook-${s.year}-${s.team}`, {
      title: "A new voice on the sideline",
      body: `${s.coach.name} begins a new chapter. Training standards, roster decisions and the response to pressure will shape the season. Follow this career through the league desk.`,
      category: "Team",
      source: "Gridiron Journal",
    });
    o.outlookYear = s.year;
  }
  o.eventKeys ??= [];
  for (const e of [...(s.franchise.events || [])].reverse().slice(-65)) {
    if (e.title === "Weekly review") continue;
    const key =
      "event-" + hash(`${e.id}:${e.year}:${e.week}:${e.title}:${e.body}`);
    if (o.eventKeys.includes(key)) continue;
    o.eventKeys.push(key);
    o.eventKeys = o.eventKeys.slice(-250);
    const category =
      e.kind === "media"
        ? "Interviews"
        : e.kind === "sanction" || e.kind === "ownership"
          ? "League"
          : /draft|scout/i.test(e.title)
            ? "Scouting"
            : /contract|trade|holdout|player|sign/i.test(e.title)
              ? "Players"
              : "Team";
    const dramatic = e.kind === "drama",
      p = dramatic
        ? s.roster.find(
            (p) =>
              (/holdout/i.test(e.title) && p.holdout) ||
              (/trade/i.test(e.title) && p.tradeDemand),
          )
        : null;
    const m = postMessage(s, key, {
      year: e.year,
      week: e.week,
      title: e.title,
      summary: e.body,
      body: e.body,
      category,
      source: dramatic
        ? "Player liaison"
        : e.kind === "media"
          ? "Media officer"
          : e.kind === "private"
            ? "Coaching office"
            : "Football operations",
      priority: dramatic ? "urgent" : "normal",
      playerId: p?.id,
      decision: dramatic
        ? /holdout/i.test(e.title)
          ? "contract"
          : /leak/i.test(e.title)
            ? "team"
            : "role"
        : null,
      route:
        category === "Scouting"
          ? "Scouting"
          : category === "League"
            ? "League"
            : /contract/i.test(e.title)
              ? "Contracts"
              : "Overview",
    });
    if (
      e.kind !== "private" &&
      (!e.title.startsWith("Conversation:") ||
        /final whistle|lights come on/i.test(e.title)) &&
      !/^(Assistant match report|NFL roster database loaded|A win for the franchise|A difficult result)$/.test(
        e.title,
      )
    )
      postStory(s, key, {
        year: e.year,
        week: e.week,
        title: e.title,
        body: e.body,
        category,
        source: e.kind === "ownership" ? "League desk" : "Gridiron Wire",
        messageId: m?.id,
      });
  }
  if (s.interviewPending)
    postMessage(s, `interview-${s.year}-${s.week}-${s.interviewPending.type}`, {
      title: "The press room is ready",
      summary: "Your postgame interview is waiting.",
      body: "Your response will be heard by the team, supporters and ownership. Attend the interview to deliver your message.",
      category: "Interviews",
      priority: "important",
      source: "Media officer",
      route: "Conversations",
      interview: true,
    });
  for (const m of o.messages) {
    if (m.interview && !s.interviewPending && m.status === "info")
      m.status = "closed";
  }
  o.medicalTracking ??= {};
  for (const p of s.roster) {
    const tracked = o.medicalTracking[p.id];
    if (p.injury) {
      if (!tracked || !tracked.active || p.injury > tracked.remaining) {
        const key = `injury-${p.id}-${s.year}-${s.week}-${(tracked?.serial || 0) + 1}`;
        o.medicalTracking[p.id] = {
          active: true,
          remaining: p.injury,
          serial: (tracked?.serial || 0) + 1,
          key,
        };
        const m = postMessage(s, key, {
          title: `Medical update: ${p.name}`,
          summary: `${p.medical?.diagnosis || "Injury"} · ${p.injury} week(s) remaining at this report.`,
          body: "The player is unavailable. Review his medical record and training load before choosing a replacement. Recovery and missed practice can affect development.",
          category: "Medical",
          source: "Medical team",
          playerId: p.id,
          route: "Medical",
        });
        if (p.injury >= 3)
          postStory(s, key, {
            title: `Availability watch: ${p.name}`,
            body: `The player is unavailable with ${p.medical?.diagnosis || "an injury"}. The staff will manage recovery and reassess his workload.`,
            category: "Medical",
            playerId: p.id,
            messageId: m?.id,
            source: "Team communications",
          });
      } else tracked.remaining = p.injury;
    } else if (tracked?.active) {
      tracked.active = false;
      postMessage(s, tracked.key + "-return", {
        title: `Back in contention: ${p.name}`,
        summary: "Cleared to return; workload still needs managing.",
        body: "The injury absence has ended. Rehabilitation and missed practice may still affect condition and ability. Review the player's development report before restoring full workload.",
        category: "Medical",
        source: "Medical team",
        playerId: p.id,
        route: "Development",
      });
    }
  }
  for (const id of Object.keys(o.medicalTracking))
    if (!own(s, id)) delete o.medicalTracking[id];
  // A due promise is a task, not a decorative headline.
  for (const p of s.franchise.cinema?.promises || []) {
    const id = `promise-${p.playerId}-${p.year}-${p.week}`;
    if (!p.done && (p.year < s.year || s.week >= p.due))
      postMessage(s, id, {
        title: `Role review due: ${p.name}`,
        summary: "You gave your word. Meet the player this week.",
        body: "Complete a one-on-one conversation to review the role. Ignoring the agreed review reduces trust when the promise expires.",
        category: "Players",
        priority: "urgent",
        playerId: p.playerId,
        source: "Player liaison",
        route: "Conversations",
        promiseKey: id,
      });
    if (p.done) {
      const m = o.messages.find((m) => m.key === id);
      if (m) {
        m.status = "closed";
        m.outcome = p.outcome;
      }
    }
  }
  trimOffice(o);
  return o;
}
export function processNewsRound(s, results, roundKey) {
  const o = ensureOffice(s);
  if (o.rounds.includes(roundKey)) return false;
  o.rounds.push(roundKey);
  o.step++;
  for (const m of o.messages.filter(
    (m) => m.status === "pending" && m.dueStep <= o.step,
  ))
    respondMessage(s, m.id, decisionOptions(m)[0].id, { delegated: true });
  const year = s.year,
    week = s.week,
    ours = results.find((r) => r.a === s.team || r.b === s.team),
    leader = person(s);
  if (ours) {
    const i = ours.a === s.team ? 0 : 1,
      won = ours.score[i] > ours.score[1 - i],
      delta = won ? 2 : -2;
    applyMood(s, {
      teamDelta: 0,
      playerId: leader?.id,
      delta,
      trust: 0,
      spillover: false,
      sourceId: "result-" + roundKey,
      reason: won
        ? "Confidence from the latest win"
        : "Confidence after the latest loss",
    });
    postStory(s, "match-" + roundKey, {
      title: won
        ? `${s.franchise.clubs[s.team].identity?.name || "The team"} turn preparation into a win`
        : `${s.franchise.clubs[s.team].identity?.name || "The team"} search for a response after defeat`,
      body: `Final score: ${ours.score[i]}–${ours.score[1 - i]}. ${won ? "The coaching staff want the confidence carried into practice." : "Players and coaches turn to the film to find a response."}`,
      category: "Team",
      source: "Sunday Review",
    });
    if (!won && o.step % 3 === 0)
      postMessage(s, "response-" + roundKey, {
        title: "The room needs a response",
        summary: "Your captain asks for a clear message after the loss.",
        body: "Results have put pressure on the group. Choose how to address the team. A challenge can backfire when confidence is already low.",
        category: "Team",
        priority: "urgent",
        source: "Team captain",
        decision: "team",
        playerId: leader?.id,
      });
  }
  const rivals = results
    .filter((r) => r.a !== s.team && r.b !== s.team && r.score)
    .sort(
      (a, b) =>
        Math.abs(a.score[0] - a.score[1]) - Math.abs(b.score[0] - b.score[1]),
    );
  for (const [i, r] of rivals
    .slice(
      0,
      o.preferences.newsFrequency === "Minimal"
        ? 1
        : o.preferences.newsFrequency === "Extensive"
          ? 5
          : 3,
    )
    .entries())
    postStory(s, "league-" + roundKey + "-" + i, {
      team: r.a,
      otherTeam: r.b,
      category: "League",
      title:
        Math.abs(r.score[0] - r.score[1]) <= 7
          ? `${s.franchise.clubs[r.score[0] > r.score[1] ? r.a : r.b].identity?.name || "The winners"} hold on in a one-score finish`
          : `${s.franchise.clubs[r.score[0] > r.score[1] ? r.a : r.b].identity?.name || "The winners"} make their mark on the standings`,
      body: `${s.franchise.clubs[r.a].identity?.name || "Team " + (r.a + 1)} ${r.score[0]}–${r.score[1]} ${s.franchise.clubs[r.b].identity?.name || "Team " + (r.b + 1)}. Standings have been updated.`,
      source: "League desk",
      route: "League",
    });
  const training = s.roster
      .filter((p) => p.progression?.lastReport?.year === year)
      .sort(
        (a, b) => (b.progression.training ?? 0) - (a.progression.training ?? 0),
      ),
    best = training.find((p) => !p.injury && p.progression.training >= 7);
  if (best)
    postMessage(s, "training-" + roundKey, {
      title: `Practice standout: ${best.name}`,
      summary: `Training grade ${best.progression.training.toFixed(1)} / 10.`,
      body: "Your development staff highlight strong practice work. Open the individual report to see the underlying ability change, workload and next focus.",
      category: "Players",
      source: "Development staff",
      playerId: best.id,
      route: "Development",
    });
  const p = s.roster
    .filter((p) => !p.injury)
    .sort((a, b) => hash(a.id + roundKey) - hash(b.id + roundKey))[0];
  if (p) {
    const type = o.step % 6,
      key = "player-action-" + roundKey;
    if (type === 1) {
      applyMood(s, {
        playerId: p.id,
        delta: 3,
        trust: 1,
        reason: "Stayed after practice to help a teammate",
        sourceId: key,
      });
      postMessage(s, key, {
        title: `${p.name} sets an example`,
        summary: "Extra work has lifted the position group.",
        body: "The position coach reports that the player stayed after practice to help a teammate. Recognise the effort or use it to reinforce expectations.",
        category: "Players",
        decision: "leadership",
        playerId: p.id,
        source: "Position coach",
      });
      postStory(s, key, {
        title: "Extra work, shared standards",
        body: `${p.name} stayed after practice to help a teammate. The gesture has been noticed in the building.`,
        category: "Players",
        playerId: p.id,
      });
    }
    if (type === 2) {
      const reserve = s.roster
        .filter((q) => !q.starter && !q.injury)
        .sort((a, b) => b.ovr - a.ovr)[0];
      if (reserve) {
        applyMood(s, {
          playerId: reserve.id,
          delta: -4,
          trust: -2,
          reason: "Concern about a limited role",
          sourceId: key,
        });
        postMessage(s, key, {
          title: `${reserve.name} wants clarity`,
          summary: "The reserve asks how to earn a bigger role.",
          body: "A player sees limited opportunities and wants an honest explanation. Your response affects morale and trust. A promised review creates a real obligation.",
          category: "Players",
          priority: "important",
          decision: "role",
          playerId: reserve.id,
          source: "Player liaison",
        });
      }
    }
    if (type === 4) {
      const unhappy = s.roster.slice().sort((a, b) => a.morale - b.morale)[0];
      applyMood(s, {
        playerId: unhappy.id,
        delta: -3,
        trust: -1,
        reason: "Public frustration over the team’s direction",
        sourceId: key,
      });
      const m = postMessage(s, key, {
        title: "A frustrated message reaches the outside",
        summary: `${unhappy.name} questions how the team can improve.`,
        body: "A player voices frustration with the team’s progress. Address the concern in private, offer public support or establish a firm boundary.",
        category: "Players",
        priority: "urgent",
        decision: "social",
        playerId: unhappy.id,
        source: "Media officer",
      });
      postStory(s, key, {
        title: "Frustration follows the latest preparation cycle",
        body: `${unhappy.name} wants more clarity about the team's direction. The coach's response will matter inside the building.`,
        category: "Players",
        playerId: unhappy.id,
        messageId: m.id,
      });
    }
  }
  const recovering = s.roster.find((p) => p.injury && p.injury >= 3);
  if (recovering && o.step % 3 === 0)
    postMessage(s, "rehab-" + roundKey, {
      title: `Reassurance needed: ${recovering.name}`,
      summary: "A long rehabilitation spell is testing confidence.",
      body: "The injured player worries about his role and his progress. Your medical staff recommend a supportive, realistic message.",
      category: "Medical",
      priority: "important",
      decision: "recovery",
      playerId: recovering.id,
      source: "Medical liaison",
    });
  syncOffice(s);
  return true;
}
export function officeCounts(s) {
  const o = ensureOffice(s);
  return {
    unread: o.messages.filter((m) => !m.read).length,
    pending: pendingDecisions(s).length,
    urgent: o.messages.filter(
      (m) => m.status === "pending" && m.priority === "urgent",
    ).length,
  };
}
