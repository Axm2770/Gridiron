// Read-only summaries for the Draft room: your selections with a grade each and a class grade.
// Live-draft picks keep the analyst grade recorded on the ticker; picks made in the quick draft are
// graded the same way afterwards, by comparing the slot with where the player's ability ranks in
// the class that was actually drafted. Never mutates state.

export const GRADE_STEPS = [
  [20, "A+"],
  [10, "A"],
  [3, "B+"],
  [-5, "B"],
  [-15, "C"],
  [-30, "D"],
  [-Infinity, "F"],
];
const POINTS = { "A+": 4.3, A: 4, "B+": 3.3, B: 3, C: 2, D: 1, F: 0 };

export const gradeFor = (diff) => GRADE_STEPS.find(([min]) => diff >= min)[1];

// Average of letter grades, mapped back to the nearest letter at or below it.
export function classGrade(grades) {
  const known = grades.filter((g) => g in POINTS);
  if (!known.length) return null;
  const avg = known.reduce((n, g) => n + POINTS[g], 0) / known.length;
  return Object.entries(POINTS).find(([, v]) => avg >= v - 0.15)?.[0] ?? "F";
}

// drafted: [{ slot, team, id, ovr }] for every selection in the class (slot is 1-based).
// ticker: optional live-draft ticker entries ({ slot, team, grade }).
export function draftClassSummary(drafted, team, ticker = []) {
  const byAbility = drafted.slice().sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0) || a.slot - b.slot),
    abilityRank = new Map(byAbility.map((x, i) => [x.id, i + 1]));
  const picks = drafted
    .filter((x) => x.team === team)
    .sort((a, b) => a.slot - b.slot)
    .map((x) => {
      const live = ticker.find((t) => t.slot === x.slot && t.team === team),
        rank = abilityRank.get(x.id) ?? x.slot;
      return { ...x, rank, grade: live?.grade || gradeFor(x.slot - rank), source: live ? "analyst" : "value" };
    });
  return { picks, grade: classGrade(picks.map((p) => p.grade)) };
}
