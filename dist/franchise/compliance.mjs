import * as S from "./state.mjs";

// One report is used by calendar gates and the club's league-registration view.
export function complianceReport(s, { game = false, camp = false } = {}) {
  const f = s.franchise,
    list = S.roster(s),
    issues = [];
  const add = (code, area, message, route) =>
    issues.push({ code, area, message, route });
  const cap = S.capLedger(s);
  if (
    ![cap.limit, cap.used, cap.room].every(Number.isSafeInteger) ||
    cap.limit <= 0
  )
    add(
      "CAP_INVALID",
      "Salary cap",
      "The salary cap ledger needs correction.",
      "Contracts",
    );
  else if (cap.room < 0)
    add(
      "CAP_OVER",
      "Salary cap",
      `Clear $${(-cap.room / S.MILLION).toFixed(2)}M before advancing.`,
      "Contracts",
    );
  const counts = Object.fromEntries(
    ["active", "practice", "elevated", "ir"].map((k) => [
      k,
      list.filter((p) => (p.status || "active") === k).length,
    ]),
  );
  const limit =
    camp || s.phase === "offseason"
      ? Math.min(90, f.rules.preseason || 90)
      : Math.min(53, f.rules.active || 53);
  if (counts.active > limit)
    add(
      "ROSTER_ACTIVE",
      "Roster",
      `Active roster: ${counts.active} / ${limit}. Move or release players before advancing.`,
      "Roster",
    );
  if (counts.practice > Math.min(16, f.rules.practice || 16))
    add(
      "ROSTER_PRACTICE",
      "Roster",
      "The practice squad exceeds its registration limit.",
      "Roster",
    );
  if (counts.elevated > 2 || counts.active + counts.elevated > limit + 2)
    add(
      "ROSTER_ELEVATED",
      "Roster",
      "Only two weekly practice-squad elevations are permitted.",
      "Roster",
    );
  const ids = new Set();
  for (const p of list) {
    if (!p?.id || ids.has(p.id)) {
      add(
        "PLAYER_ID",
        "Roster",
        "A player registration is duplicated or missing.",
        "Roster",
      );
      break;
    }
    ids.add(p.id);
    if (
      !["active", "practice", "elevated", "ir"].includes(p.status || "active")
    ) {
      add(
        "PLAYER_STATUS",
        "Roster",
        `${p.name}: choose an active, practice-squad or reserve designation.`,
        "Roster",
      );
      break;
    }
    const c = f.contracts[p.id];
    if (
      !c ||
      c.ended ||
      c.team !== s.team ||
      (s.phase !== "offseason" &&
        (S.financeYear(s) < c.start || S.financeYear(s) >= c.start + c.years))
    ) {
      add(
        "PLAYER_CONTRACT",
        "Contracts",
        `${p.name} needs a valid club contract.`,
        "Contracts",
      );
      break;
    }
  }
  try {
    S.validate(s);
  } catch (e) {
    add("STRUCTURE", "Registration", e.message, "Contracts");
  }
  if (game)
    for (const message of S.gameEligibility(s))
      if (
        !issues.some((i) => i.message === message) &&
        !/cap|exceeds|elevations/.test(message)
      )
        add("MATCH_PERSONNEL", "Match squad", message, "Roster");
  return { ok: !issues.length, issues, counts, limit, cap };
}
export function assertCanAdvance(s, options) {
  const report = complianceReport(s, options);
  if (!report.ok) throw Error(report.issues[0].message);
  return report;
}
