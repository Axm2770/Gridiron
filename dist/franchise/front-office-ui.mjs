import * as S from "./state.mjs";
import * as B from "./boardroom.mjs";
import * as BM from "./board-meetings.mjs";
import * as G from "./game-plan.mjs";
import { lockerReport } from "./locker-room.mjs";
import { icon } from "./presentation.mjs";
import * as fp from "./fo-pixel.mjs";
import { staffBust, ensureFrontDeskStyles } from "./fo-pixel.mjs";
import { coachAppearance } from "./coach-avatar.mjs";

// Boardroom, Organization hub (Club), Tactics (the legacy "Game plan" view) and Locker room.
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
  let lockerFilter = "All",
    clubTab = "Overview";
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
    ensureFrontDeskStyles();
    const o = B.boardOverview(state),
      b = o.budget,
      busy = isBusy() || !!state.live,
      payrollShare = b.staffBudget ? (b.staffPayroll / b.staffBudget) * 100 : 100,
      capShare = b.cap.limit ? (b.cap.used / b.cap.limit) * 100 : 0,
      secTone = toneFor(o.security, 60, 40),
      owner = state.franchise.clubs[state.team].owner;
    const security = `<div class="fo-security fp-security ${secTone}">${fp.gauge(o.security, { label: `Job security ${o.security} of 100` })}<div class="fp-security-score"><b>${o.security}</b><small>/ 100</small></div><div class="fp-security-copy"><span class="fp-kicker">STATUS</span><h3>${esc(o.status)}</h3><ul class="fp-factors">${o.factors.map((f) => `<li class="${f.tone || ""}"><i></i><span>${esc(f.label)}</span><b>${esc(f.value)}</b></li>`).join("")}</ul></div></div>`;
    const ownerCard = `<div class="fp-owner">${staffBust({ id: "owner-" + state.team, name: o.owner.name, role: "Owner" }, { size: 56, team: state.team })}<div><b>${esc(o.owner.name)}</b>${fp.chip(o.owner.trait, "accent")}</div></div><div class="fp-row"><span>Owner patience</span><b>${Math.round(o.owner.patience)}%</b></div>${fp.blocks(o.owner.patience, 100, 20, toneFor(o.owner.patience, 60, 40) === "bad" ? "bad" : toneFor(o.owner.patience, 60, 40), "Owner patience " + Math.round(o.owner.patience) + "%")}<p class="fp-note">${ownerNote(o.owner.trait)}</p>`;
    const x = BM.expectationsReport(state),
      mark = { done: "✓", on: "•", risk: "!", missed: "✗" };
    const expectations = `<p class="fp-note">${esc(x.headline)}. The roster rates ${x.rating} (${x.rank} of 32, league average ${x.leagueAvg}); ownership projects ${x.projected} wins${x.targetShift ? ` and has moved the target ${x.targetShift > 0 ? "+" : ""}${x.targetShift} after a meeting` : ""}.</p><div class="fp-tiles fp-tiles-4">${fp.tile("Projected", x.projected, "Wins from roster strength")}${fp.tile("Win target", o.target, esc(o.mandate) + " mandate", { tone: "accent" })}${fp.tile("Record", `${o.record.w}–${o.record.l}`, "This season")}${fp.tile("On pace for", o.pace === null ? "—" : o.pace.toFixed(1), o.pace === null ? "After the first game" : o.pace >= o.target ? "Ahead of target" : "Behind target", { tone: o.pace === null ? "" : o.pace >= o.target ? "good" : "bad" })}</div><ul class="fo-objectives fp-objectives">${x.items.map((t) => `<li class="${t.state === "done" ? "done" : t.state === "risk" || t.state === "missed" ? "risk" : ""}"><i>${mark[t.state]}</i><span>${esc(t.label)}${t.required ? "" : ' <em class="fo-soft">secondary</em>'}</span><small>${esc(t.progress)}</small></li>`).join("")}</ul><div class="fo-bands fp-bands">${x.bands.map((b) => `<div class="fo-band ${b.key === "Exceeded" ? "good" : b.key === "Met" ? "" : "bad"} ${x.outcome === b.key ? "active" : ""}"><b>${esc(b.label)}</b><small>${esc(b.when)}</small><span>${esc(b.effect)}</span></div>`).join("")}</div>`;
    const p = x.pulse,
      plan = x.plan,
      pending = x.pending.length
        ? `<div class="fp-pending">${x.pending.map((m) => `<div class="fp-row">${fp.chip("Awaiting you", "bad")}<span>${esc(m.title)}</span><button class="small" onclick="W.open('Inbox')">Answer</button></div>`).join("")}</div>`
        : "";
    const planBody = plan
      ? `<div class="fp-plan-now"><small>AGREED PLAN</small><b>${esc(plan.measure)}</b><span>${esc(plan.label)}</span></div><div class="fp-row"><span>Progress</span><b>${plan.value} / ${plan.need}</b></div>${fp.blocks(plan.value, plan.need, Math.min(12, Math.max(4, plan.need)), plan.value >= plan.need ? "good" : "warn", `Plan progress ${plan.value} of ${plan.need}`)}<div class="fp-row"><span>Checkpoint</span><b>${plan.left ? `in ${plan.left} game${plan.left === 1 ? "" : "s"}` : "after this round"}</b></div><p class="fp-note">Meet it: owner patience +${plan.reward}. Miss it: −${plan.penalty} and a sharp fall in job security.</p>`
      : x.lastPlan
        ? `<p class="fp-note">Last plan: <b>${esc(x.lastPlan.measure)}</b> ${fp.chip(x.lastPlan.status === "met" ? "Met" : x.lastPlan.status === "missed" ? "Missed" : "Closed", x.lastPlan.status === "met" ? "good" : "bad")}</p>`
        : `<p class="fp-note">No plan in place. After ${BM.MEETING_RULES.minGames} games, ownership calls a board meeting when you are on pace for ${-BM.MEETING_RULES.paceGap}+ fewer wins than the target, lose ${BM.MEETING_RULES.losingStreak} straight, or job security falls below ${BM.MEETING_RULES.security}.</p>`;
    const watch = [
      ["Point differential", `${p.pointDiff >= 0 ? "+" : ""}${p.pointDiff}`, p.pointDiff >= 0 ? "good" : "bad"],
      ["Losing streak", p.streak, p.streak >= BM.MEETING_RULES.losingStreak ? "bad" : p.streak ? "warn" : "good"],
      ["Team morale", `${p.morale}%`, toneFor(p.morale, 70, 55)],
      ["Drama", p.drama, p.drama >= 55 ? "bad" : p.drama >= 35 ? "warn" : "good"],
    ];
    const pulse = `${pending}${planBody}<span class="fp-label">What the board is watching</span><ul class="fp-watchboard">${watch.map(([k, v, t]) => `<li class="${t}"><i></i><span>${k}</span><b>${v}</b></li>`).join("")}</ul>${x.warning ? `<p class="fp-alert">${x.warning > 1 ? "Ultimatum" : "Final warning"} on record this season.</p>` : ""}`;
    const meetings = x.meetings.length
      ? `<ol class="fp-timeline">${x.meetings.map((m) => `<li class="${/missed|record/i.test(m.outcome) ? "bad" : /met|exceeded|set|agreed|active/i.test(m.outcome) ? "good" : "warn"}"><time>${m.date ? esc(m.date) : m.year} · W${m.week + 1}</time><b>${esc(m.kind)}: ${esc(m.title)}</b>${fp.chip(m.outcome, /missed|record/i.test(m.outcome) ? "bad" : /met|exceeded|set|agreed|active/i.test(m.outcome) ? "good" : "warn")}<small>${esc(m.agreed ? "Agreed: " + m.agreed : m.detail || "")}${m.agreed && m.detail ? " · " + esc(m.detail) : ""}</small></li>`).join("")}</ol>`
      : '<p class="fp-note">Board and team meetings appear here with what was agreed and how it turned out.</p>';
    const mandate = `<p class="fp-note">${o.mandateLocked ? `Agreed for ${state.year}: <b>${esc(o.mandate)}</b>. ${esc(B.MANDATES[o.mandate].text)}` : `Agree one mandate per season. It sets the win target ownership judges you on (projection ${o.projected}).`}</p><div class="fp-mandates">${Object.entries(B.MANDATES).map(([k, m]) => `<button class="fp-mandate ${o.mandate === k ? "active" : ""}" aria-pressed="${o.mandate === k}" ${o.mandateLocked || busy ? "disabled" : ""} onclick="FrontOffice.mandate(${arg(k)})"><strong>${m.shift > 0 ? "+" : ""}${m.shift}</strong><span><b>${k}${o.mandate === k ? " ✓" : ""}</b><small>${esc(m.text)}</small></span></button>`).join("")}</div>`;
    const budget = `<div class="fp-row"><span>Club cash</span><b>${money(b.cash)}</b></div><div class="fp-row"><span>Staff payroll / budget</span><b>${money(b.staffPayroll)} / ${money(b.staffBudget)}</b></div>${fp.blocks(payrollShare, 100, 20, payrollShare > 100 ? "bad" : payrollShare > 90 ? "warn" : "good", "Staff payroll " + Math.round(payrollShare) + "% of budget")}<div class="fp-row"><span>Player cap used</span><b>${money(b.cap.used)} / ${money(b.cap.limit)}</b></div>${fp.blocks(capShare, 100, 20, b.cap.room < 0 ? "bad" : capShare > 95 ? "warn" : "good", "Player cap " + Math.round(capShare) + "% used")}<div class="fp-action"><button ${!o.can.budget || o.budgetCooldown || busy ? "disabled" : ""} onclick="FrontOffice.budget()">Ask for +${money(B.BUDGET_STEP)} staff budget</button><small>${!o.can.budget ? `${esc(state.franchise.role)} cannot request budget.` : o.budgetCooldown ? `Ownership will hear another request in ${o.budgetCooldown} days.` : "Approval depends on job security and cash reserves. The answer is immediate."}</small></div>`;
    const facilities = `${o.project ? `<div class="fp-project">${icon("building")}<span><b>${esc(o.project.name)}</b><small>${o.project.remaining} week${o.project.remaining === 1 ? "" : "s"} remaining</small></span>${fp.chip("Under construction", "warn")}</div>` : ""}<div class="fp-tracks">${Object.entries(B.FACILITIES).map(([area, f]) => {
      const level = o.facilities[area],
        maxed = level >= f.max,
        pct = area === "condition";
      return `<div class="fo-facility fp-track ${maxed ? "maxed" : ""}"><div class="fp-track-head"><b>${f.label}</b><strong>${pct ? level + "%" : "Level " + level + " / " + f.max}</strong></div>${pct ? fp.blocks(level, 100, 20, level >= 70 ? "good" : level >= 45 ? "warn" : "bad", f.label + " " + level + "%") : `<span class="fp-levels">${Array.from({ length: f.max }, (_, i) => `<i class="${i < level ? "on" : ""}">${i + 1}</i>`).join("")}</span>`}<small>${esc(f.effect)}</small><button class="secondary small" ${!o.can.facilities || o.project || maxed || busy || b.cash < f.cost ? "disabled" : ""} onclick="FrontOffice.invest(${arg(area)})">${maxed ? "Maxed" : "Invest " + money(f.cost)}</button></div>`;
    }).join("")}</div>${o.can.facilities ? "" : `<p class="fp-note">${esc(state.franchise.role)} cannot fund facilities.</p>`}`;
    const history = o.decisions.length
      ? `<ol class="fp-timeline">${o.decisions.map((d) => `<li class="${d.outcome === "Rejected" ? "bad" : d.outcome === "Partial" ? "warn" : "good"}"><time>${d.year} · W${d.week + 1}</time><b>${esc(d.title)}</b>${fp.chip(d.outcome, d.outcome === "Rejected" ? "bad" : d.outcome === "Partial" ? "warn" : "good")}<small>${esc(d.detail)}</small></li>`).join("")}</ol>`
      : '<p class="fp-note">Ownership decisions appear here.</p>';
    return `<div class="fo-page fp-page fp-board"><div class="fp-grid-21">${fp.panel({ title: "Job security", kicker: "OWNERSHIP VIEW", body: security, cls: "fp-sec-panel" })}${fp.panel({ title: "Ownership", kicker: "THE OWNER", body: ownerCard })}</div><div class="fp-grid-21">${fp.panel({ title: "Expectations", kicker: state.year + " SEASON", body: expectations, extra: fp.chip(x.tier, x.rank <= 12 ? "good" : x.rank <= 22 ? "" : "warn") })}${fp.panel({ title: "Board plan", kicker: "CHECKPOINT", body: pulse, extra: x.plan ? fp.chip("Checkpoint active", "warn") : "" })}</div><div class="fp-grid-3">${fp.panel({ title: "Season mandate", kicker: "AGREE ONE PER SEASON", body: mandate })}${fp.panel({ title: "Budget", kicker: "FINANCES", body: budget })}${fp.panel({ title: "Meetings", kicker: "HISTORY", body: meetings, cls: "fp-scroll-panel" })}</div><div class="fp-grid-21">${fp.panel({ title: "Facilities", kicker: "UPGRADE TRACKS", body: facilities })}${fp.panel({ title: "Decisions", kicker: "OWNERSHIP LOG", body: history, cls: "fp-scroll-panel" })}</div></div>`;
  }
  /* ------------------------------------------------------ organization hub */
  // Replaces the hub-ui Club view: one pixel desk for ownership, people and infrastructure.
  // The Facilities tab keeps the stadium actions (ticket price, projects, relocation) and
  // calls the same F.action handlers as before.
  const PROJECTS = [
    ["condition", "Stadium restoration", 60, "Repairs lift condition, fan mood and attendance."],
    ["capacity", "Capacity expansion", 250, "More seats for match-day revenue."],
    ["medical", "Medical tier", 35, "Better treatment and faster recovery."],
    ["training", "Training tier", 35, "Faster weekly player development."],
  ];
  const tierTrack = (v, max = 5) =>
    `<span class="fp-levels small">${Array.from({ length: Math.max(max, v) }, (_, i) => `<i class="${i < v ? "on" : ""}">${i + 1}</i>`).join("")}</span>`;
  function clubView() {
    ensureFrontDeskStyles();
    const c = state.franchise.clubs[state.team],
      st = c.stadium,
      staff = (c.staff || []).slice().sort((a, b) => b.rating - a.rating),
      projects = st.projects.filter((p) => p.remaining > 0),
      busy = isBusy() || !!state.live,
      canStadium = S.allowed(state, "stadium"),
      dis = busy || !canStadium ? "disabled" : "",
      payroll = staff.reduce((n, p) => n + (p.salary || 0), 0),
      o = B.boardOverview(state),
      name = clubs[state.team][1] + " " + clubs[state.team][2];
    const banner = `<section class="fp-panel fp-club-banner"><div class="fp-club-id"><span class="fp-club-logo">${logo(state.team)}</span><div><span class="fp-kicker">ORGANIZATION / CLUB HEALTH</span><h2>${esc(name)}</h2><p>${esc(st.name)} · ${esc(st.city)} · ${Number(st.capacity).toLocaleString("en-US")} seats</p></div></div><div class="fp-club-actions"><button class="secondary small" onclick="W.open('Career')">Your coach profile</button><button class="secondary small" onclick="W.open('Staff')">Coaching staff →</button><button class="secondary small" onclick="W.open('Boardroom')">Meet ownership →</button></div></section>`;
    const tiles = `<div class="fp-tiles fp-tiles-5">${fp.tile("Club cash", money(c.cash), "Operating resources", { tone: c.cash < 80 * S.MILLION ? "warn" : "" })}${fp.tile("Attendance", Math.round(c.attendance * 100) + "%", "Responds to price and fans", { meter: fp.blocks(c.attendance * 100, 100, 10, toneFor(c.attendance * 100, 85, 65)) })}${fp.tile("Fan approval", Math.round(c.fanApproval) + "%", "Supporter mood", { meter: fp.blocks(c.fanApproval, 100, 10, toneFor(c.fanApproval, 60, 40)) })}${fp.tile("Staff payroll", money(payroll), `${staff.length} on staff`)}${fp.tile("Ticket price", "$" + st.ticket, "Per seat")}</div>`;
    const tabsHTML = `<div class="fp-tabs" role="tablist">${["Overview", "Facilities"].map((t) => `<button role="tab" class="${clubTab === t ? "selected" : ""}" aria-selected="${clubTab === t}" onclick="FrontOffice.clubTab(${arg(t)})">${t}${t === "Facilities" && projects.length ? `<em>${projects.length} live</em>` : ""}</button>`).join("")}</div>`;
    let body;
    if (clubTab === "Facilities") {
      body = `<div class="fp-grid-21">${fp.panel({
        kicker: "STADIUM PROJECTS",
        title: "Build and upgrade",
        extra: projects.length ? fp.chip("One project at a time", "warn") : "",
        body: `${projects.map((p) => `<div class="fp-project">${icon("building")}<span><b>${esc(p.name)}</b><small>${p.remaining} calendar advance${p.remaining === 1 ? "" : "s"} remaining</small></span>${fp.chip("In progress", "warn")}</div>`).join("")}<div class="fp-tracks fp-tracks-2">${PROJECTS.map(([area, label, cost, text]) => `<div class="fp-track"><div class="fp-track-head"><b>${label}</b><strong>${area === "condition" ? Math.round(st.condition) + "%" : area === "capacity" ? Number(st.capacity).toLocaleString("en-US") : "Tier " + st[area]}</strong></div>${area === "condition" ? fp.blocks(st.condition, 100, 20, toneFor(st.condition, 70, 45)) : area === "capacity" ? '<span class="fp-track-gap"></span>' : tierTrack(st[area])}<small>${text}</small><div class="fp-track-actions"><button class="small" ${dis || (projects.length ? "disabled" : "")} onclick="F.action('project',${arg(area)},'Private')">Private · ${money(cost * S.MILLION)}</button><button class="secondary small" ${dis || (projects.length ? "disabled" : "")} onclick="F.action('project',${arg(area)},'Public')" title="Councils fund 45% when fan approval is 55%+ and condition is 85% or less; fan approval −5.">Public · ${money(Math.round(cost * 0.55 * S.MILLION))}</button></div></div>`).join("")}</div><p class="fp-note">Public funding needs fan approval of 55% or more and costs 5 points of fan approval.${canStadium ? "" : ` In your career role (${esc(state.franchise.role)}) the stadium is managed by ownership.`}</p>`,
      })}<div class="fp-stack-col">${fp.panel({
        kicker: "MATCH DAY",
        title: "Ticket pricing",
        body: `<div class="fp-row"><span>Attendance</span><b>${Math.round(c.attendance * 100)}%</b></div>${fp.blocks(c.attendance * 100, 100, 20, toneFor(c.attendance * 100, 85, 65))}<label class="fp-field">Ticket price ($)<input id="ticket-price" type="number" value="${st.ticket}" min="25" max="400"></label><button class="small" ${dis} onclick="F.action('ticket',document.getElementById('ticket-price').value)">Update pricing</button><p class="fp-note">Attendance responds to price and fan approval. Concessions and suites add club revenue.</p>`,
      })}${fp.panel({
        kicker: "OFFSEASON",
        title: "Relocation application",
        body: `<p class="fp-note">Reviewed in the offseason when stadium condition or local support justifies a move. Requires $400M in cash.</p><label class="fp-field">New city<input id="relocation-city" type="text" maxlength="40"></label><label class="fp-field">New team name<input id="relocation-name" type="text" maxlength="40"></label><button class="secondary small" ${dis} onclick="F.action('relocate',document.getElementById('relocation-city').value,document.getElementById('relocation-name').value)">Apply to relocate</button>`,
      })}</div></div>`;
    } else {
      const confidence = `<div class="fp-owner">${staffBust({ id: "owner-" + state.team, name: c.owner.name, role: "Owner" }, { size: 56, team: state.team })}<div><b>${esc(c.owner.name)}</b>${fp.chip(c.owner.trait, "accent")}</div></div><div class="fp-row"><span>Owner patience</span><b>${Math.round(c.owner.patience)}%</b></div>${fp.blocks(c.owner.patience, 100, 20, toneFor(c.owner.patience, 60, 40))}<div class="fp-row"><span>Fan approval</span><b>${Math.round(c.fanApproval)}%</b></div>${fp.blocks(c.fanApproval, 100, 20, toneFor(c.fanApproval, 60, 40))}<div class="fp-row"><span>Your job security</span><b class="fp-${toneFor(o.security, 60, 40)}">${o.security} · ${esc(o.status)}</b></div><button class="link" onclick="W.open('Boardroom')">Open the boardroom →</button>`;
      const people = `<ul class="fp-people">${staff
        .slice(0, 6)
        .map((p) => `<li>${staffBust(p, { size: 36, team: state.team, appearance: p.userControlled ? coachAppearance(state) : null })}<span><small>${esc(p.role)}</small><b>${esc(p.name)}</b></span><span class="fp-ovr">${p.rating}</span></li>`)
        .join("")}</ul><button class="link" onclick="W.open('Staff')">All ${staff.length} staff →</button>`;
      const infra = `<div class="fp-row"><span>Stadium condition</span><b>${Math.round(st.condition)}%</b></div>${fp.blocks(st.condition, 100, 20, toneFor(st.condition, 70, 45))}<div class="fp-row"><span>Medical tier</span>${tierTrack(st.medical)}</div><div class="fp-row"><span>Training tier</span>${tierTrack(st.training)}</div><div class="fp-row"><span>Live projects</span><b>${projects.length ? esc(projects[0].name) + " · " + projects[0].remaining + " left" : "None"}</b></div><button class="secondary small" onclick="FrontOffice.clubTab('Facilities')">Manage facilities</button>`;
      const ops = `<div class="fp-row"><span>Active players</span><b>${S.active(state).filter((p) => p.status === "active").length} / 53</b></div><div class="fp-row"><span>Cap room</span><b>${money(S.capLedger(state).room)}</b></div><div class="fp-row"><span>Staff budget</span><b>${money(payroll)} / ${money(c.staffBudget || payroll)}</b></div><div class="fp-links">${[
        ["Roster", "Squad & depth"],
        ["Contracts", "Cap sheet"],
        ["Development", "Development"],
        ["League", "League office"],
      ]
        .map(([r, l]) => `<button class="secondary small" onclick="W.open('${r}')">${l} →</button>`)
        .join("")}</div>`;
      const tracker = st.projects.length
        ? `<ul class="fp-timeline">${st.projects
            .slice()
            .reverse()
            .slice(0, 5)
            .map((p) => `<li class="${p.remaining > 0 ? "warn" : "good"}"><b>${esc(p.name)}</b>${fp.chip(p.remaining > 0 ? "In progress" : "Complete", p.remaining > 0 ? "warn" : "good")}<small>${p.remaining > 0 ? p.remaining + " calendar advances remaining" : "Completed"}</small></li>`)
            .join("")}</ul>`
        : `<p class="fp-note">Room to grow. Upgrade training, medical care or the stadium from Facilities.</p>`;
      body = `<div class="fp-grid-3">${fp.panel({ kicker: "OWNERSHIP", title: "Board confidence", body: confidence })}${fp.panel({ kicker: "PEOPLE", title: "Coaching staff", body: people })}${fp.panel({ kicker: "INFRASTRUCTURE", title: "Stadium & facilities", body: infra })}</div><div class="fp-grid-2">${fp.panel({ kicker: "FOOTBALL OPERATIONS", title: "Operations", body: ops })}${fp.panel({ kicker: "CONSTRUCTION", title: "Project tracker", body: tracker })}</div>`;
    }
    return `<div class="fp-page fp-club">${banner}${tiles}${tabsHTML}${body}</div>`;
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
    clubTab: (t) => {
      clubTab = t;
      render();
    },
    locker: (f) => {
      lockerFilter = f;
      render();
    },
  };
  views.Boardroom = boardView;
  views.Club = clubView;
  views["Locker room"] = lockerView;
  // The legacy Tactics route renders game.js's plan(); replace it with the franchise game plan.
  window.plan = tacticsView;
}
