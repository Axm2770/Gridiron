import { ensurePlayerRatings, refreshPlayerRating } from "./ratings.mjs";
import {
  makePlayer,
  basicContract,
  roster,
  validate,
  log,
  MILLION,
} from "./state.mjs";

// Original fallback grades for unmatched identities. Verified EA grades are applied by ratings.mjs.
const elite = {
  "Patrick Mahomes": 96,
  "Josh Allen": 97,
  "Lamar Jackson": 97,
  "Joe Burrow": 95,
  "Justin Herbert": 92,
  "Jalen Hurts": 91,
  "Jayden Daniels": 90,
  "Dak Prescott": 88,
  "Jared Goff": 88,
  "Matthew Stafford": 89,
  "Baker Mayfield": 86,
  "Brock Purdy": 88,
  "Jordan Love": 86,
  "C.J. Stroud": 86,
  "Trevor Lawrence": 84,
  "Bo Nix": 84,
  "Drake Maye": 85,
  "Caleb Williams": 84,
  "Tua Tagovailoa": 84,
  "Saquon Barkley": 96,
  "Derrick Henry": 94,
  "Christian McCaffrey": 94,
  "Bijan Robinson": 94,
  "Jahmyr Gibbs": 94,
  "Jonathan Taylor": 93,
  "Josh Jacobs": 91,
  "De’Von Achane": 90,
  "De'Von Achane": 90,
  "James Cook": 90,
  "Justin Jefferson": 97,
  "Ja’Marr Chase": 97,
  "Ja'Marr Chase": 97,
  "CeeDee Lamb": 95,
  "Amon-Ra St. Brown": 95,
  "Puka Nacua": 94,
  "A.J. Brown": 94,
  "Nico Collins": 92,
  "Malik Nabers": 90,
  "Brian Thomas Jr.": 90,
  "George Pickens": 89,
  "Terry McLaurin": 91,
  "Ladd McConkey": 88,
  "Brock Bowers": 94,
  "Trey McBride": 93,
  "George Kittle": 93,
  "Travis Kelce": 89,
  "Sam LaPorta": 89,
  "Jake Ferguson": 86,
  "Penei Sewell": 97,
  "Trent Williams": 96,
  "Lane Johnson": 95,
  "Quenton Nelson": 94,
  "Chris Lindstrom": 94,
  "Tyler Smith": 91,
  "Creed Humphrey": 95,
  "Zack Martin": 88,
  "Tyler Linderbaum": 91,
  "Myles Garrett": 98,
  "Micah Parsons": 97,
  "T.J. Watt": 96,
  "Maxx Crosby": 96,
  "Chris Jones": 96,
  "Aidan Hutchinson": 94,
  "Nick Bosa": 94,
  "Dexter Lawrence": 95,
  "Quinnen Williams": 93,
  "Will Anderson Jr.": 92,
  "Jalen Carter": 92,
  "Danielle Hunter": 91,
  "Trey Hendrickson": 93,
  "Fred Warner": 97,
  "Roquan Smith": 95,
  "Zack Baun": 93,
  "Foyesade Oluokun": 90,
  "Zaire Franklin": 90,
  "Patrick Surtain II": 97,
  "Sauce Gardner": 94,
  "Derek Stingley Jr.": 95,
  "Trent McDuffie": 94,
  "Christian Gonzalez": 92,
  "DaRon Bland": 89,
  "Kyle Hamilton": 96,
  "Antoine Winfield Jr.": 94,
  "Xavier McKinney": 94,
  "Kerby Joseph": 92,
  "Brian Branch": 93,
  "Brandon Aubrey": 94,
  "Chris Boswell": 92,
  "Harrison Butker": 91,
};
const hash = (text) =>
  [...text].reduce((n, c) => (Math.imul(n, 31) + c.charCodeAt(0)) >>> 0, 17);
const positionWeight = {
  QB: 3.7,
  RB: 0.8,
  WR: 1.5,
  TE: 0.9,
  OL: 1.25,
  DL: 1.6,
  LB: 1,
  CB: 1.2,
  S: 0.8,
  K: 0.45,
  P: 0.4,
};
export function gameRating(p) {
  if (p.pos === "LS") return 60; // The engine groups long snappers under OL; keep specialists out of the offensive starting five.
  return (
    elite[p.name] ??
    Math.min(
      86,
      65 +
        Math.min(10, p.experience || 0) +
        (hash(p.id) % 12) +
        (p.group === "practiceSquad" ? -5 : 0),
    )
  );
}
export function validateSnapshot(data) {
  if (
    data?.version !== 1 ||
    !Number.isInteger(data.season) ||
    !Array.isArray(data.teams) ||
    data.teams.length !== 32
  )
    throw Error("A complete 32-team roster snapshot is required.");
  const ids = new Set(),
    teams = new Set();
  for (const team of data.teams) {
    if (
      !Number.isInteger(team.teamId) ||
      team.teamId < 0 ||
      team.teamId > 31 ||
      teams.has(team.teamId) ||
      team.players.length < 40
    )
      throw Error("Invalid roster team.");
    teams.add(team.teamId);
    for (const p of team.players) {
      if (
        !/^espn-\d+$/.test(p.id) ||
        ids.has(p.id) ||
        !p.name ||
        !Number.isFinite(p.age) ||
        ![
          "QB",
          "RB",
          "WR",
          "TE",
          "OL",
          "DL",
          "LB",
          "CB",
          "S",
          "K",
          "P",
          "LS",
        ].includes(p.pos)
      )
        throw Error("Invalid real-player identity.");
      ids.add(p.id);
    }
  }
  return { teams: teams.size, players: ids.size };
}
export function applyRealRosters(s, data) {
  validateSnapshot(data);
  if (s.live)
    throw Error(
      "Finish the current match before starting a real-roster career.",
    );
  const f = s.franchise;
  f.contracts = {};
  f.dead = [];
  f.waivers = [];
  f.market.offers = [];
  for (const team of data.teams) {
    let list = team.players.map((raw) => {
      let p = makePlayer(
        raw.id,
        raw.pos === "LS" ? "OL" : raw.pos,
        hash(raw.id),
      );
      Object.assign(p, {
        name: raw.name,
        age: raw.age,
        jersey: raw.jersey,
        realPlayer: true,
        generated: false,
        espnId: raw.espnId,
        realPosition: raw.position,
        college: raw.college,
        experience: raw.experience,
        height: raw.height,
        weight: raw.weight,
        physicalSource: "ESPN roster snapshot",
        headshot: raw.headshot,
        sourceGroup: raw.group,
        sourceTeam: team.abbr,
      });
      p.ovr = gameRating(raw);
      p.pot = Math.min(99, p.ovr + (p.age < 26 ? 5 : 1));
      ensurePlayerRatings(p);
      refreshPlayerRating(p, s.year);
      p.status =
        raw.group === "practiceSquad"
          ? "practice"
          : raw.group === "injuredReserveOrOut" || raw.group === "suspended"
            ? "ir"
            : "active";
      p.injury = p.status === "ir" ? 4 : 0;
      p.irReturnWeek = p.injury ? 4 : 0;
      p.starter = false;
      p.salary = 0;
      return p;
    });
    let active = list.filter((p) => p.status === "active");
    if (active.length > 53) {
      let keep = new Set();
      for (let pos of [
        "QB",
        "RB",
        "WR",
        "TE",
        "OL",
        "DL",
        "LB",
        "CB",
        "S",
        "K",
        "P",
      ]) {
        let min =
          pos === "OL"
            ? 5
            : pos === "WR"
              ? 2
              : pos === "DL"
                ? 3
                : pos === "LB" || pos === "CB" || pos === "S"
                  ? 2
                  : 1;
        for (let p of active
          .filter((p) => p.pos === pos)
          .sort((a, b) => b.ovr - a.ovr)
          .slice(0, min))
          keep.add(p.id);
      }
      for (let p of active.slice().sort((a, b) => b.ovr - a.ovr))
        if (keep.size < 53) keep.add(p.id);
      for (let p of active) if (!keep.has(p.id)) p.status = "practice";
    }
    let ps = list
      .filter((p) => p.status === "practice")
      .sort((a, b) => b.ovr - a.ovr);
    for (let p of ps.slice(16)) list = list.filter((q) => q !== p);
    // Model first-year commitments use a $224M team budget, with all imported reserves included.
    let weight = (p) =>
        p.status === "practice"
          ? 0.18
          : Math.max(
              0.5,
              Math.max(0, p.ovr - 55) ** 1.65 * (positionWeight[p.pos] || 1),
            ),
      total = list.reduce((n, p) => n + weight(p), 0),
      minimum = list.reduce(
        (n, p) => n + (p.status === "practice" ? 0.4 : 0.8),
        0,
      ),
      budget = Math.max(0, 224 - minimum);
    for (let p of list) {
      p.salary = Number(
        (
          (p.status === "practice" ? 0.4 : 0.8) +
          (budget * weight(p)) / total
        ).toFixed(4),
      );
      f.contracts[p.id] = basicContract(p, team.teamId, s.year);
    }
    const starting = {
      QB: 1,
      RB: 1,
      WR: 3,
      TE: 1,
      OL: 5,
      DL: 4,
      LB: 3,
      CB: 3,
      S: 2,
      K: 1,
      P: 1,
    };
    for (let [pos, n] of Object.entries(starting))
      for (let p of list
        .filter((p) => p.pos === pos && p.status === "active")
        .sort((a, b) => b.ovr - a.ovr)
        .slice(0, n))
        p.starter = true;
    if (team.teamId === s.team) s.roster = list;
    else f.clubs[team.teamId].players = list;
    if (team.coach) {
      f.clubs[team.teamId].staff[0].name = team.coach;
      if (team.teamId === s.team) s.coach.name = team.coach;
    }
    s.teams[team.teamId].rating = Math.round(
      list.filter((p) => p.starter).reduce((n, p) => n + p.ovr, 0) /
        Math.max(1, list.filter((p) => p.starter).length),
    );
  }
  // Free agents and future draft classes remain fictional; their identity is never presented as factual.
  f.rosterSnapshot = {
    season: data.season,
    capturedAt: data.capturedAt,
    source: data.source,
    players: data.teams.reduce((n, t) => n + t.players.length, 0),
    ratings:
      "EA-matched baseline with original career adjustments; modeled fallback",
    contracts: "Modeled contracts, not real NFL agreements",
  };
  f.databaseSource = `${data.source} · ${data.season} snapshot · source-linked ratings and modeled contracts`;
  s.news = [
    {
      title: "Your opening roster report",
      body: "The front office has delivered its opening roster report. Review your squad, meet the staff and prepare for the season.",
      week: 0,
    },
  ];
  validate(s);
  log(
    s,
    "NFL roster database loaded",
    `${data.season} league rosters registered across all 32 franchises. Your scouting department is ready for the season.`,
  );
  return s;
}
