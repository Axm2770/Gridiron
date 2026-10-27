import { consumeBoardPermit } from "./boardroom.mjs";
import {
  ensureCareerSystems,
  coachPerks,
  fanReaction,
  dialogueConsequences,
} from "./career-systems.mjs";
import { MILLION, log, financeYear, migrate } from "./state.mjs";

export const STAFF_ROLES = {
  HC: "Head coach",
  GM: "General manager",
  OC: "Offensive coordinator",
  DC: "Defensive coordinator",
  STC: "Special teams coordinator",
  QB: "Quarterbacks",
  RB: "Running backs",
  WR: "Receivers",
  TE: "Tight ends",
  OL: "Offensive line",
  DL: "Defensive line",
  LB: "Linebackers",
  DB: "Defensive backs",
  Medical: "Head of medical",
  Scout: "Head scout",
  AHC: "Assistant head coach",
};
export const INTERVIEW_REQUIREMENTS = {
  HC: 2,
  GM: 2,
  OC: 2,
  DC: 2,
  STC: 2,
  QB: 1,
};
const offense = ["QB", "RB", "WR", "TE", "OL"],
  defense = ["DL", "LB", "DB"];
const names = [
  "Jordan Ellis",
  "Marcus Bell",
  "Elena Torres",
  "Andre Wallace",
  "Cameron Price",
  "Darius Cole",
  "Maya Brooks",
  "Julian Grant",
  "Adrian Shaw",
  "Nolan Reeves",
  "Terry Lawson",
  "Isaiah Benton",
  "Robin Hayes",
  "Devin Carter",
  "Sam Morgan",
  "Malik West",
];
const surnames = [
  "Abbott",
  "Bennett",
  "Coleman",
  "Donovan",
  "Emerson",
  "Foster",
  "Gallagher",
  "Harris",
  "Ingram",
  "Jackson",
  "Kendall",
  "Lawson",
  "Mason",
  "Nash",
  "Ortega",
  "Palmer",
  "Quinn",
  "Ramsey",
  "Sawyer",
  "Turner",
  "Underwood",
  "Vaughn",
  "Walker",
  "Young",
  "Bell",
  "Brooks",
  "Diaz",
  "Franklin",
  "Hughes",
  "Keller",
  "Morris",
  "Price",
];
const staffName = (n) =>
  names[n % names.length].split(" ")[0] +
  " " +
  surnames[(n * 7 + Math.floor(n / names.length)) % surnames.length];
const roles = Object.keys(STAFF_ROLES);
const rank = (r) =>
  ["HC", "GM"].includes(r) ? 3 : ["OC", "DC", "STC", "AHC"].includes(r) ? 2 : 1;
export function canManageStaff(s, role) {
  return ["HC", "GM"].includes(role)
    ? ["Owner", "GM"].includes(s.franchise.role) &&
        (role !== "GM" || s.franchise.role === "Owner")
    : ["Owner", "GM", "HC"].includes(s.franchise.role);
}
function requireManager(s, role) {
  if (!canManageStaff(s, role))
    throw Error("Ownership delegates this appointment to the front office.");
  if (s.live)
    throw Error("Finish the current game before changing the coaching staff.");
}
function enrich(c, team, year) {
  if (Number.isFinite(c.salary)) c.salary = Math.round(c.salary);
  c.years ??= 3;
  c.tenure ??= c.compEligible ? 2 : 0;
  c.employer = team;
  c.joinedYear ??= year - c.tenure;
  // Eligibility is explicit database metadata, never inferred from a name or appearance.
  c.minority ??= !!c.compEligible;
  c.woman ??= false;
  c.personality ??= ["Teacher", "Analyst", "Motivator"][
    Math.abs(c.rating || 70) % 3
  ];
  c.specialty ??= STAFF_ROLES[c.role] || c.role;
  return c;
}
export function ensureStaff(s) {
  if (!s.franchise) migrate(s);
  const f = s.franchise;
  f.staffSearches ??= {};
  f.staffSearchArchive ??= [];
  f.staffCompensations ??= [];
  f.staffMovements ??= [];
  f.staffSerial ??= 0;
  if (!f.staffHubVersion) {
    for (const club of f.clubs) {
      for (const [i, role] of roles
        .filter((r) => !["HC", "GM"].includes(r))
        .entries()) {
        if (club.staff.some((c) => c.role === role)) continue;
        const n = club.id * 17 + i;
        club.staff.push({
          id: `staff-${club.id}-${role}`,
          name: staffName(n),
          role,
          rating: 63 + (n % 23),
          salary:
            (role === "Medical" ? 1.2 : rank(role) === 2 ? 2 : 0.65) * MILLION,
          scheme: ["Balanced", "Vertical offense", "Pressure defense"][n % 3],
          years: 2 + (n % 3),
          tenure: 2 + (n % 4),
          minority: n % 3 !== 0,
          woman: n % 11 === 0,
          compEligible: n % 3 !== 0,
        });
      }
      for (const c of club.staff) enrich(c, club.id, s.year);
    }
    f.staffPool ??= [];
    // Keep imported/legacy candidates; add a broad eligible external market once.
    for (const [i, role] of roles.entries())
      for (let j = 0; j < 3; j++)
        f.staffPool.push({
          id: `staff-free-${i}-${j}-${s.year}`,
          name: names[(i * 3 + j) % names.length] + [" Jr.", " Sr.", ""][j],
          role,
          rating: 67 + ((i * 7 + j * 5) % 26),
          salary:
            (rank(role) === 3
              ? 4 + j
              : rank(role) === 2
                ? 1.8 + j * 0.4
                : 0.6 + j * 0.2) * MILLION,
          scheme: ["Balanced", "Vertical offense", "Pressure defense"][i % 3],
          years: 3,
          tenure: 0,
          minority: j !== 2,
          woman: j === 1 && i % 2 === 0,
          employer: null,
          joinedYear: s.year,
          personality: ["Teacher", "Analyst", "Motivator"][j],
        });
    f.staffHubVersion = 1;
  }
  if(!f.assistantStaffVersion){
    if(!f.staffPool.some(c=>c.role==='AHC'))for(let i=0;i<3;i++)f.staffPool.push({id:`assistant-candidate-${s.year}-${i}`,name:['Alex Warren','Devin Brooks','Casey Morgan'][i],role:'AHC',rating:74+i*5,salary:(1.5+i*.3)*MILLION,scheme:'Balanced',years:3,tenure:0,minority:i===1,woman:i===2,employer:null,personality:['Teacher','Analyst','Motivator'][i]});
    f.assistantStaffVersion=1;
  }
  if (!f.staffProfileVersion) {
    const scheme = (role, n) =>
      role === "Medical"
        ? "Rehabilitation"
        : role === "Scout"
          ? "Player projection"
          : role === "STC"
            ? "Field position"
            : ["DC", "DL", "LB", "DB"].includes(role)
              ? ["Pressure defense", "Zone coverage", "Man coverage"][n % 3]
              : ["Balanced", "Vertical offense", "Run-first"][n % 3];
    for (const c of [...f.staffPool, ...f.clubs.flatMap((t) => t.staff)]) {
      const match = /^staff-(\d+)-(.+)$/.exec(c.id);
      if (match && !c.id.startsWith("staff-free-")) {
        const n =
          Number(match[1]) * 17 +
          roles.filter((r) => !["HC", "GM"].includes(r)).indexOf(match[2]);
        c.name = staffName(n);
        c.scheme = scheme(c.role, n);
      } else if (c.id.startsWith("staff-free-"))
        c.scheme = scheme(c.role, c.rating);
    }
    f.staffProfileVersion = 1;
  }
  for (const search of Object.values(f.staffSearches)) {
    const incumbent =
      f.clubs[search.team]?.staff.find((c) => c.role === search.role)?.id ||
      null;
    if (
      search.status === "open" &&
      (search.year !== s.year || search.incumbent !== incumbent)
    ) {
      search.status = "closed";
      search.closedReason =
        search.year !== s.year ? "Season ended" : "Vacancy changed";
    }
  }
  for (const c of f.staffPool || []) enrich(c, null, s.year);
  for (const club of f.clubs)
    for (const c of club.staff) enrich(c, club.id, s.year);
  ensureCareerSystems(s);
  const profile = f.userCoach;
  if (profile && ["HC", "OC", "DC"].includes(f.role)) {
    const own = f.clubs[f.humanTeam].staff.find((c) => c.role === f.role);
    if (own && !own.userControlled && f.humanTeam === s.team) {
      own.name = profile.name || s.coach.name;
      own.userControlled = true;
      own.minority = false;
      own.woman = false;
      own.compEligible = false;
    }
  }
  return f;
}
export function staffOfferSalary(s, c) {
  return Math.round(
    c.salary *
      (s.team === s.franchise.humanTeam ? coachPerks(s).staffTerms : 1),
  );
}
export function staffCandidates(s, role, team = s.team) {
  ensureStaff(s);
  const eligible = (c) =>
    c.role === role ||
    (role === "HC" && ["OC", "DC", "STC"].includes(c.role)) ||
    (role === "GM" && c.role === "Scout") ||
    (role === "OC" && offense.includes(c.role)) ||
    (role === "DC" && defense.includes(c.role));
  const all = [
    ...s.franchise.staffPool,
    ...s.franchise.clubs.flatMap((c) => c.staff),
  ];
  return all
    .filter((c) => eligible(c) && !(c.employer === team && c.role === role))
    .sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));
}
const findCandidate = (s, id) =>
  [
    ...(s.franchise.staffPool || []),
    ...s.franchise.clubs.flatMap((c) => c.staff),
  ].find((c) => c.id === id);
function eliminated(s, team) {
  if (s.phase === "offseason") return true;
  if (s.phase !== "playoffs") return false;
  const round = s.franchise.postseason?.round || 0;
  if (round === 0)
    return !(s.franchise.postseason?.seeds || []).flat().includes(team);
  return !s.playoffs?.rounds.at(-1)?.some((g) => g.a === team || g.b === team);
}
export function interviewWindow(s, c, role, mode = "inPerson", team = s.team) {
  if (!c) return { ok: false, reason: "Candidate no longer available." };
  const external = c.employer !== null && c.employer !== team;
  if (!external)
    return {
      ok: true,
      reason:
        c.employer === team
          ? "Internal interview available"
          : "Available for interview",
    };
  if (rank(role) <= rank(c.role))
    return {
      ok: false,
      reason:
        "Under contract: a lateral move requires release by the employer.",
    };
  if (s.phase === "season")
    return {
      ok: false,
      reason: "The external hiring window opens after the regular season.",
    };
  if (s.phase === "offseason")
    return { ok: true, reason: "Offseason hiring window open" };
  const round = s.franchise.postseason?.round || 0;
  if (role === "HC" && mode === "virtual") {
    const seeds = s.franchise.postseason?.seeds || [];
    const bye = seeds.some((a) => a[0] === c.employer);
    if (round >= 1 || eliminated(s, c.employer) || bye)
      return { ok: true, reason: "Virtual head-coach interview window" };
  }
  if (role === "HC" && mode === "inPerson" && round < 2)
    return {
      ok: false,
      reason:
        "In-person external head-coach interviews open after the divisional round.",
    };
  if (!eliminated(s, c.employer))
    return {
      ok: false,
      reason:
        "Candidate is still preparing for the postseason. Wait for their season to end.",
    };
  if (!eliminated(s, team))
    return {
      ok: false,
      reason: "Finish your postseason before appointing external staff.",
    };
  return { ok: true, reason: "Postseason hiring window open" };
}
export function openStaffSearch(s, role) {
  ensureStaff(s);
  requireManager(s, role);
  if (!Object.hasOwn(STAFF_ROLES, role))
    throw Error("Choose an established staff position.");
  const key = `${s.team}:${role}`,
    old = s.franchise.staffSearches[key];
  if (old?.status === "open" && old.year === s.year) return old;
  if (old && !s.franchise.staffSearchArchive.some((x) => x.id === old.id)) {
    s.franchise.staffSearchArchive.unshift(structuredClone(old));
    s.franchise.staffSearchArchive = s.franchise.staffSearchArchive.slice(
      0,
      100,
    );
  }
  const incumbent = s.franchise.clubs[s.team].staff.find(
    (c) => c.role === role,
  );
  const search = {
    id: `search-${++s.franchise.staffSerial}`,
    team: s.team,
    role,
    year: s.year,
    incumbent: incumbent?.id || null,
    status: "open",
    interviews: [],
    drafts: {},
    openedWeek: s.week,
  };
  s.franchise.staffSearches[key] = search;
  log(
    s,
    "Staff search opened",
    `The club is reviewing candidates for ${STAFF_ROLES[role]}.`,
    "club",
  );
  return search;
}
export function currentSearch(s, role, team = s.team) {
  return s.franchise.staffSearches?.[`${team}:${role}`];
}
function validSearch(s, role) {
  ensureStaff(s);
  requireManager(s, role);
  const x = currentSearch(s, role);
  if (!x || x.status !== "open" || x.year !== s.year)
    throw Error("Open a new search before contacting candidates.");
  const incumbent =
    s.franchise.clubs[s.team].staff.find((c) => c.role === role)?.id || null;
  if (x.incumbent !== incumbent)
    throw Error("The vacancy has changed. Open a fresh search.");
  return x;
}
export function startStaffInterview(s, role, id, mode = "inPerson") {
  const x = validSearch(s, role),
    c = findCandidate(s, id);
  if (!["inPerson", "virtual"].includes(mode))
    throw Error("Choose an interview format.");
  if (!staffCandidates(s, role).some((c) => c.id === id))
    throw Error("Candidate is not qualified for this position.");
  const w = interviewWindow(s, c, role, mode);
  if (!w.ok) throw Error(w.reason);
  const prior = x.interviews.find((i) => i.candidate === id && i.mode === mode);
  if (prior) throw Error("This interview has already been completed.");
  x.drafts[id] ??= {
    candidate: id,
    mode,
    employer: c.employer,
    step: 0,
    answers: [],
  };
  if (x.drafts[id].mode !== mode)
    x.drafts[id] = {
      candidate: id,
      mode,
      employer: c.employer,
      step: 0,
      answers: [],
    };
  return x.drafts[id];
}
export const STAFF_QUESTIONS = [
  {
    question: "What will define your first month in the building?",
    choices: [
      "Establish a teaching plan and assess every player.",
      "Audit the film and build a clear weekly process.",
      "Set demanding standards and explain the role of each player.",
    ],
  },
  {
    question: "How should we measure progress when results are difficult?",
    choices: [
      "Look for technical improvement and player availability.",
      "Review decisions and performance against our game plan.",
      "Protect accountability and trust throughout the room.",
    ],
  },
];
export function answerStaffInterview(s, role, id, expectedStep, choice) {
  const x = validSearch(s, role),
    d = x.drafts[id],
    c = findCandidate(s, id);
  if (
    !d ||
    !c ||
    d.step !== expectedStep ||
    !Number.isInteger(choice) ||
    choice < 0 ||
    choice > 2
  )
    throw Error("This interview response is no longer available.");
  const w = interviewWindow(s, c, role, d.mode);
  if (!w.ok || d.employer !== c.employer)
    throw Error(
      w.ok
        ? "The candidate changed employers. Begin a new interview."
        : w.reason,
    );
  d.answers.push(choice);
  d.step++;
  if (d.step === STAFF_QUESTIONS.length) {
    x.interviews.push({
      candidate: id,
      name: c.name,
      employer: c.employer,
      external: c.employer !== s.team,
      diverse: !!(c.minority || c.woman),
      mode: d.mode,
      year: s.year,
      week: s.week,
      answers: [...d.answers],
      assessment: [
        "Teaching & development",
        "Evidence & preparation",
        "Standards & leadership",
      ][d.answers[0]],
      searchId: x.id,
    });
    delete x.drafts[id];
    log(
      s,
      "Interview completed",
      `${c.name} met with the front office for the ${STAFF_ROLES[role]} position.`,
      "club",
    );
  }
  return x;
}
export function searchCompliance(s, role, team = s.team, record = null) {
  const x = record || currentSearch(s, role, team),
    required = INTERVIEW_REQUIREMENTS[role] || 0;
  const interviewed = new Set(
    (x?.interviews || [])
      .filter(
        (i) =>
          i.searchId === x.id &&
          i.external &&
          i.diverse &&
          (!["HC", "GM"].includes(role) || i.mode === "inPerson"),
      )
      .map((i) => i.candidate),
  );
  return {
    required,
    completed: interviewed.size,
    ok: interviewed.size >= required,
  };
}
function nextDraftYear(s) {
  const year = financeYear(s);
  // A draft already opened has frozen its pick order; new compensation begins the following draft.
  return s.franchise.draft
    ? Math.max(year, s.franchise.draft.year) + 1
    : s.phase === "offseason"
      ? year
      : s.year + 1;
}
export function awardStaffCompensation(s, employee, from, to, role) {
  ensureStaff(s);
  if (
    from === null ||
    from === to ||
    !employee.minority ||
    !["HC", "GM"].includes(role) ||
    ["HC", "GM"].includes(employee.role) ||
    employee.tenure < 2
  )
    return [];
  const f = s.franchise,
    key = `${employee.id}:${from}:${to}:${financeYear(s)}`;
  if (f.staffCompensations.some((e) => e.key === key)) return [];
  const first = nextDraftYear(s),
    cohort = `${from}:${financeYear(s)}`;
  f.staffCompensations.push({
    key,
    cohort,
    employee: employee.id,
    name: employee.name,
    from,
    to,
    role,
    first,
  });
  const members = f.staffCompensations.filter((e) => e.cohort === cohort);
  const count =
    members.some((e) => e.role === "HC") && members.some((e) => e.role === "GM")
      ? 3
      : 2;
  f.futurePicks ??= [];
  for (let i = 0; i < count; i++)
    if (
      !f.futurePicks.some(
        (p) => p.compensationCohort === cohort && p.year === first + i,
      )
    )
      f.futurePicks.push({
        id: `jc2a-${cohort}-${first + i}`,
        team: from,
        year: first + i,
        round: 3,
        source: "JC-2A staff development",
        compensationCohort: cohort,
        special: true,
      });
  log(
    s,
    "Draft compensation awarded",
    `${f.clubs[from].identity?.name || "The former club"} receives third-round staff-development compensation following ${employee.name}’s appointment.`,
    "league",
  );
  return f.futurePicks.filter((p) => p.compensationCohort === cohort);
}
export function hiringCheck(s, role, id) {
  const x = currentSearch(s, role),
    c = findCandidate(s, id),
    reasons = [];
  if (!canManageStaff(s, role))
    reasons.push("This appointment is delegated to the front office.");
  if (s.live) reasons.push("Finish the current game.");
  if (!x || x.status !== "open") reasons.push("Open a staff search.");
  if (!c || !staffCandidates(s, role).some((q) => q.id === id))
    reasons.push("Candidate is no longer available for this role.");
  if (c) {
    const window = interviewWindow(s, c, role, "inPerson");
    if (!window.ok) reasons.push(window.reason);
    if (
      c.employer !== null &&
      c.employer !== s.team &&
      !eliminated(s, c.employer)
    )
      reasons.push("The candidate cannot sign until their club’s season ends.");
    if (
      !x?.interviews.some(
        (i) =>
          i.candidate === id &&
          i.employer === c.employer &&
          (!["HC", "GM"].includes(role) || i.mode === "inPerson"),
      )
    )
      reasons.push("Complete an interview with this candidate.");
    const club = s.franchise.clubs[s.team],
      old = club.staff.find((c) => c.role === role),
      cost =
        staffOfferSalary(s, c) +
        (old ? Math.round(old.salary * Math.max(1, old.years) * 0.5) : 0);
    if (!Number.isSafeInteger(c.salary) || c.salary < 0 || club.cash < cost)
      reasons.push("Ownership cannot fund the appointment and severance.");
    if (
      club.staff.reduce((n, q) => n + q.salary, 0) -
        (old?.salary || 0) +
        staffOfferSalary(s, c) >
      club.staffBudget
    )
      reasons.push(
        "The appointment exceeds the annual staff budget. Request ownership backing.",
      );
    if (
      club.owner.trait === "Penny-Pincher" &&
      staffOfferSalary(s, c) > 4 * MILLION
    )
      reasons.push("The salary exceeds ownership’s staff budget.");
  }
  const compliance = searchCompliance(s, role);
  if (!compliance.ok)
    reasons.push(
      `Complete ${compliance.required} distinct external diverse interviews (${compliance.completed} recorded).`,
    );
  return { ok: !reasons.length, reasons, compliance };
}
export function hireStaff(s, role, id, { boardDelegated = false } = {}) {
  const x = validSearch(s, role),
    check = hiringCheck(s, role, id);
  if (!check.ok) throw Error(check.reasons[0]);
  const f = s.franchise,
    c = findCandidate(s, id),
    from = c.employer,
    club = f.clubs[s.team],
    old = club.staff.find((q) => q.role === role);
  let permit = null;
  if (
    old &&
    ["HC", "GM", "OC", "DC", "STC"].includes(role) &&
    !(boardDelegated && s.team !== f.humanTeam)
  )
    permit = consumeBoardPermit(s, "Staff change", {
      id: old.id,
      replacement: id,
      role,
    });
  if (permit?.scope === "Compromise" && staffOfferSalary(s, c) > old.salary)
    throw Error("Ownership approved a cost-neutral replacement only.");
  const agreedSalary = staffOfferSalary(s, c);
  if (old) {
    club.cash -= Math.round(old.salary * Math.max(1, old.years) * 0.5);
    f.staffPool.push({ ...old, employer: null, tenure: 0 });
  }
  awardStaffCompensation(s, c, from, s.team, role);
  for (const team of f.clubs)
    team.staff = team.staff.filter(
      (q) => q.id !== id && (team.id !== s.team || q.role !== role),
    );
  f.staffPool = f.staffPool.filter((q) => q.id !== id);
  club.cash -= agreedSalary;
  const hired = {
    ...c,
    salary: agreedSalary,
    role,
    employer: s.team,
    years: 3,
    tenure: from === s.team ? c.tenure : 0,
    joinedYear: from === s.team ? c.joinedYear : s.year,
  };
  club.staff.push(hired);
  x.status = "appointed";
  x.appointed = id;
  f.staffMovements.unshift({
    year: s.year,
    week: s.week,
    id,
    name: c.name,
    from,
    to: s.team,
    role,
  });
  f.staffMovements = f.staffMovements.slice(0, 100);
  log(
    s,
    "Coaching appointment",
    `${c.name} appointed ${STAFF_ROLES[role]}.`,
    "club",
  );
  fanReaction(
    s,
    `staff-hire:${s.year}:${id}:${s.team}`,
    c.rating >= 80 ? 2 : 0,
    `${c.name} appointed ${STAFF_ROLES[role]}`,
    { topic: "Coaching" },
  );
  return hired;
}
export function fireStaff(s, id) {
  ensureStaff(s);
  const club = s.franchise.clubs[s.team],
    c = club.staff.find((c) => c.id === id);
  if (!c) throw Error("Staff member no longer at the club.");
  requireManager(s, c.role);
  const severance = Math.round(c.salary * Math.max(1, c.years) * 0.5);
  if (club.cash < severance)
    throw Error("Ownership cannot fund the severance payment.");
  const permit = ["HC", "GM", "OC", "DC", "STC"].includes(c.role)
    ? consumeBoardPermit(s, "Staff change", {
        id,
        replacement: null,
        role: c.role,
      })
    : null;
  if (
    permit?.scope === "Compromise" &&
    club.staff.filter((q) => ["HC", "OC", "DC"].includes(q.role) && q.id !== id)
      .length < 2
  )
    throw Error("Ownership requires two senior coaches to remain in place.");
  club.cash -= severance;
  club.staff = club.staff.filter((q) => q.id !== id);
  s.franchise.staffPool.push({ ...c, employer: null, tenure: 0 });
  const x = currentSearch(s, c.role);
  if (x?.status === "open") x.status = "closed";
  log(
    s,
    "Staff departure",
    `${c.name} leaves the ${STAFF_ROLES[c.role]} position.`,
    "club",
  );
  fanReaction(
    s,
    `staff-fire:${s.year}:${id}`,
    -1,
    `${c.name} leaves the coaching staff`,
    { topic: "Coaching" },
  );
  return severance;
}
export function runStaffCarousel(s) {
  ensureStaff(s);
  const f = s.franchise;
  // Confirm actual employer-to-employer appointments; no compensation for an invented vacancy.
  const arrivals = new Set();
  for (const club of f.clubs) {
    if (
      club.id === s.team ||
      club.staff.some((c) => c.role === "HC" && c.years > 1)
    )
      continue;
    const c =
      f.clubs
        .filter((t) => t.id !== club.id && !arrivals.has(t.id))
        .flatMap((t) => t.staff)
        .filter(
          (c) =>
            !c.userControlled &&
            ["OC", "DC"].includes(c.role) &&
            c.rating >= 85 &&
            c.years > 0,
        )
        .sort((a, b) => b.rating - a.rating)[0] ||
      f.staffPool
        .filter((c) => c.role === "HC")
        .sort((a, b) => b.rating - a.rating)[0];
    if (
      !c ||
      (club.owner.trait === "Penny-Pincher" && c.salary > 4 * MILLION) ||
      club.cash <
        c.salary + (club.staff.find((q) => q.role === "HC")?.salary || 0) * 2
    )
      continue;
    const from = c.employer,
      originalTeam = s.team,
      originalRole = f.role;
    // CPU committees complete the same search requirements and use the same appointment gate.
    // Only staff functions run while the club context is switched; roster ownership is untouched.
    try {
      s.team = club.id;
      f.role = "Owner";
      openStaffSearch(s, "HC");
      const interviewees = staffCandidates(s, "HC")
        .filter(
          (q) =>
            (q.minority || q.woman) &&
            q.employer !== club.id &&
            interviewWindow(s, q, "HC").ok,
        )
        .slice(0, 2);
      for (const q of [
        ...interviewees,
        ...(!interviewees.some((q) => q.id === c.id) ? [c] : []),
      ]) {
        startStaffInterview(s, "HC", q.id);
        answerStaffInterview(s, "HC", q.id, 0, 1);
        answerStaffInterview(s, "HC", q.id, 1, 0);
      }
      hireStaff(s, "HC", c.id, { boardDelegated: true });
      arrivals.add(club.id);
    } finally {
      s.team = originalTeam;
      f.role = originalRole;
    }
  }
  for (const club of f.clubs) {
    for (const c of club.staff) {
      c.years--;
      if (c.userControlled && c.years <= 0) c.years = 1;
      c.tenure++;
      if (club.id !== s.team && c.years <= 0) c.years = 3;
    }
    for (const c of club.staff.filter((c) => c.years <= 0))
      f.staffPool.push({ ...c, employer: null, tenure: 0 });
    club.staff = club.staff.filter((c) => c.years > 0);
    club.cash -= club.staff.reduce((n, c) => n + c.salary, 0);
  }
  f.staffMovements = f.staffMovements.slice(0, 100);
}
