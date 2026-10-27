import * as S from "./state.mjs";
import * as Staff from "./staff.mjs";
import {
  ensureCareerSystems,
  generateJobOffers,
  coachReputation,
  hash,
  changeCoachReputation,
} from "./career-systems.mjs";
export const JOB_QUESTIONS = [
  {
    question: "What would define your first season here?",
    choices: [
      "Build a disciplined, adaptable football identity.",
      "Commit to developing the quarterback and young core.",
      "Make an immediate championship push.",
    ],
  },
  {
    question: "How will you work with ownership and the front office?",
    choices: [
      "Agree on clear milestones and review them together.",
      "Keep personnel and coaching decisions aligned through weekly reviews.",
      "Give me full control and judge the results.",
    ],
  },
];
function opportunity(s, id) {
  const f = ensureCareerSystems(s),
    o = f.coachReputation.jobOffers.find(
      (o) => o.id === id && o.year === s.year,
    );
  if (
    s.live ||
    s.phase !== "offseason" ||
    !o ||
    !["HC", "OC", "DC"].includes(f.role)
  )
    throw Error("This head-coaching opportunity is not currently available.");
  return o;
}
export function beginJobInterview(s, id) {
  const o = opportunity(s, id);
  if (!["invited", "interview"].includes(o.status))
    throw Error("This interview is already concluded.");
  o.status = "interview";
  o.answers ??= [];
  return o;
}
export function answerJobInterview(s, id, step, index) {
  const o = opportunity(s, id);
  if (
    o.status !== "interview" ||
    o.answers.length !== step ||
    !JOB_QUESTIONS[step]?.choices[index]
  )
    throw Error("Choose a current interview response.");
  o.answers.push(index);
  if (o.answers.length === 2) {
    const owner = s.franchise.clubs[o.team].owner,
      fit =
        (o.answers[0] === 2 && owner.trait === "Patient Rebuilder" ? -10 : 8) +
        (o.answers[1] === 2 && owner.trait === "Meddler" ? -12 : 8);
    o.assessment = coachReputation(s) + fit + (hash(id) % 13) - 6;
    o.status = o.assessment >= 72 ? "offered" : "declined";
    o.line =
      o.status === "offered"
        ? "We want to offer you the head-coaching position, subject to the completed search and your release."
        : "We are pursuing a different direction for this appointment.";
  }
  return o;
}
export function acceptJob(s, id) {
  const o = opportunity(s, id),
    f = s.franchise;
  if (o.status !== "offered")
    throw Error("There is no current offer to accept.");
  Staff.ensureStaff(s);
  const from = s.team,
    target = o.team,
    originalRole = f.role,
    source = f.clubs[from],
    human = source.staff.find((c) => c.role === originalRole);
  if (!human)
    throw Error(
      "Your current coaching appointment must be registered before moving clubs.",
    );
  if (S.capLedger(s, target).room < 0)
    throw Error("The destination club must resolve its cap position first.");
  // Ownership completes its own external-candidate process; the human interview answers are retained.
  try {
    s.team = target;
    f.role = "Owner";
    Staff.openStaffSearch(s, "HC");
    const diverse = Staff.staffCandidates(s, "HC")
      .filter(
        (c) =>
          (c.minority || c.woman) &&
          c.employer !== target &&
          !c.userControlled &&
          Staff.interviewWindow(s, c, "HC").ok,
      )
      .slice(0, 2);
    if (diverse.length < 2)
      throw Error(
        "The hiring committee must complete two eligible external interviews.",
      );
    for (const c of diverse) {
      Staff.startStaffInterview(s, "HC", c.id);
      Staff.answerStaffInterview(s, "HC", c.id, 0, 1);
      Staff.answerStaffInterview(s, "HC", c.id, 1, 0);
    }
    // Conditional release occurs only once the user accepts the written offer.
    if (originalRole === "HC") {
      source.staff = source.staff.filter((c) => c.id !== human.id);
      human.employer = null;
      human.tenure = 0;
      f.staffPool.push(human);
    }
    human.salary = o.salary;
    Staff.startStaffInterview(s, "HC", human.id);
    Staff.answerStaffInterview(s, "HC", human.id, 0, o.answers[0]);
    Staff.answerStaffInterview(s, "HC", human.id, 1, o.answers[1]);
    const hired = Staff.hireStaff(s, "HC", human.id, { boardDelegated: true });
    hired.userControlled = true;
  } finally {
    s.team = from;
    f.role = originalRole;
  }
  source.players = s.roster;
  s.roster = f.clubs[target].players;
  f.clubs[target].players = [];
  s.team = target;
  f.humanTeam = target;
  f.role = "HC";
  if (f.userCoach) {
    f.userCoach.team = target;
    f.userCoach.role = "HC";
  }
  s.coach.calling = "Manual";
  s.live = null;
  s.interviewPending = null;
  f.fanPulse.value = f.clubs[target].fanApproval;
  o.status = "accepted";
  for (const other of f.coachReputation.jobOffers)
    if (
      other.id !== id &&
      other.year === s.year &&
      ["invited", "offered", "interview"].includes(other.status)
    )
      other.status = "withdrawn";
  changeCoachReputation(
    s,
    "appointment:" + id,
    1,
    "Appointed to a new head-coaching position",
    "Career",
  );
  S.log(
    s,
    "A new chapter",
    `${s.coach.name} takes charge of a new club as head coach.`,
    "club",
  );
  return o;
}
export function declineJob(s, id) {
  const o = opportunity(s, id);
  if (!["invited", "offered", "interview"].includes(o.status))
    throw Error("This opportunity has already concluded.");
  o.status = "withdrawn";
}
