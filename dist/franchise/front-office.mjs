import { buildSocialFeed } from "./social-network.mjs";
// Read models for recruitment, fixtures and the public, fictional fan network.
import { talentView } from "./player-catalog.mjs";
import { ensureOffice } from "./newsroom.mjs";
export function hubPreferences(s) {
  const o = ensureOffice(s);
  o.hub ??= { board: [], socialLikes: [], socialSaved: [] };
  for (const k of ["board", "socialLikes", "socialSaved"])
    if (!Array.isArray(o.hub[k])) o.hub[k] = [];
  if (!Array.isArray(o.hub.socialSnapshots)) o.hub.socialSnapshots = [];
  return o.hub;
}
export function toggleStored(s, key, id, post = null) {
  if (!["board", "socialLikes", "socialSaved"].includes(key))
    throw Error("Unknown preference.");
  const p = hubPreferences(s),
    a = p[key],
    i = a.indexOf(id);
  if (i < 0) a.push(id);
  else a.splice(i, 1);
  if (a.length > 300) a.splice(0, a.length - 300);
  if (key === "socialSaved") {
    p.socialSnapshots = p.socialSnapshots.filter((x) =>
      p.socialSaved.includes(x.id),
    );
    if (i < 0 && post) {
      const snap = structuredClone(post);
      if (snap.pair)
        snap.pair = snap.pair.map((x) => ({
          ...x,
          p: Object.fromEntries(
            [
              "id",
              "name",
              "pos",
              "realPosition",
              "ovr",
              "face",
              "headshot",
              "generated",
              "skin",
              "hair",
            ]
              .filter((k) => x.p[k] !== undefined)
              .map((k) => [k, x.p[k]]),
          ),
        }));
      p.socialSnapshots.push(snap);
    }
  }
}
export function teamNeeds(s) {
  const desired = {
    QB: 2,
    RB: 3,
    WR: 5,
    TE: 3,
    OL: 9,
    DL: 8,
    LB: 6,
    CB: 6,
    S: 4,
    K: 1,
    P: 1,
  };
  return Object.entries(desired)
    .map(([pos, target]) => {
      const ps = s.roster.filter(
        (p) => p.pos === pos && ["active", "elevated"].includes(p.status),
      );
      const available = ps.filter((p) => !p.injury && !p.holdout),
        best = Math.max(0, ...available.map((p) => p.ovr));
      return {
        pos,
        count: ps.length,
        available: available.length,
        target,
        best,
        urgency:
          available.length < target
            ? "Need"
            : best < 75
              ? "Upgrade"
              : "Covered",
        score: (target - available.length) * 12 + Math.max(0, 80 - best),
      };
    })
    .sort((a, b) => b.score - a.score);
}
export function draftBoard(
  s,
  { query = "", position = "All", pinned = false, sort = "estimate" } = {},
) {
  const pins = hubPreferences(s).board,
    need = new Map(teamNeeds(s).map((n) => [n.pos, n]));
  return s.prospects
    .map((p) => ({
      p,
      ...talentView(s, p, -2),
      pinned: pins.includes(p.id),
      need: need.get(p.pos),
    }))
    .filter(
      (x) =>
        (position === "All" || x.p.pos === position) &&
        (!pinned || x.pinned) &&
        (x.p.name + " " + (x.p.college || "") + " " + x.p.pos)
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
    )
    .sort((a, b) =>
      sort === "board"
        ? Number(b.pinned) - Number(a.pinned) ||
          pins.indexOf(a.p.id) - pins.indexOf(b.p.id) ||
          b.rating - a.rating
        : sort === "need"
          ? (b.need?.score || 0) - (a.need?.score || 0) || b.rating - a.rating
          : sort === "confidence"
            ? b.confidence - a.confidence || b.rating - a.rating
            : b.rating - a.rating,
    );
}
export function fixtures(s) {
  const out = [];
  const add = (games, week, stage, key) => {
    const g = games.find((g) => g.a === s.team || g.b === s.team);
    if (!g) {
      if (stage === "Regular season") out.push({ key, week, stage, bye: true });
      return;
    }
    const home = g.a === s.team,
      k = home ? 0 : 1,
      o = home ? g.b : g.a,
      done = Array.isArray(g.score);
    out.push({
      key,
      week,
      stage,
      g,
      home,
      opponent: o,
      done,
      for: done ? g.score[k] : null,
      against: done ? g.score[1 - k] : null,
      result: done
        ? g.score[k] > g.score[1 - k]
          ? "W"
          : g.score[k] < g.score[1 - k]
            ? "L"
            : "T"
        : null,
      current:
        (stage === "Regular season" &&
          s.phase === "season" &&
          s.week === week - 1) ||
        (stage !== "Regular season" && s.phase === "playoffs" && !done),
    });
  };
  s.schedule.forEach((games, i) =>
    add(games, i + 1, "Regular season", "reg-" + i),
  );
  (s.playoffs?.rounds || []).forEach((games, i) =>
    add(
      games,
      i + 1,
      ["Wild Card", "Divisional", "Conference", "Championship"][i] ||
        "Postseason",
      "post-" + i,
    ),
  );
  return out;
}
export function fixtureSummary(rows) {
  const played = rows.filter((r) => r.done);
  return {
    wins: played.filter((r) => r.result === "W").length,
    losses: played.filter((r) => r.result === "L").length,
    ties: played.filter((r) => r.result === "T").length,
    pf: played.reduce((n, r) => n + r.for, 0),
    pa: played.reduce((n, r) => n + r.against, 0),
    remaining: rows.filter((r) => !r.bye && !r.done).length,
  };
}
export function championshipArchive(s, teams) {
  const simulated = (s.history || []).map((h, i) => ({
    ...h,
    id: "sim-" + i,
    kind: "This save",
    team: h.champion,
    winner: teams[h.champion]?.[0] || "—",
    name: teams[h.champion]?.slice(1, 3).join(" ") || "Unknown",
    source: "Simulated career",
    mvp: h.mvp || "",
    record: h.record || "",
  }));
  const historical = (s.franchise.history || []).map((h, i) => {
    const team = teams.findIndex((c) => c[0] === h.winner);
    return {
      ...h,
      id: "hist-" + i,
      kind: "Historical",
      team,
      name: team < 0 ? h.winner : teams[team].slice(1, 3).join(" "),
    };
  });
  return [...simulated, ...historical].sort(
    (a, b) => b.year - a.year || a.kind.localeCompare(b.kind),
  );
}
export function publicStories(s) {
  const o = ensureOffice(s);
  return o.stories
    .filter(
      (a) =>
        !a.title.startsWith("Conversation:") &&
        !["role", "contract", "recovery"].includes(
          o.messages.find((m) => m.id === a.messageId && m.response)?.decision,
        ) &&
        !/^NFL roster database loaded/.test(a.title),
    )
    .slice(0, 60);
}
export function socialFeed(s, teams) {
  return buildSocialFeed(s, teams, publicStories(s), hubPreferences(s));
}
