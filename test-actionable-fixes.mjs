// Blockers carry structured fixes that the UI turns into buttons: the cap fixes really cover the
// shortfall, roster fixes name real reserves, a live game offers quick-sim, and every fix kind
// reaches a handler that exists. Also covers the shared notice markup.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as S from "./dist/franchise/state.mjs";
import * as C from "./dist/franchise/contracts.mjs";
import * as P from "./dist/franchise/personnel.mjs";
import { capShortfall, rosterFull, rosterSpotFixes, releaseSavings, restructurePlan, issueFixes, blockerText, activeCount, rosterLimit } from "./dist/franchise/blockers.mjs";
import { tradeBlockers, ownedPicks, ensurePickLedger } from "./dist/franchise/market.mjs";
import { ensureCalendar } from "./dist/franchise/calendar-core.mjs";
import { FIX_HANDLERS, runFix, confirmFix, confirmHTML, readFix } from "./dist/franchise/fixes.mjs";
import { notice, noticeText, fixButton, blockerNotice, textFixes, noticeList } from "./dist/ui/notice.mjs";

const ctx = { console, Math, Date, setTimeout() {}, localStorage: { getItem: () => null, setItem() {} }, document: { getElementById: () => ({ innerHTML: "", style: {} }), querySelectorAll: () => [], querySelector: () => ({}) } };
ctx.window = ctx;
ctx.addEventListener = () => {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("dist/game.js", "utf8"), ctx);
vm.runInContext(fs.readFileSync("dist/match.js", "utf8"), ctx);
globalThis.clubs = JSON.parse(vm.runInContext("JSON.stringify(clubs)", ctx));
const fresh = () => {
  const s = JSON.parse(vm.runInContext("JSON.stringify(fresh())", ctx));
  s.coach = { name: "QA" };
  S.migrate(s);
  s.franchise.role = "Owner";
  ensureCalendar(s);
  return s;
};
const onRoster = (s, id) => s.roster.some((p) => p.id === id);

// Cap shortfall: release and restructure fixes reference real players and cover the gap.
for (const shortM of [0.1, 0.4, 1.2]) {
  const s = fresh(),
    short = Math.round(shortM * S.MILLION),
    b = capShortfall(s, short);
  assert.match(b.reason, /short of cap space/);
  assert(b.fix && blockerText(b).includes("Fix:"), "the sentence form stays for toasts and tests");
  const release = b.fixes.find((f) => f.kind === "release"),
    restructure = b.fixes.find((f) => f.kind === "restructure");
  assert(release || restructure, `a $${shortM}M shortfall has an inline fix`);
  assert(b.fixes.some((f) => f.kind === "open" && f.route === "Contracts"), "Open Contracts is always offered");
  if (release) {
    assert(onRoster(s, release.playerId), "release names a player on the roster");
    assert(releaseSavings(s, s.franchise.contracts[release.playerId]) >= short, "the release covers the shortfall");
    assert.match(release.label, /^Release .+ \(−\$[\d.]+M\)$/);
    const before = S.capLedger(s).room,
      after = S.capLedger(S.transact(s, (x) => C.cut(x, release.playerId, false))).room;
    assert(after - before >= short, "running the release frees at least the shortfall");
  }
  if (restructure) {
    assert(onRoster(s, restructure.playerId), "restructure names a player on the roster");
    const c = s.franchise.contracts[restructure.playerId],
      plan = restructurePlan(s, c, short);
    assert(plan.frees >= short, "the planned restructure frees the shortfall");
    assert.equal(restructure.amount, plan.amount);
    const before = S.capLedger(s).room,
      after = S.capLedger(S.transact(s, (x) => C.restructure(x, restructure.playerId, (restructure.amount / S.MILLION).toFixed(2)))).room;
    assert(after - before >= short, "running the restructure through contracts.restructure frees the shortfall");
  }
}

// Roster over the limit: at 54/53 the fixes name real, eligible reserves and the Squad screen.
{
  const s = fresh(),
    limit = rosterLimit(s),
    full = rosterFull(s, limit + 1);
  assert.equal(full.reason, `Your active roster would be ${limit + 1}/${limit}.`);
  assert(full.fixes.some((f) => f.kind === "open" && f.route === "Roster"), "Open Squad is offered");
  const waive = full.fixes.find((f) => f.kind === "waive");
  assert(waive && onRoster(s, waive.playerId), "a waive fix names a rostered player");
  const w = s.roster.find((p) => p.id === waive.playerId);
  assert(!w.starter && (!w.status || w.status === "active"), "only an active reserve is suggested");
  // With practice-squad room, the cheaper move to the practice squad is suggested first.
  const ps = s.roster.find((p) => p.status === "practice");
  if (ps) C.cut(s, ps.id, false);
  const fixes = rosterSpotFixes(s),
    practice = fixes.find((f) => f.kind === "practice");
  assert(practice, "a practice-squad move is offered while the practice squad has room");
  assert.equal(fixes[0].kind, "practice");
  const before = activeCount(s),
    moved = S.transact(s, (x) => P.movePlayer(x, practice.playerId, "practice"));
  assert.equal(activeCount(moved), before - 1, "running the practice-squad fix opens an active spot");
  assert(rosterFull(s, limit) === null, "no blocker while it fits");
}

// Trade blockers carry fixes: the screenshot's case (cap short and 54/53) and a live game.
{
  const s = fresh();
  ensurePickLedger(s);
  const partner = (s.team + 1) % 32,
    theirs = S.roster(s, partner).filter((p) => s.franchise.contracts[p.id] && !s.franchise.contracts[p.id].noTrade && (!p.status || p.status === "active")).sort((a, b) => b.salary - a.salary)[0],
    pick = ownedPicks(s, s.team).find((p) => p.round === 1),
    hit = S.capHit(s.franchise.contracts[theirs.id], S.financeYear(s));
  s.franchise.rules.cap -= S.capLedger(s).room - hit + Math.round(0.1 * S.MILLION);
  while (activeCount(s) < rosterLimit(s)) {
    const p = s.roster.find((q) => q.status === "practice");
    if (!p) break;
    p.status = "active";
  }
  const blockers = tradeBlockers(s, { partner, give: [pick.id], get: [theirs.id] }),
    cap = blockers.find((b) => /short of cap space/.test(b.reason)),
    roster = blockers.find((b) => /active roster would be/.test(b.reason));
  assert(cap?.fixes.some((f) => f.kind === "release" || f.kind === "restructure"), "the cap blocker has an inline fix");
  assert(roster?.fixes.some((f) => f.kind === "waive" || f.kind === "practice"), "the roster blocker has an inline fix");
  for (const f of [...cap.fixes, ...roster.fixes]) if (f.playerId) assert(onRoster(s, f.playerId), "fixes reference real players");
  s.live = { finished: false };
  const closed = tradeBlockers(s, { partner, give: [pick.id], get: [theirs.id] }).find((b) => /Trading is closed/.test(b.reason));
  assert.deepEqual(closed.fixes.map((f) => f.kind), ["quicksim", "matchday"], "a live game offers quick-sim and Matchday");
  assert.deepEqual(C.offerBlockers(s, s.agents[0].id).find((b) => /live game/.test(b.reason)).fixes.map((f) => f.kind), ["quicksim", "matchday"]);
}

// Compliance / calendar pauses get fixes too.
{
  const s = fresh();
  s.franchise.rules.cap = S.capLedger(s).used - Math.round(0.3 * S.MILLION);
  assert(issueFixes(s, { code: "CAP_OVER", route: "Contracts", message: "Clear $0.30M before advancing." }).some((f) => f.kind === "release" || f.kind === "restructure"));
  assert.equal(issueFixes(s, { message: "An urgent club matter or interview is waiting in your inbox." })[0].route, "Inbox");
  assert.equal(issueFixes(s, { route: "Roster", message: "Need 1 healthy K." })[0].route, "Roster");
}

// Over the cap, a suggested waive must be one contracts.cut accepts (it refuses releases that
// leave the club over the cap with less room than before; one that frees room is allowed).
{
  const s = fresh();
  s.franchise.rules.cap = S.capLedger(s).used - Math.round(0.5 * S.MILLION);
  const waive = rosterSpotFixes(s).find((f) => f.kind === "waive");
  if (waive) assert.doesNotThrow(() => S.transact(s, (x) => C.cut(x, waive.playerId, false)), "the suggested waive can be completed");
  const partial = s.roster.find((p) => !p.starter && s.franchise.contracts[p.id] && releaseSavings(s, s.franchise.contracts[p.id]) > 0 && releaseSavings(s, s.franchise.contracts[p.id]) < Math.round(0.5 * S.MILLION));
  if (partial) assert.doesNotMatch(confirmHTML(s, { kind: "waive", playerId: partial.id }), /disabled/, "a release that frees some room can be confirmed");
  // A release that costs more dead money than it saves can't be confirmed while over the cap.
  const reserve = s.roster.find((p) => !p.starter && s.franchise.contracts[p.id]),
    c = s.franchise.contracts[reserve.id];
  c.guarantees = c.base.slice();
  c.bonus = 30 * S.MILLION;
  assert(releaseSavings(s, c) < 0);
  assert.match(confirmHTML(s, { kind: "waive", playerId: reserve.id }), /disabled/, "an impossible release can't be confirmed");
}

// Every fix kind reaches an existing handler; costly ones confirm first, then run F.action.
{
  const s = fresh(),
    calls = [],
    spy = (name) => (...args) => (calls.push([name, ...args]), true),
    g = { state: s, closeModal: spy("closeModal"), modal: spy("modal"), toast: spy("toast"), W: { open: spy("W.open"), player: spy("W.player") }, F: { action: spy("F.action"), contract: spy("F.contract") }, MD: { start: spy("MD.start") }, Ops: { asset: spy("Ops.asset"), sub: spy("Ops.sub"), mk: spy("Ops.mk") }, Neg: { open: spy("Neg.open") } };
  const reserve = s.roster.find((p) => !p.starter && p.status !== "practice" && s.franchise.contracts[p.id]),
    restr = s.roster.find((p) => restructurePlan(s, s.franchise.contracts[p.id]));
  const cases = {
    release: { playerId: reserve.id },
    waive: { playerId: reserve.id },
    restructure: { playerId: restr.id, amount: restructurePlan(s, s.franchise.contracts[restr.id]).amount },
    practice: { playerId: reserve.id },
    open: { route: "Contracts" },
    player: { playerId: reserve.id },
    contract: { playerId: reserve.id },
    matchday: {},
    quicksim: {},
    dealRemove: { side: "give", id: "x" },
    freeAgents: { pos: "QB" },
  };
  assert.deepEqual(Object.keys(cases).sort(), Object.keys(FIX_HANDLERS).sort(), "every fix kind is covered");
  for (const [kind, extra] of Object.entries(cases)) {
    calls.length = 0;
    runFix({ kind, ...extra }, g);
    const handler = FIX_HANDLERS[kind].replace(/\(.*$/, "");
    if (["release", "waive", "restructure", "practice"].includes(kind)) {
      assert(calls.some((c) => c[0] === "modal" && /modal-actions/.test(c[1]) && /Fix\.confirm/.test(c[1])), `${kind} asks to confirm first`);
      calls.length = 0;
      confirmFix({ kind, ...extra, after: "neg:p1" }, g);
      const want = { release: "cut", waive: "cut", restructure: "restructure", practice: "move" }[kind];
      assert(calls.some((c) => c[0] === "F.action" && c[1] === want && c[2] === extra.playerId), `${kind} confirms through F.action('${want}')`);
      assert(calls.some((c) => c[0] === "Neg.open" && c[1] === "p1"), "the dialog it came from reopens");
    } else assert(calls.some((c) => c[0] === handler), `${kind} calls ${handler}`);
  }
  assert.match(confirmHTML(s, { kind: "release", playerId: reserve.id }), /dead money|No dead money/, "release confirm states dead money");
  assert.equal(readFix({ dataset: { fix: "restructure", id: "p9", amount: "2000000", after: "neg:p9" } }).amount, 2000000);
}

// The handlers named above exist in the game's code.
{
  const src = (f) => fs.readFileSync(f, "utf8");
  for (const c of ['case "cut"', 'case "restructure"', 'case "move"']) assert(src("dist/franchise/ui.mjs").includes(c), `F.action handles ${c}`);
  assert(/window\.W = \{\s*open\(route, tab\)/.test(src("dist/franchise/presentation.mjs")), "W.open exists");
  assert(/\n\s+player\(/.test(src("dist/franchise/presentation.mjs")) || /player\(id/.test(src("dist/franchise/presentation.mjs")), "W.player exists");
  const ops = src("dist/franchise/ops-ui.mjs");
  for (const m of ["asset(side, id, on)", "sub(key, id)", "mk(side, key, value)"]) assert(ops.includes(m), `Ops.${m} exists`);
  assert(src("dist/franchise/matchday-sim.mjs").includes('start(target = "final")'), "MD.start exists");
  assert(src("dist/franchise/negotiation-ui.mjs").includes('open(id, type = "free")'), "Neg.open exists");
}

// Notice markup: bold headline, lighter detail, fix buttons with data attributes.
{
  const html = notice({ title: "You are $0.1M short of cap space.", detail: "Release a reserve.", fixes: [{ kind: "release", playerId: "p<1>", label: "Release X (−$0.2M)" }], actions: [{ label: "Open", onclick: "W.open('Roster')" }] });
  assert.match(html, /<b>You are \$0\.1M short of cap space\.<\/b><span>Release a reserve\.<\/span>/);
  assert.match(html, /data-fix="release" data-id="p&lt;1&gt;"/, "fix data is escaped");
  assert.match(html, /onclick="Fix\.run\(this\)"/);
  assert.match(fixButton({ kind: "open", route: "Game plan", tab: "Depth", label: "Open Tactics" }), /data-route="Game plan" data-tab="Depth"/);
  assert.deepEqual(noticeText("You are $0.1M short of cap space. Fix: release X."), { title: "You are $0.1M short of cap space.", detail: "Fix: release X." });
  assert.equal(noticeText("Short line").detail, "");
  assert.match(blockerNotice({ reason: "Trading is closed. Trades pause while a game is being played.", fix: "Finish or quick-sim the game first.", fixes: [] }), /<b>Trading is closed\.<\/b><span>Trades pause while a game is being played\. Finish or quick-sim/);
  assert.equal(textFixes("Ja'Marr Chase is holding out and not available. Resolve his contract in Contracts first.")[0].route, "Contracts");
  assert(textFixes("Put someone else in his depth-chart slot (Game plan → Depth chart) first.").some((f) => f.route === "Game plan"));
  assert.equal(noticeList([]), "");
}

console.log("PASS: structured blocker fixes (cap, roster, live game, compliance), confirm-first fix handlers that exist, and notice markup.");
