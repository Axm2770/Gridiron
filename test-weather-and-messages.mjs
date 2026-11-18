// Weather comes from the stadium and the calendar, never a choice; message bodies render as structured pixel blocks.
import assert from "node:assert/strict";
import { forecast, gameForecast, engineWeather } from "./dist/franchise/weather.mjs";
import { formatMessage } from "./dist/ui/message-format.mjs";

// Domes are always indoors.
for (const abbr of ["DAL", "DET", "MIN", "NO", "LV", "ARI"]) for (let w = 0; w < 18; w++) assert.equal(forecast({ abbr, week: w, a: 1, b: 2 }).condition, "Dome");
// Stable for the same game; varies across games.
assert.deepEqual(forecast({ abbr: "GB", week: 15, a: 22, b: 20 }), forecast({ abbr: "GB", week: 15, a: 22, b: 20 }));
const tally = (abbr, weeks) => { const c = {}; for (let y = 2026; y < 2046; y++) for (const w of weeks) { const f = forecast({ abbr, year: y, week: w, a: 3, b: 9 }); c[f.condition] = (c[f.condition] || 0) + 1; } return c; };
const gbLate = tally("GB", [13, 14, 15, 16, 17]), gbEarly = tally("GB", [0, 1, 2]), mia = tally("MIA", [13, 14, 15, 16, 17]), lac = tally("LAC", [0, 5, 10, 15]);
assert.ok((gbLate.Snow || 0) > 0, "Green Bay sees snow in December");
assert.equal(gbEarly.Snow || 0, 0, "no snow in September");
assert.equal(mia.Snow || 0, 0, "never snows in Miami");
assert.equal(Object.keys(lac).join(), "Dome", "SoFi is covered");
const all = {}; for (const abbr of ["BUF", "SEA", "KC", "SF", "PHI", "TB"]) for (const [k, v] of Object.entries(tally(abbr, [...Array(18).keys()]))) all[k] = (all[k] || 0) + v;
const total = Object.values(all).reduce((a, b) => a + b, 0), bad = (all.Rain || 0) + (all.Snow || 0) + (all.Wind || 0);
assert.ok(bad / total > 0.15 && bad / total < 0.45, `share of rain/snow/wind games is realistic: ${(bad / total).toFixed(2)}`);
assert.equal(engineWeather("Snow"), "Rain"); assert.equal(engineWeather("Dome"), "Clear"); assert.equal(engineWeather("Hot"), "Clear");
assert.ok(gameForecast({ year: 2026, week: 16, franchise: { clubs: [] } }, { a: 0, b: 1 }).condition, "career forecast works without the browser club list");

// Message formatting: old one-line bodies and new multi-line bodies both become sections.
const old = "Owner group has set out what ownership expects. Targets: • Win at least 10 games • Develop one young starter (secondary) Consequences: • Exceed: 12+ wins. Owner patience +12. • Miss: Fewer than 10 wins. Owner patience −10 (−18 if short). The board will call a meeting if results fall behind.";
const html = formatMessage(old);
assert.match(html, /<h4 class="mf-head">Targets<\/h4>/); assert.match(html, /<h4 class="mf-head">Consequences<\/h4>/);
assert.match(html, /mf-tag-soft">SECONDARY/); assert.match(html, /mf-good"><span class="mf-label">Exceed/); assert.match(html, /mf-bad"><span class="mf-label">Miss/);
assert.match(html, /mf-pos">\+12/); assert.match(html, /mf-neg">−10/);
assert.match(html, /<p class="mf-p">The board will call a meeting/);
assert.equal((formatMessage("Line one\n\nTargets:\n• A\n• B").match(/<li/g) || []).length, 2);
assert.ok(!formatMessage("<script>x</script> • a").includes("<script>"), "escapes HTML");
assert.match(formatMessage("Just a sentence."), /^<div class="mf"><p class="mf-p mf-lead">Just a sentence\.<\/p><\/div>$/);
console.log("weather + message formatting ok", JSON.stringify(all));
