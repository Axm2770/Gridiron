// One sort model for the Squad screen: the SORT BY select, the reverse toggle and the column
// headers all write { sort, direction } and the list is rebuilt from it on every render.
// Pure: values that need the career (cap charge, season stats, contract end) come in via ctx.

// dir is the natural first direction: -1 = highest first, 1 = lowest / A–Z first.
export const SQUAD_SORTS = {
  ovr: { label: "Overall", dir: -1 },
  pot: { label: "Potential", dir: -1 },
  name: { label: "Name", dir: 1 },
  pos: { label: "Position", dir: 1 },
  age: { label: "Age", dir: 1 },
  role: { label: "Role", dir: -1 },
  condition: { label: "Condition", dir: -1 },
  morale: { label: "Morale", dir: -1 },
  form: { label: "Form", dir: -1 },
  growth: { label: "Ability change", dir: -1 },
  training: { label: "Training grade", dir: -1 },
  availability: { label: "Availability", dir: 1 },
  cap: { label: "Cap charge", dir: -1 },
  contract: { label: "Contract through", dir: -1 },
  trust: { label: "Trust", dir: -1 },
  snaps: { label: "Snaps", dir: -1 },
  passYards: { label: "Pass yards", dir: -1 },
  rushYards: { label: "Rush yards", dir: -1 },
  recYards: { label: "Rec yards", dir: -1 },
  td: { label: "Touchdowns", dir: -1 },
  height: { label: "Height", dir: -1 },
  weight: { label: "Weight", dir: -1 },
  college: { label: "College", dir: 1 },
  experience: { label: "Experience", dir: -1 },
};
// The options offered in the SORT BY select; header clicks can reach the rest.
export const SQUAD_SORT_MENU = ["ovr", "name", "pos", "age", "condition", "morale", "form", "growth", "cap"];

export const defaultDirection = (key) => SQUAD_SORTS[key]?.dir ?? -1;

const finite = (n) => (Number.isFinite(n) ? n : null);
// Healthy and available first, then holdouts, then the longest injuries last.
const availabilityRank = (p) =>
  p.injury ? 100 + p.injury : p.holdout ? 50 : ({ active: 0, elevated: 1, practice: 2, ir: 3 }[p.status || "active"] ?? 4);

// The value a player sorts by, or null when it is unknown (nulls always sort last).
export function squadSortValue(p, key, ctx = {}) {
  const stats = () => (ctx.stats ? ctx.stats(p) || {} : p.stats?.[ctx.year] || {});
  switch (key) {
    case "name":
      return p.name ? String(p.name) : null;
    case "pos":
      return p.realPosition || p.pos || null;
    case "college":
      return p.college ? String(p.college) : null;
    case "role":
      return p.starter ? 1 : 0;
    case "condition":
      return finite(p.fitness ?? 100);
    case "morale":
      return finite(p.morale);
    case "form":
      return finite(p.progression?.form);
    case "growth":
      return finite(p.progression?.lastReport?.delta);
    case "training":
      return finite(p.progression?.training);
    case "availability":
      return availabilityRank(p);
    case "cap":
      return finite(ctx.cap ? ctx.cap(p) : null);
    case "contract":
      return finite(ctx.contractEnd ? ctx.contractEnd(p) : null);
    case "trust":
      return finite(p.coachTrust ?? 60);
    case "snaps":
    case "passYards":
    case "rushYards":
    case "recYards":
      return finite(stats()[key] ?? 0);
    case "td": {
      const s = stats();
      return (s.passTD || 0) + (s.rushTD || 0) + (s.recTD || 0);
    }
    case "height":
      return finite(ctx.height ? ctx.height(p) : p.height);
    case "weight":
      return p.weight > 0 ? p.weight : null;
    case "experience":
      return finite(p.experience);
    default:
      return finite(p[key]);
  }
}

// Comparator for Array#sort. direction: -1 highest / Z first, 1 lowest / A first.
// Unknown values sit at the bottom in both directions; ties fall back to OVR, then name.
export function compareSquad(a, b, { sort = "ovr", direction } = {}, ctx = {}) {
  const dir = direction === 1 || direction === -1 ? direction : defaultDirection(sort),
    av = squadSortValue(a, sort, ctx),
    bv = squadSortValue(b, sort, ctx);
  const an = av === null || av === "",
    bn = bv === null || bv === "";
  if (an !== bn) return an ? 1 : -1;
  if (!an) {
    const d =
      typeof av === "string" || typeof bv === "string"
        ? String(av).localeCompare(String(bv), undefined, { sensitivity: "base", numeric: true })
        : av - bv;
    if (d) return dir * d;
  }
  return (b.ovr ?? 0) - (a.ovr ?? 0) || String(a.name || "").localeCompare(String(b.name || "")) || String(a.id).localeCompare(String(b.id));
}

export const sortSquad = (players, opts, ctx) => players.slice().sort((a, b) => compareSquad(a, b, opts, ctx));
