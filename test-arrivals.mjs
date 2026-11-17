import assert from "node:assert/strict";
import { detectArrivals, jerseyNumber } from "./dist/franchise/arrivals.mjs";
import { ensureEventLog, deriveRoundEvents } from "./dist/franchise/event-bus.mjs";
import { processSocialRound, socialEnginePosts } from "./dist/franchise/social-engine.mjs";
import { processNewsRound, ensureOffice, matchStory, leagueStory, leagueHeadliners } from "./dist/franchise/newsroom.mjs";
import { pickCinematic } from "./dist/presentation/cinematics.mjs";
import { PixelGrid, glyphText, textWidth, fontCovers, teamColors, pixelPortrait, pixelJersey, signingSceneSVG, coachSceneSVG, sceneData, storyArt } from "./dist/presentation/pixel-art.mjs";

globalThis.clubs ??= Array.from({ length: 32 }, (_, i) => [`T${i}`, `City ${i}`, `Club${i}`, `Division ${Math.floor(i / 4)}`]);

function career({ fresh = false } = {}) {
  const player = (id, pos, ovr, extra = {}) => ({ id, name: `${pos} Player ${id}`, pos, ovr, age: 27, morale: 75, injury: 0, starter: true, stats: {}, face: { seed: 7, skin: "#b77b51", hair: "#1e1713", style: 1, beard: false }, ...extra });
  return {
    year: 2026,
    week: fresh ? 0 : 3,
    phase: fresh ? "offseason" : "season",
    team: 0,
    morale: 75,
    coach: { name: "Avery Coach" },
    roster: [player("q1", "QB", 88, { jersey: "9" }), player("w1", "WR", 70, { jersey: "11" })],
    agents: [player("fa1", "WR", 84, { jersey: "11" }), player("fa2", "CB", 66), player("fa3", "LB", 90)],
    teams: Array.from({ length: 32 }, () => (fresh ? { w: 0, l: 0 } : { w: 2, l: 1 })),
    schedule: [],
    franchise: {
      role: "HC",
      career: { reputation: 55, xp: 0 },
      clubs: Array.from({ length: 32 }, (_, id) => ({
        id,
        fanApproval: 65,
        owner: { patience: 60 },
        identity: { name: `Club${id}`, city: `City ${id}`, abbr: `T${id}` },
        staff: [{ id: `hc-${id}`, role: "HC", name: `Coach ${id}`, rating: 70, scheme: "Balanced", userControlled: id === 0 }],
        players: id === 0 ? [] : [player(`o${id}`, "LB", 80)],
      })),
      office: { stories: [], messages: [], seen: [], rounds: fresh ? [] : ["r0"], step: 0, moodHistory: [], followedTeams: [0] },
    },
  };
}

// Jersey numbers: keep your own number unless taken, else a free number in the position range.
assert.equal(jerseyNumber({ id: "x", pos: "QB", jersey: "7" }, []), 7);
const wr = jerseyNumber({ id: "fa1", pos: "WR", jersey: "11" }, [{ id: "w1", jersey: "11" }]);
assert(wr !== 11 && ((wr >= 10 && wr <= 19) || (wr >= 80 && wr <= 89)), "taken number reassigned within the WR range");
assert.equal(jerseyNumber({ id: "z", pos: "OL" }, []), jerseyNumber({ id: "z", pos: "OL" }, []), "deterministic");

// First pass is a silent baseline for an existing career.
let s = career();
assert.deepEqual(detectArrivals(s), []);
assert.equal(ensureOffice(s).stories.length, 0);

// A free-agent signing for your club: one Signing event with jersey data and a jersey news card.
const fa = s.agents.shift();
s.roster.push(fa);
let out = detectArrivals(s);
assert.equal(out.length, 1);
const sign = out[0];
assert.equal(sign.kind, "Signing");
assert.equal(sign.team, 0);
assert.equal(sign.via, "free-agency");
assert.equal(sign.playerName, fa.name);
assert(Number.isInteger(sign.number) && sign.number !== 11);
assert.equal(sign.role, "starter", "the 84 WR outranks every receiver on the roster");
const card = ensureOffice(s).stories.find((a) => a.card?.type === "jersey");
assert(card && card.category === "Players" && card.card.number === sign.number);
assert.deepEqual(detectArrivals(s), [], "idempotent: no second event for the same move");

// Your own signing reaches the social engine once; trade arrivals are skipped when a Trade
// event already covered the player.
const posts = processSocialRound(s, out);
assert(posts.some((p) => p.eventId === sign.id && p.topic === "Signings"), "signing posts");
assert(posts.every((p) => !/\{|\}|\[|\]/.test(p.body)), "templates expanded");
assert.equal(processSocialRound(s, out).length, 0);

// Around the league: notable signings get cards, depth signings do not, and nothing enters the
// event log for other clubs.
const before = ensureEventLog(s).events.length;
const star = s.agents.find((p) => p.id === "fa3"),
  depth = s.agents.find((p) => p.id === "fa2");
s.agents = [];
s.franchise.clubs[5].players.push(star);
s.franchise.clubs[6].players.push(depth);
assert.deepEqual(detectArrivals(s), []);
assert.equal(ensureEventLog(s).events.length, before);
const league = ensureOffice(s).stories.filter((a) => a.category === "League" && a.card);
assert.equal(league.length, 1);
assert.equal(league[0].card.playerId, "fa3");
assert.equal(league[0].team, 5);

// Trade arrival into your club.
const moved = s.franchise.clubs[7].players.shift();
s.roster.push(moved);
out = detectArrivals(s);
assert.equal(out[0].via, "trade");
assert.equal(out[0].from, 7);

// Head coach changes: your club gets an event, other clubs a coach card.
s.franchise.clubs[9].staff = [{ id: "hc-new", role: "HC", name: "Dana Fresh", rating: 81, scheme: "Vertical offense" }];
s.franchise.staffMovements = [{ id: "hc-new", from: 4, to: 9, role: "HC" }];
assert.deepEqual(detectArrivals(s), []);
const coachCard = ensureOffice(s).stories.find((a) => a.card?.type === "coach");
assert.equal(coachCard.card.name, "Dana Fresh");
assert.equal(coachCard.card.from, 4);
s.franchise.clubs[0].staff = [{ id: "hc-other", role: "HC", name: "Sam Boss", rating: 75 }];
out = detectArrivals(s);
assert.equal(out[0].kind, "CoachingMove");
assert.equal(out[0].user, false);
assert(processSocialRound(s, out).some((p) => p.topic === "Coaching"));

// A brand-new career opens with your own head-coach arrival.
const newbie = career({ fresh: true });
const intro = detectArrivals(newbie);
assert.equal(intro.length, 1);
assert.equal(intro[0].kind, "CoachingMove");
assert.equal(intro[0].user, true);
assert.equal(intro[0].coachName, "Avery Coach");
assert.deepEqual(detectArrivals(newbie), []);

// Cinematic priority: a head-coach arrival is a big moment, a signing a regular one.
assert.equal(pickCinematic([sign, intro[0]], "all").kind, "CoachingMove");
assert.equal(pickCinematic([sign], "major"), null);
assert.equal(pickCinematic([sign], "all").kind, "Signing");

// Pixel art: font coverage, crisp SVG output, scenes and news cards.
for (const ch of "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-.' ") assert(fontCovers(ch), "glyph " + ch);
assert.equal(glyphText("Dé'Von Smith-Jr"), "DE'VON SMITH-JR");
assert.equal(textWidth("AB"), 7);
const g = new PixelGrid(4, 4).rect(1, 1, 2, 2, "#ffffff").outline("#000000");
assert.equal(g.get(0, 1), "#000000");
assert.equal(g.get(0, 0), null);
assert.match(g.svg(), /^<svg class="px-sprite[^"]*" viewBox="0 0 4 4" shape-rendering="crispEdges"/);
const colors = teamColors(13, null);
assert.equal(colors.primary, "#cd2434");
assert(pixelPortrait({ skin: "#b77b51" }, { colors }).includes("#b77b51"));
assert(pixelJersey({ colors, name: "Okafor", number: 17 }).includes(colors.secondary));
const scene = signingSceneSVG({ colors, abbr: "T13", name: "Jalen Okafor", number: 17, playerId: "p", teamName: "Club13" });
assert(scene.includes('class="px-l-lift"') && scene.includes("px-flash") && scene.includes("number 17"));
assert(coachSceneSVG({ colors, abbr: "T13", name: "Dana Fresh", team: 13, teamName: "Club13" }).includes('class="px-l-wave"'));
const d = sceneData(sign, s);
assert.equal(d.kind, "signing");
assert.match(d.sub, /signed in free agency/);
assert.match(sceneData(intro[0], newbie).sub, /hand you the headset/);
const art = storyArt(card, s);
assert(art.includes("px-card-signing") && art.includes("PixelScenes.replay") && art.includes(fa.name));
assert(storyArt(coachCard, s).includes("px-card-coach"));
assert.equal(storyArt({ id: "x", title: "No player" }, s), "");

// Newsroom variety: different situations, different wording, no repeats week to week.
const titles = new Set();
const v = career();
for (let w = 0; w < 6; w++) titles.add(matchStory(v, { a: 0, b: 1, score: [24, 21] }, 0, `2026:season:${w}:0`).title);
assert(titles.size >= 4, "close wins rotate their headline: " + [...titles].join(" | "));
assert.match(matchStory(v, { a: 0, b: 1, score: [3, 41] }, 0, "x").body, /^Final score: 3–41\./);
const big = { a: 3, b: 4, score: [45, 3] },
  close = { a: 5, b: 6, score: [20, 19] },
  wild = { a: 7, b: 8, score: [41, 38] };
const order = leagueHeadliners(v, [big, close, wild]);
assert.deepEqual(order.slice(0, 3), [close, big, wild], "closest, biggest margin, then highest scoring");
assert.match(leagueStory(v, big, "k").title, /Club3/);
const n = career();
for (let w = 0; w < 6; w++) {
  n.week = w;
  processNewsRound(n, [{ a: 0, b: 1, score: [w % 2 ? 10 : 31, 17] }, { a: 2, b: 3, score: [14, 13] }, { a: 4, b: 5, score: [52, 7] }], `2026:season:${w}:n`);
}
const ownTitles = ensureOffice(n).stories.filter((a) => a.source === "Sunday Review").map((a) => a.title);
assert.equal(new Set(ownTitles).size, ownTitles.length, "own match headlines never repeat across six weeks");
assert(ensureOffice(n).stories.some((a) => a.category === "Players" && a.source === "Gridiron Journal"), "feature stories fill quiet weeks");

// New storyline tags on results.
const t = career();
t.teams[0] = { w: 1, l: 4 };
t.teams[1] = { w: 4, l: 1 };
ensureEventLog(t).streak = -3;
const ev = deriveRoundEvents(t, [{ a: 0, b: 1, score: [38, 31] }], "tag-1")[0];
for (const tag of ["upset", "shootout", "skid-snapped"]) assert(ev.tags.includes(tag), tag);
assert(processSocialRound(t, [ev]).every((p) => !/\{|\}|\[|\]/.test(p.body)));
assert(socialEnginePosts(t).length > 0);

console.log("PASS: arrival detection (signings, trades, league cards, head coaches, career start), jersey numbers, pixel sprites/scenes/cards, newsroom headline variety and storyline tags.");
