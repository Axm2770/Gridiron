import {
  POS,
  MILLION,
  basicContract,
  roster,
  log,
  validate,
} from "./state.mjs";
export const DATABASE_VERSION = 1;
export function parseCSV(text) {
  let rows = [],
    row = [],
    field = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    let c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (quoted) throw Error("Unclosed CSV quote.");
  row.push(field);
  if (row.some(Boolean)) rows.push(row);
  let headers = rows.shift()?.map((x) => x.trim());
  if (!headers || !headers.includes("id") || !headers.includes("teamId"))
    throw Error("CSV requires id and teamId headers.");
  return {
    version: 1,
    players: rows.map((r) =>
      Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])),
    ),
  };
}
export function validatePack(pack) {
  if (
    !pack ||
    pack.version !== 1 ||
    !Array.isArray(pack.players) ||
    pack.players.length > 5000
  )
    throw Error("Database v1 supports up to 5,000 players.");
  let ids = new Set();
  for (let p of pack.players) {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(p.id) || ids.has(p.id))
      throw Error("Player IDs must be unique, safe text.");
    ids.add(p.id);
    if (
      !Number.isInteger(Number(p.teamId)) ||
      Number(p.teamId) < 0 ||
      Number(p.teamId) > 31
    )
      throw Error("Team ID must be 0–31.");
    if (!POS.includes(p.pos)) throw Error("Unsupported position: " + p.pos);
    if (!String(p.name || "").trim() || String(p.name).length > 70)
      throw Error("Invalid name.");
    for (let [key, min, max] of [
      ["age", 18, 60],
      ["ovr", 1, 99],
      ["pot", 1, 99],
      ["salary", 0.1, 100],
    ]) {
      let n = Number(p[key] ?? (key === "pot" ? p.ovr : 0));
      if (!Number.isFinite(n) || n < min || n > max)
        throw Error(`Invalid ${key} for ${p.id}.`);
    }
  }
  for (let t of pack.teams || []) {
    if (
      !Number.isInteger(t.id) ||
      t.id < 0 ||
      t.id > 31 ||
      String(t.city).length > 45 ||
      String(t.name).length > 45
    )
      throw Error("Invalid team metadata.");
    if (
      t.logo &&
      !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(t.logo)
    )
      throw Error("Logo must be an embedded PNG, JPEG or WebP.");
  }
  return {
    players: pack.players.length,
    teams: (pack.teams || []).length,
    history: (pack.history || []).length,
  };
}
export function importPack(s, pack) {
  validatePack(pack);
  if (s.live) throw Error("Finish the live game before importing.");
  let teams = new Set(pack.players.map((p) => Number(p.teamId)));
  for (let t of teams) {
    for (let p of roster(s, t)) delete s.franchise.contracts[p.id];
    if (t === s.team) s.roster = [];
    else s.franchise.clubs[t].players = [];
  }
  for (let raw of pack.players) {
    let p = {
      id: raw.id,
      name: String(raw.name).trim(),
      pos: raw.pos,
      age: Number(raw.age),
      ovr: Number(raw.ovr),
      pot: Number(raw.pot ?? raw.ovr),
      salary: Number(raw.salary),
      fitness: 100,
      injury: 0,
      starter: raw.starter === true || raw.starter === "true",
      status: ["practice", "ir"].includes(raw.status) ? raw.status : "active",
      morale: 75,
      persona: { money: 0.5, loyalty: 0.5, ambition: 0.5, leadership: 0.5 },
      wear: { knee: 0, ankle: 0, shoulder: 0, back: 0 },
      stats: {},
      jersey: String(raw.jersey || "").slice(0, 3),
      realPosition: String(raw.realPosition || raw.pos).slice(0, 8),
      college: String(raw.college || "").slice(0, 80),
      height: String(raw.height || "").slice(0, 16),
      weight:
        Number.isFinite(Number(raw.weight)) &&
        Number(raw.weight) > 100 &&
        Number(raw.weight) < 500
          ? Number(raw.weight)
          : null,
      experience: Math.max(0, Math.min(30, Number(raw.experience) || 0)),
      realPlayer: raw.realPlayer === true && /^espn-\d+$/.test(raw.id),
      espnId: /^\d+$/.test(String(raw.espnId || ""))
        ? String(raw.espnId)
        : null,
      headshot:
        /^https:\/\/a\.espncdn\.com\/i\/headshots\/nfl\/players\/full\/\d+\.png$/.test(
          raw.headshot || "",
        )
          ? raw.headshot
          : "",
    };
    let t = Number(raw.teamId);
    roster(s, t).push(p);
    s.franchise.contracts[p.id] = basicContract(p, t, s.year);
  }
  for (let t of pack.teams || [])
    s.franchise.clubs[t.id].rebrand = {
      city: String(t.city),
      name: String(t.name),
      logo: t.logo || null,
    };
  for (let h of pack.history || []) {
    if (
      !Number.isInteger(h.year) ||
      h.year < 1900 ||
      h.year > s.year ||
      typeof h.winner !== "string"
    )
      throw Error("Invalid history record.");
    s.franchise.history.push({
      year: h.year,
      winner: h.winner.slice(0, 80),
      mvp: String(h.mvp || "").slice(0, 80),
      source: String(h.source || "Imported database").slice(0, 200),
      kind: "imported",
    });
  }
  s.franchise.databaseSource = String(pack.source || "User database").slice(
    0,
    200,
  );
  validate(s);
  log(
    s,
    "Database imported",
    `${pack.players.length} players imported. Roster, cap and game eligibility must still be checked.`,
  );
}
export function exportPack(s) {
  return {
    version: 1,
    source:
      s.franchise.databaseSource || "Gridiron Director — fictional database",
    players: Array.from({ length: 32 }, (_, teamId) =>
      roster(s, teamId).map((p) => ({
        id: p.id,
        teamId,
        name: p.name,
        pos: p.pos,
        age: p.age,
        ovr: p.ovr,
        pot: p.pot,
        salary: p.salary,
        starter: p.starter,
        status: p.status,
        jersey: p.jersey,
        realPosition: p.realPosition,
        college: p.college,
        experience: p.experience,
        realPlayer: p.realPlayer,
        espnId: p.espnId,
        headshot: p.headshot,
        height: p.height,
        weight: p.weight,
      })),
    ).flat(),
    teams: s.franchise.clubs.map((t) => ({
      id: t.id,
      city: t.rebrand?.city || t.stadium.city,
      name: t.rebrand?.name || t.identity?.name || "Team " + (t.id + 1),
      logo: t.rebrand?.logo || null,
    })),
    history: s.franchise.history,
  };
}
