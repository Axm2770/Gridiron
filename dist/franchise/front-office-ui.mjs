import * as S from "./state.mjs";
import * as B from "./boardroom.mjs";
import * as BM from "./board-meetings.mjs";
import * as G from "./game-plan.mjs";
import { lockerReport } from "./locker-room.mjs";
import { icon } from "./presentation.mjs";

// Boardroom, Tactics (the legacy "Game plan" view) and Locker room.
const arg = (v) => esc(JSON.stringify(v));
const money = (n) => "$" + (n / S.MILLION).toFixed(1) + "M";
const chip = (text, tone = "") => `<span class="fo-chip ${tone}">${esc(text)}</span>`;
const meter = (v, tone = "", max = 100) =>
  `<span class="fo-meter ${tone}"><i style="width:${Math.max(0, Math.min(100, (v / max) * 100))}%"></i></span>`;
const toneFor = (v, good = 70, warn = 50) => (v >= good ? "good" : v >= warn ? "warn" : "bad");
const card = (title, body, extra = "", cls = "") =>
  `<section class="fo-card ${cls}"><div class="fo-card-head"><h3>${title}</h3>${extra}</div>${body}</section>`;
const kpi = (label, value, sub, tone = "", bar = null) =>
  `<div class="fo-kpi ${tone}"><small>${label}</small><b>${value}</b>${bar === null ? "" : meter(bar, tone)}<span>${sub}</span></div>`;
const cause = (c) => `<li class="${c.tone || ""}">${esc(c.text)}</li>`;

export function installFrontOfficeUI({ views, isBusy }) {
  if (!document.querySelector('link[href="front-office.css"]'))
    document.head.insertAdjacentHTML("beforeend", '<link rel="stylesheet" href="front-office.css">');
  let lockerFilter = "All";
  function mutate(fn, done) {
    if (isBusy()) {
      toast("Wait for the simulation to finish.");
      return;
    }
    try {
      let result;
      state = S.transact(state, (s) => {
        result = fn(s);
      });
      save();
      render();
      if (done) toast(typeof done === "function" ? done(result) : done);
    } catch (e) {
      toast(e.message);
    }
  }

  /* ------------------------------------------------------------ boardroom */
  function boardView() {
    const o = B.boardOverview(state),
      b = o.budget,
      busy = isBusy() || !!state.live,
      payrollShare = b.staffBudget ? (b.staffPayroll / b.staffBudget) * 100 : 100,
      capShare = b.cap.limit ? (b.cap.used / b.cap.limit) * 100 : 0;
    const security = `<div class="fo-security ${toneFor(o.security, 60, 40)}"><div class="fo-gauge" style="--v:${o.security}"><b>${o.security}</b><small>/ 100</small></div><div><h2>${esc(o.status)}</h2><ul class="fo-causes">${o.factors.map((f) => cause({ text: `${f.label}: ${f.value}`, tone: f.tone })).join("")}</ul></div></div>`;
    const owner = `<div class="fo-owner"><span class="fo-owner-icon">${icon("briefcase")}</span><div><b>${esc(o.owner.name)}</b><small>${esc(o.owner.trait)}</small></div></div><div class="fo-row"><span>Owner patience</span><b>${Math.round(o.owner.patience)}%</b></div>${meter(o.owner.patience, toneFor(o.owner.patience, 60, 40))}<p class="fo-note">${ownerNote(o.owner.trait)}</p>`;
    const x = BM.expectationsReport(state),
      mark = { done: "✓", on: "•", risk: "!", missed: "✗" };
    const expectations = `<p class="fo-note">${esc(x.headline)}. The roster rates ${x.rating} (${x.rank} of 32, league average ${x.leagueAvg}); ownership projects ${x.projected} wins${x.targetShift ? ` and has moved the target ${x.targetShift > 0 ? "+" : ""}${x.targetShift} after a meeting` : ""}.</p><div class="fo-target fo-target-4"><div><small>PROJECTED</small><b>${x.projected}</b></div><div><small>WIN TARGET</small><b>${o.target}</b></div><div><small>RECORD</small><b>${o.record.w}–${o.record.l}</b></div><div><small>ON PACE FOR</small><b>${o.pace === null ? "—" : o.pace.toFixed(1)}</b></div></div><ul class="fo-objectives">${x.items.map((t) => `<li class="${t.state === "done" ? "done" : t.state === "risk" || t.state === "missed" ? "risk" : ""}"><i>${mark[t.state]}</i><span>${esc(t.label)}${t.required ? "" : ' <em class="fo-soft">secondary</em>'}</span><small>${esc(t.progress)}</small></li>`).join("")}</ul><div class="fo-bands">${x.bands.map((b) => `<div class="fo-band ${b.key === "Exceeded" ? "good" : b.key === "Met" ? "" : "bad"} ${x.outcome === b.key ? "active" : ""}"><b>${esc(b.label)}</b><small>${esc(b.when)}</small><span>${esc(b.effect)}</span></div>`).join("")}</div>`;
    const p = x.pulse,
      plan = x.plan,
      pending = x.pending.length
        ? `<div class="fo-pending">${x.pending.map((m) => `<div class="fo-row"><span>${chip("Awaiting you", "bad")} ${esc(m.title)}</span><button class="small" onclick="W.open('Inbox')">Answer</button></div>`).join("")}</div>`
        : "";
    const planBody = plan
      ? `<div class="fo-plan-now"><small>AGREED PLAN</small><b>${esc(plan.measure)}</b><span>${esc(plan.label)}</span></div><div class="fo-row"><span>Progress</span><b>${plan.value} / ${plan.need}</b></div>${meter(plan.value, plan.value >= plan.need ? "good" : "warn", plan.need)}<div class="fo-row"><span>Checkpoint</span><b>${plan.left ? `in ${plan.left} game${plan.left === 1 ? "" : "s"}` : "after this round"}</b></div><p class="fo-note">Meet it: owner patience +${plan.reward}. Miss it: −${plan.penalty} and a sharp fall in job security.</p>`
      : x.lastPlan
        ? `<p class="fo-note">Last plan: <b>${esc(x.lastPlan.measure)}</b> ${chip(x.lastPlan.status === "met" ? "Met" : x.lastPlan.status === "missed" ? "Missed" : "Closed", x.lastPlan.status === "met" ? "good" : "bad")}</p>`
        : `<p class="fo-note">No plan in place. After ${BM.MEETING_RULES.minGames} games, ownership calls a board meeting when you are on pace for ${-BM.MEETING_RULES.paceGap}+ fewer wins than the target, lose ${BM.MEETING_RULES.losingStreak} straight, or job security falls below ${BM.MEETING_RULES.security}.</p>`;
    const pulse = `${pending}${planBody}<label class="fo-label">What the board is watching</label><div class="fo-row"><span>Point differential</span><b>${p.pointDiff >= 0 ? "+" : ""}${p.pointDiff}</b></div><div class="fo-row"><span>Losing streak</span><b>${p.streak}</b></div><div class="fo-row"><span>Team morale · drama</span><b>${p.morale}% · ${p.drama}</b></div>${x.warning ? `<p class="fo-banner">${x.warning > 1 ? "Ultimatum" : "Final warning"} on record this season.</p>` : ""}`;
    const meetings = x.meetings.length
      ? `<ul class="fo-log">${x.meetings.map((m) => `<li>${chip(m.outcome, /missed|record/i.test(m.outcome) ? "bad" : /met|exceeded|set|agreed|active/i.test(m.outcome) ? "good" : "warn")}<span><b>${esc(m.kind)}: ${esc(m.title)}</b><small>${esc(m.agreed ? "Agreed: " + m.agreed : m.detail || "")}${m.agreed && m.detail ? " · " + esc(m.detail) : ""}</small></span><time>${m.date ? esc(m.date) : m.year} · W${m.week + 1}</time></li>`).join("")}</ul>`
      : '<p class="fo-note">Board and team meetings appear here with what was agreed and how it turned out.</p>';
    const mandate = `<p class="fo-note">${o.mandateLocked ? `Agreed for ${state.year}: <b>${esc(o.mandate)}</b>. ${esc(B.MANDATES[o.mandate].text)}` : `Agree one mandate per season. It sets the win target ownership judges you on (projection ${o.projected}).`}</p><div class="fo-options">${Object.entries(B.MANDATES).map(([k, m]) => `<button class="fo-option ${o.mandate === k ? "active" : ""}" ${o.mandateLocked || busy ? "disabled" : ""} onclick="FrontOffice.mandate(${arg(k)})"><b>${k}</b><small>${m.shift > 0 ? "+" : ""}${m.shift} wins · ${esc(m.text)}</small></button>`).join("")}</div>`;
    const budget = `<div class="fo-row"><span>Club cash</span><b>${money(b.cash)}</b></div><div class="fo-row"><span>Staff payroll / budget</span><b>${money(b.staffPayroll)} / ${money(b.staffBudget)}</b></div>${meter(payrollShare, payrollShare > 100 ? "bad" : payrollShare > 90 ? "warn" : "good")}<div class="fo-row"><span>Player cap used</span><b>${money(b.cap.used)} / ${money(b.cap.limit)}</b></div>${meter(capShare, b.cap.room < 0 ? "bad" : capShare > 95 ? "warn" : "good")}<div class="fo-action"><button ${!o.can.budget || o.budgetCooldown || busy ? "disabled" : ""} onclick="FrontOffice.budget()">Ask for +${money(B.BUDGET_STEP)} staff budget</button><small>${!o.can.budget ? `${esc(state.franchise.role)} cannot request budget.` : o.budgetCooldown ? `Ownership will hear another request in ${o.budgetCooldown} days.` : "Approval depends on job security and cash reserves. The answer is immediate."}</small></div>`;
    const facilities = `${o.project ? `<div class="fo-project">${icon("building")}<span><b>${esc(o.project.name)}</b><small>${o.project.remaining} week${o.project.remaining === 1 ? "" : "s"} remaining</small></span></div>` : ""}<div class="fo-facilities">${Object.entries(B.FACILITIES).map(([area, f]) => {
      const level = o.facilities[area],
        maxed = level >= f.max;
      return `<div class="fo-facility"><b>${f.label}</b><strong>${area === "condition" ? level + "%" : "Level " + level}</strong><small>${esc(f.effect)}</small><button class="secondary small" ${!o.can.facilities || o.project || maxed || busy || b.cash < f.cost ? "disabled" : ""} onclick="FrontOffice.invest(${arg(area)})">${maxed ? "Maxed" : "Invest " + money(f.cost)}</button></div>`;
    }).join("")}</div>${o.can.facilities ? "" : `<p class="fo-note">${esc(state.franchise.role)} cannot fund facilities.</p>`}`;
    const history = o.decisions.length
      ? `<ul class="fo-log">${o.decisions.map((d) => `<li>${chip(d.outcome, d.outcome === "Rejected" ? "bad" : d.outcome === "Partial" ? "warn" : "good")}<span><b>${esc(d.title)}</b><small>${esc(d.detail)}</small></span><time>${d.year} · W${d.week + 1}</time></li>`).join("")}</ul>`
      : '<p class="fo-note">Ownership decisions appear here.</p>';
    return `<div class="fo-page"><div class="fo-grid fo-top">${card("Job security", security, "", "fo-span-2")}${card("Ownership", owner)}</div><div class="fo-grid">${card("Expectations", expectations, chip(x.tier, x.rank <= 12 ? "good" : x.rank <= 22 ? "" : "warn"), "fo-span-2")}${card("Board plan", pulse, x.plan ? chip("Checkpoint active", "warn") : "")}</div><div class="fo-grid">${card("Season mandate", mandate)}${card("Budget", budget)}${card("Meetings", meetings)}</div><div class="fo-grid fo-wide">${card("Facilities", facilities, "", "fo-span-2")}${card("Decisions", history)}</div></div>`;
  }
  const ownerNote = (trait) =>
    ({
      "Penny-Pincher": "Values financial discipline. Spending costs goodwill.",
      "Patient Rebuilder": "Accepts a rebuild if young players develop.",
      Meddler: "Wants a say. Missed targets cost patience quickly.",
    })[trait] || "Wants results now. Winning buys patience.";

  /* -------------------------------------------------------------- tactics */
  function tacticsView() {
    const r = G.opponentReport(state),
      locked = !!state.live && !state.live.finished,
      dis = (key) => (locked || isBusy() || !G.canEdit(state, key) ? "disabled" : ""),
      value = (key) => G.settingValue(state, key),
      options = (key, list) =>
        `<div class="fo-segments">${list.map(([v, sub]) => `<button class="${value(key) === v ? "active" : ""}" aria-pressed="${value(key) === v}" ${dis(key)} onclick="FrontOffice.plan(${arg(key)},${arg(v)})"><b>${esc(v)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</button>`).join("")}</div>`;
    const plan = `${card("Offense", `<label class="fo-label">Play style</label>${options("style", Object.entries(G.STYLES))}<label class="fo-label">Base formation</label>${options("formation", G.FORMATIONS.map((f) => [f]))}`)}${card("Defense", `<label class="fo-label">Base front</label>${options("defense", G.FRONTS.map((f) => [f, { "4–3 base": "Stops the run", "3–4 base": "Flexible pressure", Nickel: "Five defensive backs", Dime: "Six defensive backs" }[f]]))}`)}${card("Situations", `<div class="fo-toggles">${Object.entries(G.DIRECTIVES).map(([k, label]) => `<label class="fo-toggle"><input type="checkbox" ${value(k) ? "checked" : ""} ${dis(k)} onchange="FrontOffice.plan(${arg(k)},this.checked)"><span>${esc(label)}</span></label>`).join("")}</div><label class="fo-label">Play calling</label>${options("calling", Object.entries(G.CALLING))}<p class="fo-note">In simulated games, feeding the running back or protecting the quarterback overrides the play style. Settings apply to your next game; results are decided on the field.</p>`)}`;
    return `<div class="fo-page"><div class="fo-tactics"><div class="fo-plan">${locked ? '<p class="fo-banner">A game is in progress. Change calls from the sideline.</p>' : ""}${plan}</div><div class="fo-scout">${r ? opponentPanel(r, locked) : card("Opponent analysis", '<p class="fo-note">No upcoming opponent. The analysis returns when the next fixture is scheduled.</p>')}</div></div></div>`;
  }
  function opponentPanel(r, locked) {
    const name = clubs[r.team][2],
      t = r.tendencies;
    const unitRows = r.units
      .map(
        (u) =>
          `<div class="fo-unit"><span>${esc(u.label)}<small>${u.side === "offense" ? "OFF" : "DEF"}</small></span>${meter(u.rating - 50, u.vsLeague >= 3 ? "bad" : u.vsLeague <= -3 ? "good" : "", 50)}<b>${u.rating}</b><em class="${u.vsLeague > 0 ? "up" : u.vsLeague < 0 ? "down" : ""}">${u.vsLeague > 0 ? "+" : ""}${u.vsLeague}</em></div>`,
      )
      .join("");
    const counters = r.counters
      .map((c) => {
        const label = c.key in G.DIRECTIVES ? (c.value ? "" : "Turn off: ") + G.DIRECTIVES[c.key] : `${{ style: "Play style", formation: "Formation", defense: "Front" }[c.key]}: ${c.value}`;
        return `<li><span><b>${esc(label)}</b><small>${esc(c.reason)}</small></span>${c.applied ? chip("In plan", "good") : `<button class="small" ${locked || isBusy() || !G.canEdit(state, c.key) ? "disabled" : ""} onclick="FrontOffice.plan(${arg(c.key)},${arg(c.value)})">Apply</button>`}</li>`;
      })
      .join("");
    const pending = r.counters.filter((c) => !c.applied && G.canEdit(state, c.key));
    return `<section class="fo-card fo-opponent"><div class="fo-card-head"><div class="fo-opp-head">${logo(r.team)}<div><span class="eyebrow">OPPONENT ANALYSIS · ${r.home ? "HOME" : "AWAY"}</span><h3>${esc(clubs[r.team][1] + " " + name)}</h3><small>${r.record.w}–${r.record.l} this season</small></div></div></div>
<div class="fo-split"><div><label class="fo-label">Strengths</label>${r.strengths.map((u) => chip(`${u.label} ${u.rating}`, "bad")).join("") || chip("None above league average")}</div><div><label class="fo-label">Weaknesses</label>${r.weaknesses.map((u) => chip(`${u.label} ${u.rating}`, "good")).join("") || chip("No clear weakness")}</div></div>
<label class="fo-label">Units vs league average</label><div class="fo-units">${unitRows}</div>
<label class="fo-label">Tendencies</label><div class="fo-tend"><div class="fo-runpass"><i style="width:${t.run}%">Run ${t.run}%</i><i style="width:${t.pass}%">Pass ${t.pass}%</i></div><div class="fo-row"><span>Offense</span><b>${esc(t.lean)} · coordinator: ${esc(t.oc)}</b></div><div class="fo-row"><span>Coverage</span><b>${esc(t.coverage)}</b></div><small class="fo-note">Source: ${esc(t.source)}.</small></div>
<label class="fo-label">Key players</label><div class="fo-keys">${r.keyPlayers.map((p) => `<button class="fo-key" onclick="W.player(${arg(p.id)},${r.team})"><b>${p.ovr}</b><span>${esc(p.name)}<small>${p.pos} · ${p.age}</small></span></button>`).join("")}</div>
<label class="fo-label">Suggested counters</label><ul class="fo-counters">${counters}</ul>${pending.length > 1 ? `<button ${locked || isBusy() ? "disabled" : ""} onclick="FrontOffice.applyCounters()">Apply all ${pending.length} counters</button>` : ""}</section>`;
  }

  /* ---------------------------------------------------------- locker room */
  function lockerView() {
    const r = lockerReport(state),
      total = r.players.length || 1,
      list = r.players.filter((p) => (lockerFilter === "Unhappy" ? p.concern : lockerFilter === "Starters" ? p.starter : true));
    const kpis = `<div class="fo-kpis">${kpi("TEAM MORALE", r.teamMorale + "%", `${r.pulseLabel} · squad average ${r.avgMorale}%`, toneFor(r.teamMorale, 70, 55), r.teamMorale)}${kpi("CHEMISTRY", r.chemistry, `Weekly morale ${r.moraleModifier > 0 ? "+" : ""}${r.moraleModifier}`, toneFor(r.chemistry, 65, 50), r.chemistry)}${kpi("DRAMA", r.drama, r.drama >= 55 ? "Eroding chemistry" : "Under control", r.drama >= 55 ? "bad" : r.drama >= 35 ? "warn" : "good", r.drama)}${kpi("LEADERSHIP", r.leadership, "Top three leaders", toneFor(r.leadership, 65, 45), r.leadership)}${kpi("UNHAPPY", r.unhappy.length, r.unhappy.length ? "Need your attention" : "Nobody unsettled", r.unhappy.length > 4 ? "bad" : r.unhappy.length ? "warn" : "good")}</div>`;
    const spread = `<div class="fo-spread">${Object.entries(r.counts).map(([k, n]) => (n ? `<i class="${B_TONE[k]}" style="flex:${n}" title="${k}: ${n}">${n}</i>` : "")).join("")}</div><div class="fo-legend">${Object.entries(r.counts).map(([k, n]) => `<span class="${B_TONE[k]}"><i></i>${k} ${n}</span>`).join("")}</div>`;
    const attention = r.unhappy.length
      ? `<div class="fo-attention">${r.unhappy.slice(0, 6).map((p) => `<article class="fo-person ${p.tone}"><div class="fo-person-head"><b>${esc(p.name)}</b><small>${p.pos} · ${p.ovr} OVR</small><strong>${p.morale}%</strong></div><ul class="fo-causes">${p.causes.map(cause).join("") || "<li>No single cause recorded</li>"}</ul><button class="secondary small" onclick="F.meeting(${arg(p.id)})">Meet player</button></article>`).join("")}</div>`
      : '<p class="fo-note">Every player is at least content. Keep it that way.</p>';
    const leaders = `<div class="fo-leaders">${r.leaders.map((p) => `<div class="fo-leader"><b>${esc(p.name)}</b><small>${p.pos} · leadership ${p.leadership}</small>${meter(p.morale, p.tone)}<span>${p.morale}% morale</span></div>`).join("")}</div>`;
    const table = `<div class="fo-filter">${["All", "Unhappy", "Starters"].map((f) => `<button class="${lockerFilter === f ? "active" : ""}" onclick="FrontOffice.locker(${arg(f)})">${f}</button>`).join("")}</div><div class="fo-table"><table><thead><tr><th>PLAYER</th><th>MORALE</th><th>MOOD</th><th>TRUST</th><th>WHY</th><th></th></tr></thead><tbody>${list.map((p) => `<tr><td><button class="link" onclick="W.player(${arg(p.id)},${state.team})">${esc(p.name)}</button><small>${p.pos} · ${p.ovr}${p.starter ? " · starter" : ""}</small></td><td class="fo-cell-meter">${meter(p.morale, p.tone)}<b>${p.morale}</b></td><td>${chip(p.mood, p.tone)}</td><td>${p.trust}</td><td class="fo-why">${esc(p.causes[0]?.text || "—")}</td><td><button class="secondary small" onclick="F.meeting(${arg(p.id)})">Meet</button></td></tr>`).join("")}</tbody></table></div>`;
    return `<div class="fo-page">${kpis}<div class="fo-grid">${card("Morale across the squad", spread + `<label class="fo-label">What is moving the room</label><ul class="fo-causes">${r.teamCauses.map(cause).join("")}</ul>`, "", "fo-span-2")}${card("Leaders", leaders, `<button class="link" onclick="W.open('Conversations')">Conversations →</button>`)}</div>${card(`Needs attention <span class="fo-count">${r.unhappy.length}</span>`, attention)}${card("Squad morale", table)}</div>`;
  }
  const B_TONE = { Happy: "good", Content: "", Unsettled: "warn", Unhappy: "bad" };

  window.FrontOffice = {
    mandate: (key) => mutate((s) => B.setMandate(s, key), `${key} mandate agreed with ownership.`),
    budget: () =>
      mutate(
        (s) => B.requestStaffBudget(s),
        (r) => (r.amount ? `Ownership ${r.outcome === "Partial" ? "partly " : ""}approved +${money(r.amount)} for staff.` : "Ownership declined the budget request."),
      ),
    invest: (area) => mutate((s) => B.investFacility(s, area), `${B.FACILITIES[area].label} upgrade started.`),
    plan: (key, value) => mutate((s) => G.setGamePlan(s, key, value), "Game plan updated."),
    applyCounters: () =>
      mutate((s) => {
        const r = G.opponentReport(s);
        for (const c of r?.counters || []) if (!c.applied && G.canEdit(s, c.key)) G.setGamePlan(s, c.key, c.value);
      }, "Counters added to the game plan."),
    locker: (f) => {
      lockerFilter = f;
      render();
    },
  };
  views.Boardroom = boardView;
  views["Locker room"] = lockerView;
  // The legacy Tactics route renders game.js's plan(); replace it with the franchise game plan.
  window.plan = tacticsView;
}
