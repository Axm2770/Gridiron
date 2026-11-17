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
      ...matchStory(s, ours, i, roundKey),
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
  const rivals = leagueHeadliners(
    s,
    results.filter((r) => r.a !== s.team && r.b !== s.team && r.score),
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
      ...leagueStory(s, r, `${roundKey}-${i}`),
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
    // Story-only features fill the weeks without a decision, so the feed is not just results.
    if (type === 0 || type === 3 || type === 5) {
      const feature = featureStory(s, p, type, roundKey);
      if (feature) postStory(s, key, { ...feature, category: "Players", playerId: feature.playerId ?? p.id, source: feature.source || "Gridiron Journal" });
    }
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

/* ------------------------------------------------------------ story variety */
// Deterministic per round key; the office remembers recently used lines and prefers fresh ones,
// so consecutive weeks do not repeat the same headline wording.

const fillLine = (t, ctx) => t.replace(/\{(\w+)\}/g, (_, k) => ctx[k] ?? "");
function vary(s, family, key, list, ctx) {
  const o = ensureOffice(s);
  o.recentLines = Array.isArray(o.recentLines) ? o.recentLines : [];
  const ids = list.map((_, i) => `${family}:${i}`),
    fresh = ids.filter((id) => !o.recentLines.includes(id)),
    pool = fresh.length ? fresh : ids,
    id = pool[hash(key + family) % pool.length];
  o.recentLines.unshift(id);
  o.recentLines = o.recentLines.slice(0, 60);
  return fillLine(list[ids.indexOf(id)], ctx);
}
const clubName = (s, t) =>
  s.franchise.clubs[t]?.identity?.name || globalThis.clubs?.[t]?.[2] || `Team ${t + 1}`;
const recordOf = (s, t) => {
  const r = s.teams?.[t];
  return r ? `${r.w}-${r.l}${r.t ? "-" + r.t : ""}` : "";
};
const winPct = (s, t) => {
  const r = s.teams?.[t];
  return r && r.w + r.l >= 3 ? r.w / (r.w + r.l) : 0.5;
};

const MATCH_TITLES = {
  winClose: ["{team} survive a one-score fight with the {opp}", "Nerves hold: {team} edge the {opp} {us}–{them}", "{team} find a way late against the {opp}", "{team} close it out when it matters"],
  winBig: ["{team} overwhelm the {opp}", "No contest: {team} roll past the {opp}", "{team} dominate from the opening drive", "{team} send a message to the {opp}"],
  winShootout: ["{team} outscore the {opp} in a shootout", "Offense rules the day as {team} beat the {opp}"],
  win: ["{team} turn preparation into a win", "{team} handle the {opp} {us}–{them}", "A complete performance lifts the {team} to {record}", "{team} control the second half against the {opp}"],
  lossClose: ["{team} fall just short against the {opp}", "One play away: {team} lose {us}–{them}", "Late heartbreak for the {team}", "So close for the {team} against the {opp}"],
  lossBig: ["{opp} run away from the {team}", "A long afternoon: {team} beaten {them}–{us}", "{team} have no answers against the {opp}"],
  loss: ["{team} search for a response after defeat", "{team} drop to {record} after loss to the {opp}", "Missed chances cost the {team} against the {opp}", "The {opp} get the better of the {team}"],
  tie: ["{team} and {opp} cannot be separated", "Honours even: {team} and {opp} tie {us}–{them}"],
};
const MATCH_LINES = {
  winClose: ["The final possession was managed with real composure.", "The defense made the last stop count.", "It was not pretty, but the staff will take the result."],
  winBig: ["Every phase contributed and the starters rested late.", "The game plan landed from the first series.", "The depth chart got valuable snaps in the fourth quarter."],
  win: ["The coaching staff want the confidence carried into practice.", "Third-down execution made the difference.", "Ball security and field position told the story."],
  lossClose: ["One more stop or one more first down would have flipped it.", "The margin came down to a handful of snaps.", "The locker room knows how close that was."],
  lossBig: ["Players and coaches turn to the film to find a response.", "Nothing worked for long enough to matter.", "The staff will reset fundamentals this week."],
  loss: ["Players and coaches turn to the film to find a response.", "Penalties and turnovers stalled promising drives.", "The second half never found a rhythm."],
  tie: ["Neither side could find the decisive play."],
};

export function matchStory(s, ours, i, roundKey) {
  const us = ours.score[i],
    them = ours.score[1 - i],
    margin = us - them,
    opp = i === 0 ? ours.b : ours.a,
    ctx = { team: clubName(s, s.team), opp: clubName(s, opp), us, them, record: recordOf(s, s.team) },
    kind =
      margin === 0 ? "tie"
      : margin > 0 ? (margin <= 3 ? "winClose" : margin >= 21 ? "winBig" : us + them >= 60 ? "winShootout" : "win")
      : -margin <= 3 ? "lossClose" : -margin >= 21 ? "lossBig" : "loss",
    lineKind = MATCH_LINES[kind] ? kind : margin > 0 ? "win" : "loss";
  return {
    title: vary(s, "match-" + kind, roundKey, MATCH_TITLES[kind], ctx),
    body: `Final score: ${us}–${them}. ${vary(s, "match-line-" + lineKind, roundKey, MATCH_LINES[lineKind], ctx)}${ctx.record ? ` The ${ctx.team} are ${ctx.record}.` : ""}`,
  };
}

// Mix the week's league headlines: the closest game, the biggest margin, the highest-scoring
// game and the biggest upset by record, then the rest by closeness.
export function leagueHeadliners(s, games) {
  const gap = (r) => Math.abs(r.score[0] - r.score[1]),
    upset = (r) => {
      const [w, l] = r.score[0] > r.score[1] ? [r.a, r.b] : [r.b, r.a];
      return winPct(s, l) - winPct(s, w);
    },
    by = (f) => [...games].sort((x, y) => f(x) - f(y))[0],
    picks = [by(gap), by((r) => -gap(r)), by((r) => -(r.score[0] + r.score[1])), by((r) => -upset(r))];
  return [...new Set([...picks.filter(Boolean), ...[...games].sort((x, y) => gap(x) - gap(y))])];
}

const LEAGUE_TITLES = {
  close: ["{w} hold on in a one-score finish", "{w} edge the {l}", "Last-minute drama as {w} beat the {l}"],
  rout: ["{w} rout the {l}", "{w} make a statement against the {l}", "{l} overwhelmed by the {w}"],
  shootout: ["Points everywhere as {w} outlast the {l}", "{w} win a shootout with the {l}"],
  grind: ["{w} grind past the {l} in a defensive battle", "Defense wins out: {w} beat the {l}"],
  upset: ["Upset: {w} stun the {l}", "{w} shake up the standings against the {l}"],
  plain: ["{w} make their mark on the standings", "{w} take care of the {l}", "{w} move to {wrec} with a win over the {l}"],
};
const LEAGUE_LINES = ["Standings have been updated.", "The {l} fall to {lrec}.", "The {w} improve to {wrec}.", "Playoff pictures shift across the conference."];

export function leagueStory(s, r, key) {
  const [w, l] = r.score[0] >= r.score[1] ? [r.a, r.b] : [r.b, r.a],
    gap = Math.abs(r.score[0] - r.score[1]),
    total = r.score[0] + r.score[1],
    kind =
      winPct(s, l) - winPct(s, w) >= 0.25 ? "upset"
      : gap <= 3 ? "close"
      : gap >= 21 ? "rout"
      : total >= 60 ? "shootout"
      : total <= 23 ? "grind"
      : gap <= 7 ? "close"
      : "plain",
    ctx = { w: clubName(s, w), l: clubName(s, l), wrec: recordOf(s, w), lrec: recordOf(s, l) };
  return {
    title: vary(s, "league-" + kind, key, LEAGUE_TITLES[kind], ctx),
    body: `${clubName(s, r.a)} ${r.score[0]}–${r.score[1]} ${clubName(s, r.b)}. ${vary(s, "league-line", key, LEAGUE_LINES, ctx)}`,
  };
}

const FEATURES = {
  0: [
    ["{name} visits a children's hospital in {city}", "The {pos} spent his day off signing helmets and talking football with young patients."],
    ["{name} hosts a youth camp", "More than a hundred local kids ran drills with the {pos}, who stayed until the last autograph."],
    ["{name} backs a local food drive", "Teammates joined the {pos} to pack meals for families across {city}."],
    ["A quiet act of leadership from {name}", "The {pos} paid for the practice-squad players' team dinner this week."],
  ],
  3: [
    ["{name} is taking notes", "The young {pos} has been first into the film room, working alongside {mentor}."],
    ["Mentor and pupil: {mentor} and {name}", "Teammates say {mentor} has taken the young {pos} under his wing this season."],
    ["Veteran voice: {name} sets the tone", "Younger players say the {pos} is the one they ask when the playbook gets complicated."],
  ],
  5: [
    ["Film room: what {name} does differently", "Coaches point to the {pos}'s preparation: {stat}"],
    ["By the numbers: {name}", "A closer look at the {pos}'s season so far: {stat}"],
    ["Inside the scheme: {name}'s role grows", "The staff have found new ways to use the {pos}. {stat}"],
  ],
};

export function featureStory(s, p, type, roundKey) {
  const list = FEATURES[type];
  if (!list) return null;
  const st = p.stats?.[s.year] || {},
    stat =
      st.passYards ? `${st.passYards} passing yards and counting.`
      : st.rushYards ? `${st.rushYards} rushing yards so far.`
      : st.recYards ? `${st.recYards} receiving yards so far.`
      : st.tackles ? `${st.tackles} tackles and climbing.`
      : "the production is starting to match the practice tape.",
    young = (p.age ?? 27) <= 24,
    mentor = s.roster
      .filter((q) => q.id !== p.id && q.pos === p.pos && (q.age ?? 0) >= 28)
      .sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0))[0],
    options = type === 3 ? (young && mentor ? list.slice(0, 2) : list.slice(2)) : list,
    ctx = {
      name: p.name,
      pos: p.pos,
      city: s.franchise.clubs[s.team]?.identity?.city || globalThis.clubs?.[s.team]?.[1] || "town",
      mentor: mentor?.name || "a veteran",
      stat,
    };
  const title = vary(s, `feature-${type}-${options.length}`, roundKey, options.map((x) => x[0]), ctx),
    i = options.findIndex((x) => fillLine(x[0], ctx) === title);
  return { title, body: fillLine(options[Math.max(0, i)][1], ctx), playerId: p.id };
}
