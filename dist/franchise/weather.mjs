// Game-day weather, decided by where and when the game is played — never chosen.
// Each home stadium has a climate profile and a roof type; the month of the game
// (from the week) sets temperature and the odds of rain, snow and wind. The roll is
// seeded by season, week and the two clubs, so a game's forecast is stable: the
// matchday preview, live coaching and every simulated path see the same weather.
//
// The engine knows Clear, Rain and Wind. Snow plays like Rain (footing and ball
// security); domes and closed roofs always play Clear.

// Abbreviation → [climate, roof]. roof: "dome" (always indoors), "open".
const STADIUMS = {
  BUF: ["snowbelt", "open"], MIA: ["tropical", "open"], NE: ["cold", "open"], NYJ: ["cold", "open"],
  BAL: ["mild", "open"], CIN: ["cold", "open"], CLE: ["snowbelt", "open"], PIT: ["cold", "open"],
  HOU: ["tropical", "dome"], IND: ["cold", "dome"], JAX: ["tropical", "open"], TEN: ["mild", "open"],
  DEN: ["mountain", "open"], KC: ["plains", "open"], LV: ["desert", "dome"], LAC: ["coastal", "dome"],
  DAL: ["plains", "dome"], NYG: ["cold", "open"], PHI: ["cold", "open"], WAS: ["mild", "open"],
  CHI: ["lake", "open"], DET: ["lake", "dome"], GB: ["snowbelt", "open"], MIN: ["snowbelt", "dome"],
  ATL: ["mild", "dome"], CAR: ["mild", "open"], NO: ["tropical", "dome"], TB: ["tropical", "open"],
  ARI: ["desert", "dome"], LAR: ["coastal", "dome"], SF: ["bay", "open"], SEA: ["pacific", "open"],
};

// Per climate: average °F for Sep, Oct, Nov, Dec, Jan; chance of precipitation; chance of strong wind.
const CLIMATES = {
  snowbelt: { temp: [66, 54, 42, 30, 24], wet: 0.24, wind: 0.2 },
  cold: { temp: [70, 58, 47, 37, 32], wet: 0.2, wind: 0.14 },
  lake: { temp: [68, 55, 43, 31, 26], wet: 0.2, wind: 0.24 },
  plains: { temp: [76, 63, 50, 38, 33], wet: 0.14, wind: 0.2 },
  mountain: { temp: [68, 54, 42, 33, 31], wet: 0.12, wind: 0.14 },
  mild: { temp: [76, 64, 54, 45, 41], wet: 0.18, wind: 0.1 },
  tropical: { temp: [88, 83, 76, 70, 67], wet: 0.24, wind: 0.07 },
  coastal: { temp: [76, 72, 66, 60, 59], wet: 0.05, wind: 0.06 },
  bay: { temp: [68, 66, 60, 54, 53], wet: 0.12, wind: 0.22 },
  pacific: { temp: [66, 56, 47, 42, 41], wet: 0.32, wind: 0.12 },
  desert: { temp: [96, 85, 71, 62, 62], wet: 0.03, wind: 0.08 },
};
const FALLBACK = ["mild", "open"];

// Weeks 0–3 September, 4–8 October, 9–12 November, 13–17 December, playoffs January.
const monthIndex = (week, post) => (post ? 4 : week <= 3 ? 0 : week <= 8 ? 1 : week <= 12 ? 2 : 3);

function rng(seed) {
  let x = seed >>> 0 || 1;
  return () => ((x = Math.imul(x ^ (x >>> 15), 2246822519) ^ Math.imul(x ^ (x >>> 13), 3266489917)), ((x ^= x >>> 16) >>> 0) / 4294967296);
}

export const ENGINE_WEATHER = { Clear: "Clear", Cloudy: "Clear", Hot: "Clear", Cold: "Clear", Dome: "Clear", Rain: "Rain", Snow: "Rain", Wind: "Wind" };
export const engineWeather = (w) => ENGINE_WEATHER[w] || "Clear";

/**
 * Forecast for a game. `abbr` is the home club's abbreviation (clubs[a][0]).
 * Returns { condition, engine, temp, indoor, climate, label }.
 */
export function forecast({ abbr, year = 2026, week = 0, postseason = 0, a = 0, b = 0, relocated = false }) {
  const [climate, roof] = (!relocated && STADIUMS[abbr]) || FALLBACK;
  const c = CLIMATES[climate];
  const r = rng(year * 7919 + week * 104729 + (postseason || 0) * 15485863 + a * 2654435 + b * 40503 + 17);
  const month = monthIndex(week, postseason);
  const temp = Math.round(c.temp[month] + (r() - 0.5) * 16);
  if (roof === "dome") return { condition: "Dome", engine: "Clear", temp: 70, indoor: true, climate, label: "Indoors · 70°F" };
  // Later in the season the odds of bad weather rise in cold climates.
  const late = month >= 2 && ["snowbelt", "cold", "lake", "plains", "mountain"].includes(climate) ? 1.25 : 1;
  const wet = r() < c.wet * late, windy = r() < c.wind * late;
  let condition = wet ? (temp <= 34 ? "Snow" : "Rain") : windy ? "Wind" : temp >= 88 ? "Hot" : temp <= 32 ? "Cold" : r() < 0.3 ? "Cloudy" : "Clear";
  const engine = engineWeather(condition);
  return { condition, engine, temp, indoor: false, climate, label: `${condition} · ${temp}°F` };
}

/** Forecast for a scheduled game in a running career (`s` is the game state). */
export function gameForecast(s, g) {
  if (!s || !g) return null;
  const home = s.franchise?.clubs?.[g.a],
    // `clubs` is game.js's script-scope list; STADIUMS follows the same default order for node/workers.
    abbr = (typeof clubs !== "undefined" && clubs[g.a]?.[0]) || Object.keys(STADIUMS)[g.a];
  return forecast({ abbr, year: s.year, week: s.week, postseason: s.franchise?.postseason?.round || 0, a: g.a, b: g.b, relocated: !!home?.stadium?.relocation?.done });
}

export const WEATHER_ICON = { Clear: "☀", Cloudy: "☁", Hot: "☀", Cold: "❄", Rain: "☂", Snow: "❄", Wind: "≋", Dome: "⌂" };
