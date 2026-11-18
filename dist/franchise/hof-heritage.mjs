// Recently retired real players who are not yet in the in-game Hall of Fame (legends.json covers the
// enshrined greats). They seed the first ballots of a new career, before simulated retirees reach the
// five-season wait. Career totals are rounded regular-season figures and honours counts from public
// records (pro-football-reference.com); the ballots themselves are simulated in-universe.
// teamIds use the game's club indices (franchise-heritage.json `teams[].id`).
export const HOF_HERITAGE = [
  { id: "drew-brees", name: "Drew Brees", pos: "QB", teamIds: [26, 15], lastSeason: 2020, seasons: 20, stats: { passYards: 80358, passTD: 571 }, honors: { proBowls: 13, allPro: 1, opoy: 2, rings: 1, sbMvp: 1 } },
  { id: "larry-fitzgerald", name: "Larry Fitzgerald", pos: "WR", teamIds: [28], lastSeason: 2020, seasons: 17, stats: { receptions: 1432, recYards: 17492, recTD: 121 }, honors: { proBowls: 11, allPro: 1 } },
  { id: "frank-gore", name: "Frank Gore", pos: "RB", teamIds: [30, 9, 1, 0, 3], lastSeason: 2020, seasons: 16, stats: { rushYards: 16000, rushTD: 81 }, honors: { proBowls: 5 } },
  { id: "luke-kuechly", name: "Luke Kuechly", pos: "LB", teamIds: [25], lastSeason: 2019, seasons: 8, stats: { tackles: 1092, defInterceptions: 18, sacks: 12.5 }, honors: { proBowls: 7, allPro: 5, dpoy: 1, droy: 1 } },
  { id: "marshal-yanda", name: "Marshal Yanda", pos: "OL", teamIds: [4], lastSeason: 2019, seasons: 13, stats: {}, honors: { proBowls: 8, allPro: 2, rings: 1 } },
  { id: "rob-gronkowski", name: "Rob Gronkowski", pos: "TE", teamIds: [2, 27], lastSeason: 2021, seasons: 11, stats: { receptions: 621, recYards: 9286, recTD: 92 }, honors: { proBowls: 5, allPro: 4, rings: 4 } },
  { id: "ben-roethlisberger", name: "Ben Roethlisberger", pos: "QB", teamIds: [7], lastSeason: 2021, seasons: 18, stats: { passYards: 64088, passTD: 418 }, honors: { proBowls: 6, rings: 2, oroy: 1 } },
  { id: "adrian-peterson", name: "Adrian Peterson", pos: "RB", teamIds: [23, 26, 19, 21, 8, 31], lastSeason: 2021, seasons: 15, stats: { rushYards: 14918, rushTD: 120 }, honors: { proBowls: 7, allPro: 4, mvp: 1, opoy: 1, oroy: 1 } },
  { id: "richard-sherman", name: "Richard Sherman", pos: "CB", teamIds: [31, 30, 27], lastSeason: 2021, seasons: 11, stats: { defInterceptions: 37, tackles: 495 }, honors: { proBowls: 5, allPro: 3, rings: 1 } },
  { id: "earl-thomas", name: "Earl Thomas", pos: "S", teamIds: [31, 4], lastSeason: 2019, seasons: 10, stats: { defInterceptions: 30, tackles: 664 }, honors: { proBowls: 7, allPro: 3, rings: 1 } },
  { id: "marshawn-lynch", name: "Marshawn Lynch", pos: "RB", teamIds: [0, 31, 14], lastSeason: 2019, seasons: 13, stats: { rushYards: 10413, rushTD: 85 }, honors: { proBowls: 5, allPro: 1, rings: 1 } },
  { id: "julian-edelman", name: "Julian Edelman", pos: "WR", teamIds: [2], lastSeason: 2020, seasons: 12, stats: { receptions: 620, recYards: 6822, recTD: 36 }, honors: { rings: 3, sbMvp: 1 } },
  { id: "greg-olsen", name: "Greg Olsen", pos: "TE", teamIds: [20, 25, 31], lastSeason: 2020, seasons: 14, stats: { receptions: 742, recYards: 8683, recTD: 60 }, honors: { proBowls: 3 } },
  { id: "eli-manning", name: "Eli Manning", pos: "QB", teamIds: [17], lastSeason: 2019, seasons: 16, stats: { passYards: 57023, passTD: 366 }, honors: { proBowls: 4, rings: 2, sbMvp: 2 } },
  { id: "cam-newton", name: "Cam Newton", pos: "QB", teamIds: [25, 2], lastSeason: 2021, seasons: 11, stats: { passYards: 32382, passTD: 194, rushYards: 5628, rushTD: 75 }, honors: { proBowls: 3, allPro: 1, mvp: 1, oroy: 1 } },
  { id: "joe-staley", name: "Joe Staley", pos: "OL", teamIds: [30], lastSeason: 2019, seasons: 13, stats: {}, honors: { proBowls: 6 } },
  { id: "maurkice-pouncey", name: "Maurkice Pouncey", pos: "OL", teamIds: [7], lastSeason: 2020, seasons: 11, stats: {}, honors: { proBowls: 9, allPro: 2 } },
  { id: "jj-watt", name: "J.J. Watt", pos: "DL", teamIds: [8, 28], lastSeason: 2022, seasons: 12, stats: { sacks: 114.5, tackles: 590 }, honors: { proBowls: 5, allPro: 5, dpoy: 3 } },
  { id: "matt-ryan", name: "Matt Ryan", pos: "QB", teamIds: [24, 9], lastSeason: 2022, seasons: 15, stats: { passYards: 62792, passTD: 381 }, honors: { proBowls: 4, allPro: 1, mvp: 1, opoy: 1, oroy: 1 } },
  { id: "tom-brady", name: "Tom Brady", pos: "QB", teamIds: [2, 27], lastSeason: 2022, seasons: 23, stats: { passYards: 89214, passTD: 649 }, honors: { proBowls: 15, allPro: 3, mvp: 3, opoy: 1, rings: 7, sbMvp: 5 } },
  { id: "jason-peters", name: "Jason Peters", pos: "OL", teamIds: [0, 18, 20, 16], lastSeason: 2022, seasons: 19, stats: {}, honors: { proBowls: 9, allPro: 2, rings: 1 } },
  { id: "ndamukong-suh", name: "Ndamukong Suh", pos: "DL", teamIds: [21, 1, 29, 27, 18], lastSeason: 2022, seasons: 13, stats: { sacks: 71.5, tackles: 600 }, honors: { proBowls: 5, allPro: 3, droy: 1, rings: 1 } },
  { id: "jason-kelce", name: "Jason Kelce", pos: "OL", teamIds: [18], lastSeason: 2023, seasons: 13, stats: {}, honors: { proBowls: 7, allPro: 6, rings: 1 } },
  { id: "fletcher-cox", name: "Fletcher Cox", pos: "DL", teamIds: [18], lastSeason: 2023, seasons: 12, stats: { sacks: 70, tackles: 500 }, honors: { proBowls: 6, allPro: 1, rings: 1 } },
];

// Plaque lines for the honours above, e.g. "13× Pro Bowl", "2× Super Bowl champion".
export function heritageAchievements(h) {
  const o = h.honors || {},
    n = (k, label) => (o[k] ? `${o[k] > 1 ? o[k] + "× " : ""}${label}` : "");
  return [n("mvp", "MVP"), n("dpoy", "Defensive Player of the Year"), n("opoy", "Offensive Player of the Year"), n("rings", "Super Bowl champion"), n("sbMvp", "Super Bowl MVP"), n("allPro", "First-team All-Pro"), n("proBowls", "Pro Bowl"), n("oroy", "Offensive Rookie of the Year"), n("droy", "Defensive Rookie of the Year")].filter(Boolean);
}
