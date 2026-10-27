import { roster, log, requireRole, MILLION } from "./state.mjs";
import {
  ensureCareerSystems,
  hash,
  fanReaction,
  coachReputation,
  changeCoachReputation,
  dialogueConsequences,
} from "./career-systems.mjs";
import { effectiveAttributes } from "./ratings.mjs";
export const COMMITTEE_TYPES = {
  "Cap growth": {
    label: "Salary cap growth",
    description: "Increase the annual league salary cap by 8%.",
    kind: "cap",
  },
  "18-game season": {
    label: "Regular-season length",
    description: "Review the number of regular-season games.",
    kind: "regularGames",
  },
  "Overtime format": {
    label: "Overtime possessions",
    description: "Review whether each team is guaranteed a possession.",
    kind: "overtime",
  },
  "Trade deadline": {
    label: "Trade deadline",
    description: "Review the deadline for regular-season player trades.",
    kind: "tradeDeadline",
  },
  "Kickoff touchbacks": {
    label: "Kickoff touchback placement",
    description: "Review the starting field position after a touchback.",
    kind: "touchback",
  },
};
export function ensureCommittee(s) {
  const f = ensureCareerSystems(s),
    w = f.world;
  let agenda = w.committee.find((a) => a.year === s.year);
  if (agenda) return agenda;
  agenda = {
    year: s.year,
    effectiveYear: s.year + 1,
    proposals: Object.entries(COMMITTEE_TYPES).map(([name, d]) => {
      const target =
        d.kind === "cap"
          ? Math.round(f.rules.cap * 1.08)
          : d.kind === "regularGames"
            ? f.rules.regularGames === 18
              ? 17
              : 18
            : d.kind === "overtime"
              ? f.rules.overtime?.startsWith("Both")
                ? "Sudden death"
                : "Both teams receive a possession"
              : d.kind === "tradeDeadline"
                ? (f.rules.tradeDeadline || 9) === 9
                  ? 10
                  : 9
                : (f.rules.touchback || 25) === 35
                  ? 30
                  : 35;
      return {
        id: `rule-${s.year}-${d.kind}`,
        name,
        ...d,
        target,
        status: "Open",
      };
    }),
  };
  w.committee.unshift(agenda);
  w.committee = w.committee.slice(0, 20);
  return agenda;
}
export function voteCommittee(s, id, choice, { delegated = false } = {}) {
  if (!delegated) requireRole(s, "league");
  if (s.phase !== "offseason")
    throw Error("The annual league meeting opens after the championship.");
  if (!["Yes", "No"].includes(choice)) throw Error("Choose yes or no.");
  const agenda = ensureCommittee(s),
    p = agenda.proposals.find((p) => p.id === id || p.name === id);
  if (!p) throw Error("This proposal is not on the agenda.");
  if (p.status !== "Open")
    throw Error("This proposal has already been voted on.");
  const yes = s.franchise.clubs.reduce((n, c) => {
    if (c.id === s.team) return n + (choice === "Yes" ? 1 : 0);
    const threshold =
      p.kind === "cap"
        ? 0.82
        : p.kind === "touchback"
          ? 0.73
          : p.kind === "overtime"
            ? 0.74
            : 0.63;
    return (
      n +
      ((hash(`${s.year}:${p.id}:${c.id}:${c.owner.trait}`) % 1000) / 1000 <
      threshold
        ? 1
        : 0)
    );
  }, 0);
  p.yes = yes;
  p.no = 32 - yes;
  p.choice = choice;
  p.delegated = delegated;
  p.status = yes >= 24 ? "Adopted" : "Defeated";
  p.votedDay = s.franchise.clock.day;
  log(
    s,
    "Competition Committee vote",
    `${p.label}: ${yes}–${32 - yes}. ${p.status === "Adopted" ? `Effective in ${agenda.effectiveYear}.` : "The proposal did not reach 24 votes."}`,
    "league",
  );
  return p;
}
export function applyCommitteeRules(s) {
  const f = ensureCareerSystems(s),
    agenda = ensureCommittee(s);
  for (const p of agenda.proposals) {
    if (p.status === "Open")
      voteCommittee(
        s,
        p.id,
        hash(`${p.id}:${s.team}:delegate`) % 10 < 7 ? "Yes" : "No",
        { delegated: true },
      );
    if (p.status === "Adopted" && !p.applied) {
      f.rules[p.kind] = p.target;
      p.applied = true;
      p.appliedYear = s.year + 1;
    }
  }
}
function subject(s, team, id) {
  return roster(s, team).find((p) => p.id === id);
}
export function processRumors(s, key) {
  const f = ensureCareerSystems(s),
    w = f.world;
  if (w.rounds.includes(key)) return;
  w.rounds.push(key);
  w.rounds = w.rounds.slice(-500);
  for (const r of w.rumors.filter((r) =>
    ["Developing", "Addressed"].includes(r.status),
  )) {
    const p = r.playerId ? subject(s, r.team, r.playerId) : null;
    if (r.playerId && !p) {
      r.status = "Resolved";
      r.outcome = "Player moved on";
      continue;
    }
    if (f.clock.day < r.deadline) continue;
    const valid =
      r.kind === "Holdout"
        ? p.morale < 58 && (p.persona?.money ?? 0.5) > 0.5
        : r.kind === "Trade buzz"
          ? p.morale < 60 || p.tradeDemand
          : s.teams[r.team].l > s.teams[r.team].w + 2;
    const confirmed = valid && hash(r.id + ":verify") % 100 < r.heat;
    r.status = confirmed ? "Confirmed" : "Denied";
    r.resolvedDay = f.clock.day;
    if (confirmed) {
      if (r.kind === "Holdout") p.holdout = true;
      else if (r.kind === "Trade buzz") p.tradeDemand = true;
      else {
        const c = f.clubs[r.team].staff.find((c) => c.id === r.staffId);
        if (c) c.jobSecurity = "Under review";
        f.clubs[r.team].owner.patience = Math.max(
          10,
          f.clubs[r.team].owner.patience - 4,
        );
      }
      if (p) p.morale = Math.max(20, p.morale - 2);
      log(
        s,
        `${r.kind} confirmed`,
        r.kind === "Holdout"
          ? `${p.name} has stepped away from team activities pending contract talks.`
          : r.kind === "Trade buzz"
            ? `${p.name} has requested a fresh start.`
            : `Ownership has placed the coaching position under review.`,
        "media",
      );
      if (r.team === s.team)
        fanReaction(s, "rumor:" + r.id, -2, `${r.kind}: ${r.name}`, {
          topic: "Rumors",
        });
    } else
      log(
        s,
        "Rumor update",
        `${r.name}: the reported ${r.kind.toLowerCase()} has not been substantiated.`,
        "media",
      );
  }
  for (const r of w.rumors.filter((r) => r.status === "Confirmed")) {
    const p = r.playerId ? subject(s, r.team, r.playerId) : null;
    if (
      r.playerId &&
      (!p ||
        (r.kind === "Holdout" && !p.holdout) ||
        (r.kind === "Trade buzz" && !p.tradeDemand))
    ) {
      r.status = "Resolved";
      r.outcome = "The club addressed the concern";
      log(
        s,
        "A situation settles",
        `${r.name}: the club has addressed the concern.`,
        "club",
      );
    }
  }
  if (s.phase === "offseason") {
    ensureCommittee(s);
    return;
  }
  const team =
      hash(key + ":team") % 3 === 0 ? s.team : hash(key + ":club") % 32,
    club = f.clubs[team],
    players = roster(s, team),
    worst = players
      .filter((p) => !p.injury)
      .sort((a, b) => (a.morale ?? 70) - (b.morale ?? 70) || b.ovr - a.ovr)[0];
  const coach = club.staff.find((c) => c.role === "HC");
  let kind, p;
  if (
    coach &&
    (s.teams[team].l > s.teams[team].w + 2 || club.owner.patience < 40)
  )
    kind = "Coaching hot seat";
  else if (worst && worst.morale < 62) {
    p = worst;
    kind = (p.persona?.money ?? 0.5) > 0.65 ? "Holdout" : "Trade buzz";
  } else if (hash(key) % 4 === 0) {
    p = players
      .filter((p) => p.ovr >= 80 && !p.injury)
      .sort((a, b) => b.ovr - a.ovr)[0];
    kind = "Trade buzz";
  }
  if (
    !kind ||
    (kind !== "Coaching hot seat" && !p) ||
    (!p && !coach) ||
    w.rumors.some(
      (r) =>
        r.team === team &&
        r.kind === kind &&
        ["Developing", "Addressed", "Confirmed"].includes(r.status),
    )
  )
    return;
  const id = `rumor-${s.year}-${s.week}-${team}-${kind}`,
    r = {
      id,
      kind,
      team,
      playerId: p?.id || null,
      staffId: kind === "Coaching hot seat" ? coach?.id : null,
      name: p?.name || coach?.name || "Coaching staff",
      year: s.year,
      week: s.week,
      day: f.clock.day,
      deadline: f.clock.day + 7,
      status: "Developing",
      heat: p
        ? Math.max(
            25,
            Math.min(90, 100 - (p.morale ?? 70) + (p.tradeDemand ? 30 : 0)),
          )
        : 65,
      response: null,
    };
  w.rumors.unshift(r);
  w.rumors = w.rumors.slice(0, 100);
  log(
    s,
    "Around the league: " + kind.toLowerCase(),
    `${r.name} is the subject of ${kind.toLowerCase()} reports. The situation remains unconfirmed.`,
    "media",
  );
}
export function respondRumor(s, id, choice) {
  requireRole(s, "media");
  if (s.live) throw Error("Address this report after the current game.");
  const r = ensureCareerSystems(s).world.rumors.find(
    (r) => r.id === id && r.team === s.team,
  );
  if (!r || r.response || !["Developing", "Confirmed"].includes(r.status))
    throw Error("This report no longer needs a response.");
  if (
    !["Private contact", "Public support", "Demand accountability"].includes(
      choice,
    )
  )
    throw Error("Choose a media response.");
  r.response = choice;
  const p = r.playerId ? subject(s, r.team, r.playerId) : null,
    fit = dialogueConsequences(s, {
      key: "rumor-response:" + id,
      person: p,
      tone: choice === "Demand accountability" ? "Challenge" : "Support",
      publicCriticism: choice === "Demand accountability",
      kind: "player",
    });
  if (p) {
    p.morale = Math.max(20, Math.min(99, p.morale + (fit.fit >= 0 ? 2 : -2)));
    if (choice === "Private contact")
      p.coachTrust = Math.min(99, (p.coachTrust ?? 60) + 3);
  }
  if (r.status === "Developing") {
    r.heat = Math.max(
      10,
      r.heat - (choice === "Demand accountability" ? 0 : 25),
    );
    r.status = "Addressed";
  }
  log(
    s,
    "Club responds to speculation",
    `${choice}: the coaching staff has addressed reports around ${r.name}.`,
    choice === "Private contact" ? "private" : "media",
  );
  return r;
}
export function processComparisons(s) {
  const f = ensureCareerSystems(s),
    w = f.world;
  for (const p of s.roster) {
    const st = f.statBook?.regularTotals[s.year]?.[p.id]?.stats || {},
      form = p.progression?.form,
      a = effectiveAttributes(p) || {};
    if (
      p.age > 25 ||
      p.ovr < 84 ||
      (st.snaps || 0) < 100 ||
      (form ?? 0) < 7 ||
      w.comparisons.some((c) => c.playerId === p.id && c.year === s.year)
    )
      continue;
    const legend =
      p.pos === "QB"
        ? a.throwPower >= 90 && a.speed >= 75
          ? "John Elway"
          : "Joe Montana"
        : p.pos === "RB"
          ? a.agility >= 90
            ? "Barry Sanders"
            : "Walter Payton"
          : ["WR", "TE"].includes(p.pos)
            ? a.speed >= 92
              ? "Randy Moss"
              : "Jerry Rice"
            : p.pos === "DL"
              ? "Reggie White"
              : p.pos === "LB"
                ? "Ray Lewis"
                : ["CB", "S"].includes(p.pos)
                  ? "Ed Reed"
                  : null;
    if (!legend) continue;
    const evidence =
      p.pos === "QB"
        ? `${st.passYards || 0} passing yards with ${st.passTD || 0} touchdowns`
        : p.pos === "RB"
          ? `${st.rushYards || 0} rushing yards`
          : ["WR", "TE"].includes(p.pos)
            ? `${st.recYards || 0} receiving yards`
            : `${st.tackles || 0} tackles and ${st.sacks || 0} sacks`;
    const item = {
      id: `comparison-${s.year}-${p.id}`,
      playerId: p.id,
      name: p.name,
      legend,
      team: s.team,
      year: s.year,
      week: s.week,
      evidence,
      reason:
        p.pos === "QB"
          ? "arm talent and composure"
          : p.pos === "RB"
            ? "balance and changes of direction"
            : ["WR", "TE"].includes(p.pos)
              ? "receiving technique and separation"
              : "range, anticipation and physical play",
    };
    w.comparisons.unshift(item);
    log(
      s,
      `The next ${legend}?`,
      `${p.name} is drawing a style comparison for ${item.reason}. His ${evidence} has started the discussion; matching the career is a much bigger test.`,
      "media",
    );
  }
  if (
    coachReputation(s) >= 75 &&
    Object.keys(f.coachSeasons).length >= 3 &&
    !w.comparisons.some((c) => c.coach && c.year === s.year)
  ) {
    const legend =
      s.coach.style === "Run-first"
        ? "Don Shula"
        : f.career.archetype === "Defensive Genius"
          ? "Tom Landry"
          : "Bill Walsh";
    w.comparisons.unshift({
      id: `coach-comparison-${s.year}`,
      coach: true,
      name: s.coach.name,
      legend,
      team: s.team,
      year: s.year,
      week: s.week,
      reason: "a consistent coaching identity, development work and results",
      evidence: `${Math.round(coachReputation(s))} reputation`,
    });
    log(
      s,
      `A coaching comparison: ${legend}`,
      `${s.coach.name} is earning comparisons for a consistent organizational style. The next test is sustaining it.`,
      "media",
    );
  }
  w.comparisons = w.comparisons.slice(0, 100);
}
export function expandedSocialPosts(s) {
  const f = ensureCareerSystems(s),
    posts = [];
  const voices = [
    ["Maya Reyes", "League insider", "insider"],
    ["Jordan Ellis", "National pundit", "pundit"],
    ["Darius Hale", "Former player", "alumni"],
    ["Legends Roundtable", "Legends panel", "legends"],
  ];
  const seenMoments = new Set();
  const moments = f.world.moments.filter((m) => {
    const key = `${m.year}:${m.week}:${m.team}:${m.reason}`;
    if (seenMoments.has(key)) return false;
    seenMoments.add(key);
    return true;
  });
  for (const m of moments.slice(0, 10))
    for (const [vi, [name, role, handle]] of voices.entries()) {
      if (vi !== hash(m.id) % 4 && vi !== 1) continue;
      const positive = m.delta >= 0,
        body =
          role === "League insider"
            ? `${m.reason}. The next question inside the building is how this changes responsibilities and the weekly plan.`
            : role === "Former player"
              ? `${m.reason}. Players notice whether decisions have a clear explanation. ${positive ? "Give the group a chance to build on it." : "A difficult call needs an honest conversation afterward."}`
              : role === "Legends panel"
                ? `${m.reason}. The great teams sustained their standards through decisions like this. One headline is a start; execution over the next few weeks is the test.`
                : `${m.reason}. ${m.detail || ""} ${positive ? "There is a football case for it." : "I would want to hear the football case."} Judge the process as well as the result.`;
      posts.push({
        id: `world-post-${m.id}-${vi}`,
        name,
        handle: "gridiron_" + handle,
        authorRole: role,
        voiceKind: role,
        team: m.team ?? s.team,
        year: m.year,
        week: m.week,
        topic: role === "Legends panel" ? "Legends" : m.topic || "Reactions",
        tone: role,
        body,
        likes: 320 + (hash(m.id + vi) % 4000),
        feedOrder: vi + 1,
        comments: [
          {
            name: "Fourth Down Film",
            stance: "Football case",
            text: positive
              ? "The upside is there. Watch how the staff follows it up."
              : "The result matters, but the matchup and situation matter too.",
          },
          {
            name: "Maya / Section 214",
            stance: "Supporter",
            replyTo: "Fourth Down Film",
            text: positive
              ? "Fair. I want a plan that lasts beyond this week."
              : "Agreed. Explain the choice and take responsibility when it misses.",
          },
        ],
      });
    }
  for (const r of f.world.rumors
    .filter((r) => r.team === s.team || r.status === "Confirmed")
    .slice(0, 4))
    posts.push({
      id: "rumor-post-" + r.id + "-" + r.status,
      name: "Maya Reyes",
      handle: "gridiron_insider",
      voiceKind: "League insider",
      team: r.team,
      year: r.year,
      week: r.week,
      topic: "Rumors",
      tone: r.status,
      body: `${r.name}: ${r.kind.toLowerCase()} · ${r.status.toLowerCase()}. ${r.status === "Developing" ? "There is no confirmed action yet." : r.status === "Confirmed" ? "The report has developed into a concrete club matter." : "The latest club update changes the picture."}`,
      likes: 200 + (hash(r.id) % 900),
      comments: [
        {
          name: "Cap Room Corner",
          stance: "Context",
          text: "A report is one piece of information. Contract status, role and the team’s plan still matter.",
        },
      ],
    });
  for (const c of f.world.comparisons
    .filter((c) => c.year === s.year)
    .slice(0, 4))
    posts.push({
      id: c.id,
      name: "Legends Roundtable",
      handle: "legends_roundtable",
      voiceKind: "Legends panel",
      team: c.team,
      year: c.year,
      week: c.week,
      topic: "Comparisons",
      tone: "The next " + c.legend + "?",
      body: `${c.name}: ${c.reason}. ${c.evidence}. The ${c.legend} comparison describes a style; a career of achievements still has to be earned.`,
      likes: 2000 + (hash(c.id) % 5000),
      comments: [
        {
          name: "Route Detail",
          stance: "Film",
          text: "I see the stylistic link. The next step is repeating it against different opponents.",
        },
        {
          name: "Noah on Sundays",
          stance: "Perspective",
          replyTo: "Route Detail",
          text: "Exactly. The comparison makes the discussion interesting, but it should not become an expectation overnight.",
        },
      ],
    });
  return posts;
}
