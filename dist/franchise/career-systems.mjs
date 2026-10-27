import { log, roster } from "./state.mjs";
const clamp = (n, a = 0, b = 99) => Math.max(a, Math.min(b, n));
export const hash = (s) => {
  let h = 2166136261;
  for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
};
export function ensureCareerSystems(s) {
  const f = s.franchise;
  if (!f) return null;
  f.expansionVersion ??= 1;
  f.humanTeam ??= s.team;
  f.clock ??= { day: 0, seen: [] };
  f.coachReputation ??= {
    value: clamp(f.career.reputation ?? 50),
    ledger: [],
    seen: [],
    jobOffers: [],
  };
  f.career.reputation = f.coachReputation.value;
  f.cooldowns ??= {};
  f.relationshipRifts ??= [];
  f.fanPulse ??= {
    value: f.clubs[s.team].fanApproval ?? 65,
    events: [],
    seen: [],
  };
  f.coachSeasons ??= {};
  f.preseasonExpectations ??= {};
  f.decisionLedger ??= {};
  f.draftDevelopment ??= {};
  f.world ??= {
    rumors: [],
    comparisons: [],
    moments: [],
    seen: [],
    committee: [],
    rounds: [],
  };
  for (const c of f.clubs)
    c.staffBudget ??= Math.max(
      25e8,
      Math.round(c.staff.reduce((n, c) => n + c.salary, 0) * 1.25),
    );
  return f;
}
export function advanceCareerTime(s, days, key) {
  const f = ensureCareerSystems(s);
  if (f.clock.seen.includes(key)) return;
  f.clock.seen.push(key);
  f.clock.seen = f.clock.seen.slice(-2500);
  f.clock.day += Math.max(0, Math.floor(days));
}
export function cooldownRemaining(s, area, target = "club") {
  const f = ensureCareerSystems(s);
  return Math.max(
    0,
    (f.cooldowns[`${s.team}:${area}:${target}`]?.until || 0) - f.clock.day,
  );
}
export function checkCooldown(s, area, target = "club") {
  const days = cooldownRemaining(s, area, target);
  if (days)
    throw Error(
      `This ${area.toLowerCase()} can be revisited in ${days} football calendar day${days === 1 ? "" : "s"}.`,
    );
}
export function setCooldown(s, area, target = "club", days = 14) {
  const f = ensureCareerSystems(s);
  f.cooldowns[`${s.team}:${area}:${target}`] = {
    until: f.clock.day + days,
    year: s.year,
    week: s.week,
  };
}
export function coachReputation(s) {
  return ensureCareerSystems(s).coachReputation.value;
}
export function coachPerks(s) {
  const r = coachReputation(s);
  return {
    label:
      r >= 90
        ? "League icon"
        : r >= 75
          ? "Highly respected"
          : r >= 60
            ? "Established"
            : r >= 40
              ? "Building credibility"
              : "Under scrutiny",
    recruitment: (r - 50) * 0.35,
    demand: Math.max(0.92, Math.min(1.05, 1 - (r - 50) * 0.002)),
    staffTerms: Math.max(0.92, Math.min(1.08, 1 - (r - 50) * 0.0016)),
    prestigeJobs: r >= 75,
  };
}
export function changeCoachReputation(
  s,
  key,
  delta,
  reason,
  category = "Leadership",
) {
  const r = ensureCareerSystems(s).coachReputation;
  if (r.seen.includes(key)) return 0;
  if (!Number.isFinite(delta)) throw Error("Invalid reputation event.");
  r.seen.push(key);
  r.seen = r.seen.slice(-3500);
  const before = r.value;
  r.value =
    Math.round(clamp(r.value + Math.max(-5, Math.min(10, delta))) * 10) / 10;
  s.franchise.career.reputation = r.value;
  r.ledger.unshift({
    key,
    year: s.year,
    week: s.week,
    category,
    reason,
    delta: Math.round((r.value - before) * 10) / 10,
    value: r.value,
  });
  r.ledger = r.ledger.slice(0, 120);
  const f = s.franchise,
    storyKey = `respect:${s.year}:${s.week}`;
  if (delta > 0 && r.value >= 75 && !f.world.seen.includes(storyKey)) {
    f.world.seen.push(storyKey);
    log(
      s,
      "Respect across the league",
      `${s.coach?.name || "The head coach"} is earning praise for ${reason.toLowerCase()}. The football program is attracting greater attention.`,
      "media",
    );
    f.world.moments.unshift({
      id: storyKey,
      year: s.year,
      week: s.week,
      team: s.team,
      reason: `The coaching staff earns recognition: ${reason}`,
      delta: 1,
      topic: "Coaching",
    });
    f.world.moments = f.world.moments.slice(0, 70);
  }
  return r.value - before;
}
export function fanReaction(s, key, delta, reason, context = {}) {
  const f = ensureCareerSystems(s),
    p = f.fanPulse;
  if (s.team !== f.humanTeam) return;
  if (p.seen.includes(key)) return;
  p.seen.push(key);
  p.seen = p.seen.slice(-1800);
  delta = clamp(delta, -4, 4);
  const club = f.clubs[s.team];
  club.fanApproval = clamp((club.fanApproval ?? 65) + delta, 10, 99);
  p.value = club.fanApproval;
  p.events.unshift({
    key,
    year: s.year,
    week: s.week,
    delta,
    reason,
    ...context,
  });
  p.events = p.events.slice(0, 60);
  f.world.moments.unshift({
    id: key,
    year: s.year,
    week: s.week,
    team: s.team,
    reason,
    delta,
    ...context,
  });
  f.world.moments = f.world.moments.slice(0, 70);
}
export function dialogueFit(
  person,
  tone,
  { injured = false, publicCriticism = false } = {},
) {
  const p = person?.persona || {},
    ambition = p.ambition ?? (person?.personality === "Motivator" ? 0.8 : 0.5),
    loyalty = p.loyalty ?? (person?.personality === "Teacher" ? 0.8 : 0.5);
  if (publicCriticism) return -3 - Math.round(loyalty * 3);
  if (
    [
      "Challenge",
      "Accountability",
      "pressure",
      "discipline",
      "firm",
      "challenge",
    ].includes(tone)
  )
    return injured ? -6 : ambition >= 0.6 ? 4 : loyalty >= 0.65 ? -5 : -2;
  if (
    [
      "Support",
      "Trust",
      "patient",
      "private",
      "back",
      "praise",
      "unite",
    ].includes(tone)
  )
    return person?.personality === "Analyst" ? 2 : 4;
  return 2;
}
export function dialogueConsequences(
  s,
  {
    key,
    person = null,
    tone,
    delta = 0,
    publicCriticism = false,
    kind = "player",
  },
) {
  const f = ensureCareerSystems(s),
    fit = dialogueFit(person, tone, {
      injured: !!person?.injury,
      publicCriticism,
    });
  const id = person?.id || "team";
  if (fit < 0 || delta < 0) {
    const severity = Math.min(
      3,
      Math.max(1, Math.ceil(Math.abs(Math.min(fit, delta)) / 3)),
    );
    const existing = f.relationshipRifts.find(
      (r) => r.key === key && r.personId === id,
    );
    if (existing) return { fit, rift: existing };
    const rift = {
      key,
      personId: id,
      name: person?.name || "The locker room",
      kind,
      year: s.year,
      week: s.week,
      day: f.clock.day,
      severity,
      active: true,
      reason: publicCriticism
        ? "Public criticism damaged trust"
        : "The message clashed with expectations",
      tone,
    };
    f.relationshipRifts.unshift(rift);
    f.relationshipRifts = f.relationshipRifts.slice(0, 80);
    if (person)
      person.coachTrust = clamp((person.coachTrust ?? 60) - severity * 2);
    changeCoachReputation(
      s,
      "rift:" + key,
      -severity * 0.4,
      `${person?.name || "The locker room"}: a leadership message damaged trust`,
      "Relationships",
    );
    log(
      s,
      publicCriticism
        ? "Players respond to public criticism"
        : "Tension in the building",
      `${rift.name}: ${rift.reason.toLowerCase()}. The coaching staff will need to rebuild trust.`,
      publicCriticism || severity >= 2 ? "media" : "private",
    );
    if (publicCriticism)
      fanReaction(
        s,
        "criticism:" + key,
        -1,
        "Supporters question the public handling of the locker room",
        { topic: "Coaching" },
      );
    return { fit, rift };
  }
  for (const r of f.relationshipRifts.filter(
    (r) => r.active && r.personId === id,
  )) {
    r.severity--;
    if (r.severity <= 0) {
      r.active = false;
      r.resolvedYear = s.year;
      r.resolvedWeek = s.week;
    }
  }
  if (kind === "staff" && person)
    person.chemistry = clamp((person.chemistry ?? 60) + fit);
  return { fit };
}
export function capturePreseason(s, lock = false) {
  const f = ensureCareerSystems(s),
    old = f.preseasonExpectations[s.year];
  if (old?.locked) return old;
  f.coachQBBase ??= {};
  for (const p of s.roster.filter((p) => p.pos === "QB"))
    if (!f.coachQBBase[p.id] || f.coachQBBase[p.id].year !== s.year)
      f.coachQBBase[p.id] = {
        year: s.year,
        development: p.ratings?.development || 0,
      };
  const previous = f.archive.find((a) => a.year === s.year - 1);
  const teams = s.teams.map((t, i) => ({
    team: i,
    expectedWins:
      Math.round(clamp(8.5 + (t.rating - 79) * 0.36, 3, 14) * 10) / 10,
    priorWins: previous?.teams[i]?.w ?? null,
  }));
  return (f.preseasonExpectations[s.year] = {
    year: s.year,
    locked: lock,
    teams,
  });
}
export function recordDecision(s, d) {
  const f = ensureCareerSystems(s);
  if (d.a !== s.team && d.b !== s.team) return;
  const key = `${s.year}:${s.phase}:${s.week}:${s.live?.a ?? d.a}:${s.live?.b ?? d.b}:${d.id}`;
  const round = `${s.year}:${s.phase}:${s.week}:${f.postseason?.round || 0}`;
  const entry = (f.decisionLedger[round] ??= {
    seen: [],
    calls: {},
    formations: {},
    snaps: 0,
    fourths: [],
  });
  if (entry.seen.includes(key)) return;
  entry.seen.push(key);
  entry.snaps++;
  if (d.team === s.team) {
    entry.calls[d.call] = (entry.calls[d.call] || 0) + 1;
    entry.formations[d.formation] = (entry.formations[d.formation] || 0) + 1;
    if (d.down === 4 && !["Punt", "Field goal"].includes(d.call)) {
      const good = d.kind === "touchdown" || (d.yards ?? 0) >= d.toGo;
      const sound =
        (d.toGo <= 2 && d.spot >= 45) ||
        (d.quarter === 4 && d.clock < 180 && d.scoreDiff < 0);
      entry.fourths.push({ good, sound, call: d.call, toGo: d.toGo });
      fanReaction(
        s,
        "fourth:" + key,
        good ? 1 : sound ? -1 : -2,
        good
          ? "The fourth-down gamble pays off"
          : sound
            ? "A defensible fourth-down call comes up short"
            : "Supporters question a high-risk fourth-down decision",
        {
          topic: "Fourth downs",
          detail: `${d.toGo} yards to gain · ${d.call}`,
        },
      );
    }
  }
  const keys = Object.keys(f.decisionLedger);
  for (const k of keys.slice(0, -45)) delete f.decisionLedger[k];
}
export function recordDraftDevelopment(s, p, pick) {
  const f = ensureCareerSystems(s);
  if (pick.team !== s.team) return;
  f.draftDevelopment[p.id] = {
    playerId: p.id,
    name: p.name,
    year: s.year + 1,
    round: pick.round,
    startAbility: p.ratings?.base ?? p.ovr,
    scouted: !!f.reports[p.id],
    credited: false,
  };
  const need = roster(s).filter(
    (q) => q.id !== p.id && q.pos === p.pos && q.status === "active",
  ).length;
  fanReaction(
    s,
    `draft:${s.year}:${p.id}`,
    p.ovr >= 76 ? 2 : p.ovr < 65 && pick.round <= 2 ? -2 : 1,
    `${p.name} joins the draft class`,
    {
      topic: "Draft",
      detail: `Round ${pick.round} · ${p.pos} · ${need < 2 ? "addresses a thin position" : "adds competition"}`,
    },
  );
}
export function processCoachRound(s, results, roundInfo) {
  const f = ensureCareerSystems(s),
    key = roundInfo.key;
  const ours = results.find((r) => r.a === s.team || r.b === s.team),
    tactics = f.decisionLedger[key];
  if (ours) {
    const k = ours.a === s.team ? 0 : 1,
      win = ours.score[k] > ours.score[1 - k];
    if (
      win &&
      Object.keys(tactics?.calls || {}).filter(
        (k) => !["Punt", "Field goal"].includes(k),
      ).length >= 3 &&
      Object.keys(tactics?.formations || {}).length >= 2 &&
      tactics.snaps >= 20
    )
      changeCoachReputation(
        s,
        "adapt:" + key,
        1,
        "Varied personnel and playcalling helped secure a win",
        "Tactics",
      );
    if (roundInfo.phase === "playoffs" && win)
      changeCoachReputation(
        s,
        "playoffs:" + key,
        roundInfo.round >= 3 ? 8 : roundInfo.round === 2 ? 3 : 1.5,
        roundInfo.round >= 3
          ? "Championship victory"
          : roundInfo.round === 2
            ? "A conference championship win"
            : "A postseason victory",
        "Results",
      );
    if (roundInfo.phase === "season" && win && s.teams[s.team].w >= 10)
      changeCoachReputation(
        s,
        `tenwins:${s.year}`,
        2,
        "A ten-win regular season",
        "Results",
      );
  }
  for (const p of s.roster) {
    const a = p.ratings,
      base = (f.coachQBBase ??= {});
    if (p.pos === "QB") {
      if (!base[p.id] || base[p.id].year !== s.year)
        base[p.id] = { year: s.year, development: a?.development || 0 };
      if (
        a &&
        a.development - base[p.id].development >= 1 &&
        (p.stats?.[s.year]?.attempts || 0) >= 100
      )
        changeCoachReputation(
          s,
          `qb:${s.year}:${p.id}`,
          2,
          `${p.name} progressed through meaningful quarterback work`,
          "Development",
        );
    }
    const d = f.draftDevelopment[p.id];
    if (
      d &&
      !d.credited &&
      s.year >= d.year &&
      (p.stats?.[s.year]?.snaps || 0) >= 100 &&
      (p.ovr >= d.startAbility + 2 || p.progression?.form >= 7.2)
    ) {
      d.credited = true;
      changeCoachReputation(
        s,
        "draft:" + p.id,
        d.scouted ? 2 : 1,
        `${p.name} is delivering on the draft evaluation`,
        "Recruitment",
      );
    }
  }
  for (const r of f.relationshipRifts.filter(
    (r) => r.active && f.clock.day - r.day >= 28,
  )) {
    r.severity = Math.max(0, r.severity - 1);
    r.day = f.clock.day;
    if (!r.severity) r.active = false;
  }
}
export function generateJobOffers(s) {
  const f = ensureCareerSystems(s),
    r = f.coachReputation;
  if (
    r.value < 65 ||
    s.phase !== "offseason" ||
    !["HC", "OC", "DC"].includes(f.role)
  )
    return;
  const key = `jobs:${s.year}`;
  if (r.seen.includes(key)) return;
  r.seen.push(key);
  const prestige = r.value >= 75 ? "Contender" : "Rebuild";
  const clubs = f.clubs
    .filter((c) => c.id !== s.team)
    .sort((a, b) =>
      r.value >= 75
        ? s.teams[b.id].rating - s.teams[a.id].rating
        : s.teams[a.id].w - s.teams[b.id].w,
    )
    .slice(0, 2);
  for (const c of clubs)
    r.jobOffers.push({
      id: `job-${s.year}-${c.id}`,
      year: s.year,
      team: c.id,
      prestige,
      role: "HC",
      status: "invited",
      salary: Math.round((4 + r.value / 20) * 1e8),
    });
  log(
    s,
    "Head-coaching interest",
    `Ownership groups have requested meetings about head-coaching opportunities. Review your career dossier.`,
    "club",
  );
}

export function validateCareerSystems(s) {
  const f = s.franchise;
  if (!f.expansionVersion) return true;
  if (
    !Number.isInteger(f.clock.day) ||
    f.clock.day < 0 ||
    !Number.isFinite(f.coachReputation.value) ||
    f.coachReputation.value < 0 ||
    f.coachReputation.value > 99
  )
    throw Error("Invalid career reputation or calendar.");
  for (const c of f.clubs)
    if (!Number.isSafeInteger(c.staffBudget) || c.staffBudget < 0)
      throw Error("Invalid annual staff budget.");
  for (const c of Object.values(f.cooldowns))
    if (!Number.isInteger(c.until) || c.until < 0)
      throw Error("Invalid action cooldown.");
  for (const r of f.relationshipRifts)
    if (!Number.isInteger(r.severity) || r.severity < 0 || r.severity > 3)
      throw Error("Invalid relationship state.");
  for (const p of f.boardroom?.permits || [])
    if (
      !Number.isInteger(p.until) ||
      !["Approved", "Compromise"].includes(p.scope) ||
      typeof p.fingerprint !== "string"
    )
      throw Error("Invalid ownership authority.");
  return true;
}
