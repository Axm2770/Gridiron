// Inbox message cards: tone per metric, parsing of old plain-text bodies, transcripts, every
// structured card kind, and old messages still rendering through the plain formatter.
import assert from "node:assert/strict";
import { metricTone, parseEffects, parseTranscript, cardData, renderMessageBody, bodyPart } from "./dist/ui/message-cards.mjs";
import { inlineTone, formatMessage } from "./dist/ui/message-format.mjs";
import { pressMessageData } from "./dist/franchise/press-consequences.mjs";

// Tone follows the metric, not the sign.
assert.equal(metricTone("Drama", 7), "bad", "more drama is bad");
assert.equal(metricTone("Drama", -3), "good");
assert.equal(metricTone("Injury risk", 5), "bad");
assert.equal(metricTone("Dead money", 2), "bad");
assert.equal(metricTone("Fatigue", 4), "bad");
for (const label of ["Team morale", "Chemistry", "Fan approval", "Owner patience", "Trust", "Coach trust", "Job security"]) {
  assert.equal(metricTone(label, 3), "good", label);
  assert.equal(metricTone(label, -3), "bad", label);
}
assert.equal(metricTone("Owner patience", 0), "flat", "0 is neutral");
assert.equal(metricTone("Win target", -1), "good", "a lower win target is relief");

// The plain formatter colours numbers the same way (mf-pos = good outcome, mf-neg = bad).
const toned = inlineTone("Changes: team morale +2, chemistry -2, drama +7, owner patience −10 (−18 if short).");
assert.match(toned, /team morale <b class="mf-num mf-pos">\+2/);
assert.match(toned, /drama <b class="mf-num mf-neg">\+7/, "drama +7 is shown as bad");
assert.match(toned, /chemistry <b class="mf-num mf-neg">-2/);
assert.match(toned, /\(<b class="mf-num mf-neg">−18/, "the bracketed value keeps the clause's metric");
assert.match(formatMessage("Drama -3 after the meeting."), /mf-pos">-3/, "less drama is good");

// The screenshot's sentence becomes two groups of rows.
const sentence = 'Earlier this week you said: "We are here to make a statement.". The result did not back it up.\n\nChanges: team morale +2, chemistry -2, drama +7, fan approval -2, owner patience 0, Bo Nix: morale -6, trust -15.';
const fx = parseEffects(sentence);
assert.equal(fx.groups.length, 2);
assert.deepEqual(fx.groups[0], { name: "Team", rows: [{ label: "Team morale", delta: 2 }, { label: "Chemistry", delta: -2 }, { label: "Drama", delta: 7 }, { label: "Fan approval", delta: -2 }, { label: "Owner patience", delta: 0 }] });
assert.deepEqual(fx.groups[1], { name: "Bo Nix", rows: [{ label: "Morale", delta: -6 }, { label: "Trust", delta: -15 }] });
assert.match(fx.lead, /^Earlier this week/);

// Transcripts: reporter, outlet and answer lines are separated (old one-line bodies too).
const old = parseTranscript("Jordan Ellis · Gridiron Network. That starts with me. We will learn and improve. Nix has to be better. Everybody saw it.");
assert.equal(old.speaker, "Jordan Ellis");
assert.equal(old.outlet, "Gridiron Network");
assert.deepEqual(old.answers, ["That starts with me. We will learn and improve.", "Nix has to be better. Everybody saw it."]);
const lined = parseTranscript('Jordan Ellis · Gridiron Network\nQ: How do you explain that?\nA: "That starts with me."\nQ: And Nix?\nA: "Nix has to be better."');
assert.deepEqual(lined.questions, ["How do you explain that?", "And Nix?"]);
assert.deepEqual(lined.answers, ["That starts with me.", "Nix has to be better."]);

// Context the inbox passes (player lookups, coach face, crests).
const nix = { id: "p1", name: "Bo Nix", pos: "QB", age: 26, ovr: 78, morale: 72, coachTrust: 45, injury: 3, medical: { diagnosis: "High ankle sprain", bodyPart: "ankle" } };
const ctx = { team: 9, player: (id) => (id === "p1" ? nix : null), playerByName: (n) => (n === "Bo Nix" ? nix : null), teamName: (t) => ["Bears", "Broncos"][t % 2], logo: () => "", coachName: "Alex Morgan", coachFace: "<svg></svg>" };
const clean = (html) => html.replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, " ");
const ok = (m, kind) => {
  const r = renderMessageBody(m, ctx);
  assert.equal(r.cards, true, `${m.title} renders as a card`);
  if (kind) assert.equal(r.kind, kind, m.title);
  assert.doesNotMatch(clean(r.html), /undefined|NaN|\[object/, `${m.title} has no undefined/NaN`);
  return r;
};

// Old saves (no data) still become cards where the text allows it.
const press = ok({ title: "Your words come back to bite", body: sentence, playerId: "p1" }, "effects");
assert.match(press.html, /mc-row t-bad"><span class="mc-row-label">Drama/, "drama +7 row is bad");
assert.match(press.html, /mc-row t-flat"><span class="mc-row-label">Owner patience/, "0 is neutral");
assert.equal(press.coversPlayer, true, "the player's rows replace the separate player strip");
const conv = ok({ title: "Conversation: At the final whistle", body: "Jordan Ellis · Gridiron Network. That starts with me. We will learn and improve. Nix has to be better. Everybody saw it." }, "transcript");
assert.equal((conv.html.match(/class="mc-a"/g) || []).length, 2, "two answer blocks");
assert.match(conv.html, /<b>Jordan Ellis<\/b><small>Gridiron Network<\/small>/);
ok({ title: "Medical update: Bo Nix", summary: "High ankle sprain · 3 week(s) remaining at this report.", body: "The player is unavailable.", playerId: "p1", week: 4 }, "injury");
ok({ title: "Trade agreed", body: "Bo Nix is exchanged for Sam Smith." }, "transaction");
ok({ title: "Contract extension agreed", body: "Bo Nix commits to 3 additional seasons from 2027." }, "transaction");
ok({ title: "Scouting report: X Y", body: "Area scout filed a formal report on X Y (WR, 23). Overall 72–86 → 78–84; potential 80–88. Verdict: Quality starter. Strengths: Speed 88–92, Agility 84–90. Concerns: Blocking 40–52. Confidence 40% → 65%. Another report would narrow the ranges further.", source: "Area scout" }, "scouting");
ok({ title: "Owner's expectations for 2026", body: "Owner group has set out what ownership expects. Targets: • Win at least 10 games • Develop one young starter (secondary) Consequences: • Exceed: 12+ wins. Owner patience +12. • Miss: Fewer than 10 wins. Owner patience −10. The board will call a meeting if results fall behind." }, "targets");
ok({ title: "Checkpoint missed: ownership is losing patience", body: "Owner reviewed the plan agreed at the board meeting. Win 3 of the next 5 games: 1 of 3 wins needed. Owner patience −20, fan approval −3. Job security 58 → 44." }, "checkpoint");
ok({ title: "Board meeting: Owner wants a plan", body: "Called in.\n\n• Record: 2–5 after 7 games\n• Fan approval 41% · team morale 62% · drama 30\n\nWhy now: losing streak of 3; on pace for 4.9 wins.\n\nOwnership wants a plan." }, "meeting");
ok({ title: "A win for the franchise", body: "Bears 27–20.", team: 0 }, "score");
ok({ title: "Practice standout: Bo Nix", summary: "Training grade 8.4 / 10.", body: "Strong practice work.", playerId: "p1" }, "training");
ok({ title: "Player meeting", body: "Bo Nix: Support. Morale +4." }, "effects");

// New messages carry structured data for every kind.
const structured = [
  { title: "Your words come back to bite", playerId: "p1", data: pressMessageData({ kind: "credibility", text: "We are here to make a statement." }, { changes: { morale: 2, chemistry: -2, drama: 7, fans: -2, owner: 0, media: -4, credibility: -12, playerMorale: -6, playerTrust: -15 } }, nix) },
  { title: "Bo Nix reacts to your comments", playerId: "p1", data: pressMessageData({ kind: "callout", text: 'Bo Nix answers on social media: "Watch me."' }, { changes: { morale: 0, chemistry: -3, drama: 4, fans: 1, owner: 0, playerMorale: -5, playerTrust: -8 } }, nix) },
  { title: "Conversation: At the final whistle", data: { kind: "transcript", speaker: "Jordan Ellis", outlet: "Gridiron Network", reporterId: "reporter-jordan", setting: "Postgame", questions: ["Tough loss. What went wrong?", "Is Nix still your starter?"], answers: [{ text: "That starts with me.", tone: "Accountable" }, { text: "Nix has to be better.", tone: "Challenge" }] } },
  { title: "Medical update: Bo Nix", playerId: "p1", data: { kind: "injury", playerId: "p1", name: "Bo Nix", pos: "QB", diagnosis: "High ankle sprain", bodyPart: "ankle", weeks: 4, total: 4, week: 3, status: "out" } },
  { title: "Back in contention: Bo Nix", playerId: "p1", data: { kind: "injury", playerId: "p1", name: "Bo Nix", status: "cleared", weeks: 0, total: 4, week: 7 } },
  { title: "Trade agreed", data: { kind: "transaction", type: "trade", partner: "Broncos", incoming: [{ id: "x1", name: "Sam Smith", pos: "WR", ovr: 81, age: 27 }, { name: "2027 round 2", pos: "Draft pick" }], outgoing: [{ id: "p1", name: "Bo Nix", pos: "QB", ovr: 78, age: 26 }] } },
  { title: "Free agent signed", data: { kind: "transaction", type: "signing", incoming: [{ id: "x2", name: "Lee Park", pos: "CB", ovr: 74, age: 29 }], terms: [{ label: "Annual base", value: "$8.5M" }, { label: "Years", value: "3" }] } },
  { title: "Draft selection", data: { kind: "transaction", type: "draft", incoming: [{ id: "x3", name: "Ty Moss", pos: "OT", ovr: 66, age: 21, college: "Iowa" }], terms: [{ label: "Pick", value: "#14" }] } },
  { title: "Scouting report: Ty Moss", data: { kind: "scouting", playerId: "x3", name: "Ty Moss", pos: "OT", age: 21, scout: "Area scout", before: "58–74", ovr: "62–70", pot: "70–82", verdict: "Day 2 pick", strengths: [{ label: "Strength", range: "80–86" }], concerns: [{ label: "Speed", range: "50–58" }], confidence: [40, 65] } },
  { title: "Owner's expectations for 2026", data: { kind: "targets", mandate: "Compete", facts: [{ label: "Projected wins", value: "9.6" }], items: [{ label: "Win 10 games", required: true }, { label: "Keep fans at 45%", required: false }], bands: [{ label: "Exceed", text: "12+ wins. Owner patience +12." }] } },
  { title: "End-of-season review", data: { kind: "targets", verdict: "Expectations missed", items: [{ label: "Win 10 games", required: true, progress: "7 / 10", state: "missed" }, { label: "Cap", required: true, progress: "$4.0M room", state: "done" }] } },
  { title: "Checkpoint met", data: { kind: "checkpoint", met: true, measure: "Win 3 of the next 5", value: 3, need: 3, unit: "wins", security: [44, 58], effects: [{ label: "Owner patience", delta: 10 }] } },
  { title: "Board meeting", data: { kind: "meeting", status: "Security 38", facts: [{ label: "Record", value: "2–5" }, { label: "Fan approval", value: "41%" }, { label: "Drama", value: "52%" }], reasons: ["losing streak of 3"] } },
  { title: "A win for the franchise", data: { kind: "score", team: 0, opp: 1, us: 27, them: 20, label: "Week 5" } },
  { title: "Practice standout: Bo Nix", playerId: "p1", data: { kind: "training", playerId: "p1", grade: 8.4, ovr: 78, delta: 0.6, form: 7.2, reasons: ["Competitive snaps"], attributes: [{ label: "Accuracy", delta: 0.4 }, { label: "Speed", delta: -0.1 }] } },
];
for (const m of structured) ok(m, m.data.kind);
const callout = renderMessageBody(structured[1], ctx).html;
assert.match(callout, /class="mc-quote"/, "a player's reaction is a quote card with his face");
assert.match(callout, /gd-pixel-face/);
const tr = renderMessageBody(structured[2], ctx).html;
assert.equal((tr.match(/class="mc-q"/g) || []).length, 2, "each question is its own block");
assert.match(tr, /Tough loss\. What went wrong\?/);
assert.doesNotMatch(clean(tr), /Gridiron Network\. That starts/, "the reporter line and answers never run together");
assert.equal(bodyPart("ankle")[1], "Ankle / foot");
assert.equal(bodyPart("Torn ACL")[1], "Knee");
assert.match(renderMessageBody(structured[13], ctx).html, /mc-tag t-good">Win/);

// Messages the cards don't recognise keep the plain structured formatter.
const plain = renderMessageBody({ title: "The room needs a response", body: "Results have put pressure on the group." }, ctx);
assert.equal(plain.cards, false);
assert.equal(plain.html, formatMessage("Results have put pressure on the group."));
assert.equal(cardData({ title: "Something new", body: "No structure here." }), null);
// A malformed data blob falls back instead of printing undefined.
assert.equal(renderMessageBody({ title: "x", body: "Body text.", data: { kind: "score" } }, ctx).cards, false);
assert.ok(!renderMessageBody({ title: "x", body: "<script>alert(1)</script>", data: { kind: "effects", lead: "<img onerror=x>", groups: [{ name: "<b>", rows: [{ label: "<i>", delta: 1 }] }] } }, ctx).html.includes("<img"), "escapes text");
console.log("message cards ok");
