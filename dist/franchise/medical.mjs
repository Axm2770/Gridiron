// Medical department: diagnosis with uncertainty, treatment decisions with real trade-offs
// (rehab, surgery, injection/brace to play through, IR), player trust, recovery staff and
// long-term consequences. Own-club players only; CPU clubs keep the existing injury model.
// p.injury (weeks out) stays authoritative for availability everywhere else in the game.
import { random, clamp } from "../engine/random.mjs";
import { identitySeed } from "./newgens.mjs";
import { applyMood } from "./newsroom.mjs";
import { ensurePlayerRatings, refreshPlayerRating } from "./ratings.mjs";
import { movePlayer } from "./personnel.mjs";
import { log, MILLION } from "./state.mjs";

/* ------------------------------------------------------------------ catalogue */
// weeks: base range for the conservative path. Options scale it. longTerm applies once on return.
export const INJURIES = {
  hamstring: { label: "Hamstring strain", part: "hamstring", weeks: [1, 4], tier: "moderate", reinjury: 0.22, options: ["rehab", "injection", "ir"] },
  highAnkle: { label: "High ankle sprain", part: "ankle", weeks: [2, 6], tier: "moderate", reinjury: 0.15, options: ["rehab", "tightrope", "brace", "ir"] },
  mcl: { label: "MCL sprain", part: "knee", weeks: [2, 6], tier: "moderate", reinjury: 0.12, options: ["rehab", "brace", "ir"] },
  meniscus: { label: "Meniscus tear", part: "knee", weeks: [4, 8], tier: "major", reinjury: 0.1, options: ["trim", "repair", "brace"] },
  shoulder: { label: "AC joint sprain", part: "shoulder", weeks: [1, 4], tier: "moderate", reinjury: 0.12, options: ["rehab", "injection", "ir"] },
  hand: { label: "Fractured hand", part: "hand", weeks: [2, 5], tier: "moderate", reinjury: 0.05, options: ["rehab", "pin", "ir"] },
  turfToe: { label: "Turf toe", part: "foot", weeks: [1, 6], tier: "moderate", reinjury: 0.18, options: ["rehab", "injection", "ir"] },
  back: { label: "Back spasms", part: "back", weeks: [1, 2], tier: "minor", reinjury: 0.2, options: ["rehab", "injection"] },
  concussion: { label: "Concussion", part: "head", weeks: [1, 3], tier: "moderate", reinjury: 0.15, options: ["protocol"] },
  pectoral: { label: "Torn pectoral", part: "chest", weeks: [12, 16], tier: "season", reinjury: 0.05, options: ["surgery", "ir"], longTerm: { base: -1, attrs: { strength: -3 } } },
  acl: { label: "Torn ACL", part: "knee", weeks: [36, 44], tier: "season", reinjury: 0.12, options: ["surgery"], longTerm: { base: -2, pot: -3, attrs: { speed: -3, agility: -3, acceleration: -2 } } },
  achilles: { label: "Ruptured Achilles", part: "ankle", weeks: [40, 50], tier: "season", reinjury: 0.08, options: ["surgery"], longTerm: { base: -3, pot: -3, attrs: { speed: -4, acceleration: -3 } } },
};

// Treatment definitions. weeks multiplies the diagnosed timeline; playsNow means available
// this week with an aggravation risk each game; risk = re-injury multiplier after return.
export const TREATMENTS = {
  rehab: { label: "Rest & rehab", weeks: 1, playsNow: false, aggravate: 0, risk: 1, cost: 0, wants: "patient" },
  ir: { label: "Injured reserve", weeks: 1.15, playsNow: false, aggravate: 0, risk: 0.7, cost: 0, minWeeks: 4, wants: "patient", note: "Frees a roster spot; out at least 4 weeks." },
  injection: { label: "Toradol injection — play through", weeks: 0, playsNow: true, aggravate: 0.28, risk: 1.6, cost: 0, wants: "play", note: "Available now. Each game risks a worse injury." },
  brace: { label: "Brace & play", weeks: 0.25, playsNow: true, aggravate: 0.16, risk: 1.3, cost: 0, wants: "play", note: "Back quickly with protection; lower risk than an injection." },
  tightrope: { label: "Tightrope surgery", weeks: 0.6, playsNow: false, aggravate: 0, risk: 0.8, cost: 0.4 * MILLION, wants: "surgery", success: 0.9 },
  trim: { label: "Meniscus trim (quick return)", weeks: 0.6, playsNow: false, aggravate: 0, risk: 1.2, cost: 0.3 * MILLION, wants: "play", longTerm: { attrs: { agility: -1 } } },
  repair: { label: "Meniscus repair (season-ending, protects the knee)", weeks: 3, playsNow: false, aggravate: 0, risk: 0.5, cost: 0.5 * MILLION, wants: "surgery" },
  pin: { label: "Surgery with pin, play in a cast", weeks: 0.5, playsNow: false, aggravate: 0, risk: 0.9, cost: 0.2 * MILLION, wants: "play", longTerm: { attrs: { catching: -2 } } },
  surgery: { label: "Surgery & full rehab", weeks: 1, playsNow: false, aggravate: 0, risk: 0.9, cost: 0.6 * MILLION, wants: "surgery", success: 0.95 },
  protocol: { label: "Concussion protocol", weeks: 1, playsNow: false, aggravate: 0, risk: 1, cost: 0, wants: "patient", note: "League protocol: no option to play through." },
};

const PART_TYPES = {
  knee: ["mcl", "meniscus"],
  ankle: ["highAnkle", "turfToe"],
  shoulder: ["shoulder", "hand"],
  back: ["back", "hamstring", "concussion"],
};

/* ------------------------------------------------------------------- department */

const PHYSIO_NAMES = ["Dana Reyes", "Marcus Hollis", "Priya Shah", "Tom Okonkwo", "Elena Varga", "Chris Lindqvist", "Aisha Bello", "Ryan Castellano"];

export function ensureMedical(s) {
  const f = s.franchise;
  if (!f) return null;
  f.medical ??= { version: 1, cases: {}, history: [], seen: [], physio: null, physioPool: [], decisionsMade: 0 };
  const m = f.medical;
  m.cases ??= {};
  for (const k of ["history", "seen", "physioPool"]) if (!Array.isArray(m[k])) m[k] = [];
  // Players already injured when the department is first created (older saves, imported IR)
  // continue their existing recovery instead of arriving as a batch of new decisions.
  if (!m.baselined) {
    m.baselined = true;
    for (const p of s.roster || [])
      if (p.injury > 0)
        m.cases[p.id] = { id: `case-${p.id}-baseline`, playerId: p.id, type: "back", label: p.medical?.diagnosis || "Ongoing injury", tier: "moderate", part: p.medical?.bodyPart || "body", trueWeeks: p.injury, estimate: [p.injury, p.injury], status: "treating", treatment: "rehab", options: ["rehab"], preference: "patient", opened: { year: s.year, week: s.week }, aggravations: 0, baseline: true };
  }
  if (!m.physio) m.physio = { id: "physio-default", name: "Staff physiotherapist", recovery: 55, prevention: 55, salary: 0.35 * MILLION };
  return m;
}

// Head of medical (existing staff role) drives diagnosis accuracy and surgical outcomes.
export function department(s) {
  const m = ensureMedical(s),
    club = s.franchise.clubs[s.team],
    head = (club?.staff || []).find((x) => x.role === "Medical"),
    facilities = Number(club?.stadium?.medical ?? 1);
  return {
    doctor: { name: head?.name ?? "Vacant", diagnosis: head?.rating ?? 50, surgery: head?.rating ?? 50, vacant: !head },
    physio: m.physio,
    facilities,
    // Multiplier on recovery speed and re-injury protection.
    recoveryBonus: (m.physio.recovery - 50) / 150 + facilities * 0.03,
    prevention: (m.physio.prevention - 50) / 200 + facilities * 0.02,
  };
}

export function physioCandidates(s) {
  const m = ensureMedical(s),
    key = `${s.year}`;
  if (m.physioPoolYear !== key) {
    const rng = random(identitySeed(`physio:${s.team}:${s.year}`));
    m.physioPool = Array.from({ length: 3 }, (_, i) => {
      const recovery = Math.round(55 + rng() * 40),
        prevention = Math.round(50 + rng() * 40);
      return { id: `physio-${s.year}-${i}`, name: PHYSIO_NAMES[(identitySeed(`${s.team}${s.year}${i}`) + i) % PHYSIO_NAMES.length], recovery, prevention, salary: Math.round(((recovery + prevention) / 2 - 30) * 0.012 * MILLION) };
    });
    m.physioPoolYear = key;
  }
  return m.physioPool;
}

export function hirePhysio(s, id) {
  const m = ensureMedical(s),
    c = physioCandidates(s).find((x) => x.id === id);
  if (!c) throw Error("That physiotherapist is no longer available.");
  const club = s.franchise.clubs[s.team];
  if ((club.cash ?? 0) < c.salary) throw Error("The club cannot cover this salary.");
  club.cash -= c.salary;
  m.physio = { ...c };
  m.physioPool = m.physioPool.filter((x) => x.id !== id);
  log(s, "Medical staff hire", `${c.name} joins as lead physiotherapist (recovery ${c.recovery}, prevention ${c.prevention}).`);
  return m.physio;
}

/* --------------------------------------------------------------------- diagnosis */

// How the player would like to be treated: ambitious players and contract-year players want
// to play; veterans and loyal players prefer to protect their careers.
export function playerPreference(s, p) {
  const persona = p.persona || {},
    contract = s.franchise.contracts?.[p.id],
    contractYear = contract && contract.start + contract.years - 1 <= s.year,
    playScore = (persona.ambition ?? 0.5) + (contractYear ? 0.3 : 0) - (p.age >= 30 ? 0.25 : 0) - (persona.loyalty ?? 0.5) * 0.2;
  return playScore > 0.55 ? "play" : playScore < 0.3 ? "patient" : "surgery";
}

function classify(p, weeks, rng) {
  const part = p.medical?.bodyPart || "back",
    pool = PART_TYPES[part] || ["hamstring"];
  // A small share of injuries look worse on the scan than on the field.
  if (rng() < 0.04) return part === "knee" && rng() < 0.5 ? "acl" : part === "ankle" && rng() < 0.4 ? "achilles" : "meniscus";
  const fitting = pool.filter((k) => INJURIES[k].weeks[0] <= Math.max(1, weeks) && INJURIES[k].weeks[1] >= Math.min(weeks, 3));
  return (fitting.length ? fitting : pool)[Math.floor(rng() * (fitting.length || pool.length))];
}

// Opens a case for a newly injured player: true timeline, the doctor's estimated range, options.
export function openCase(s, p) {
  const m = ensureMedical(s),
    d = department(s),
    rng = random(identitySeed(`${p.id}:${s.year}:${s.week}:case`)),
    type = classify(p, Number(p.injury) || 1, rng),
    def = INJURIES[type];
  // The conservative timeline keeps the existing absence unless the scan found something worse.
  const trueWeeks = def.tier === "season" || def.weeks[0] > (p.injury || 0) ? Math.round(def.weeks[0] + rng() * (def.weeks[1] - def.weeks[0])) : Math.max(1, Number(p.injury) || 1);
  const spread = Math.max(0, Math.round(trueWeeks * (1 - d.doctor.diagnosis / 110) * 0.8));
  const c = {
    id: `case-${p.id}-${s.year}-${s.week}`,
    playerId: p.id,
    type,
    label: def.label,
    tier: def.tier,
    part: def.part,
    trueWeeks,
    estimate: [Math.max(1, trueWeeks - spread), trueWeeks + spread],
    status: "decision",
    preference: playerPreference(s, p),
    options: def.options,
    opened: { year: s.year, week: s.week },
    aggravations: 0,
  };
  m.cases[p.id] = c;
  p.injury = trueWeeks;
  p.medical = { ...(p.medical || {}), bodyPart: def.part, diagnosis: def.label, weeks: trueWeeks, caseId: c.id };
  log(s, "Medical report", `${p.name}: ${def.label}. Estimated ${c.estimate[0]}–${c.estimate[1]} weeks. A treatment decision is needed.`);
  return c;
}

/* -------------------------------------------------------------------- treatment */

// What each option would mean for this case, for the decision UI and the AI recommendation.
export function treatmentOutlook(s, c, option) {
  const t = TREATMENTS[option],
    d = department(s),
    weeks = t.playsNow ? Math.round(c.trueWeeks * t.weeks) : Math.max(t.minWeeks ?? 1, Math.round(c.trueWeeks * t.weeks * (1 - d.recoveryBonus * 0.5)));
  const reinjury = clamp(INJURIES[c.type].reinjury * t.risk * (1 - d.prevention), 0.01, 0.9);
  const preferred = t.wants === c.preference;
  return {
    option,
    label: t.label,
    note: t.note ?? null,
    weeksOut: weeks,
    estimate: t.playsNow ? [0, 0] : [Math.max(t.minWeeks ?? 1, Math.round(c.estimate[0] * t.weeks)), Math.max(t.minWeeks ?? 1, Math.round(c.estimate[1] * t.weeks))],
    playsNow: t.playsNow,
    aggravateRisk: t.aggravate,
    reinjuryRisk: Math.round(reinjury * 100) / 100,
    cost: t.cost,
    longTerm: t.longTerm ?? (option === "surgery" || option === "protocol" ? INJURIES[c.type].longTerm ?? null : null),
    trust: preferred ? 3 : t.wants === "play" && c.preference === "patient" ? -12 : t.wants === "patient" && c.preference === "play" ? -4 : -2,
    preferred,
  };
}

export function recommendedTreatment(s, c) {
  return c.options.map((o) => treatmentOutlook(s, c, o)).sort((a, b) => a.weeksOut * (1 + a.reinjuryRisk * 3 + a.aggravateRisk * 4) - b.weeksOut * (1 + b.reinjuryRisk * 3 + b.aggravateRisk * 4))[0].option;
}

export function chooseTreatment(s, playerId, option, { delegated = false } = {}) {
  const m = ensureMedical(s),
    c = m.cases[playerId],
    p = s.roster.find((x) => x.id === playerId);
  if (!c || !p || c.status !== "decision") throw Error("There is no pending medical decision for this player.");
  if (!c.options.includes(option)) throw Error("That treatment is not appropriate for this injury.");
  const t = TREATMENTS[option],
    outlook = treatmentOutlook(s, c, option),
    club = s.franchise.clubs[s.team];
  if (t.cost && (club.cash ?? 0) < t.cost) throw Error("The club cannot cover the procedure cost.");
  if (option === "ir") movePlayer(s, playerId, "ir"); // enforces roster role and IR rules
  if (t.cost) club.cash -= t.cost;
  // Surgical success: rare complications lengthen recovery.
  const rng = random(identitySeed(`${c.id}:${option}`));
  let weeks = outlook.weeksOut;
  if (t.success && rng() > t.success * (0.8 + department(s).doctor.surgery / 500)) {
    weeks = Math.round(weeks * 1.4);
    log(s, "Surgical complication", `${p.name}'s recovery will take longer than planned (${weeks} weeks).`);
  }
  p.injury = t.playsNow ? 0 : weeks;
  if (option === "ir") p.irReturnWeek = s.week + Math.max(4, weeks);
  Object.assign(c, { status: t.playsNow ? "playing-through" : "treating", treatment: option, weeksOut: weeks, chosen: { year: s.year, week: s.week, delegated }, outlook });
  p.medical = { ...(p.medical || {}), weeks: p.injury, treatment: t.label };
  if (outlook.trust)
    applyMood(s, {
      playerId,
      delta: Math.sign(outlook.trust) * Math.min(6, Math.abs(outlook.trust) / 2),
      trust: outlook.trust,
      reason: outlook.preferred ? `Medical plan respected his wishes (${t.label})` : `Overruled on treatment: ${t.label}`,
      sourceId: c.id,
      spillover: false,
    });
  // Forcing a reluctant player to play hurt is remembered at the negotiating table.
  if (t.wants === "play" && c.preference === "patient") p.medicalGrievances = (p.medicalGrievances || 0) + 1;
  m.decisionsMade++;
  log(s, delegated ? "Medical staff decision" : "Treatment decided", `${p.name}: ${t.label}${t.playsNow ? " — available this week" : `, out ${weeks} weeks`}.`);
  return c;
}

/* ------------------------------------------------------------------- weekly tick */

function applyLongTerm(p, longTerm, year) {
  if (!longTerm) return;
  const r = ensurePlayerRatings(p);
  if (longTerm.base) r.base = Math.max(40, (r.base ?? p.ovr) + longTerm.base);
  if (longTerm.pot) p.pot = Math.max(p.ovr - 2, (p.pot ?? 99) + longTerm.pot);
  if (longTerm.attrs) {
    r.attributeChanges ??= {};
    for (const [k, v] of Object.entries(longTerm.attrs)) r.attributeChanges[k] = (r.attributeChanges[k] || 0) + v;
  }
  refreshPlayerRating(p, year);
}

// Runs once per settled round (idempotent by key): new cases, staff fallback decisions,
// physio-accelerated recovery, play-through aggravation, returns and re-injuries.
export function processMedicalWeek(s, roundKey) {
  const m = ensureMedical(s);
  if (!m || m.seen.includes(roundKey)) return [];
  m.seen.push(roundKey);
  m.seen = m.seen.slice(-200);
  const d = department(s),
    events = [];
  for (const p of s.roster) {
    const c = m.cases[p.id],
      rng = random(identitySeed(`${p.id}:${roundKey}:med`));
    if (p.injury > 0 && (!c || c.status === "cleared")) {
      events.push({ kind: "new", case: openCase(s, p) });
      continue;
    }
    if (!c) continue;
    if (c.status === "decision") {
      // Undecided cases default to the staff recommendation after a round, so the game never stalls.
      if (c.opened.week !== s.week || c.opened.year !== s.year) {
        try {
          chooseTreatment(s, p.id, recommendedTreatment(s, c), { delegated: true });
        } catch {
          chooseTreatment(s, p.id, c.options.find((o) => o !== "ir") ?? c.options[0], { delegated: true });
        }
      }
      continue;
    }
    if (c.status === "treating") {
      // Good physios and facilities sometimes shave a week off.
      if (p.injury > 1 && rng() < Math.max(0, d.recoveryBonus)) {
        p.injury -= 1;
        events.push({ kind: "ahead", playerId: p.id });
      }
      if (p.injury <= 0) {
        c.status = "cleared";
        c.returned = { year: s.year, week: s.week };
        c.reinjuryUntil = s.week + 4;
        applyLongTerm(p, c.outlook?.longTerm, s.year);
        m.history.unshift({ ...c });
        m.history = m.history.slice(0, 60);
        log(s, "Cleared to return", `${p.name} is back from a ${c.label.toLowerCase()}.`);
        events.push({ kind: "cleared", playerId: p.id });
      }
    } else if (c.status === "playing-through" && p.injury > 0) {
      // A separate knock while playing hurt ends the play-through and needs its own decision.
      c.status = "cleared";
      m.history.unshift({ ...c });
      events.push({ kind: "new", case: openCase(s, p) });
    } else if (c.status === "playing-through") {
      const t = TREATMENTS[c.treatment];
      c.weeksPlayed = (c.weeksPlayed || 0) + 1;
      if (rng() < t.aggravate * (1 - d.prevention)) {
        c.aggravations++;
        const weeks = Math.round(c.trueWeeks * 1.6) + 1;
        p.injury = weeks;
        c.status = "treating";
        c.treatment = "rehab";
        c.weeksOut = weeks;
        c.outlook = { ...treatmentOutlook(s, c, "rehab"), longTerm: { base: -1 } };
        applyMood(s, { playerId: p.id, delta: -4, trust: -6, reason: "Aggravated an injury he played through", sourceId: `${c.id}:agg`, spillover: false });
        log(s, "Injury aggravated", `${p.name} aggravated the ${c.label.toLowerCase()} and is now out ${weeks} weeks.`);
        events.push({ kind: "aggravated", playerId: p.id });
      } else if (c.weeksPlayed >= c.trueWeeks) {
        c.status = "cleared";
        c.reinjuryUntil = s.week + 3;
        m.history.unshift({ ...c });
        events.push({ kind: "healed", playerId: p.id });
      }
    } else if (c.status === "cleared" && (c.reinjuryUntil ?? -1) > s.week && p.injury === 0) {
      const risk = INJURIES[c.type].reinjury * (TREATMENTS[c.treatment]?.risk ?? 1) * (1 - d.prevention) * 0.25;
      if (rng() < risk) {
        p.injury = Math.max(2, Math.round(c.trueWeeks * 0.8));
        p.medical = { ...(p.medical || {}), bodyPart: c.part, diagnosis: `Recurring ${c.label.toLowerCase()}`, weeks: p.injury };
        delete m.cases[p.id];
        events.push({ kind: "new", case: openCase(s, p), recurring: true });
      }
    }
  }
  return events;
}

export function medicalBoard(s) {
  const m = ensureMedical(s);
  const open = Object.values(m.cases)
    .filter((c) => c.status !== "cleared")
    .map((c) => ({ ...c, player: s.roster.find((p) => p.id === c.playerId) }))
    .filter((c) => c.player);
  return {
    decisions: open.filter((c) => c.status === "decision"),
    treating: open.filter((c) => c.status === "treating"),
    playingThrough: open.filter((c) => c.status === "playing-through"),
    history: m.history.slice(0, 12),
    department: department(s),
  };
}

// Negotiation weight: players who were forced to play hurt ask for more and trust less.
export const medicalDemandFactor = (p) => 1 + Math.min(0.2, (p.medicalGrievances || 0) * 0.05);
