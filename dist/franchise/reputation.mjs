// Original career reputation model. Scores and audience estimates are simulated, not real social metrics.
import { playerAwards } from "./player-catalog.mjs";
const clamp = (n, a = 1, b = 99) => Math.max(a, Math.min(b, n));
export function reputationView(s, p) {
  const honors = playerAwards(s, p),
    base = p.ratings?.base ?? p.ovr ?? 60;
  const established = clamp(
    Math.round(
      18 +
        (base - 50) * 1.35 +
        Math.min(9, Math.max(0, p.age - 22) * 0.75) +
        Math.min(12, honors.length * 3),
    ),
  );
  const r = p.reputation;
  const recognition = r?.recognition ?? established;
  const form = p.progression?.form;
  const esteem = Math.round(
    clamp(
      (p.ovr ?? 60) * 0.65 +
        recognition * 0.35 +
        (Number.isFinite(form) ? (form - 6.5) * 5 : 0) -
        (p.holdout ? 3 : 0),
    ),
  );
  return {
    recognition,
    esteem,
    delta: r?.delta ?? 0,
    label:
      recognition >= 90
        ? "League icon"
        : recognition >= 78
          ? "Star name"
          : recognition >= 62
            ? "Established"
            : recognition >= 45
              ? "Building a name"
              : "Emerging",
    audience: Math.round((1200 + recognition ** 3 * 8) / 100) * 100,
    form: Number.isFinite(form) ? form : null,
  };
}
export function syncReputation(s) {
  const key = `${s.year}:${s.phase}:${s.week}`;
  const all = [
    ...s.roster,
    ...s.agents,
    ...s.franchise.clubs
      .filter((c) => c.id !== s.team)
      .flatMap((c) => c.players || []),
  ];
  for (const p of all) {
    if (p.reputation?.lastKey === key) continue;
    const v = reputationView(s, p),
      prior = p.reputation;
    if (!prior) {
      p.reputation = {
        recognition: v.recognition,
        delta: 0,
        lastKey: key,
        history: [{ year: s.year, week: s.week, value: v.recognition }],
      };
      continue;
    }
    const target = clamp(
      (p.ovr ?? 60) * 0.7 +
        v.esteem * 0.3 +
        Math.min(8, playerAwards(s, p).length * 2),
    );
    const delta = Math.max(
      -1,
      Math.min(1, Math.round((target - prior.recognition) * 0.08 * 10) / 10),
    );
    prior.recognition = Math.round(clamp(prior.recognition + delta) * 10) / 10;
    prior.delta = delta;
    prior.lastKey = key;
    prior.history = [
      ...(prior.history || []),
      { year: s.year, week: s.week, value: prior.recognition },
    ].slice(-26);
  }
}
export function reputationLeaders(s) {
  return s.franchise.clubs
    .flatMap((c) =>
      (c.id === s.team ? s.roster : c.players || []).map((p) => ({
        p,
        team: c.id,
        ...reputationView(s, p),
      })),
    )
    .sort((a, b) => b.recognition - a.recognition || b.p.ovr - a.p.ovr);
}
