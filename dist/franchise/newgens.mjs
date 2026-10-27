import { regularCareerTotals, historicalCareerFor } from "./records.mjs";
import { random } from "../engine/random.mjs";
export const identitySeed = (value) => {
  let h = 2166136261;
  for (const c of String(value)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
};
const first =
  "Adrian Andre Anthony Ashton Austin Blake Brandon Bryce Cameron Carter Chase Chris Christian Cole Darius Darnell David DeAndre Devin Dominic Elijah Ellis Ethan Evan Gabriel Gavin Isaiah Jace Jalen Jamal James Jayden Jeremiah Jordan Josiah Julian Kai Kaleb Kendrick Kenneth Khalil Landon Logan Malik Marcus Mason Mateo Micah Miles Nathan Noah Nolan Owen Parker Quentin Rashad Roman Ryan Samuel Sebastian Solomon Tariq Theo Trey Tristan Tyler Xavier Zaire Zion".split(
    " ",
  );
const last =
  "Alexander Anderson Armstrong Banks Barnes Bell Bennett Black Brooks Brown Bryant Butler Campbell Carter Chandler Clark Coleman Collins Cook Cooper Crawford Daniels Davis Dawson Dixon Douglas Edwards Ellis Evans Fields Fisher Ford Foster Franklin Freeman Gaines Gardner Gibson Graham Grant Gray Green Griffin Hall Hamilton Harris Harrison Hart Hayes Henderson Henry Hill Howard Hudson Hughes Jackson James Jefferson Jenkins Johnson Jones Jordan Kelly Kennedy King Knight Lawson Lee Lewis Long Marshall Martin Mason Matthews Maxwell McCoy Miller Mitchell Montgomery Moore Morgan Morris Murray Nelson Owens Palmer Parker Patterson Perry Peterson Phillips Pierce Porter Powell Price Reed Reynolds Richards Richardson Riley Rivers Roberts Robinson Rogers Ross Russell Sanders Scott Shaw Simmons Smith Spencer Stephens Stewart Stone Sullivan Taylor Thomas Thompson Turner Vaughn Walker Wallace Ward Warren Washington Watson Webb Wells West White Williams Wilson Woods Wright Young".split(
    " ",
  );
const colleges = [
  "Alabama",
  "Ohio State",
  "Texas",
  "Georgia",
  "Michigan",
  "LSU",
  "Oregon",
  "Penn State",
  "Notre Dame",
  "USC",
  "Florida State",
  "Tennessee",
  "Oklahoma",
  "Washington",
  "Clemson",
  "Iowa",
  "Utah",
  "Boise State",
  "Jackson State",
  "Appalachian State",
];
export function generatedPhysique(id, position) {
  const rng = random(identitySeed(id) + 4919),
    ranges = {
      QB: [73, 79, 205, 245],
      RB: [67, 74, 185, 245],
      WR: [68, 78, 170, 230],
      TE: [74, 80, 235, 275],
      OL: [74, 81, 290, 350],
      DL: [73, 80, 265, 335],
      LB: [71, 78, 220, 265],
      CB: [68, 75, 175, 215],
      S: [69, 76, 190, 225],
      K: [69, 76, 175, 225],
      P: [71, 78, 190, 245],
    };
  const [a, b, c, d] = ranges[position] || [70, 78, 190, 250],
    h = a + Math.floor(rng() * (b - a + 1));
  return {
    height: `${Math.floor(h / 12)}' ${h % 12}"`,
    weight: c + Math.floor(rng() * (d - c + 1)),
    physicalSource: "Generated physique",
  };
}
export function newgenIdentity(id, seed, rookie = true, position = "") {
  const rng = random(identitySeed(id) + seed),
    pick = (a) => a[Math.floor(rng() * a.length)],
    skin = ["#f1c5a5", "#dba27b", "#b77b51", "#895737", "#623d2b"];
  return {
    ...generatedPhysique(id, position),
    generated: true,
    generation: 1,
    face: {
      seed: identitySeed(id),
      skin: pick(skin),
      hair: pick(["#1e1713", "#34251e", "#15191c", "#5b3924"]),
      style: Math.floor(rng() * 5),
      beard: rng() > 0.58,
    },
    college: pick(colleges),
    experience: rookie ? 0 : Math.floor(rng() * 8),
    development: pick([
      "Normal",
      "Normal",
      "Normal",
      "Impact",
      "Impact",
      "Star",
      "Late bloomer",
    ]),
    archetype: pick(
      {
        QB: ["Field general", "Pocket passer", "Improviser"],
        RB: ["Elusive runner", "Power back", "Receiving back"],
        WR: ["Route technician", "Deep threat", "Contested-catch target"],
        TE: ["Vertical threat", "Possession target", "Blocking specialist"],
        OL: ["Pass protector", "Power blocker", "Agile lineman"],
        DL: ["Power rusher", "Speed rusher", "Run stopper"],
        LB: ["Field general", "Coverage linebacker", "Edge pressure"],
        CB: ["Man specialist", "Zone defender", "Press corner"],
        S: ["Coverage safety", "Box safety", "Versatile defender"],
        K: ["Power kicker", "Precision kicker"],
        P: ["Directional punter", "Power punter"],
      }[position] || [
        "Technician",
        "Explosive athlete",
        "Instinctive playmaker",
        "Physical competitor",
      ],
    ),
    name: pick(first) + " " + pick(last) + (rng() > 0.95 ? " Jr." : ""),
  };
}
export function faceSVG(p, cls = "") {
  const f = p.face || newgenIdentity(p.id || p.name, 0).face,
    n = Number(f.seed || identitySeed(p.id || p.name)) >>> 0,
    skin = /^#[0-9a-f]{6}$/i.test(f.skin) ? f.skin : "#b77b51",
    hair = /^#[0-9a-f]{6}$/i.test(f.hair) ? f.hair : "#211b17",
    style = f.style;
  return `<svg class="generated-face ${cls}" viewBox="0 0 160 180" role="img" aria-label="Illustrated player portrait"><path fill="#25384c" d="M8 180v-23q8-30 51-34h42q43 4 51 34v23"/><path fill="${skin}" d="M61 110h38v28q-19 14-38 0z"/><ellipse fill="${skin}" cx="80" cy="73" rx="${36 + (n % 7)}" ry="${47 + ((n >>> 4) % 6)}"/><ellipse fill="${skin}" cx="40" cy="77" rx="6" ry="12"/><ellipse fill="${skin}" cx="120" cy="77" rx="6" ry="12"/><path fill="${hair}" d="${style === 0 ? "M40 58q-3-42 40-42t40 42l-12-22H52z" : style === 1 ? "M39 60V29q40-30 82 0v31l-12-24q-30 12-57 0z" : style === 2 ? "M40 48q-2-32 40-32t40 32q-40-20-80 0" : style === 3 ? "M39 66V29q10-22 41-22t41 22v37l-12-33H52z" : "M43 42q37-24 74 0l-8-12q-30-15-58 0z"}"/><path d="M54 64l16-2m20 0 16 2" stroke="${hair}" stroke-width="4" stroke-linecap="round"/><ellipse fill="#201a18" cx="${60 + ((n >>> 7) % 5)}" cy="${73 + ((n >>> 12) % 3)}" rx="3" ry="3"/><ellipse fill="#201a18" cx="${96 + ((n >>> 16) % 5)}" cy="${73 + ((n >>> 12) % 3)}" rx="3" ry="3"/><path d="M80 76l-${3 + ((n >>> 20) % 4)} ${14 + ((n >>> 22) % 4)}h9" fill="none" stroke="#704433" opacity=".6" stroke-width="2"/><path d="M65 104q15 8 30 0" fill="none" stroke="#6c3930" stroke-width="3" stroke-linecap="round"/>${f.beard ? `<path d="M45 88q5 44 35 44t35-44l-8 22q-27 17-54 0z" fill="${hair}" opacity=".8"/>` : ""}<path fill="#c5d8ec" d="M59 133l21 16 21-16-7 25H67z"/><path stroke="#57718a" d="M34 163h22m48 0h22" stroke-width="4"/></svg>`;
}
export function retirementAge(p) {
  return (
    p.retirementAge ??
    ({
      QB: 40,
      RB: 33,
      WR: 36,
      TE: 37,
      OL: 38,
      DL: 36,
      LB: 36,
      CB: 35,
      S: 36,
      K: 43,
      P: 43,
    }[p.pos] ||
      38)
  );
}
export function careerTotals(p) {
  return Object.values(p.stats || {}).reduce((out, season) => {
    for (const [k, v] of Object.entries(season))
      if (Number.isFinite(v)) out[k] = (out[k] || 0) + v;
    return out;
  }, {});
}
export function retireRecord(s, p, team, year) {
  const stats = careerTotals(p);
  for (const [key, value] of Object.entries(
    historicalCareerFor(p)?.stats || {},
  ))
    if (Number.isFinite(value)) stats[key] = (stats[key] || 0) + value;
  const awards = s.franchise.awards.filter((a) => a.playerId === p.id),
    legacy = Math.round(
      (stats.passYards || 0) / 400 +
        (stats.rushYards || 0) / 90 +
        (stats.recYards || 0) / 100 +
        (stats.sacks || 0) * 3 +
        (stats.tackles || 0) / 12 +
        awards.reduce(
          (n, a) =>
            n +
            (["MVP", "DPOY", "OPOY"].includes(a.award)
              ? 35
              : a.award === "All-Pro"
                ? 15
                : 5),
          0,
        ),
    );
  const record = {
    regularTotals: regularCareerTotals(s, p),
    id: p.id,
    name: p.name,
    pos: p.pos,
    headshot: p.headshot,
    face: p.face,
    team,
    retired: year,
    year: year + 5,
    stats: structuredClone(p.stats || {}),
    totals: stats,
    awards,
    careerYards:
      (stats.passYards || 0) + (stats.rushYards || 0) + (stats.recYards || 0),
    legacy,
    generated: !!p.generated,
    kind: "simulated",
  };
  (s.franchise.retired ??= []).push(record);
  if (legacy >= 120 && !s.franchise.hall.some((h) => h.id === p.id))
    s.franchise.hall.push(record);
  return record;
}
