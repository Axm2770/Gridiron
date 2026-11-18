// League table maths for the League snapshot: division order, the playoff picture "if the
// season ended today" and conservative clinch / elimination marks. Pure functions of state, no
// DOM. Seeding mirrors lifecycle.mjs (four division winners, then the three best other clubs per
// conference; wins, then point differential). Ties are never treated as won, so a mark only
// appears once it cannot be undone by any remaining result.
export const SEEDS_PER_CONFERENCE = 7;

const diff = (r) => (r.pf || 0) - (r.pa || 0);
export const rankTeams = (s, ids) =>
  ids.slice().sort((a, b) => s.teams[b].w - s.teams[a].w || diff(s.teams[b]) - diff(s.teams[a]) || a - b);

// Unplayed regular-season games per club, counted from the schedule itself.
export function remainingGames(s) {
  const left = new Array(s.teams.length).fill(0);
  if (s.phase !== "season") return left;
  for (const week of s.schedule || [])
    for (const g of week)
      if (!Array.isArray(g.score)) {
        left[g.a]++;
        left[g.b]++;
      }
  return left;
}

// Clubs are stored in conference/division order: 16 per conference, 4 per division.
const conferenceIds = (c) => Array.from({ length: 16 }, (_, i) => i + c * 16);
const divisionIds = (d) => Array.from({ length: 4 }, (_, i) => i + d * 4);

export function playoffPicture(s) {
  const left = remainingGames(s),
    max = (t) => s.teams[t].w + left[t],
    marks = {},
    conferences = [];
  const seeded = s.phase !== "season" ? s.franchise?.postseason?.seeds : null;
  for (let c = 0; c < 2; c++) {
    const ids = conferenceIds(c),
      winners = [0, 1, 2, 3].map((d) => rankTeams(s, divisionIds(c * 4 + d))[0]),
      seeds = seeded?.[c]?.length
        ? seeded[c].slice(0, SEEDS_PER_CONFERENCE)
        : [...rankTeams(s, winners), ...rankTeams(s, ids.filter((t) => !winners.includes(t))).slice(0, SEEDS_PER_CONFERENCE - 4)],
      hunt = rankTeams(s, ids.filter((t) => !seeds.includes(t))).slice(0, 3);
    conferences.push({ conference: c, seeds, hunt, winners });
    for (const t of ids) {
      if (seeded) {
        marks[t] = seeds.indexOf(t) >= 0 ? (seeds.indexOf(t) < 4 ? "y" : "x") : "e";
        continue;
      }
      const w = s.teams[t].w,
        rivals = divisionIds(Math.floor(t / 4)).filter((o) => o !== t),
        others = ids.filter((o) => o !== t);
      if (rivals.every((o) => max(o) < w)) marks[t] = "y";
      else if (others.filter((o) => max(o) >= w).length <= 3) marks[t] = "x";
      else if (rivals.some((o) => s.teams[o].w > max(t)) && others.filter((o) => s.teams[o].w > max(t)).length >= SEEDS_PER_CONFERENCE) marks[t] = "e";
      else marks[t] = null;
    }
  }
  return { conferences, marks, remaining: left, final: !!seeded };
}

export const MARK_LABELS = { y: "Clinched division", x: "Clinched playoff berth", e: "Eliminated" };

// Last few results for a club, newest last ("W", "L", "T"), from the regular-season schedule.
export function recentForm(s, team, count = 5) {
  const out = [];
  for (const week of s.schedule || [])
    for (const g of week) {
      if (!Array.isArray(g.score) || (g.a !== team && g.b !== team)) continue;
      const k = g.a === team ? 0 : 1;
      out.push(g.score[k] > g.score[1 - k] ? "W" : g.score[k] < g.score[1 - k] ? "L" : "T");
    }
  return out.slice(-count);
}

export function streak(form) {
  if (!form.length) return "";
  const last = form[form.length - 1];
  let n = 0;
  for (let i = form.length - 1; i >= 0 && form[i] === last; i--) n++;
  return last + n;
}
